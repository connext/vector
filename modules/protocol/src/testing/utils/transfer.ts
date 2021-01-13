import {
  FullChannelState,
  FullTransferState,
  IVectorProtocol,
  CreateTransferParams,
  ChannelUpdate,
  UpdateType,
  ResolveTransferParams,
  TransferResolver,
  DEFAULT_TRANSFER_TIMEOUT,
  Balance,
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
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";

import { env } from "../env";
import { CHAIN_ID } from "../constants";

// Will create a hashlock transfer in the channel, and return the full
// transfer state (including the necessary resolver)
export const createTransfer = async (
  channelAddress: string,
  creator: IVectorProtocol,
  resolver: IVectorProtocol,
  assetId: string = AddressZero,
  amount: BigNumberish = 10,
  outsiderPayee?: string,
  channelInitialBalance?: Balance,
  skipBalanceVerification = false, // use true if testing concurrency
): Promise<{ channel: FullChannelState; transfer: FullTransferState }> => {
  // Create the transfer information
  const preImage = getRandomBytes32();
  const lockHash = createlockHash(preImage);
  const payorAddress = creator.signerAddress;
  const payeeAddress = outsiderPayee ?? resolver.signerAddress;

  const balance = {
    to: [payorAddress, payeeAddress],
    amount: [amount.toString(), "0"],
  };
  const transferInitialState = createTestHashlockTransferState({ lockHash });
  const params: CreateTransferParams = {
    channelAddress,
    balance,
    transferDefinition: env.chainAddresses[CHAIN_ID].hashlockTransferAddress,
    transferInitialState,
    timeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
    meta: { test: "field" },
    assetId,
  };

  const preCreateChannel = await creator.getChannelState(channelAddress);
  const assetIdx = (preCreateChannel?.assetIds ?? []).findIndex((a) => a === assetId);
  const preCreateBalance = channelInitialBalance ?? preCreateChannel!.balances[assetIdx];
  const isAlice = creator.signerAddress === preCreateChannel?.alice;
  const initCreatorBalance = preCreateBalance.amount[isAlice ? 0 : 1];
  const initResolverBalance = preCreateBalance.amount[isAlice ? 1 : 0];

  const ret = await creator.create(params);
  expect(ret.getError()).to.be.undefined;
  const channel = ret.getValue();
  expect(await resolver.getChannelState(channelAddress)).to.be.deep.eq(channel);

  const { transferId } = (channel.latestUpdate as ChannelUpdate<typeof UpdateType.create>).details;
  const transfer = await resolver.getTransferState(transferId);
  expect(transfer).to.containSubset({
    balance,
    assetId,
    channelAddress,
    transferId,
    transferDefinition: params.transferDefinition,
    channelFactoryAddress: channel.networkContext.channelFactoryAddress,
    CHAIN_ID,
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

  // Ensure the balance was properly decremented for creator && not touched for
  // resolver
  if (!skipBalanceVerification) {
    const finalCreatorBalance = channel?.balances[assetIdx].amount[isAlice ? 0 : 1];
    const finalResolverBalance = channel?.balances[assetIdx].amount[isAlice ? 1 : 0];
    expect(BigNumber.from(finalCreatorBalance)).to.be.eq(BigNumber.from(initCreatorBalance).sub(balance.amount[0]));
    expect(BigNumber.from(finalResolverBalance)).to.be.eq(BigNumber.from(initResolverBalance).sub(balance.amount[1]));
  }

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
