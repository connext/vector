import { VectorChainReader } from "@connext/vector-contracts";
import {
  createTestChannelState,
  expect,
  getRandomBytes32,
  mkAddress,
  RestServerNodeService,
  mkPublicIdentifier,
  getTestLoggers,
} from "@connext/vector-utils";
import Sinon from "sinon";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Result, UpdateType } from "@connext/vector-types";
import { parseEther } from "@ethersproject/units";

import { config } from "../config";
import * as configService from "../services/config";

const testName = "Auto Rebalance";
const { log } = getTestLoggers(testName, config.logLevel as any);
const chainId = parseInt(Object.keys(config.chainProviders)[0]);

describe(testName, () => {
  let node: Sinon.SinonStubbedInstance<RestServerNodeService>;
  let chainReader: Sinon.SinonStubbedInstance<VectorChainReader>;
  let getRebalanceProfile: Sinon.SinonStub;

  const ethProfile = config.rebalanceProfiles.find((p) => p.chainId === chainId && p.assetId === AddressZero)!;
  const routerPublicIdentifier = mkPublicIdentifier("vectorRRR");

  beforeEach(async () => {
    node = Sinon.createStubInstance(RestServerNodeService);
    node.conditionalTransfer.resolves(Result.ok({} as any));
    node.sendDepositTx.resolves(Result.ok({ txHash: getRandomBytes32() }));
    node.reconcileDeposit.resolves(Result.ok({ channelAddress: mkAddress() }));

    chainReader = Sinon.createStubInstance(VectorChainReader);
    chainReader.getTotalDepositedA.resolves(Result.ok(BigNumber.from(0)));
    chainReader.getTotalDepositedB.resolves(Result.ok(BigNumber.from(0)));
    chainReader.getHydratedProviders.returns(
      Result.ok({
        [1337]: { waitForTransaction: () => Promise.resolve({ logs: [] }) } as any,
      }),
    );

    getRebalanceProfile = Sinon.stub(configService, "getRebalanceProfile");
    getRebalanceProfile.returns(Result.ok(ethProfile));
  });

  afterEach(() => {
    Sinon.restore();
    Sinon.reset();
  });

  it("should not rebalance if threshold is within", async () => {
    const { channel } = createTestChannelState(UpdateType.deposit, {
      alice: mkAddress("0xaaa"),
      aliceIdentifier: routerPublicIdentifier,
      assetIds: [AddressZero],
      balances: [{ to: [mkAddress("0xaaa"), mkAddress("0xbbb")], amount: [transferAmount.mul(3).toString(), "0"] }],
    });
  });
});
