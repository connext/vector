import { BrowserNode } from "@connext/vector-browser-node";
import {
  getPublicKeyFromPublicIdentifier,
  encrypt,
  createlockHash,
  getBalanceForAssetId,
  getRandomBytes32,
  delay,
} from "@connext/vector-utils";
import React, { useEffect, useState } from "react";
import pino from "pino";
import { constants, utils } from "ethers";
import { Col, Divider, Row, Statistic, Input, Typography, Table, Form, Button, List } from "antd";
import { EngineEvents, EngineParams, FullChannelState, TransferNames } from "@connext/vector-types";

import "./App.css";

function App() {
  const [node, setNode] = useState<BrowserNode>();
  const [channel, setChannel] = useState<FullChannelState>();

  const [setupLoading, setSetupLoading] = useState<boolean>(false);
  const [connectLoading, setConnectLoading] = useState<boolean>(false);
  const [depositLoading, setDepositLoading] = useState<boolean>(false);
  const [requestCollateralLoading, setRequestCollateralLoading] = useState<boolean>(false);
  const [transferLoading, setTransferLoading] = useState<boolean>(false);
  const [withdrawLoading, setWithdrawLoading] = useState<boolean>(false);
  const [entropy, setEntropy] = useState<string>("");
  const [iframeSrc, setIframeSrc] = useState<string>("");

  const [connectError, setConnectError] = useState<string>();

  const [withdrawForm] = Form.useForm();
  const [transferForm] = Form.useForm();

  useEffect(() => {
    const effect = async () => {
      const storedEntropy = localStorage.getItem("entropy");
      const storedIframeSrc = localStorage.getItem("iframeSrc");
      setEntropy(storedEntropy || utils.hexlify(utils.randomBytes(65)));
      setIframeSrc(storedIframeSrc || "http://localhost:3030");
    };
    effect();
  }, []);

  const connectNode = async (iframeSrc: string, entropy: string): Promise<BrowserNode> => {
    if (!iframeSrc) {
      iframeSrc = "http://localhost:3030";
    }
    try {
      setConnectLoading(true);
      const client = await BrowserNode.connect({
        iframeSrc,
        iframeSignerEntropy: entropy,
        logger: pino(),
      });
      const channelsRes = await client.getStateChannels();
      if (channelsRes.isError) {
        setConnectError(channelsRes.getError().message);
        return;
      }
      const _channel = channelsRes.getValue()[0];
      if (_channel) {
        const channelRes = await client.getStateChannel({ channelAddress: _channel });
        console.log("Channel found in store:", channelRes.getValue());
        setChannel(channelRes.getValue());
      }
      setNode(client);
      client.on(EngineEvents.DEPOSIT_RECONCILED, async data => {
        console.log("Received EngineEvents.DEPOSIT_RECONCILED: ", data);
        await updateChannel(client, data.channelAddress);
      });
      // TODO: this is required bc the event handlers are keyed on Date.now()
      await delay(10);
      client.on(EngineEvents.CONDITIONAL_TRANSFER_CREATED, async data => {
        console.log("Received EngineEvents.CONDITIONAL_TRANSFER_CREATED: ", data);
        if (data.transfer.meta.path[0].recipient !== client.publicIdentifier) {
          console.log("We are the sender");
          return;
        }
        console.log(data.transfer.meta.encryptedPreImage);
        const rpc: EngineParams.RpcRequest = {
          id: Date.now(),
          jsonrpc: "2.0",
          method: "chan_decrypt",
          params: data.transfer.meta.encryptedPreImage,
        };
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
      setChannel(res.getValue());
    }
  };

  const setupChannel = async (aliceIdentifier: string) => {
    setSetupLoading(true);
    const setupRes = await node.setup({
      counterpartyIdentifier: aliceIdentifier,
      chainId: 1337,
      timeout: "100000",
    });
    if (setupRes.isError) {
      console.error(setupRes.getError());
    } else {
      setChannel(setupRes.getValue() as FullChannelState);
    }
    setSetupLoading(false);
  };

  const reconcileDeposit = async (assetId: string) => {
    setDepositLoading(true);
    const depositRes = await node.reconcileDeposit({
      channelAddress: channel.channelAddress,
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
      channelAddress: channel.channelAddress,
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
      channelAddress: channel.channelAddress,
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

  const withdraw = async (assetId: string, amount: string, recipient: string) => {
    setWithdrawLoading(true);
    const requestRes = await node.withdraw({
      channelAddress: channel.channelAddress,
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
        <Col span={8}>
          <Button
            danger
            onClick={() => {
              indexedDB.deleteDatabase("VectorIndexedDBDatabase");
              localStorage.clear();
              window.location.reload();
            }}
          >
            Clear Store
          </Button>
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
                renderItem={item => (
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
          <>
            <Col span={12}>
              <Input.Search
                placeholder="IFrame Src (blank for localhost:3030)"
                enterButton="Setup Node"
                size="large"
                value={iframeSrc}
                onChange={event => setIframeSrc(event.target.value)}
                onSearch={() => {
                  localStorage.setItem("iframeSrc", iframeSrc || "http://localhost:3030");
                  localStorage.setItem("entropy", entropy);
                  connectNode(iframeSrc, entropy);
                }}
                loading={connectLoading}
              />
            </Col>
            <Col span={12}>
              <Input.Search
                placeholder="Entropy"
                enterButton="Random"
                value={entropy}
                size="large"
                onChange={event => setEntropy(event.target.value)}
                onSearch={() => setEntropy(utils.hexlify(utils.randomBytes(65)))}
                loading={connectLoading}
              />
            </Col>
          </>
        )}
      </Row>
      {node?.publicIdentifier && (
        <>
          <Divider orientation="left">Channel</Divider>
          <Row gutter={16}>
            <Col span={24}>
              {channel ? (
                <Statistic title="Channel Address" value={channel.channelAddress} />
              ) : (
                <Form layout="horizontal" name="deposit" wrapperCol={{ span: 18 }} labelCol={{ span: 6 }}>
                  <Form.Item label="Setup Channel">
                    <Input.Search
                      onSearch={async value => setupChannel(value)}
                      placeholder="Counterparty Identifier"
                      enterButton="Setup"
                      loading={setupLoading}
                    />
                  </Form.Item>
                </Form>
              )}
            </Col>
          </Row>

          <Divider orientation="left">Balance & Deposit</Divider>
          <Row gutter={16}>
            {channel && channel.assetIds && (
              <Col span={24}>
                <Table
                  dataSource={channel.assetIds.map((assetId, index) => {
                    return {
                      key: index,
                      assetId,
                      counterpartyBalance: channel.balances[index].amount[0], // they are Alice
                      myBalance: channel.balances[index].amount[1], // we are Bob
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
                    onSearch={assetId => reconcileDeposit(assetId || constants.AddressZero)}
                    loading={depositLoading}
                  />
                </Form.Item>
                <Form.Item label="Request Collateral">
                  <Input.Search
                    placeholder={constants.AddressZero}
                    enterButton="Request"
                    suffix="Asset ID"
                    onSearch={assetId => requestCollateral(assetId || constants.AddressZero)}
                    loading={requestCollateralLoading}
                  />
                </Form.Item>
              </Form>
            </Col>
          </Row>

          <Divider orientation="left">Transfer</Divider>
          <Row gutter={16}>
            <Col span={24}>
              <Form
                layout="horizontal"
                labelCol={{ span: 6 }}
                wrapperCol={{ span: 18 }}
                name="transfer"
                initialValues={{ assetId: channel?.assetIds && channel?.assetIds[0], preImage: getRandomBytes32() }}
                onFinish={values => transfer(values.assetId, values.amount, values.recipient, values.preImage)}
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
                      const amount = getBalanceForAssetId(channel, assetId, "bob");
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
                initialValues={{ assetId: channel?.assetIds && channel?.assetIds[0], recipient: channel?.bob }}
                onFinish={values => withdraw(values.assetId, values.amount, values.recipient)}
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
                      const amount = getBalanceForAssetId(channel, assetId, "bob");
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
