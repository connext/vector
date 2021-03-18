import {
  EngineEvents,
  RouterSchemas,
  INodeService,
  ConditionalTransferCreatedPayload,
  FullChannelState,
  IVectorChainReader,
  jsonifyError,
  Result,
  ConditionalTransferResolvedPayload,
  DEFAULT_CHANNEL_TIMEOUT,
  ChainAddresses,
  IChannelSigner,
  DEFAULT_FEE_EXPIRY,
} from "@connext/vector-types";
import {
  calculateExchangeWad,
  getBalanceForAssetId,
  getExchangeRateInEth,
  getParticipant,
  getRandomBytes32,
  getSignerAddressFromPublicIdentifier,
  hashTransferQuote,
} from "@connext/vector-utils";
import Ajv from "ajv";
import { JsonRpcProvider } from "@ethersproject/providers";
import { BaseLogger } from "pino";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero, HashZero } from "@ethersproject/constants";

import { adjustCollateral, requestCollateral } from "./services/collateral";
import { forwardTransferCreation, forwardTransferResolution, handleIsAlive } from "./forwarding";
import { IRouterStore } from "./services/store";
import { getMatchingSwap, getRebalanceProfile } from "./services/config";
import { IRouterMessagingService } from "./services/messaging";
import { getConfig } from "./config";
import {
  openChannels,
  transactionAttempt,
  transactionSuccess,
  transactionFailed,
  offchainLiquidity,
  parseBalanceToNumber,
  successfulTransfer,
  failedTransfer,
  gasConsumed,
  forwardedTransferSize,
  forwardedTransferVolume,
  attemptedTransfer,
  feesCollected,
  getDecimals,
  mainnetFeesCollectedInEth,
  mainnetGasCost,
} from "./metrics";
import { calculateFeeAmount } from "./services/fees";
import { QuoteError } from "./errors";
import { getSwappedAmount } from "./services/swap";

const config = getConfig();

const ajv = new Ajv();

export type ChainJsonProviders = {
  [k: string]: JsonRpcProvider;
};

// Used to track all the transfers we are forwarding in memory
// so that when router is handling transfers they may have dropped,
// they do not double spend. I.e. sender creates transfer and goes
// offline. Router starts forwarding to receiver, and while this is
// happening sender comes back online. Without tracking the in-progress
// forwards, the transfer would be double created with the receiver via
// the handleIsAlive fn
export const inProgressCreations: { [channelAddr: string]: string[] } = {};

export async function setupListeners(
  routerSigner: IChannelSigner,
  chainAddresses: ChainAddresses,
  nodeService: INodeService,
  store: IRouterStore,
  chainReader: IVectorChainReader,
  messagingService: IRouterMessagingService,
  logger: BaseLogger,
): Promise<void> {
  const method = "setupListeners";
  const methodId = getRandomBytes32();
  logger.debug(
    {
      method,
      methodId,
      routerPublicIdentifier: routerSigner.publicIdentifier,
      routerSignerAddress: routerSigner.address,
    },
    "Method started",
  );

  nodeService.on(EngineEvents.SETUP, async (data) => {
    openChannels.inc({
      chainId: data.chainId,
    });
  });

  nodeService.on(EngineEvents.TRANSACTION_SUBMITTED, async (data) => {
    const channel = await nodeService.getStateChannel({ channelAddress: data.channelAddress });
    if (channel.isError) {
      logger.warn({ ...channel.getError()?.toJson() }, "Failed to get channel");
      return;
    }
    const chainId = channel.getValue()?.networkContext.chainId;
    transactionAttempt.inc({
      reason: data.reason,
      chainId,
    });
  });

  nodeService.on(EngineEvents.TRANSACTION_MINED, async (data) => {
    const channel = await nodeService.getStateChannel({ channelAddress: data.channelAddress });
    if (channel.isError) {
      logger.warn({ ...channel.getError()?.toJson() }, "Failed to get channel");
      return;
    }
    const chainId = channel.getValue()?.networkContext.chainId;
    transactionSuccess.inc({
      reason: data.reason,
      chainId,
    });
    if (!data.receipt) {
      return;
    }
    gasConsumed.inc(
      { chainId, reason: data.reason },
      await parseBalanceToNumber(data.receipt!.cumulativeGasUsed, chainId!.toString(), AddressZero),
    );
    if (chainId !== 1) {
      return;
    }

    // add normalized costs
    const providers = chainReader.getHydratedProviders();
    if (providers.isError) {
      logger.warn({ ...jsonifyError(providers.getError()!) }, "Failed to get hydrated providers");
      return;
    }
    const gasPrice = await providers.getValue()[chainId].getGasPrice();
    const gasUsed = gasPrice.mul(data.receipt.cumulativeGasUsed);
    mainnetGasCost.inc(
      { reason: data.reason, chainId },
      await parseBalanceToNumber(gasUsed, chainId.toString(), AddressZero),
    );
  });

  nodeService.on(EngineEvents.TRANSACTION_FAILED, async (data) => {
    const channel = await nodeService.getStateChannel({ channelAddress: data.channelAddress });
    if (channel.isError) {
      logger.warn({ ...channel.getError()?.toJson() }, "Failed to get channel");
      return;
    }
    const chainId = channel.getValue()?.networkContext.chainId;
    transactionFailed.inc({
      reason: data.reason,
      chainId,
    });
    if (data.receipt) {
      gasConsumed.inc(
        { chainId, reason: data.reason },
        await parseBalanceToNumber(data.receipt.cumulativeGasUsed, chainId!.toString(), AddressZero),
      );
    }
  });

  // Set up listener to handle transfer creation
  nodeService.on(
    EngineEvents.CONDITIONAL_TRANSFER_CREATED,
    async (data: ConditionalTransferCreatedPayload) => {
      const meta = data.transfer.meta as RouterSchemas.RouterMeta;
      const assetId = meta.path[0].recipientAssetId;
      const chainId = meta.path[0].recipientChainId;
      attemptedTransfer.inc({
        assetId,
        chainId,
      });
      // Add to processing
      inProgressCreations[data.channelAddress] = [
        ...(inProgressCreations[data.channelAddress] ?? []),
        data.transfer.transferId,
      ];
      const res = await forwardTransferCreation(
        data,
        routerSigner.publicIdentifier,
        routerSigner.address,
        nodeService,
        store,
        logger,
        chainReader,
      );
      // Remove from processing
      inProgressCreations[data.channelAddress] = inProgressCreations[data.channelAddress].filter(
        (t) => t !== data.transfer.transferId,
      );
      if (res.isError) {
        failedTransfer.inc({
          assetId,
          chainId,
        });
        return logger.error(
          { method: "forwardTransferCreation", error: jsonifyError(res.getError()!) },
          "Error forwarding transfer",
        );
      }
      const created = res.getValue();
      logger.info({ method: "forwardTransferCreation", result: created }, "Successfully forwarded transfer");
      if (!meta.quote) {
        return;
      }
      if (meta.quote.fee === "0") {
        return;
      }
      // Increment fees (taken in sender chain/asset)
      const { assetId: senderAsset, chainId: senderChain } = data.transfer;
      // First increment fees in asset
      feesCollected.inc(
        {
          chainId: senderChain,
          assetId: senderAsset,
        },
        await parseBalanceToNumber(meta.quote.fee, senderChain.toString(), senderAsset),
      );

      // normalize fee to be in mainnet eth if possible
      // NOTE: can only normalize fees if somehow they touch mainnet
      // otherwise we cannot get a valid exchange rate. this means
      // any percentage or flat rate fees on l2 are disregarded.
      if (senderChain !== 1 && chainId !== 1) {
        return;
      }

      // if the receiver chain is 1, then convert the sender amount
      // to the receiver amount using the allowed swaps
      let feeToNormalize = meta.quote.fee;
      let assetToNormalize = senderAsset;
      if (senderChain !== 1) {
        const swapped = await getSwappedAmount(meta.quote.fee, senderAsset, senderChain, assetId, chainId);
        if (swapped.isError) {
          logger.warn({ ...jsonifyError(swapped.getError()!) }, "Error getting receiver-asset denominated fee");
          return;
        }
        feeToNormalize = swapped.getValue();
        assetToNormalize = assetId;
      }

      // get eth-token rate
      const rate = await getExchangeRateInEth(senderAsset, logger);
      if (rate.isError) {
        // calculate exchange rate
        logger.warn({ ...jsonifyError(rate.getError()!), assetToNormalize, chain: 1 }, "Failed to get exchange rate");
        return;
      }
      const feeDecimals = await getDecimals("1", assetToNormalize);

      // get fee in eth
      const ethFee = calculateExchangeWad(BigNumber.from(feeToNormalize), feeDecimals, rate.getValue().toString(), 18);

      mainnetFeesCollectedInEth.inc(
        { chainId: senderChain, assetId: senderAsset },
        await parseBalanceToNumber(ethFee, "1", AddressZero),
      );
    },
    (data: ConditionalTransferCreatedPayload) => {
      // Only forward transfers with valid routing metas
      const meta = data.transfer.meta as RouterSchemas.RouterMeta;
      const validate = ajv.compile(RouterSchemas.RouterMeta);
      const valid = validate(meta);
      if (!valid) {
        logger.info(
          {
            transferId: data.transfer.transferId,
            routingId: meta.routingId,
            channelAddress: data.channelAddress,
            errors: validate.errors?.map((err) => err.message).join(","),
          },
          "Not forwarding non-routing transfer",
        );
        return false;
      }

      if (data.transfer.initiator === routerSigner.address) {
        logger.info(
          { initiator: data.transfer.initiator },
          "Not forwarding transfer which was initiated by our node, doing nothing",
        );
        return false;
      }

      if (!meta.path[0].recipient || meta.path[0].recipient === routerSigner.publicIdentifier) {
        logger.warn(
          { path: meta.path[0], publicIdentifier: routerSigner.publicIdentifier },
          "Not forwarding transfer with no path to follow",
        );
        return false;
      }
      return true;
    },
  );

  // Set up listener to handle transfer resolution
  nodeService.on(
    EngineEvents.CONDITIONAL_TRANSFER_RESOLVED,
    async (data: ConditionalTransferResolvedPayload) => {
      const res = await forwardTransferResolution(
        data,
        routerSigner.publicIdentifier,
        routerSigner.address,
        nodeService,
        store,
        logger,
      );
      if (res.isError) {
        failedTransfer.inc({
          assetId: data.transfer.assetId,
          chainId: data.transfer.chainId,
        });

        return logger.error(
          { method: "forwardTransferResolution", error: jsonifyError(res.getError()!) },
          "Error forwarding resolution",
        );
      }
      const resolved = res.getValue();
      if (!!resolved) {
        // was not queued, use receiver transfer for values
        const amount = BigNumber.from(data.transfer.balance.amount[0]).add(data.transfer.balance.amount[1]);
        successfulTransfer.inc({
          assetId: data.transfer.assetId,
          chainId: data.transfer.chainId,
        });

        // add volume metrics
        const amountNumber = await parseBalanceToNumber(
          amount,
          data.transfer.chainId.toString(),
          data.transfer.assetId,
        );
        forwardedTransferSize.set({ assetId: data.transfer.assetId, chainId: data.transfer.chainId }, amountNumber);
        forwardedTransferVolume.inc(
          {
            assetId: data.transfer.assetId,
            chainId: data.transfer.chainId,
          },
          amountNumber,
        );
      }
      logger.info(
        { event: EngineEvents.CONDITIONAL_TRANSFER_RESOLVED, result: resolved },
        "Successfully forwarded resolution",
      );

      const transferSenderResolutionChannelAddress = resolved?.channelAddress;
      const transferSenderResolutionAssetId = resolved?.assetId;
      if (!transferSenderResolutionChannelAddress || !transferSenderResolutionAssetId) {
        logger.warn(
          {
            event: EngineEvents.CONDITIONAL_TRANSFER_RESOLVED,
            transferSenderResolutionChannelAddress,
            transferSenderResolutionAssetId,
          },
          "No channel or transfer found in response, will not adjust sender collateral",
        );
        return;
      }

      // Adjust collateral in channel
      const response = await adjustCollateral(
        transferSenderResolutionChannelAddress,
        transferSenderResolutionAssetId,
        routerSigner.publicIdentifier,
        nodeService,
        chainReader,
        logger,
      );
      if (response.isError) {
        return logger.error(
          { method: "adjustCollateral", error: jsonifyError(response.getError()!) },
          "Error adjusting collateral",
        );
      }
      logger.info({ method: "adjustCollateral", result: response.getValue() }, "Successfully adjusted collateral");
    },
    (data: ConditionalTransferCreatedPayload) => {
      // Only forward transfers with valid routing metas
      const validate = ajv.compile(RouterSchemas.RouterMeta);
      const valid = validate(data.transfer.meta);
      if (!valid) {
        logger.info(
          {
            transferId: data.transfer.transferId,
            channelAddress: data.channelAddress,
            errors: validate.errors?.map((err) => err.message),
          },
          "Not forwarding non-routing transfer",
        );
        return false;
      }

      // If there is no resolver, do nothing
      if (!data.transfer.transferResolver) {
        logger.warn(
          {
            transferId: data.transfer,
            routingId: data.transfer.meta.routingId,
            channelAddress: data.transfer.channelAddress,
          },
          "No resolver found in transfer",
        );
        return false;
      }

      // If we are the receiver of this transfer, do nothing
      // (indicates a sender-side resolve)
      if (data.transfer.responder === routerSigner.address) {
        logger.info({ routingId: data.transfer.meta.routingId }, "Nothing to reclaim");
        return false;
      }

      return true;
    },
  );

  nodeService.on(EngineEvents.REQUEST_COLLATERAL, async (data) => {
    const method = "requestCollateral";
    const methodId = getRandomBytes32();
    logger.info(
      { method, methodId, channelAddress: data.channelAddress, assetId: data.assetId, amount: data.amount },
      "Received request collateral event",
    );
    logger.debug({ method, methodId, event: data }, "Handling event");
    const channelRes = await nodeService.getStateChannel({
      channelAddress: data.channelAddress,
      publicIdentifier: routerSigner.publicIdentifier,
    });
    if (channelRes.isError) {
      logger.error(
        {
          method,
          methodId,
          channelAddress: data.channelAddress,
          error: jsonifyError(channelRes.getError()!),
        },
        "Could not get channel",
      );
      return;
    }
    const channel = channelRes.getValue();
    if (!channel) {
      logger.error({ method, methodId, channelAddress: data.channelAddress }, "Channel undefined");
      return;
    }

    // Verify the requested amount here is less than the reclaimThreshold
    // NOTE: this is done to allow users to request a specific amount of
    // collateral via the server-node requestCollateral endpoint. If it
    // is done within the `requestCollateral` function, then when that fn
    // is called by `justInTimeCollateral` it will not allow for a large
    // payment
    const profileRes = getRebalanceProfile(channel.networkContext.chainId, data.assetId);
    if (profileRes.isError) {
      logger.error(
        {
          method,
          methodId,
          error: jsonifyError(profileRes.getError()!),
          assetId: data.assetId,
          channelAddress: channel.channelAddress,
        },
        "Could not get rebalance profile",
      );
      return;
    }
    const profile = profileRes.getValue();
    if (data.amount && BigNumber.from(data.amount).gt(profile.reclaimThreshold)) {
      logger.error(
        {
          method,
          methodId,
          profile,
          requestedAmount: data.amount,
          assetId: data.assetId,
          channelAddress: channel.channelAddress,
        },
        "Requested amount gt reclaimThreshold",
      );
      return;
    }

    const res = await requestCollateral(
      channel as FullChannelState,
      data.assetId,
      routerSigner.publicIdentifier,
      nodeService,
      chainReader,
      logger,
      data.amount,
    );
    if (res.isError) {
      logger.error({ method, methodId, error: jsonifyError(res.getError()!) }, "Error requesting collateral");
      return;
    }

    logger.info(
      { method, methodId, assetId: data.assetId, channelAddress: channel.channelAddress },
      "Succesfully requested collateral",
    );
  });

  nodeService.on(EngineEvents.DEPOSIT_RECONCILED, async (data) => {
    // TODO: do we want this to be updated on withdrawal as well #442
    const channelRes = await nodeService.getStateChannel({ channelAddress: data.channelAddress });
    if (channelRes.isError) {
      logger.warn({ ...channelRes.getError()?.toJson() }, "Failed to get channel");
      return;
    }
    const channel = channelRes.getValue() as FullChannelState;
    const participant = getParticipant(channel, nodeService.publicIdentifier);
    if (!participant) {
      return;
    }
    const balance = getBalanceForAssetId(channel, data.assetId, participant);
    const parsed = await parseBalanceToNumber(balance, channel.networkContext.chainId.toString(), data.assetId);
    offchainLiquidity.set({ assetId: data.assetId, chainId: channel.networkContext.chainId }, parsed);
  });

  nodeService.on(EngineEvents.WITHDRAWAL_RESOLVED, async (data) => {
    const channelRes = await nodeService.getStateChannel({ channelAddress: data.channelAddress });
    if (channelRes.isError) {
      logger.warn({ ...channelRes.getError()?.toJson() }, "Failed to get channel");
      return;
    }
    const channel = channelRes.getValue() as FullChannelState;
    const participant = getParticipant(channel, nodeService.publicIdentifier);
    if (!participant) {
      return;
    }
    const balance = getBalanceForAssetId(channel, data.assetId, participant);
    const chainId = channel.networkContext.chainId;
    const parsed = await parseBalanceToNumber(balance, chainId.toString(), data.assetId);
    offchainLiquidity.set({ assetId: data.assetId, chainId }, parsed);

    // increment fees iff alice
    if (participant === "alice" && data.transfer.meta.quote) {
      feesCollected.inc(
        { chainId, assetId: data.assetId },
        await parseBalanceToNumber(data.transfer.transferState.fee, chainId.toString(), data.assetId),
      );
    }
  });

  nodeService.on(EngineEvents.IS_ALIVE, async (data) => {
    const res = await handleIsAlive(
      data,
      routerSigner.publicIdentifier,
      routerSigner.address,
      nodeService,
      store,
      chainReader,
      logger,
    );
    if (res.isError) {
      logger.error({ method: "handleIsAlive", error: jsonifyError(res.getError()!) }, "Error handling isAlive");
      return;
    }

    logger.info({ method: "handleIsAlive", res: res.getValue() }, "Succesfully handled isAlive");
  });

  /////////////////////////////////
  ///// Messaging responses //////
  ///////////////////////////////
  await messagingService.onReceiveRouterConfigMessage(routerSigner.publicIdentifier, async (request, from, inbox) => {
    const method = "onReceiveRouterConfigMessage";
    const methodId = getRandomBytes32();
    logger.debug({ method, methodId }, "Method started");
    if (request.isError) {
      logger.error(
        { error: request.getError()!.toJson(), from, method, methodId },
        "Received error, shouldn't happen!",
      );
      return;
    }
    const { chainProviders, allowedSwaps } = config;
    const supportedChains = Object.keys(chainProviders)
      .map((x) => parseInt(x))
      .filter((x) => !!x);
    await messagingService.respondToRouterConfigMessage(inbox, Result.ok({ supportedChains, allowedSwaps }));
    logger.debug({ method, methodId }, "Method complete");
  });

  await messagingService.onReceiveTransferQuoteMessage(routerSigner.publicIdentifier, async (request, from, inbox) => {
    const method = "onReceiveTransferQuoteMessage";
    const methodId = getRandomBytes32();
    logger.debug({ method, methodId }, "Method started");
    if (request.isError) {
      logger.error(
        { error: request.getError()!.toJson(), from, method, methodId },
        "Received error, shouldn't happen!",
      );
      return;
    }
    const {
      amount,
      assetId,
      chainId,
      recipient: _recipient,
      recipientChainId: _recipientChainId,
      recipientAssetId: _recipientAssetId,
      receiveExactAmount: _receiveExactAmount,
    } = request.getValue();

    const recipient = _recipient ?? routerSigner.publicIdentifier;
    const recipientChainId = _recipientChainId ?? chainId;
    const recipientAssetId = _recipientAssetId ?? assetId;
    const receiveExactAmount = _receiveExactAmount ?? false;

    const isSwap = recipientChainId !== chainId || recipientAssetId !== assetId;
    const supported = isSwap
      ? getMatchingSwap(assetId, chainId, recipientAssetId, recipientChainId)
      : getRebalanceProfile(recipientChainId, recipientAssetId);

    if (supported.isError || !supported.getValue()) {
      // transfer of this chain/asset not supported
      await messagingService.respondToTransferQuoteMessage(
        inbox,
        Result.fail(
          new QuoteError(QuoteError.reasons.TransferNotSupported, {
            recipient,
            recipientChainId,
            recipientAssetId,
            assetId,
            chainId,
            sender: from,
          }),
        ),
      );
      return;
    }

    const supportedChains = Object.keys(config.chainProviders);
    if (!supportedChains.includes(chainId.toString()) || !supportedChains.includes(recipientChainId.toString())) {
      // recipient or sender chain not supported
      await messagingService.respondToTransferQuoteMessage(
        inbox,
        Result.fail(
          new QuoteError(QuoteError.reasons.ChainNotSupported, {
            supportedChains,
            recipient,
            recipientChainId,
            recipientAssetId,
            assetId,
            chainId,
            sender: from,
          }),
        ),
      );
      return;
    }

    const [senderChannelRes, recipientChannelRes] = await Promise.all([
      nodeService.getStateChannelByParticipants({ counterparty: from, chainId }),
      nodeService.getStateChannelByParticipants({
        chainId: recipientChainId,
        counterparty: recipient === routerSigner.publicIdentifier ? from : recipient,
      }),
    ]);

    if (senderChannelRes.isError || recipientChannelRes.isError) {
      // return error to counterparty
      await messagingService.respondToTransferQuoteMessage(
        inbox,
        Result.fail(
          new QuoteError(QuoteError.reasons.CouldNotGetChannel, {
            senderChannelError: senderChannelRes.isError ? jsonifyError(senderChannelRes.getError()!) : undefined,
            recipientChannelError: recipientChannelRes.isError
              ? jsonifyError(recipientChannelRes.getError()!)
              : undefined,
            recipient,
            recipientChainId,
            recipientAssetId,
            assetId,
            chainId,
            sender: from,
          }),
        ),
      );
      return;
    }

    const getEmptyChannel = async (
      counterparty: string,
      chainId: number,
    ): Promise<Result<FullChannelState, QuoteError>> => {
      const alice = getSignerAddressFromPublicIdentifier(routerSigner.publicIdentifier);
      const bob = getSignerAddressFromPublicIdentifier(counterparty);
      const channelAddress = await chainReader.getChannelAddress(
        alice,
        bob,
        chainAddresses[chainId].channelFactoryAddress,
        chainId,
      );
      if (channelAddress.isError) {
        return Result.fail(
          new QuoteError(QuoteError.reasons.CouldNotGetChannelAddress, {
            chainServiceError: jsonifyError(channelAddress.getError()!),
            recipient,
            recipientChainId,
            recipientAssetId,
            assetId,
            chainId,
            sender: from,
          }),
        );
      }
      return Result.ok({
        nonce: 1,
        channelAddress: channelAddress.getValue(),
        timeout: DEFAULT_CHANNEL_TIMEOUT.toString(),
        alice,
        bob,
        balances: [],
        processedDepositsA: [],
        processedDepositsB: [],
        assetIds: [],
        defundNonces: [],
        merkleRoot: HashZero,
        latestUpdate: {} as any,
        networkContext: {
          chainId,
          channelFactoryAddress: chainAddresses[chainId].channelFactoryAddress,
          transferRegistryAddress: chainAddresses[chainId].transferRegistryAddress,
        },
        aliceIdentifier: routerSigner.publicIdentifier,
        bobIdentifier: counterparty,
        inDispute: false,
      });
    };

    let senderChannel = senderChannelRes.getValue() as FullChannelState | undefined;
    if (!senderChannel) {
      const placeholder = await getEmptyChannel(from, chainId);
      if (placeholder.isError) {
        await messagingService.respondToTransferQuoteMessage(inbox, Result.fail(placeholder.getError()!));
        return;
      }
      senderChannel = placeholder.getValue();
    }
    let recipientChannel = recipientChannelRes.getValue() as FullChannelState | undefined;
    if (!recipientChannel) {
      const placeholder = await getEmptyChannel(recipient, chainId);
      if (placeholder.isError) {
        await messagingService.respondToTransferQuoteMessage(inbox, Result.fail(placeholder.getError()!));
        return;
      }
      recipientChannel = placeholder.getValue();
    }
    const feeRes = await calculateFeeAmount(
      BigNumber.from(amount),
      receiveExactAmount,
      assetId,
      senderChannel,
      recipientAssetId,
      recipientChannel,
      chainReader,
      routerSigner.publicIdentifier,
      logger,
    );
    if (feeRes.isError) {
      await messagingService.respondToTransferQuoteMessage(
        inbox,
        Result.fail(
          new QuoteError(QuoteError.reasons.CouldNotGetFee, {
            feeError: jsonifyError(feeRes.getError()!),
            recipient,
            recipientChainId,
            recipientAssetId,
            assetId,
            chainId,
            sender: from,
          }),
        ),
      );
      return;
    }
    const { fee, amount: quoteAmount } = feeRes.getValue();
    const quote = {
      assetId,
      amount: quoteAmount.toString(),
      chainId,
      routerIdentifier: routerSigner.publicIdentifier,
      recipient,
      recipientChainId,
      recipientAssetId,
      fee: fee.toString(),
      expiry: (Date.now() + (getConfig().feeQuoteExpiry ?? DEFAULT_FEE_EXPIRY)).toString(), // valid for next 2 blocks
    };
    const toSign = hashTransferQuote(quote);
    try {
      const signature = await routerSigner.signMessage(toSign);
      await messagingService.respondToTransferQuoteMessage(inbox, Result.ok({ ...quote, signature }));
    } catch (e) {
      await messagingService.respondToTransferQuoteMessage(
        inbox,
        Result.fail(
          new QuoteError(QuoteError.reasons.CouldNotSignQuote, {
            error: jsonifyError(e),
            recipient,
            recipientChainId,
            recipientAssetId,
            assetId,
            chainId,
            sender: from,
            fee: quote.fee,
            expiry: quote.expiry,
          }),
        ),
      );
    }
  });

  logger.debug({ method, methodId }, "Method complete");
}
