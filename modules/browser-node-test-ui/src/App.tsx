import { BrowserNode } from "@connext/vector-browser-node";
import { ChannelSigner } from "@connext/vector-utils";
import React, { useEffect, useState } from "react";
import pino from "pino";
import { Wallet, constants, utils } from "ethers";
import { Col, Divider, Row, Spin, Statistic, Input, Typography, Table, Form, Checkbox, Button } from "antd";

import "./App.css";
import { FullChannelState } from "@connext/vector-types";

import { config } from "./config";

const logger = pino();

const layout = {
  labelCol: { span: 6 },
  wrapperCol: { span: 16 },
};
const tailLayout = {
  wrapperCol: { span: 6, offset: 6 },
};

function App() {
  const [node, setNode] = useState<BrowserNode>();
  const [connectError, setConnectError] = useState<string>();
  const [channel, setChannel] = useState<FullChannelState>();
  const [counterpartyUrl, setCounterpartyUrl] = useState<string>("http://localhost:8007");
  const [aliceIdentifier, setAliceIdentifier] = useState<string>();
  const [setupLoading, setSetupLoading] = useState<boolean>(false);
  const [connectLoading, setConnectLoading] = useState<boolean>(false);
  const [depositAssetId, setDepositAssetId] = useState<string>(constants.AddressZero);
  const [depositLoading, setDepositLoading] = useState<boolean>(false);
  const [mnemonic, setMnemonic] = useState<string>();

  useEffect(() => {
    const init = async () => {
      const storedMnemonic = localStorage.getItem("mnemonic");
      if (!storedMnemonic) {
        return;
      }
      console.log("Found stored mnemonic, hydrating node");
      await connectNode(storedMnemonic);
    };
    init();
  }, []);

  const connectNode = async (mnemonic: string) => {
    console.log(config);
    try {
      const wallet = Wallet.fromMnemonic(mnemonic);
      const signer = new ChannelSigner(wallet.privateKey);
      const client = await BrowserNode.connect({
        chainAddresses: config.chainAddresses,
        chainProviders: config.chainProviders,
        logger,
        authUrl: config.authUrl, // optional, only for local setups
        natsUrl: config.natsUrl, // optional, only for local setups
        messagingUrl: config.messagingUrl,
        signer,
      });
      const channelsRes = await client.getStateChannels();
      if (channelsRes.isError) {
        setConnectError(channelsRes.getError().message);
        return;
      }
      setChannel(channelsRes.getValue()[0]);
      console.log("channel: ", channelsRes.getValue());
      setNode(client);
      localStorage.setItem("mnemonic", mnemonic);
    } catch (e) {
      console.error("Error connecting node: ", e);
      setConnectError(e.message);
    }
  };

  const setupChannel = async () => {
    const setupRes = await node.requestSetup({
      aliceIdentifier,
      aliceUrl: counterpartyUrl,
      chainId: 1337,
      timeout: "100000",
    });
    if (setupRes.isError) {
      console.error(setupRes.getError());
    } else {
      setChannel(setupRes.getValue() as FullChannelState);
    }
  };

  const reconcileDeposit = async () => {
    const depositRes = await node.reconcileDeposit({
      channelAddress: channel.channelAddress,
      assetId: depositAssetId,
    });
    if (depositRes.isError) {
      console.error(depositRes.getError());
    } else {
      const chan = await node.getStateChannel({ channelAddress: channel.channelAddress });
      setChannel(chan.getValue());
    }
  };

  const onFinish = values => {
    console.log("Success:", values);
  };

  const onFinishFailed = errorInfo => {
    console.log("Failed:", errorInfo);
  };

  return (
    <div style={{ margin: 24 }}>
      <Typography.Title>Vector Browser Node</Typography.Title>
      <Divider orientation="left">Connection</Divider>
      <Row gutter={16}>
        {node?.publicIdentifier ? (
          <>
            <Row>
              <Statistic title="Public Identifier" value={node!.publicIdentifier} />
            </Row>{" "}
            <Row>
              <Statistic title="Signer Address" value={node!.signerAddress} />
            </Row>
          </>
        ) : connectError ? (
          <Statistic title="Error Connecting Node" value={connectError} />
        ) : (
          <>
            <Col span={16}>
              <Input.Search
                placeholder="Mnemonic"
                enterButton="Setup Node"
                size="large"
                value={mnemonic}
                onChange={event => setCounterpartyUrl(event.target.value)}
                onSearch={async mnemonic => {
                  setConnectLoading(true);
                  try {
                    await connectNode(mnemonic);
                  } catch (e) {
                    console.error("Error connecting node", e);
                  } finally {
                    setConnectLoading(false);
                  }
                }}
                loading={connectLoading}
              />
            </Col>
            <Col span={8}>
              <Button type="primary" size="large" onClick={() => setMnemonic(Wallet.createRandom().mnemonic.phrase)}>
                Generate Random Mnemonic
              </Button>
            </Col>
          </>
        )}
      </Row>
      <Divider orientation="left">Channels</Divider>
      <Row gutter={16}>
        <Col span={24}>
          {channel ? (
            <Statistic title="Channel Address" value={channel.channelAddress} />
          ) : (
            <Form {...layout} name="basic" initialValues={{}} onFinish={onFinish} onFinishFailed={onFinishFailed}>
              <Form.Item
                label="Counterparty URL"
                name="counterpartyUrl"
                rules={[{ required: true, message: "Counterparty URL" }]}
              >
                <Input />
              </Form.Item>

              <Form.Item
                label="Counterparty Public Identifier"
                name="counterpartyIdentifier"
                rules={[{ required: true, message: "Counterparty Public Identifier" }]}
              >
                <Input.Password />
              </Form.Item>

              <Form.Item {...tailLayout}>
                <Button type="primary" htmlType="submit" loading={setupLoading}>
                  Setup
                </Button>
              </Form.Item>
            </Form>
            // <Input.Search
            //   placeholder="Counterparty Url"
            //   enterButton="Setup Channel"
            //   size="large"
            //   value={counterpartyUrl}
            //   onChange={event => setCounterpartyUrl(event.target.value)}
            //   onSearch={async () => {
            //     setSetupLoading(true);
            //     await setupChannel();
            //     setSetupLoading(false);
            //   }}
            //   loading={setupLoading}
            // />
          )}
        </Col>
      </Row>
      <Divider orientation="left">Balance</Divider>
      <Row gutter={16}>
        {channel && (
          <Col span={24}>
            <Row>
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
            </Row>
            <Row>
              <Input.Search
                placeholder="Asset Id"
                enterButton="Reconcile Deposit"
                size="large"
                value={depositAssetId}
                onChange={event => setDepositAssetId(event.target.value)}
                onSearch={async () => {
                  setDepositLoading(true);
                  await reconcileDeposit();
                  setDepositLoading(false);
                }}
                loading={depositLoading}
              />
            </Row>
          </Col>
        )}
      </Row>
    </div>
  );
}

export default App;
