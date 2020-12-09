import { BrowserNode } from "@connext/vector-browser-node";
import {
  getPublicKeyFromPublicIdentifier,
  encrypt,
  createlockHash,
  getBalanceForAssetId,
  getRandomBytes32,
  constructRpcRequest,
} from "@connext/vector-utils";
import React, { useEffect, useState } from "react";
import { constants } from "ethers";
import { Col, Divider, Row, Statistic, Input, Typography, Table, Form, Button, List, Select, Tabs } from "antd";
import { EngineEvents, FullChannelState, TransferNames } from "@connext/vector-types";

import "./App.css";

function App() {
  const [node, setNode] = useState<BrowserNode>();
  const [channels, setChannels] = useState<FullChannelState[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<FullChannelState>();
  const [showCustomIframe, setShowCustomIframe] = useState<boolean>(false);

  const [setupLoading, setSetupLoading] = useState<boolean>(false);
  const [connectLoading, setConnectLoading] = useState<boolean>(false);
  const [depositLoading, setDepositLoading] = useState<boolean>(false);
  const [requestCollateralLoading, setRequestCollateralLoading] = useState<boolean>(false);
  const [transferLoading, setTransferLoading] = useState<boolean>(false);
  const [withdrawLoading, setWithdrawLoading] = useState<boolean>(false);

  const [connectError, setConnectError] = useState<string>();

  const [withdrawForm] = Form.useForm();
  const [transferForm] = Form.useForm();

  useEffect(() => {
    const effect = async () => {};
    effect();
  }, []);

  const connectNode = async (
    iframeSrc: string,
    supportedChains: number[],
    routerPublicIdentifier: string,
  ): Promise<BrowserNode> => {
    try {
      setConnectLoading(true);
      console.log("supportedChains: ", supportedChains);
      const client = new BrowserNode({
        supportedChains,
        iframeSrc,
        routerPublicIdentifier,
      });
      await client.init();
      const channelsRes = await client.getStateChannels();
      if (channelsRes.isError) {
        setConnectError(channelsRes.getError().message);
        return;
      }
      const channelAddresses = channelsRes.getValue();
      const _channels = await Promise.all(
        channelAddresses.map(async (c) => {
          const channelRes = await client.getStateChannel({ channelAddress: c });
          console.log("Channel found in store:", channelRes.getValue());
          const channelVal = channelRes.getValue() as FullChannelState;
          return channelVal;
        }),
      );
      if (_channels.length > 0) {
        setChannels(_channels);
        setSelectedChannel(_channels[0]);
      }
      setNode(client);
      client.on(EngineEvents.DEPOSIT_RECONCILED, async (data) => {
        console.log("Received EngineEvents.DEPOSIT_RECONCILED: ", data);
        await updateChannel(client, data.channelAddress);
      });
      // TODO: this is required bc the event handlers are keyed on Date.now()
      // await delay(10);
      client.on(EngineEvents.CONDITIONAL_TRANSFER_CREATED, async (data) => {
        console.log("Received EngineEvents.CONDITIONAL_TRANSFER_CREATED: ", data);
        if (data.transfer.meta.path[0].recipient !== client.publicIdentifier) {
          console.log("We are the sender");
          return;
        }
        console.log(data.transfer.meta.encryptedPreImage);
        const rpc = constructRpcRequest<"chan_decrypt">("chan_decrypt", data.transfer.meta.encryptedPreImage);
        const decryptedPreImage = await client.send(rpc);
        console.log("decryptedPreImage: ", decryptedPreImage);

        const requestRes = await client.resolveTransfer({
          channelAddress: data.transfer.channelAddress,
          transferResolver: {
            preImage: decryptedPreImage,
          },
          transferId: data.transfer.transferId,
        });
        if (requestRes.isError) {
          console.error("Error resolving transfer", requestRes.getError());
        }
        await updateChannel(client, data.channelAddress);
      });
      return client;
    } catch (e) {
      console.error("Error connecting node: ", e);
      setConnectError(e.message);
    } finally {
      setConnectLoading(false);
    }
  };

  const updateChannel = async (node: BrowserNode, channelAddress: string) => {
    const res = await node.getStateChannel({ channelAddress });
    if (res.isError) {
      console.error("Error getting state channel", res.getError());
    } else {
      console.log("Updated channel:", res.getValue());
      const idx = channels.findIndex((c) => c.channelAddress === channelAddress);
      channels.splice(idx, res.getValue());
      setChannels(channels);
    }
  };

  const setupChannel = async (aliceIdentifier: string, chainId: number) => {
    setSetupLoading(true);
    const setupRes = await node.setup({
      counterpartyIdentifier: aliceIdentifier,
      chainId,
      timeout: "100000",
    });
    if (setupRes.isError) {
      console.error(setupRes.getError());
    } else {
      channels.push(setupRes.getValue() as FullChannelState);
      setChannels(channels);
    }
    setSetupLoading(false);
  };

  const reconcileDeposit = async (assetId: string) => {
    setDepositLoading(true);
    const depositRes = await node.reconcileDeposit({
      channelAddress: selectedChannel.channelAddress,
      assetId,
    });
    if (depositRes.isError) {
      console.error("Error depositing", depositRes.getError());
    }
    setDepositLoading(false);
  };

  const requestCollateral = async (assetId: string) => {
    setRequestCollateralLoading(true);
    const requestRes = await node.requestCollateral({
      channelAddress: selectedChannel.channelAddress,
      assetId,
    });
    if (requestRes.isError) {
      console.error("Error depositing", requestRes.getError());
    }
    setRequestCollateralLoading(false);
  };

  const transfer = async (assetId: string, amount: string, recipient: string, preImage: string) => {
    setTransferLoading(true);

    const submittedMeta: { encryptedPreImage?: string } = {};
    if (recipient) {
      const recipientPublicKey = getPublicKeyFromPublicIdentifier(recipient);
      const encryptedPreImage = await encrypt(preImage, recipientPublicKey);
      submittedMeta.encryptedPreImage = encryptedPreImage;
    }

    const requestRes = await node.conditionalTransfer({
      type: TransferNames.HashlockTransfer,
      channelAddress: selectedChannel.channelAddress,
      assetId,
      amount,
      recipient,
      details: {
        lockHash: createlockHash(preImage),
        expiry: "0",
      },
      meta: submittedMeta,
    });
    if (requestRes.isError) {
      console.error("Error transferring", requestRes.getError());
    }
    setTransferLoading(false);
  };

  const crossChainTransfer = async (
    amount: string,
    fromAssetId: string,
    fromChainId: number,
    toAssetId: string,
    toChainId: number,
    withdrawalAddress: string,
  ) => {
    setTransferLoading(true);
    try {
      await node.crossChainTransfer({
        amount,
        fromAssetId,
        fromChainId,
        toAssetId,
        toChainId,
        reconcileDeposit: true,
        withdrawalAddress,
      });
      console.log(`Cross chain transfer complete!`);
    } catch (e) {
      console.error("Error transferring", e);
    }
    setTransferLoading(false);
  };

  const withdraw = async (assetId: string, amount: string, recipient: string) => {
    setWithdrawLoading(true);
    const requestRes = await node.withdraw({
      channelAddress: selectedChannel.channelAddress,
      assetId,
      amount,
      recipient,
    });
    if (requestRes.isError) {
      console.error("Error withdrawing", requestRes.getError());
    }
    setWithdrawLoading(false);
  };

  const onFinishFailed = (errorInfo: any) => {
    console.log("Failed:", errorInfo);
  };

  return (
    <div style={{ margin: 36 }}>
      <Row gutter={16}>
        <Col span={16}>
          <Typography.Title>Vector Browser Node</Typography.Title>
        </Col>
      </Row>
      <Divider orientation="left">Connection</Divider>
      <Row gutter={16}>
        {node?.publicIdentifier ? (
          <>
            <Col span={16}>
              <List
                itemLayout="horizontal"
                dataSource={[
                  { title: "Public Identifier", description: node!.publicIdentifier },
                  { title: "Signer Address", description: node!.signerAddress },
                ]}
                renderItem={(item) => (
                  <List.Item>
                    <List.Item.Meta title={item.title} description={item.description} />
                  </List.Item>
                )}
              />
            </Col>
          </>
        ) : connectError ? (
          <>
            <Col span={16}>
              <Statistic title="Error Connecting Node" value={connectError} />
            </Col>
          </>
        ) : (
          <Col span={18}>
            <Form
              layout="horizontal"
              name="node"
              wrapperCol={{ span: 18 }}
              labelCol={{ span: 6 }}
              onFinish={(vals) => {
                const iframe = showCustomIframe ? vals.customIframe : vals.iframeSrc;
                console.log("Connecting to iframe at: ", iframe);
                connectNode(
                  iframe,
                  vals.supportedChains.split(",").map((x: string) => parseInt(x.trim())),
                  vals.routerPublicIdentifier,
                );
              }}
              initialValues={{
                iframeSrc: "http://localhost:3030",
                routerPublicIdentifier: "vector8Uz1BdpA9hV5uTm6QUv5jj1PsUyCH8m8ciA94voCzsxVmrBRor",
                supportedChains: "1337,1338",
              }}
            >
              <Form.Item label="IFrame Src" name="iframeSrc">
                <Select
                  onChange={(event) => {
                    if (event === "custom") {
                      setShowCustomIframe(true);
                    } else {
                      setShowCustomIframe(false);
                    }
                  }}
                >
                  <Select.Option value="http://localhost:3030">http://localhost:3030</Select.Option>
                  <Select.Option value="https://wallet.connext.network">https://wallet.connext.network</Select.Option>
                  <Select.Option value="custom">Custom</Select.Option>
                </Select>
              </Form.Item>

              {showCustomIframe && (
                <Form.Item label="Custom Iframe URL" name="customIframe">
                  <Input />
                </Form.Item>
              )}

              <Form.Item name="routerPublicIdentifier" label="Router Public Identifier">
                <Input placeholder="vector..." />
              </Form.Item>

              <Form.Item name="supportedChains" label="Supported Chains">
                <Input placeholder="Chain Ids (domma-separated)" />
              </Form.Item>

              <Form.Item wrapperCol={{ offset: 8, span: 16 }}>
                <Button type="primary" htmlType="submit" loading={connectLoading}>
                  Connect To Iframe
                </Button>
              </Form.Item>
            </Form>
          </Col>
        )}
      </Row>
      {node?.publicIdentifier && (
        <>
          <Divider orientation="left">Setup Channel</Divider>
          <Row gutter={16}>
            <Col span={18}>
              <Form
                layout="horizontal"
                name="setup"
                wrapperCol={{ span: 18 }}
                labelCol={{ span: 6 }}
                onFinish={(vals) => setupChannel(vals.counterparty, parseInt(vals.chainId))}
              >
                <Form.Item
                  label="Counterparty"
                  name="counterparty"
                  rules={[{ required: true, message: "Please input the counterparty identifier!" }]}
                >
                  <Input placeholder="Counterparty Identifier" />
                </Form.Item>

                <Form.Item
                  label="Chain Id"
                  name="chainId"
                  rules={[{ required: true, message: "Please input the chain ID!" }]}
                >
                  <Input placeholder="Chain Id" />
                </Form.Item>

                <Form.Item wrapperCol={{ offset: 8, span: 16 }}>
                  <Button type="primary" htmlType="submit" loading={setupLoading}>
                    Setup Channel
                  </Button>
                </Form.Item>
              </Form>
            </Col>
          </Row>

          <Divider orientation="left">Channels</Divider>
          <Row gutter={16}>
            <Col span={18}>
              <Form layout="horizontal" name="selectChannel" wrapperCol={{ span: 18 }} labelCol={{ span: 6 }}>
                <Form.Item label="Channels">
                  <Select
                    value={selectedChannel?.channelAddress}
                    onChange={(newChannel) => {
                      const c = channels.find((chan) => chan.channelAddress === newChannel);
                      setSelectedChannel(c);
                    }}
                  >
                    {channels.map((channel) => (
                      <Select.Option value={channel.channelAddress} key={channel.channelAddress}>
                        {channel.channelAddress}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Form>
            </Col>
          </Row>

          <Divider orientation="left">Balance & Deposit</Divider>
          <Row gutter={16}>
            {selectedChannel && selectedChannel.assetIds && (
              <Col span={24}>
                <Table
                  dataSource={selectedChannel.assetIds.map((assetId, index) => {
                    return {
                      key: index,
                      assetId,
                      counterpartyBalance: selectedChannel.balances[index].amount[0], // they are Alice
                      myBalance: selectedChannel.balances[index].amount[1], // we are Bob
                    };
                  })}
                  columns={[
                    {
                      title: "Asset ID",
                      dataIndex: "assetId",
                      key: "assetId",
                    },
                    {
                      title: "My Balance",
                      dataIndex: "myBalance",
                      key: "myBalance",
                    },
                    {
                      title: "Counterparty Balance",
                      dataIndex: "counterpartyBalance",
                      key: "counterpartyBalance",
                    },
                  ]}
                />
              </Col>
            )}
          </Row>
          <div style={{ paddingTop: 24 }} />
          <Row gutter={16}>
            <Col span={24}>
              <Form layout="horizontal" name="deposit" wrapperCol={{ span: 18 }} labelCol={{ span: 6 }}>
                <Form.Item label="Reconcile Deposit">
                  <Input.Search
                    placeholder={constants.AddressZero}
                    enterButton="Reconcile"
                    suffix="Asset ID"
                    onSearch={(assetId) => reconcileDeposit(assetId || constants.AddressZero)}
                    loading={depositLoading}
                  />
                </Form.Item>
                <Form.Item label="Request Collateral">
                  <Input.Search
                    placeholder={constants.AddressZero}
                    enterButton="Request"
                    suffix="Asset ID"
                    onSearch={(assetId) => requestCollateral(assetId || constants.AddressZero)}
                    loading={requestCollateralLoading}
                  />
                </Form.Item>
              </Form>
            </Col>
          </Row>

          <Divider orientation="left">Transfer</Divider>
          <Row gutter={16}>
            <Col span={24}>
              <Tabs defaultActiveKey="HashlockTransfer">
                <Tabs.TabPane tab="Hashlock Transfer" key="HashlockTransfer">
                  <Form
                    layout="horizontal"
                    labelCol={{ span: 6 }}
                    wrapperCol={{ span: 18 }}
                    name="transfer"
                    initialValues={{
                      assetId: selectedChannel?.assetIds && selectedChannel?.assetIds[0],
                      preImage: getRandomBytes32(),
                    }}
                    onFinish={(values) => transfer(values.assetId, values.amount, values.recipient, values.preImage)}
                    onFinishFailed={onFinishFailed}
                    form={transferForm}
                  >
                    <Form.Item label="Asset ID" name="assetId">
                      <Input placeholder={constants.AddressZero} />
                      {/* <Select>
                    {channel?.assetIds?.map(aid => {
                      return (
                        <Select.Option key={aid} value={aid}>
                          {aid}
                        </Select.Option>
                      );
                    })}
                  </Select> */}
                    </Form.Item>

                    <Form.Item
                      label="Recipient"
                      name="recipient"
                      rules={[{ required: true, message: "Please input recipient address" }]}
                    >
                      <Input />
                    </Form.Item>

                    <Form.Item
                      label="Amount"
                      name="amount"
                      rules={[{ required: true, message: "Please input transfer amount" }]}
                    >
                      <Input.Search
                        enterButton="MAX"
                        onSearch={() => {
                          const assetId = transferForm.getFieldValue("assetId");
                          const amount = getBalanceForAssetId(selectedChannel, assetId, "bob");
                          transferForm.setFieldsValue({ amount });
                        }}
                      />
                    </Form.Item>

                    <Form.Item
                      label="Pre Image"
                      name="preImage"
                      rules={[{ required: true, message: "Please input pre image" }]}
                    >
                      <Input.Search
                        enterButton="Random"
                        onSearch={() => {
                          const preImage = getRandomBytes32();
                          transferForm.setFieldsValue({ preImage });
                        }}
                      />
                    </Form.Item>

                    <Form.Item label="Recipient Chain ID" name="recipientChainId">
                      <Input />
                    </Form.Item>

                    <Form.Item label="Recipient Asset ID" name="recipientAssetId">
                      <Input />
                    </Form.Item>

                    <Form.Item wrapperCol={{ offset: 6 }}>
                      <Button type="primary" htmlType="submit" loading={transferLoading}>
                        Transfer
                      </Button>
                    </Form.Item>
                  </Form>
                </Tabs.TabPane>
                <Tabs.TabPane tab="Cross-Chain Transfer" key="CrossChainTransfer">
                  <Form
                    layout="horizontal"
                    labelCol={{ span: 6 }}
                    wrapperCol={{ span: 18 }}
                    name="crossChainTransfer"
                    onFinish={(values) =>
                      crossChainTransfer(
                        values.amount,
                        values.fromAssetId,
                        values.fromChainId,
                        values.toAssetId,
                        values.toChainId,
                        values.withdrawalAddress,
                      )
                    }
                    onFinishFailed={onFinishFailed}
                    form={transferForm}
                  >
                    <Form.Item label="Amount" name="amount">
                      <Input placeholder="Amount in Wei" />
                    </Form.Item>

                    <Form.Item label="From Asset ID" name="fromAssetId">
                      <Select defaultActiveFirstOption={true}>
                        {Array.from(new Set(channels.flatMap((channel) => channel.assetIds))).map((assetId) => (
                          <Select.Option value={assetId} key={assetId}>
                            {assetId}
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>

                    <Form.Item label="From Chain ID" name="fromChainId">
                      <Select defaultActiveFirstOption={true}>
                        {Array.from(new Set(channels.flatMap((channel) => channel.assetIds))).map((assetId) => (
                          <Select.Option value={assetId} key={assetId}>
                            {assetId}
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>

                    <Form.Item label="To Asset ID" name="toAssetId">
                      <Select defaultActiveFirstOption={true}>
                        {Array.from(new Set(channels.map((channel) => channel.networkContext.chainId))).map(
                          (assetId) => (
                            <Select.Option value={assetId} key={assetId}>
                              {assetId}
                            </Select.Option>
                          ),
                        )}
                      </Select>
                    </Form.Item>

                    <Form.Item label="To Chain ID" name="toChainId">
                      <Select defaultActiveFirstOption={true}>
                        {Array.from(new Set(channels.map((channel) => channel.networkContext.chainId))).map(
                          (assetId) => (
                            <Select.Option value={assetId} key={assetId}>
                              {assetId}
                            </Select.Option>
                          ),
                        )}
                      </Select>
                    </Form.Item>

                    <Form.Item wrapperCol={{ offset: 6 }}>
                      <Button type="primary" htmlType="submit" loading={transferLoading}>
                        Transfer
                      </Button>
                    </Form.Item>
                  </Form>
                </Tabs.TabPane>
              </Tabs>
            </Col>
          </Row>

          <Divider orientation="left">Withdraw</Divider>
          <Row gutter={16}>
            <Col span={24}>
              <Form
                layout="horizontal"
                labelCol={{ span: 6 }}
                wrapperCol={{ span: 18 }}
                name="withdraw"
                initialValues={{
                  assetId: selectedChannel?.assetIds && selectedChannel?.assetIds[0],
                  recipient: selectedChannel?.bob,
                }}
                onFinish={(values) => withdraw(values.assetId, values.amount, values.recipient)}
                onFinishFailed={onFinishFailed}
                form={withdrawForm}
              >
                <Form.Item label="Asset ID" name="assetId">
                  <Input placeholder={constants.AddressZero} />
                  {/* <Select>
                    {channel?.assetIds?.map(aid => {
                      return (
                        <Select.Option key={aid} value={aid}>
                          {aid}
                        </Select.Option>
                      );
                    })}
                  </Select> */}
                </Form.Item>

                <Form.Item
                  label="Recipient"
                  name="recipient"
                  rules={[{ required: true, message: "Please input recipient address" }]}
                >
                  <Input />
                </Form.Item>

                <Form.Item
                  label="Amount"
                  name="amount"
                  rules={[{ required: true, message: "Please input withdrawal amount" }]}
                >
                  <Input.Search
                    enterButton="MAX"
                    onSearch={() => {
                      const assetId = withdrawForm.getFieldValue("assetId");
                      const amount = getBalanceForAssetId(selectedChannel, assetId, "bob");
                      withdrawForm.setFieldsValue({ amount });
                    }}
                  />
                </Form.Item>

                <Form.Item wrapperCol={{ offset: 6 }}>
                  <Button type="primary" htmlType="submit" loading={withdrawLoading}>
                    Withdraw
                  </Button>
                </Form.Item>
              </Form>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}

export default App;
