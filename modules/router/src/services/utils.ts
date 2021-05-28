import { FullTransferState, INodeService, IVectorChainReader, NodeError, Result } from "@connext/vector-types";
import { FeeCalculationError, normalizeFee } from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { BaseLogger } from "pino";
import { v4 } from "uuid";

// Yes, this is dumb. It helps with mocking because using
// sinon to mock vector-utils functions does not work
export function normalizeGasFees(
  fee: BigNumber,
  baseAssetDecimals: number,
  desiredFeeAssetId: string, // asset you want fee denominated in
  desiredFeeAssetDecimals: number,
  chainId: number,
  ethReader: IVectorChainReader,
  logger: BaseLogger,
  gasPriceOverride?: BigNumber,
): Promise<Result<BigNumber, FeeCalculationError>> {
  return normalizeFee(
    fee,
    baseAssetDecimals,
    desiredFeeAssetId,
    desiredFeeAssetDecimals,
    chainId,
    ethReader,
    logger,
    gasPriceOverride,
  );
}

// Use this utility function to verify if the receiver processed
// a sent transfer. This is to address the edgecase where a transfer
// receiver may be withholding signatures. In this case, the router
// would send a single signed update adding the transfer to the
// channel, and receive an error from a malicious receiver client.
// To determine whether or not the transfer with the sender can be safely
// cancelled, the router sends a deposit update to come to consensus
// on the merkle root and then checks their store for the existing
// transfer. If it exists, the router cannot cancel and if it does not
// the router may safely cancel sender-side payment.
// Returns true if it was processed (cannot cancel), false otherwise.
export async function wasSingleSignedTransferProcessed(
  routerPublicIdentifier: string,
  routingId: string,
  recipientChannelAddress: string,
  nodeService: INodeService,
): Promise<Result<{ senderTransfer: FullTransferState; receiverTransfer?: FullTransferState }, NodeError>> {
  const reconcile = await nodeService.reconcileDeposit({
    publicIdentifier: routerPublicIdentifier,
    channelAddress: recipientChannelAddress,
    assetId: AddressZero,
  });
  if (reconcile.isError) {
    return Result.fail(reconcile.getError()!);
  }

  const transfers = await nodeService.getTransfersByRoutingId({
    routingId,
    publicIdentifier: routerPublicIdentifier,
  });
  if (transfers.isError) {
    return Result.fail(transfers.getError()!);
  }
  const receiverTransfer = transfers.getValue().find((t) => {
    return t.initiatorIdentifier === routerPublicIdentifier;
  }) as FullTransferState | undefined;
  const senderTransfer = transfers.getValue().find((t) => {
    return t.initiatorIdentifier !== routerPublicIdentifier;
  }) as FullTransferState;
  return Result.ok({ senderTransfer, receiverTransfer });
}

// TODO: what else?
export type RequestContext = {
  id: string;
  entry: string;
};

export function createRequestContext(entry: string): RequestContext {
  const id = v4();
  return {
    id,
    entry,
  };
}
