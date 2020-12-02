import {
  FullChannelState,
  FullTransferState,
  IVectorProtocol,
  CreateTransferParams,
  DEFAULT_TRANSFER_TIMEOUT,
  ChannelUpdate,
  UpdateType,
  ResolveTransferParams,
  TransferResolver,
} from "@connext/vector-types";
import {
  createlockHash,
  createTestHashlockTransferState,
  getRandomBytes32,
  hashTransferState,
  encodeTransferResolver,
  expect,
} from "@connext/vector-utils";
import { defaultAbiCoder } from "@ethersproject/abi";
import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";

import { env } from "../env";
import { chainId } from "../constants";

// Will create a hashlock transfer in the channel, and return the full
// transfer state (including the necessary resolver)
// TODO: Should be improved to create any type of state, though maybe
// this is out of scope for integration test utils
export const createTransfer = async (
  channelAddress: string,
  payor: IVectorProtocol,
  payee: IVectorProtocol,
  assetId: string = AddressZero,
  amount: BigNumberish = 10,
  outsiderPayee?: string | undefined,
): Promise<{ channel: FullChannelState; transfer: FullTransferState }> => {
  // Create the transfer information
  const preImage = getRandomBytes32();
  const lockHash = createlockHash(preImage);
  const payorAddress = payor.signerAddress;
  const payeeAddress = outsiderPayee ? outsiderPayee : payee.signerAddress;

  const balance = {
    to: [payorAddress, payeeAddress],
    amount: [amount.toString(), "0"],
  };

  const transferInitialState = createTestHashlockTransferState({ lockHash });
  const params: CreateTransferParams = {
    channelAddress,
    balance,
    transferDefinition: env.chainAddresses[chainId].hashlockTransferAddress,
    transferInitialState,
    timeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
    meta: { test: "field" },
    assetId,
  };

  const ret = await payor.create(params);
  expect(ret.getError()).to.be.undefined;
  const channel = ret.getValue();
  expect(await payee.getChannelState(channelAddress)).to.be.deep.eq(channel);

  const { transferId } = (channel.latestUpdate as ChannelUpdate<typeof UpdateType.create>).details;
  const transfer = await payee.getTransferState(transferId);
  expect(transfer).to.containSubset({
    balance,
    assetId,
    channelAddress,
    transferId,
    transferDefinition: params.transferDefinition,
    channelFactoryAddress: channel.networkContext.channelFactoryAddress,
    chainId,
    transferState: params.transferInitialState,
    meta: params.meta,
  });

  // Ensure the encodings work
  const hash = hashTransferState(transferInitialState, transfer!.transferEncodings[0]);
  const encoding = encodeTransferResolver({ preImage }, transfer!.transferEncodings[1]);

  expect(transfer!.initialStateHash).to.be.eq(hash);
  const decoded = defaultAbiCoder.decode([transfer!.transferEncodings[1]], encoding)[0];
  expect(decoded.preImage).to.be.deep.eq(preImage);
  expect(transfer!.transferEncodings.length).to.be.eq(2);

  return {
    channel,
    transfer: {
      ...transfer!,
      transferResolver: { preImage },
    },
  };
};

export const resolveTransfer = async (
  channelAddress: string,
  transfer: FullTransferState,
  redeemer: IVectorProtocol,
  counterparty: IVectorProtocol,
  resolver?: TransferResolver,
): Promise<FullChannelState> => {
  const params: ResolveTransferParams = {
    channelAddress,
    transferId: transfer.transferId,
    transferResolver: resolver || transfer.transferResolver!,
    meta: { test: "field" },
  };
  const ret = await redeemer.resolve(params);
  expect(ret.getError()).to.be.undefined;
  const channel = ret.getValue();
  const stored = await redeemer.getTransferState(transfer.transferId);
  expect(stored!.transferResolver).to.deep.eq(params.transferResolver);
  expect(await redeemer.getChannelState(channelAddress)).to.be.deep.eq(channel);
  expect(await counterparty.getChannelState(channelAddress)).to.be.deep.eq(channel);
  expect(await counterparty.getTransferState(transfer.transferId)).to.be.deep.eq(stored);
  return channel;
};
