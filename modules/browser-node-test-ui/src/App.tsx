import { BrowserNode } from "@connext/vector-browser-node";
import { ChannelSigner } from "@connext/vector-utils";
import React, { useEffect, useState } from "react";
import pino from "pino";
import { Wallet, constants, utils } from "ethers";
import { Col, Divider, Row, Spin, Statistic, Input, Typography, Table, Form, Button } from "antd";

import "./App.css";
import { FullChannelState } from "@connext/vector-types";

import { config } from "./config";
import Axios from "axios";

const logger = pino();

const layout = {
  labelCol: { span: 6 },
  wrapperCol: { span: 16 },
};
const tailLayout = {
  wrapperCol: { span: 6, offset: 6 },
};

const storedMnemonic = localStorage.getItem("mnemonic");

function App() {
  const [node, setNode] = useState<BrowserNode>();
  const [channel, setChannel] = useState<FullChannelState>();
  const [mnemonic, setMnemonic] = useState<string>();
  const [counterpartyConfig, setCounterpartyConfig] = useState<string>();

  const [setupLoading, setSetupLoading] = useState<boolean>(false);
  const [connectLoading, setConnectLoading] = useState<boolean>(false);
  const [depositLoading, setDepositLoading] = useState<boolean>(false);
  const [requestCollateralLoading, setRequestCollateralLoading] = useState<boolean>(false);

  const [connectError, setConnectError] = useState<string>();

  useEffect(() => {
    const init = async () => {
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
        messagingUrl: config.messagingUrl, // used in place of authUrl + natsUrl in prod setups
        signer,
      });
      const channelsRes = await client.getStateChannels();
      if (channelsRes.isError) {
        setConnectError(channelsRes.getError().message);
        return;
      }
      setChannel(channelsRes.getValue()[0]);
      console.log("channels: ", channelsRes.getValue());
      setNode(client);
      localStorage.setItem("mnemonic", mnemonic);
    } catch (e) {
      console.error("Error connecting node: ", e);
      setConnectError(e.message);
    }
  };

  const setupChannel = async (aliceIdentifier: string, counterpartyUrl: string) => {
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

  const reconcileDeposit = async (assetId: string) => {
    const depositRes = await node.reconcileDeposit({
      channelAddress: channel.channelAddress,
      assetId,
    });
    if (depositRes.isError) {
      console.error("Error depositing", depositRes.getError());
    } else {
      const chan = await node.getStateChannel({ channelAddress: channel.channelAddress });
      setChannel(chan.getValue());
    }
  };

  const requestCollateral = async (assetId: string) => {
    // const requestRes = await node.requestCollateral({
    //   channelAddress: channel.channelAddress,
    //   assetId,
    // });
    // if (requestRes.isError) {
    //   console.error("Error depositing", requestRes.getError());
    // } else {
    //   const chan = await node.getStateChannel({ channelAddress: channel.channelAddress });
    //   setChannel(chan.getValue());
    // }
  };

  const onFinishFailed = errorInfo => {
    console.log("Failed:", errorInfo);
  };

  return (
    <div style={{ margin: 36 }}>
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
      {node?.publicIdentifier && (
        <>
          <Divider orientation="left">Channel</Divider>
          <Row gutter={16}>
            <Col span={24}>
              {channel ? (
                <Statistic title="Channel Address" value={channel.channelAddress} />
              ) : (
                <Form
                  {...layout}
                  name="basic"
                  initialValues={{}}
                  onFinish={async (values: { counterpartyUrl: string; counterpartyIdentifier: string }) => {
                    setSetupLoading(true);
                    await setupChannel(values.counterpartyIdentifier, values.counterpartyUrl);
                    setSetupLoading(false);
                  }}
                  onFinishFailed={onFinishFailed}
                >
                  <Form.Item
                    label="Counterparty URL"
                    name="counterpartyUrl"
                    rules={[{ required: true, message: "Please enter counterparty URL" }]}
                  >
                    <Input.Search
                      onSearch={async value => {
                        try {
                          const config = await Axios.get(`${value}/config`);
                          setCounterpartyConfig(JSON.stringify(config.data, null, 2));
                        } catch (e) {
                          console.error("Error getting config from counterparty:", e);
                        }
                      }}
                      enterButton="Get Config"
                    />
                  </Form.Item>

                  {counterpartyConfig && (
                    <Form.Item label="Counterparty Config">
                      <Typography.Text code>{counterpartyConfig}</Typography.Text>
                    </Form.Item>
                  )}

                  <Form.Item
                    label="Counterparty Public Identifier"
                    name="counterpartyIdentifier"
                    rules={[{ required: true, message: "Please enter counterparty public identifier (i.e. indra...)" }]}
                  >
                    <Input />
                  </Form.Item>

                  <Form.Item {...tailLayout}>
                    <Button type="primary" htmlType="submit" loading={setupLoading}>
                      Setup
                    </Button>
                  </Form.Item>
                </Form>
              )}
            </Col>
          </Row>
          <Divider orientation="left">Balance & Deposit</Divider>
          <Row gutter={16}>
            {channel && channel.assetIds && (
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
              </Col>
            )}
          </Row>
          <Row gutter={16}>
            <Col span={18}>
              <Input.Search
                placeholder={constants.AddressZero}
                enterButton="Reconcile Deposit"
                size="large"
                suffix="Asset ID"
                onSearch={async assetId => {
                  setDepositLoading(true);
                  await reconcileDeposit(assetId || constants.AddressZero);
                  setDepositLoading(false);
                }}
                loading={depositLoading}
              />
            </Col>
          </Row>
          <Row gutter={16} style={{ paddingTop: 16 }}>
            <Col span={18}>
              <Input.Search
                placeholder={constants.AddressZero}
                enterButton="Request Collateral"
                size="large"
                suffix="Asset ID"
                onSearch={async assetId => {
                  setRequestCollateralLoading(true);
                  await requestCollateral(assetId || constants.AddressZero);
                  setRequestCollateralLoading(false);
                }}
                loading={requestCollateralLoading}
              />
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}

export default App;
