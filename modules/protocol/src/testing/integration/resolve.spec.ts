import { IVectorProtocol } from "@connext/vector-types";
import { constants } from "ethers";

import { getTestLoggers } from "../utils";
import { createTransfer, getFundedChannel, resolveTransfer } from "../utils/channel";

const testName = "Create Integrations";
const { log } = getTestLoggers(testName);
describe(testName, () => {
  let alice: IVectorProtocol;
  let bob: IVectorProtocol;
  let channelAddress: string;

  beforeEach(async () => {
    const setup = await getFundedChannel(testName, [
      {
        assetId: constants.AddressZero,
        amount: ["14", 0],
      },
    ]);
    alice = setup.alice;
    bob = setup.bob;
    channelAddress = setup.channel.channelAddress;

    log.info({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
    });


  });

  it.only("should resolve an eth transfer from alice -> bob", async () => {
    // Set test constants
    const assetId = constants.AddressZero;
    const transferAmount = "7";
  
    const { transfer } = await createTransfer(
      channelAddress,
      alice,
      bob,
      assetId,
      transferAmount,
    );

    await resolveTransfer(
      channelAddress,
      transfer,
      alice,
      bob,
    );
  });
});
