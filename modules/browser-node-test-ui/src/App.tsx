import { BrowserNode } from "@connext/vector-browser-node";
import { ChannelSigner } from "@connext/vector-utils";
import React, { useEffect, useState } from "react";
import pino from "pino";
import { Wallet, constants } from "ethers";
import { Col, Divider, Row, Spin, Statistic, Input, Typography, Table, Button } from "antd";

import "./App.css";
import { config } from "./config";
import { FullChannelState } from "@connext/vector-types";

const logger = pino();
const wallet = Wallet.fromMnemonic(config.mnemonic!);
const signer = new ChannelSigner(wallet.privateKey);
console.log(`Signer from mnemonic: ${signer.publicIdentifier}`);

function App() {
  const [node, setNode] = useState<BrowserNode>();
  const [connectError, setConnectError] = useState<string>();
  const [channel, setChannel] = useState<FullChannelState>();
  const [counterpartyUrl, setCounterpartyUrl] = useState<string>("http://localhost:8007");
  const [setupLoading, setSetupLoading] = useState<boolean>(false);
  const [depositAssetId, setDepositAssetId] = useState<string>(constants.AddressZero);
  const [depositLoading, setDepositLoading] = useState<boolean>(false);

  useEffect(() => {
    const init = async () => {
      console.log(config);
      try {
        const client = await BrowserNode.connect(
          config.messagingUrl,
          logger,
          signer,
          config.chainProviders,
          config.chainAddresses,
        );
        const channelsRes = await client.getStateChannels();
        if (channelsRes.isError) {
          setConnectError(channelsRes.getError().message);
          return;
        }
        setChannel(channelsRes.getValue()[0]);
        console.log("channel: ", channelsRes.getValue());
        setNode(client);
      } catch (e) {
        console.error("Error connecting client: ", e);
        setConnectError(e.message);
      }
    };
    init();
  }, []);

  const setupChannel = async () => {
    const setupRes = await node.requestSetup({
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
          <Spin />
        )}
      </Row>
      <Divider orientation="left">Channels</Divider>
      <Row gutter={16}>
        <Col span={24}>
          {channel ? (
            <Statistic title="Channel Address" value={channel.channelAddress} />
          ) : (
            <Input.Search
              placeholder="Counterparty Url"
              enterButton="Setup Channel"
              size="large"
              value={counterpartyUrl}
              onChange={event => setCounterpartyUrl(event.target.value)}
              onSearch={async () => {
                setSetupLoading(true);
                await setupChannel();
                setSetupLoading(false);
              }}
              loading={setupLoading}
            />
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
