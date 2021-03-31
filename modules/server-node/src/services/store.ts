import {
  FullChannelState,
  Balance,
  CreateUpdateDetails,
  DepositUpdateDetails,
  ResolveUpdateDetails,
  SetupUpdateDetails,
  FullTransferState,
  UpdateType,
  EngineEvent,
  IServerNodeStore,
  WithdrawCommitmentJson,
  StoredTransaction,
  TransactionReason,
  StoredTransactionStatus,
  ChannelDispute,
  TransferDispute,
  GetTransfersFilterOpts,
  CoreChannelState,
  CoreTransferState,
} from "@connext/vector-types";
import { getRandomBytes32, getSignerAddressFromPublicIdentifier } from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { TransactionResponse, TransactionReceipt } from "@ethersproject/providers";

import { config } from "../config";
import {
  Prisma,
  Channel,
  PrismaClient,
  Update,
  Balance as BalanceEntity,
  Transfer,
  OnchainTransaction,
  ChannelDispute as ChannelDisputeEntity,
  TransferDispute as TransferDisputeEntity,
} from "../generated/db-client";

const convertOnchainTransactionEntityToTransaction = (
  onchainEntity: OnchainTransaction & {
    channel: Channel;
  },
): StoredTransaction => {
  return {
    status: onchainEntity.status as StoredTransactionStatus,
    reason: onchainEntity.reason as TransactionReason,
    error: onchainEntity.error ?? undefined,
    channelAddress: onchainEntity.channelAddress,
    to: onchainEntity.to,
    from: onchainEntity.from,
    data: onchainEntity.data,
    value: onchainEntity.value,
    chainId: BigNumber.from(onchainEntity.chainId).toNumber(),
    nonce: onchainEntity.nonce,
    gasLimit: onchainEntity.gasLimit,
    gasPrice: onchainEntity.gasPrice,
    transactionHash: onchainEntity.transactionHash,
    timestamp: onchainEntity.timestamp ? BigNumber.from(onchainEntity.timestamp).toNumber() : undefined,
    raw: onchainEntity.raw ?? undefined,
    blockHash: onchainEntity.blockHash ?? undefined,
    blockNumber: onchainEntity.blockNumber ?? undefined,
    contractAddress: onchainEntity.contractAddress ?? undefined,
    transactionIndex: onchainEntity.transactionIndex ?? undefined,
    root: onchainEntity.root ?? undefined,
    gasUsed: onchainEntity.gasUsed ?? undefined,
    logsBloom: onchainEntity.logsBloom ?? undefined,
    cumulativeGasUsed: onchainEntity.cumulativeGasUsed ?? undefined,
    byzantium: onchainEntity.byzantium ?? undefined,
    logs: onchainEntity.logs ? JSON.parse(onchainEntity.logs) : undefined,
  };
};

const convertChannelEntityToFullChannelState = (
  channelEntity: Channel & {
    balances: BalanceEntity[];
    latestUpdate: Update | null;
    disputeReference: ChannelDisputeEntity | null;
  },
): FullChannelState => {
  // use the inputted assetIds to preserve order
  const assetIds = channelEntity?.assetIds ? channelEntity.assetIds.split(",") : [];

  // get balances and locked value for each assetId
  const processedDepositsA: string[] = [];
  const processedDepositsB: string[] = [];
  const defundNonces: string[] = [];
  const balances: Balance[] = assetIds.map((assetId) => {
    const balanceA = channelEntity.balances.find(
      (bal) => bal.assetId === assetId && bal.participant === channelEntity.participantA,
    );
    processedDepositsA.push(balanceA?.processedDeposit ?? "0");
    const balanceB = channelEntity.balances.find(
      (bal) => bal.assetId === assetId && bal.participant === channelEntity.participantB,
    );
    defundNonces.push(balanceA?.defundNonce ?? "1");
    processedDepositsB.push(balanceB?.processedDeposit ?? "0");
    return {
      amount: [balanceA?.amount ?? "0", balanceB?.amount ?? "0"],
      to: [balanceA?.to ?? channelEntity.participantA, balanceB?.to ?? channelEntity.participantB],
    };
  });

  // convert db representation into details for the particular update
  let details: SetupUpdateDetails | DepositUpdateDetails | CreateUpdateDetails | ResolveUpdateDetails | undefined;
  if (channelEntity.latestUpdate) {
    switch (channelEntity.latestUpdate.type) {
      case "setup":
        details = {
          networkContext: {
            chainId: BigNumber.from(channelEntity.chainId).toNumber(),
            channelFactoryAddress: channelEntity.channelFactoryAddress,
            transferRegistryAddress: channelEntity.transferRegistryAddress,
          },
          timeout: channelEntity.timeout,
        } as SetupUpdateDetails;
        break;
      case "deposit":
        details = {
          totalDepositsAlice: channelEntity.latestUpdate.totalDepositsAlice,
          totalDepositsBob: channelEntity.latestUpdate.totalDepositsBob,
        } as DepositUpdateDetails;
        break;
      case "create":
        details = {
          balance: {
            to: [channelEntity.latestUpdate.transferToA!, channelEntity.latestUpdate.transferToB!],
            amount: [channelEntity.latestUpdate.transferAmountA!, channelEntity.latestUpdate.transferAmountB!],
          },
          merkleProofData: channelEntity.latestUpdate.merkleProofData!.split(","),
          merkleRoot: channelEntity.latestUpdate.merkleRoot!,
          transferDefinition: channelEntity.latestUpdate.transferDefinition!,
          transferTimeout: channelEntity.latestUpdate.transferTimeout!,
          transferId: channelEntity.latestUpdate.transferId!,
          transferEncodings: channelEntity.latestUpdate.transferEncodings!.split("$"),
          transferInitialState: JSON.parse(channelEntity.latestUpdate.transferInitialState!),
          meta: channelEntity.latestUpdate!.meta ? JSON.parse(channelEntity.latestUpdate!.meta) : undefined,
        } as CreateUpdateDetails;
        break;
      case "resolve":
        details = {
          merkleRoot: channelEntity.latestUpdate.merkleRoot!,
          transferDefinition: channelEntity.latestUpdate.transferDefinition!,
          transferId: channelEntity.latestUpdate.transferId!,
          transferResolver: JSON.parse(channelEntity.latestUpdate.transferResolver!),
          meta: channelEntity.latestUpdate!.meta ? JSON.parse(channelEntity.latestUpdate!.meta) : undefined,
        } as ResolveUpdateDetails;
        break;
    }
  }

  const channel: FullChannelState = {
    assetIds,
    balances,
    channelAddress: channelEntity.channelAddress,
    merkleRoot: channelEntity.merkleRoot,
    processedDepositsA,
    processedDepositsB,
    defundNonces,
    networkContext: {
      chainId: BigNumber.from(channelEntity.chainId).toNumber(),
      channelFactoryAddress: channelEntity.channelFactoryAddress,
      transferRegistryAddress: channelEntity.transferRegistryAddress,
    },
    nonce: channelEntity.nonce,
    alice: channelEntity.participantA,
    aliceIdentifier: channelEntity.publicIdentifierA,
    bob: channelEntity.participantB,
    bobIdentifier: channelEntity.publicIdentifierB,
    timeout: channelEntity.timeout,
    latestUpdate: {
      assetId: channelEntity.latestUpdate!.assetId,
      balance: {
        amount: [channelEntity.latestUpdate!.amountA, channelEntity.latestUpdate!.amountB],
        to: [channelEntity.latestUpdate!.toA, channelEntity.latestUpdate!.toB],
      },
      channelAddress: channelEntity.channelAddress,
      details,
      fromIdentifier: channelEntity.latestUpdate!.fromIdentifier,
      nonce: channelEntity.latestUpdate!.nonce,
      aliceSignature: channelEntity.latestUpdate!.signatureA ?? undefined,
      bobSignature: channelEntity.latestUpdate!.signatureB ?? undefined,
      toIdentifier: channelEntity.latestUpdate!.toIdentifier,
      type: channelEntity.latestUpdate!.type as "create" | "deposit" | "resolve" | "setup",
    },
    inDispute: !!channelEntity.disputeReference,
  };
  return channel;
};

const convertTransferEntityToFullTransferState = (
  transfer: Transfer & {
    channel: Channel | null;
    createUpdate: Update | null;
    resolveUpdate: Update | null;
    disputeReference: TransferDisputeEntity | null;
  },
) => {
  const fullTransfer: FullTransferState = {
    inDispute: !!transfer.disputeReference,
    channelFactoryAddress: transfer.channel!.channelFactoryAddress,
    assetId: transfer.createUpdate!.assetId,
    chainId: BigNumber.from(transfer.channel!.chainId).toNumber(),
    channelAddress: transfer.channel!.channelAddress!,
    balance: {
      amount: [transfer.amountA, transfer.amountB],
      to: [transfer.toA, transfer.toB],
    },
    initiator:
      transfer.createUpdate!.fromIdentifier === transfer.channel?.publicIdentifierA
        ? transfer.channel!.participantA
        : transfer.channel!.participantB,
    responder:
      transfer.createUpdate!.toIdentifier === transfer.channel?.publicIdentifierA
        ? transfer.channel!.participantA
        : transfer.channel!.participantB,
    initialStateHash: transfer.initialStateHash,
    transferDefinition: transfer.createUpdate!.transferDefinition!,
    initiatorIdentifier: transfer.createUpdate!.fromIdentifier,
    responderIdentifier: transfer.createUpdate!.toIdentifier,
    channelNonce: transfer!.channelNonce,
    transferEncodings: transfer.createUpdate!.transferEncodings!.split("$"),
    transferId: transfer.createUpdate!.transferId!,
    transferState: {
      balance: {
        amount: [transfer.createUpdate!.transferAmountA!, transfer.createUpdate!.transferAmountB],
        to: [transfer.createUpdate!.transferToA, transfer.createUpdate!.transferToB],
      },
      ...JSON.parse(transfer.createUpdate!.transferInitialState!),
    },
    transferTimeout: transfer.createUpdate!.transferTimeout!,
    meta: transfer.createUpdate!.meta ? JSON.parse(transfer.createUpdate!.meta) : undefined,
    transferResolver: transfer.resolveUpdate?.transferResolver
      ? JSON.parse(transfer.resolveUpdate?.transferResolver)
      : undefined,
  };
  return fullTransfer;
};

const convertEntitiesToWithdrawalCommitment = (
  resolveEntity: Update | null,
  createEntity: Update,
  channel: Channel,
): WithdrawCommitmentJson => {
  const initialState = JSON.parse(createEntity.transferInitialState ?? "{}");
  const resolver = JSON.parse(resolveEntity?.transferResolver ?? "{}");
  const resolveMeta = JSON.parse(resolveEntity?.meta ?? "{}");

  const aliceIsInitiator = channel.participantA === getSignerAddressFromPublicIdentifier(createEntity!.fromIdentifier);

  return {
    aliceSignature: aliceIsInitiator ? initialState.initiatorSignature : resolver.responderSignature,
    bobSignature: aliceIsInitiator ? resolver.responderSignature : initialState.initiatorSignature,
    channelAddress: channel.channelAddress,
    alice: channel.participantA,
    bob: channel.participantB,
    recipient: createEntity.transferToA!, // balance = [toA, toB]
    assetId: createEntity.assetId,
    amount: BigNumber.from(createEntity.transferAmountA).sub(initialState.fee).toString(),
    nonce: initialState.nonce,
    callData: initialState.callData,
    callTo: initialState.callTo,
    transactionHash: resolveMeta.transactionHash ?? undefined,
  };
};

const convertEntityToChannelDispute = (dispute: ChannelDisputeEntity): ChannelDispute => {
  return {
    channelStateHash: dispute.channelStateHash,
    consensusExpiry: dispute.consensusExpiry,
    defundExpiry: dispute.defundExpiry,
    merkleRoot: dispute.merkleRoot,
    nonce: dispute.nonce,
  };
};

const convertEntityToTransferDispute = (entity: TransferDisputeEntity): TransferDispute => {
  return {
    isDefunded: entity.isDefunded,
    transferDisputeExpiry: entity.transferDisputeExpiry,
    transferId: entity.transferId,
    transferStateHash: entity.transferStateHash,
  };
};
export class PrismaStore implements IServerNodeStore {
  public prisma: PrismaClient;

  constructor(private readonly dbUrl?: string) {
    const _dbUrl = this.dbUrl
      ? this.dbUrl
      : config.dbUrl?.startsWith("sqlite")
      ? `${config.dbUrl}?connection_limit=1&socket_timeout=10`
      : config.dbUrl;

    this.prisma = new PrismaClient(_dbUrl ? { datasources: { db: { url: _dbUrl } } } : undefined);
  }

  async getTransactionByHash(transactionHash: string): Promise<StoredTransaction | undefined> {
    const entity = await this.prisma.onchainTransaction.findUnique({
      where: { transactionHash },
      include: { channel: true },
    });
    if (!entity) {
      return undefined;
    }
    return convertOnchainTransactionEntityToTransaction(entity);
  }

  async saveTransactionResponse(
    channelAddress: string,
    reason: TransactionReason,
    response: TransactionResponse,
  ): Promise<void> {
    await this.prisma.onchainTransaction.upsert({
      where: { transactionHash: response.hash },
      create: {
        status: StoredTransactionStatus.submitted,
        reason,
        transactionHash: response.hash,
        to: response.to!,
        from: response.from,
        data: response.data,
        value: response.value.toString(),
        chainId: response.chainId.toString(),
        nonce: response.nonce,
        gasLimit: response.gasLimit.toString(),
        gasPrice: response.gasPrice.toString(),
        timestamp: response.timestamp?.toString(),
        raw: response.raw,
        blockHash: response.blockHash,
        blockNumber: response.blockNumber,
        channel: {
          connect: {
            channelAddress,
          },
        },
      },
      update: {
        status: StoredTransactionStatus.submitted,
        reason,
        transactionHash: response.hash,
        to: response.to!,
        from: response.from,
        data: response.data,
        value: response.value.toString(),
        chainId: response.chainId.toString(),
        nonce: response.nonce,
        gasLimit: response.gasLimit.toString(),
        gasPrice: response.gasPrice.toString(),
        timestamp: response.timestamp?.toString(),
        raw: response.raw,
        blockHash: response.blockHash,
        blockNumber: response.blockNumber,
        channel: {
          connect: {
            channelAddress,
          },
        },
      },
      include: { channel: true },
    });
  }

  async saveTransactionReceipt(channelAddress: string, transaction: TransactionReceipt): Promise<void> {
    await this.prisma.onchainTransaction.update({
      where: { transactionHash: transaction.transactionHash },
      data: {
        status: StoredTransactionStatus.mined,
        to: transaction.to,
        from: transaction.from,
        blockHash: transaction.blockHash,
        blockNumber: transaction.blockNumber,
        contractAddress: transaction.contractAddress,
        transactionIndex: transaction.transactionIndex,
        root: transaction.root,
        gasUsed: transaction.gasUsed.toString(),
        logsBloom: transaction.logsBloom,
        logs: JSON.stringify(transaction.logs),
        cumulativeGasUsed: transaction.cumulativeGasUsed.toString(),
        byzantium: transaction.byzantium,
        channel: {
          connect: {
            channelAddress,
          },
        },
      },
    });
  }

  async saveTransactionFailure(channelAddress: string, transactionHash: string, error: string): Promise<void> {
    await this.prisma.onchainTransaction.update({
      where: { transactionHash },
      data: {
        status: StoredTransactionStatus.failed,
        error,
        channel: {
          connect: { channelAddress },
        },
      },
      include: { channel: true },
    });
  }

  async getWithdrawalCommitmentByTransactionHash(transactionHash: string): Promise<WithdrawCommitmentJson | undefined> {
    // use findFirst instead of findUnique. should be unique but
    // HashZero is used if the transaction was already submitted and we
    // have no record
    const entity = await this.prisma.transfer.findFirst({
      where: { onchainTransactionId: transactionHash },
      include: { channel: true, createUpdate: true, resolveUpdate: true },
    });
    if (!entity) {
      return undefined;
    }

    const channel =
      entity.channel ??
      (await this.prisma.channel.findUnique({
        where: { channelAddress: entity.channelAddressId },
      }));

    if (!channel) {
      throw new Error("Could not retrieve channel for withdraw commitment");
    }

    return convertEntitiesToWithdrawalCommitment(entity.resolveUpdate!, entity.createUpdate!, channel);
  }

  async getWithdrawalCommitment(transferId: string): Promise<WithdrawCommitmentJson | undefined> {
    const entity = await this.prisma.transfer.findUnique({
      where: { transferId },
      include: { channel: true, createUpdate: true, resolveUpdate: true },
    });
    if (!entity) {
      return undefined;
    }

    // if there is not an attached channel, the transfer has been resolved
    // so grab channel
    const channel =
      entity.channel ??
      (await this.prisma.channel.findUnique({
        where: { channelAddress: entity.channelAddressId },
      }));

    if (!channel) {
      throw new Error("Could not retrieve channel for withdraw commitment");
    }

    return convertEntitiesToWithdrawalCommitment(entity.resolveUpdate!, entity.createUpdate!, channel);
  }

  async saveWithdrawalCommitment(transferId: string, withdrawCommitment: WithdrawCommitmentJson): Promise<void> {
    if (!withdrawCommitment.transactionHash) {
      return;
    }
    const record = await this.prisma.onchainTransaction.findUnique({
      where: { transactionHash: withdrawCommitment.transactionHash },
    });
    if (!record) {
      // Did not submit transaction ourselves, no record to connect
      // This is the case for server-node bobs
      await this.prisma.transfer.update({
        where: { transferId },
        data: { onchainTransactionId: withdrawCommitment.transactionHash },
      });
      return;
    }
    await this.prisma.transfer.update({
      where: { transferId },
      data: {
        onchainTransactionId: withdrawCommitment.transactionHash,
        onchainTransaction: { connect: { transactionHash: withdrawCommitment.transactionHash } },
      },
    });
    return;
  }

  // NOTE: this does not exist on the browser node, only on the server node
  // This will pull *all* unsubmitted withdrawals that are not associated with
  // a transaction hash
  async getUnsubmittedWithdrawals(
    channelAddress: string,
    withdrawalDefinition: string,
  ): Promise<{ commitment: WithdrawCommitmentJson; transfer: FullTransferState }[]> {
    const entities = await this.prisma.transfer.findMany({
      where: {
        channelAddressId: channelAddress,
        AND: {
          onchainTransactionId: null,
          resolveUpdateChannelAddressId: channelAddress,
          createUpdate: { transferDefinition: withdrawalDefinition },
        },
      },
      include: { channel: true, createUpdate: true, resolveUpdate: true, disputeReference: true },
    });

    for (const transfer of entities) {
      if (!transfer.channel) {
        const channel = await this.prisma.channel.findUnique({ where: { channelAddress: transfer.channelAddressId } });
        transfer.channel = channel;
      }
    }

    return entities.map((e) => {
      return {
        commitment: convertEntitiesToWithdrawalCommitment(e.resolveUpdate, e.createUpdate!, e.channel!),
        transfer: convertTransferEntityToFullTransferState(e),
      };
    });
  }

  async registerSubscription<T extends EngineEvent>(publicIdentifier: string, event: T, url: string): Promise<void> {
    await this.prisma.eventSubscription.upsert({
      where: {
        publicIdentifier_event: {
          event,
          publicIdentifier,
        },
      },
      create: {
        publicIdentifier,
        event,
        url,
      },
      update: {
        url,
      },
    });
  }

  async getSubscription<T extends EngineEvent>(publicIdentifier: string, event: T): Promise<string | undefined> {
    const sub = await this.prisma.eventSubscription.findUnique({
      where: { publicIdentifier_event: { publicIdentifier, event: event as any } },
    });
    return sub ? sub.url : undefined;
  }

  async getSubscriptions(publicIdentifier: string): Promise<{ [event: string]: string }> {
    const subs = await this.prisma.eventSubscription.findMany({ where: { publicIdentifier } });
    return subs.reduce((s, sub) => {
      s[sub.event] = sub.url;
      return s;
    }, {} as { [event: string]: string });
  }

  getSchemaVersion(): Promise<number> {
    throw new Error("Method not implemented.");
  }

  updateSchemaVersion(version?: number): Promise<void> {
    throw new Error("Method not implemented.");
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async getChannelState(channelAddress: string): Promise<FullChannelState | undefined> {
    const channelEntity = await this.prisma.channel.findUnique({
      where: { channelAddress },
      include: { balances: true, latestUpdate: true, disputeReference: true },
    });
    if (!channelEntity) {
      return undefined;
    }

    return convertChannelEntityToFullChannelState(channelEntity);
  }

  async getChannelStateByParticipants(
    publicIdentifierA: string,
    publicIdentifierB: string,
    chainId: number,
  ): Promise<FullChannelState | undefined> {
    const [channelEntity] = await this.prisma.channel.findMany({
      where: {
        OR: [
          {
            publicIdentifierA,
            publicIdentifierB,
            chainId: chainId.toString(),
          },
          {
            publicIdentifierA: publicIdentifierB,
            publicIdentifierB: publicIdentifierA,
            chainId: chainId.toString(),
          },
        ],
      },
      include: { balances: true, latestUpdate: true, disputeReference: true },
    });
    if (!channelEntity) {
      return undefined;
    }

    return convertChannelEntityToFullChannelState(channelEntity);
  }

  async getChannelStates(): Promise<FullChannelState[]> {
    const channelEntities = await this.prisma.channel.findMany({
      include: { balances: true, latestUpdate: true, disputeReference: true },
    });
    return channelEntities.map(convertChannelEntityToFullChannelState);
  }

  async saveChannelState(channelState: FullChannelState, transfer?: FullTransferState): Promise<void> {
    const createTransferEntity: Prisma.TransferCreateWithoutChannelInput | undefined =
      channelState.latestUpdate.type === UpdateType.create
        ? {
            channelAddressId: channelState.channelAddress,
            transferId: transfer!.transferId,
            routingId: transfer!.meta?.routingId ?? getRandomBytes32(),
            amountA: transfer!.balance.amount[0],
            toA: transfer!.balance.to[0],
            amountB: transfer!.balance.amount[1],
            toB: transfer!.balance.to[1],
            initialStateHash: transfer!.initialStateHash,
            channelNonce: transfer!.channelNonce,
          }
        : undefined;

    const activeTransfers: Prisma.TransferUpdateManyWithoutChannelInput | undefined =
      channelState.latestUpdate.type === UpdateType.create
        ? {
            connectOrCreate: {
              where: {
                transferId: createTransferEntity!.transferId,
              },
              create: createTransferEntity!,
            },
          }
        : channelState.latestUpdate.type === UpdateType.resolve
        ? {
            disconnect: {
              transferId: (channelState.latestUpdate!.details as ResolveUpdateDetails).transferId,
            },
          }
        : undefined;
    // create the latest update db structure from the input data
    let latestUpdateModel: Prisma.UpdateCreateInput | undefined;
    if (channelState.latestUpdate) {
      latestUpdateModel = {
        channelAddressId: channelState.channelAddress,
        fromIdentifier: channelState.latestUpdate!.fromIdentifier,
        toIdentifier: channelState.latestUpdate!.toIdentifier,
        nonce: channelState.latestUpdate!.nonce,
        signatureA: channelState.latestUpdate?.aliceSignature,
        signatureB: channelState.latestUpdate?.bobSignature,
        amountA: channelState.latestUpdate!.balance.amount[0],
        amountB: channelState.latestUpdate!.balance.amount[1],
        toA: channelState.latestUpdate!.balance.to[0],
        toB: channelState.latestUpdate!.balance.to[1],
        type: channelState.latestUpdate!.type,
        assetId: channelState.latestUpdate!.assetId,

        // details
        // deposit
        totalDepositsAlice: (channelState.latestUpdate!.details as DepositUpdateDetails).totalDepositsAlice,
        totalDepositsBob: (channelState.latestUpdate!.details as DepositUpdateDetails).totalDepositsBob,

        // create transfer
        transferInitialState: (channelState.latestUpdate!.details as CreateUpdateDetails).transferInitialState
          ? JSON.stringify((channelState.latestUpdate!.details as CreateUpdateDetails).transferInitialState)
          : undefined,

        transferAmountA: (channelState.latestUpdate!.details as CreateUpdateDetails).balance?.amount[0] ?? undefined,
        transferToA: (channelState.latestUpdate!.details as CreateUpdateDetails).balance?.to[0] ?? undefined,
        transferAmountB: (channelState.latestUpdate!.details as CreateUpdateDetails).balance?.amount[1] ?? undefined,
        transferToB: (channelState.latestUpdate!.details as CreateUpdateDetails).balance?.to[1] ?? undefined,
        merkleRoot: (channelState.latestUpdate!.details as CreateUpdateDetails).merkleRoot,
        merkleProofData: (channelState.latestUpdate!.details as CreateUpdateDetails).merkleProofData?.join(),
        transferDefinition: (channelState.latestUpdate!.details as CreateUpdateDetails).transferDefinition,
        transferEncodings: (channelState.latestUpdate!.details as CreateUpdateDetails).transferEncodings
          ? (channelState.latestUpdate!.details as CreateUpdateDetails).transferEncodings.join("$") // comma separation doesnt work
          : undefined,
        transferId: (channelState.latestUpdate!.details as CreateUpdateDetails).transferId,
        transferTimeout: (channelState.latestUpdate!.details as CreateUpdateDetails).transferTimeout,
        meta: (channelState.latestUpdate!.details as CreateUpdateDetails).meta
          ? JSON.stringify((channelState.latestUpdate!.details as CreateUpdateDetails).meta)
          : undefined,

        // resolve transfer
        transferResolver: (channelState.latestUpdate!.details as ResolveUpdateDetails).transferResolver
          ? JSON.stringify((channelState.latestUpdate!.details as ResolveUpdateDetails).transferResolver)
          : undefined,

        // if create, add createdTransfer
        createdTransfer:
          channelState.latestUpdate.type === UpdateType.create
            ? {
                connectOrCreate: {
                  where: {
                    transferId: transfer!.transferId,
                  },
                  create: createTransferEntity!,
                },
              }
            : undefined,

        // if resolve, add resolvedTransfer by transferId
        resolvedTransfer:
          channelState.latestUpdate.type === UpdateType.resolve
            ? {
                connect: {
                  transferId: (channelState.latestUpdate!.details as ResolveUpdateDetails).transferId,
                },
              }
            : undefined,
      };
    }

    // use the inputted assetIds to preserve order
    const assetIds = channelState.assetIds.join(",");

    // create the rest of the channel
    // use upsert so that it can be idempotent
    await this.prisma.channel.upsert({
      where: { channelAddress: channelState.channelAddress },
      create: {
        assetIds,
        activeTransfers: {
          ...activeTransfers,
          disconnect: undefined,
        } as any,
        chainId: channelState.networkContext.chainId.toString(),
        channelAddress: channelState.channelAddress,
        channelFactoryAddress: channelState.networkContext.channelFactoryAddress,
        transferRegistryAddress: channelState.networkContext.transferRegistryAddress,
        merkleRoot: channelState.merkleRoot,
        nonce: channelState.nonce,
        participantA: channelState.alice,
        participantB: channelState.bob,
        publicIdentifierA: channelState.aliceIdentifier,
        publicIdentifierB: channelState.bobIdentifier,
        timeout: channelState.timeout,
        balances: {
          create: channelState.assetIds.reduce(
            (create: Prisma.BalanceCreateWithoutChannelInput[], assetId: string, index: number) => {
              return [
                ...create,
                {
                  amount: channelState.balances[index].amount[0],
                  participant: channelState.alice,
                  to: channelState.balances[index].to[0],
                  assetId,
                  processedDeposit: channelState.processedDepositsA[index],
                  defundNonce: channelState.defundNonces[index],
                },
                {
                  amount: channelState.balances[index].amount[1],
                  participant: channelState.bob,
                  to: channelState.balances[index].to[1],
                  assetId,
                  processedDeposit: channelState.processedDepositsB[index],
                  defundNonce: channelState.defundNonces[index],
                },
              ];
            },
            [],
          ),
        },
        latestUpdate: {
          create: channelState.latestUpdate ? latestUpdateModel : undefined,
        },
      },
      update: {
        assetIds,
        activeTransfers,
        merkleRoot: channelState.merkleRoot,
        nonce: channelState.nonce,
        channelFactoryAddress: channelState.networkContext.channelFactoryAddress,
        latestUpdate: {
          connectOrCreate: {
            where: {
              channelAddressId_nonce: {
                channelAddressId: channelState.channelAddress,
                nonce: channelState.latestUpdate!.nonce,
              },
            },
            create: latestUpdateModel!,
          },
        },
        balances: {
          upsert: channelState.assetIds.reduce(
            (upsert: Prisma.BalanceUpsertWithWhereUniqueWithoutChannelInput[], assetId: string, index: number) => {
              return [
                ...upsert,
                {
                  create: {
                    amount: channelState.balances[index].amount[0],
                    participant: channelState.alice,
                    to: channelState.balances[index].to[0],
                    processedDeposit: channelState.processedDepositsA[index],
                    defundNonce: channelState.defundNonces[index],
                    assetId,
                  },
                  update: {
                    amount: channelState.balances[index].amount[0],
                    to: channelState.balances[index].to[0],
                    processedDeposit: channelState.processedDepositsA[index],
                    defundNonce: channelState.defundNonces[index],
                  },
                  where: {
                    participant_channelAddress_assetId: {
                      participant: channelState.alice,
                      channelAddress: channelState.channelAddress,
                      assetId,
                    },
                  },
                },
                {
                  create: {
                    amount: channelState.balances[index].amount[1],
                    participant: channelState.bob,
                    to: channelState.balances[index].to[1],
                    processedDeposit: channelState.processedDepositsB[index],
                    defundNonce: channelState.defundNonces[index],
                    assetId,
                  },
                  update: {
                    amount: channelState.balances[index].amount[1],
                    to: channelState.balances[index].to[1],
                    processedDeposit: channelState.processedDepositsB[index],
                    defundNonce: channelState.defundNonces[index],
                  },
                  where: {
                    participant_channelAddress_assetId: {
                      participant: channelState.bob,
                      channelAddress: channelState.channelAddress,
                      assetId,
                    },
                  },
                },
              ];
            },
            [],
          ),
        },
      },
    });
  }

  async saveChannelStateAndTransfers(
    channel: FullChannelState<any>,
    activeTransfers: FullTransferState[],
  ): Promise<void> {
    // make sure any old records are removed
    const balanceDelete = this.prisma.balance.deleteMany({ where: { channelAddress: channel.channelAddress } });
    const updateDelete = this.prisma.update.deleteMany({ where: { channelAddress: channel.channelAddress } });
    const transferDelete = this.prisma.transfer.deleteMany({ where: { channelAddress: channel.channelAddress } });
    const channelDelete = this.prisma.channel.deleteMany({ where: { channelAddress: channel.channelAddress } });
    // add these calls to the transaction at the end

    // create the latest update db structure from the input data
    let latestUpdateModel: Prisma.UpdateCreateInput | undefined;
    if (channel.latestUpdate) {
      latestUpdateModel = {
        channelAddressId: channel.channelAddress,
        fromIdentifier: channel.latestUpdate!.fromIdentifier,
        toIdentifier: channel.latestUpdate!.toIdentifier,
        nonce: channel.latestUpdate!.nonce,
        signatureA: channel.latestUpdate?.aliceSignature,
        signatureB: channel.latestUpdate?.bobSignature,
        amountA: channel.latestUpdate!.balance.amount[0],
        amountB: channel.latestUpdate!.balance.amount[1],
        toA: channel.latestUpdate!.balance.to[0],
        toB: channel.latestUpdate!.balance.to[1],
        type: channel.latestUpdate!.type,
        assetId: channel.latestUpdate!.assetId,

        // details
        // deposit
        totalDepositsAlice: (channel.latestUpdate!.details as DepositUpdateDetails).totalDepositsAlice,
        totalDepositsBob: (channel.latestUpdate!.details as DepositUpdateDetails).totalDepositsBob,

        // create transfer
        transferInitialState: (channel.latestUpdate!.details as CreateUpdateDetails).transferInitialState
          ? JSON.stringify((channel.latestUpdate!.details as CreateUpdateDetails).transferInitialState)
          : undefined,

        transferAmountA: (channel.latestUpdate!.details as CreateUpdateDetails).balance?.amount[0] ?? undefined,
        transferToA: (channel.latestUpdate!.details as CreateUpdateDetails).balance?.to[0] ?? undefined,
        transferAmountB: (channel.latestUpdate!.details as CreateUpdateDetails).balance?.amount[1] ?? undefined,
        transferToB: (channel.latestUpdate!.details as CreateUpdateDetails).balance?.to[1] ?? undefined,
        merkleRoot: (channel.latestUpdate!.details as CreateUpdateDetails).merkleRoot,
        merkleProofData: (channel.latestUpdate!.details as CreateUpdateDetails).merkleProofData?.join(),
        transferDefinition: (channel.latestUpdate!.details as CreateUpdateDetails).transferDefinition,
        transferEncodings: (channel.latestUpdate!.details as CreateUpdateDetails).transferEncodings
          ? (channel.latestUpdate!.details as CreateUpdateDetails).transferEncodings.join("$") // comma separation doesnt work
          : undefined,
        transferId: (channel.latestUpdate!.details as CreateUpdateDetails).transferId,
        transferTimeout: (channel.latestUpdate!.details as CreateUpdateDetails).transferTimeout,
        meta: (channel.latestUpdate!.details as CreateUpdateDetails).meta
          ? JSON.stringify((channel.latestUpdate!.details as CreateUpdateDetails).meta)
          : undefined,

        // resolve transfer
        transferResolver: (channel.latestUpdate!.details as ResolveUpdateDetails).transferResolver
          ? JSON.stringify((channel.latestUpdate!.details as ResolveUpdateDetails).transferResolver)
          : undefined,

        // create update will be generated by activeTransfers

        // if resolve, add resolvedTransfer by transferId
        // NOTE: no guarantee that this transfer exists, will not save
      };
    }

    // use the inputted assetIds to preserve order
    const assetIds = channel.assetIds.join(",");

    // create entities for each active transfer + associated create update
    const transferEntityDetails: Prisma.TransferCreateInput[] = activeTransfers.map((transfer) => {
      return {
        createUpdate: {
          create: {
            // common fields
            channelAddressId: transfer.channelAddress,
            fromIdentifier: transfer.initiatorIdentifier,
            toIdentifier: transfer.responderIdentifier,
            type: UpdateType.create,
            nonce: transfer.channelNonce + 1, // transfer created, then update proposed
            amountA: "", // channel balance unkown
            amountB: "", // channel balance unkown
            toA: channel.alice,
            toB: channel.bob,
            assetId: transfer.assetId,
            signatureA: "", // commitment sigs unknown
            signatureB: "", // commitment sigs unknown
            // detail fields
            transferAmountA: transfer.balance.amount[0],
            transferAmountB: transfer.balance.amount[1],
            transferToA: transfer.balance.to[0],
            transferToB: transfer.balance.to[1],
            transferId: transfer.transferId,
            transferDefinition: transfer.transferDefinition,
            transferTimeout: transfer.transferTimeout,
            transferInitialState: JSON.stringify(transfer.transferState),
            transferEncodings: transfer.transferEncodings.join("$"),
            merkleProofData: "", // could recreate, but y tho
            meta: transfer.meta ? JSON.stringify(transfer.meta) : undefined,
            responder: transfer.responder,
          },
        },
        channelAddressId: transfer.channelAddress,
        transferId: transfer.transferId,
        routingId: transfer.meta?.routingId ?? getRandomBytes32(),
        amountA: transfer.balance.amount[0],
        toA: transfer.balance.to[0],
        amountB: transfer.balance.amount[1],
        toB: transfer.balance.to[1],
        initialStateHash: transfer!.initialStateHash,
        channelNonce: transfer.channelNonce,
      };
    });

    const channelModelDetails: Prisma.ChannelCreateInput = {
      assetIds,
      chainId: channel.networkContext.chainId.toString(),
      channelAddress: channel.channelAddress,
      channelFactoryAddress: channel.networkContext.channelFactoryAddress,
      transferRegistryAddress: channel.networkContext.transferRegistryAddress,
      merkleRoot: channel.merkleRoot,
      nonce: channel.nonce,
      participantA: channel.alice,
      participantB: channel.bob,
      publicIdentifierA: channel.aliceIdentifier,
      publicIdentifierB: channel.bobIdentifier,
      timeout: channel.timeout,
      balances: {
        create: channel.assetIds.flatMap((assetId: string, index: number) => {
          return [
            {
              amount: channel.balances[index].amount[0],
              participant: channel.alice,
              to: channel.balances[index].to[0],
              assetId,
              processedDeposit: channel.processedDepositsA[index],
              defundNonce: channel.defundNonces[index],
            },
            {
              amount: channel.balances[index].amount[1],
              participant: channel.bob,
              to: channel.balances[index].to[1],
              assetId,
              processedDeposit: channel.processedDepositsB[index],
              defundNonce: channel.defundNonces[index],
            },
          ];
        }),
      },
      latestUpdate: {
        connectOrCreate: {
          where: {
            channelAddressId_nonce: {
              channelAddressId: channel.channelAddress,
              nonce: channel.latestUpdate!.nonce,
            },
          },
          create: latestUpdateModel!,
        },
      },
      activeTransfers: { create: transferEntityDetails },
    };

    const channelCreate = this.prisma.channel.create({
      data: channelModelDetails,
    });

    await this.prisma.$transaction([balanceDelete, updateDelete, transferDelete, channelDelete, channelCreate]);
  }

  async getActiveTransfers(channelAddress: string): Promise<FullTransferState[]> {
    const transferEntities = await this.prisma.transfer.findMany({
      where: { channelAddress },
      include: { channel: true, createUpdate: true, resolveUpdate: true, disputeReference: true },
    });
    const transfers = transferEntities.map(convertTransferEntityToFullTransferState);
    return transfers;
  }

  async getTransferState(transferId: string): Promise<FullTransferState | undefined> {
    // should be only 1, verify this is always true
    const transfer = await this.prisma.transfer.findUnique({
      where: { transferId },
      include: { channel: true, createUpdate: true, resolveUpdate: true, disputeReference: true },
    });

    if (!transfer) {
      return undefined;
    }

    // not ideal, but if the channel has been detatched we need to re-attach it separatedly... todo: use join queries #430
    if (!transfer.channel) {
      const channel = await this.prisma.channel.findUnique({ where: { channelAddress: transfer.channelAddressId } });
      transfer.channel = channel;
    }

    return convertTransferEntityToFullTransferState(transfer);
  }

  async getTransferByRoutingId(channelAddress: string, routingId: string): Promise<FullTransferState | undefined> {
    const transfer = await this.prisma.transfer.findUnique({
      where: { routingId_channelAddressId: { routingId, channelAddressId: channelAddress } },
      include: { channel: true, createUpdate: true, resolveUpdate: true, disputeReference: true },
    });

    if (!transfer) {
      return undefined;
    }

    // not ideal, but if the channel has been detatched we need to re-attach it separatedly... todo: use join queries #430
    if (!transfer.channel) {
      const channel = await this.prisma.channel.findUnique({ where: { channelAddress: transfer.channelAddressId } });
      transfer.channel = channel;
    }

    return convertTransferEntityToFullTransferState(transfer);
  }

  async getTransfers(filterOpts?: GetTransfersFilterOpts): Promise<FullTransferState[]> {
    const filterQuery: Prisma.TransferWhereInput[] = [];
    if (filterOpts?.channelAddress) {
      filterQuery.push({ channelAddressId: filterOpts.channelAddress });
    }

    // start and end
    if (filterOpts?.startDate && filterOpts.endDate) {
      filterQuery.push({ createdAt: { gte: filterOpts.startDate, lte: filterOpts.endDate } });
    } else if (filterOpts?.startDate) {
      filterQuery.push({ createdAt: { gte: filterOpts.startDate } });
    } else if (filterOpts?.endDate) {
      filterQuery.push({ createdAt: { lte: filterOpts.endDate } });
    }

    if (filterOpts?.active) {
      filterQuery.push({ channelAddress: filterOpts.channelAddress });
    }

    if (filterOpts?.routingId) {
      filterQuery.push({ routingId: filterOpts.routingId });
    }

    if (filterOpts?.transferDefinition) {
      filterQuery.push({ createUpdate: { transferDefinition: filterOpts.transferDefinition } });
    }

    const transfers = await this.prisma.transfer.findMany({
      where: filterOpts ? { AND: filterQuery } : undefined,
      include: {
        channel: true,
        createUpdate: true,
        resolveUpdate: true,
        disputeReference: true,
      },
    });

    for (const transfer of transfers) {
      if (!transfer.channel) {
        const channel = await this.prisma.channel.findUnique({ where: { channelAddress: transfer.channelAddressId } });
        transfer.channel = channel;
      }
    }

    return transfers.map(convertTransferEntityToFullTransferState);
  }

  async getTransfersByRoutingId(routingId: string): Promise<FullTransferState[]> {
    const transfers = await this.prisma.transfer.findMany({
      where: { routingId },
      include: {
        channel: true,
        createUpdate: true,
        resolveUpdate: true,
        disputeReference: true,
      },
    });

    for (const transfer of transfers) {
      if (!transfer.channel) {
        const channel = await this.prisma.channel.findUnique({ where: { channelAddress: transfer.channelAddressId } });
        transfer.channel = channel;
      }
    }

    return transfers.map(convertTransferEntityToFullTransferState);
  }

  //////////////////////////////////
  ///// DISPUTE METHODS
  //////////////////////////////////
  async saveChannelDispute(
    channelAddress: string,
    channelDispute: ChannelDispute,
    disputedChannel?: CoreChannelState,
  ): Promise<void> {
    const offchain = await this.prisma.channel.findUnique({ where: { channelAddress } });
    const onchainChannelCreateEntry =
      disputedChannel && offchain
        ? {
            connectOrCreate: {
              where: { channelAddress: `${channelAddress}-dispute` },
              create: {
                // fields from CoreChannelState
                channelAddress: `${channelAddress}-dispute`,
                participantA: `${disputedChannel!.alice}-dispute`,
                participantB: `${disputedChannel!.bob}-dispute`,
                assetIds: disputedChannel.assetIds.join(","),
                timeout: disputedChannel.timeout,
                merkleRoot: disputedChannel.merkleRoot,
                nonce: disputedChannel.nonce,
                chainId: offchain.chainId,
                balances: {
                  create: disputedChannel!.assetIds.reduce(
                    (create: Prisma.BalanceCreateWithoutChannelInput[], assetId: string, index: number) => {
                      return [
                        ...create,
                        {
                          amount: disputedChannel.balances[index].amount[0],
                          participant: disputedChannel.alice,
                          to: disputedChannel.balances[index].to[0],
                          assetId,
                          processedDeposit: disputedChannel.processedDepositsA[index],
                          defundNonce: disputedChannel.defundNonces[index],
                        },
                        {
                          amount: disputedChannel.balances[index].amount[1],
                          participant: disputedChannel.bob,
                          to: disputedChannel.balances[index].to[1],
                          assetId,
                          processedDeposit: disputedChannel.processedDepositsB[index],
                          defundNonce: disputedChannel.defundNonces[index],
                        },
                      ];
                    },
                    [],
                  ),
                },
                // fields from FullChannelState
                publicIdentifierA: `${offchain!.publicIdentifierA}-dispute`,
                publicIdentifierB: `${offchain!.publicIdentifierB}-dispute`,
                channelFactoryAddress: offchain!.channelFactoryAddress,
                transferRegistryAddress: offchain!.transferRegistryAddress,
              },
            },
          }
        : { connect: { channelAddress: `${channelAddress}-dispute` } };

    const onchainChannelUpdateEntry =
      disputedChannel && offchain
        ? {
            upsert: {
              create: {
                // fields from CoreChannelState
                channelAddress: `${channelAddress}-dispute`,
                participantA: `${disputedChannel!.alice}-dispute`,
                participantB: `${disputedChannel!.bob}-dispute`,
                assetIds: disputedChannel!.assetIds.join(","),
                timeout: disputedChannel!.timeout,
                merkleRoot: disputedChannel!.merkleRoot,
                nonce: disputedChannel!.nonce,
                chainId: offchain!.chainId,
                balances: {
                  create: disputedChannel!.assetIds.reduce(
                    (create: Prisma.BalanceCreateWithoutChannelInput[], assetId: string, index: number) => {
                      return [
                        ...create,
                        {
                          amount: disputedChannel!.balances[index].amount[0],
                          participant: disputedChannel!.alice,
                          to: disputedChannel!.balances[index].to[0],
                          assetId,
                          processedDeposit: disputedChannel!.processedDepositsA[index],
                          defundNonce: disputedChannel!.defundNonces[index],
                        },
                        {
                          amount: disputedChannel!.balances[index].amount[1],
                          participant: disputedChannel!.bob,
                          to: disputedChannel!.balances[index].to[1],
                          assetId,
                          processedDeposit: disputedChannel!.processedDepositsB[index],
                          defundNonce: disputedChannel!.defundNonces[index],
                        },
                      ];
                    },
                    [],
                  ),
                },
                // fields from FullChannelState
                publicIdentifierA: `${offchain!.publicIdentifierA}-dispute`,
                publicIdentifierB: `${offchain!.publicIdentifierB}-dispute`,
                channelFactoryAddress: offchain!.channelFactoryAddress,
                transferRegistryAddress: offchain!.transferRegistryAddress,
              },
              update: {
                // fields from CoreChannelState
                timeout: disputedChannel!.timeout,
                merkleRoot: disputedChannel!.merkleRoot,
                nonce: disputedChannel!.nonce,
                balances: {
                  upsert: disputedChannel!.assetIds.reduce(
                    (
                      upsert: Prisma.BalanceUpsertWithWhereUniqueWithoutChannelInput[],
                      assetId: string,
                      index: number,
                    ) => {
                      return [
                        ...upsert,
                        {
                          create: {
                            amount: disputedChannel!.balances[index].amount[0],
                            participant: disputedChannel!.alice,
                            to: disputedChannel!.balances[index].to[0],
                            processedDeposit: disputedChannel!.processedDepositsA[index],
                            defundNonce: disputedChannel!.defundNonces[index],
                            assetId,
                          },
                          update: {
                            amount: disputedChannel!.balances[index].amount[0],
                            to: disputedChannel!.balances[index].to[0],
                            processedDeposit: disputedChannel!.processedDepositsA[index],
                            defundNonce: disputedChannel!.defundNonces[index],
                          },
                          where: {
                            participant_channelAddress_assetId: {
                              participant: disputedChannel!.alice,
                              channelAddress: `${channelAddress}-dispute`,
                              assetId,
                            },
                          },
                        },
                        {
                          create: {
                            amount: disputedChannel!.balances[index].amount[1],
                            participant: disputedChannel!.bob,
                            to: disputedChannel!.balances[index].to[1],
                            processedDeposit: disputedChannel!.processedDepositsB[index],
                            defundNonce: disputedChannel!.defundNonces[index],
                            assetId,
                          },
                          update: {
                            amount: disputedChannel!.balances[index].amount[1],
                            to: disputedChannel!.balances[index].to[1],
                            processedDeposit: disputedChannel!.processedDepositsB[index],
                            defundNonce: disputedChannel!.defundNonces[index],
                          },
                          where: {
                            participant_channelAddress_assetId: {
                              participant: disputedChannel!.bob,
                              channelAddress: `${channelAddress}-dispute`,
                              assetId,
                            },
                          },
                        },
                      ];
                    },
                    [],
                  ),
                },
              },
            },
          }
        : { connect: { channelAddress: `${channelAddress}-dispute` } };

    await this.prisma.channelDispute.upsert({
      where: { channelAddress },
      create: {
        channelAddress,
        channelStateHash: channelDispute.channelStateHash,
        consensusExpiry: channelDispute.consensusExpiry,
        defundExpiry: channelDispute.defundExpiry,
        merkleRoot: channelDispute.merkleRoot,
        nonce: channelDispute.nonce,
        offchainChannel: { connect: { channelAddress } },
        onchainChannel: { ...onchainChannelCreateEntry },
      },
      update: {
        channelStateHash: channelDispute.channelStateHash,
        consensusExpiry: channelDispute.consensusExpiry,
        defundExpiry: channelDispute.defundExpiry,
        merkleRoot: channelDispute.merkleRoot,
        nonce: channelDispute.nonce,
        offchainChannel: { connect: { channelAddress } },
        onchainChannel: { ...onchainChannelUpdateEntry },
      },
    });
  }

  async getChannelDispute(channelAddress: string): Promise<ChannelDispute | undefined> {
    const entity = await this.prisma.channelDispute.findUnique({
      where: {
        channelAddress,
      },
    });
    if (!entity) {
      return undefined;
    }
    return convertEntityToChannelDispute(entity);
  }

  async saveTransferDispute(
    transferId: string,
    transferDispute: TransferDispute,
    disputedTransfer?: CoreTransferState,
  ): Promise<void> {
    // TODO: fix the storage of the onchain transfer reference
    const offchain = await this.prisma.transfer.findUnique({ where: { transferId } });
    await this.prisma.transferDispute.upsert({
      where: { transferId },
      create: {
        isDefunded: transferDispute.isDefunded,
        transferId: transferDispute.transferId,
        transferStateHash: transferDispute.transferStateHash,
        transferDisputeExpiry: transferDispute.transferDisputeExpiry,
        offchainTransfer: { connect: { transferId } },
        // TODO: make `connectOrCreate`
        onchainTransfer: {
          connectOrCreate: {
            where: { transferId: `${transferId}-dispute` },
            create: {
              // CoreTransferState fields
              transferId: `${transferId}-dispute`,
              channelAddressId: disputedTransfer!.channelAddress,
              amountA: disputedTransfer!.balance.amount[0],
              amountB: disputedTransfer!.balance.amount[1],
              toA: disputedTransfer!.balance.to[0],
              toB: disputedTransfer!.balance.to[1],
              initialStateHash: disputedTransfer!.initialStateHash,
              // TODO: make connectOrCreate
              channel: { connect: { channelAddress: `${disputedTransfer!.channelAddress}-dispute` } },
              // TODO: make connectOrCreate
              createUpdate: {
                connect: {
                  channelAddressId_nonce: {
                    channelAddressId: `${disputedTransfer!.channelAddress}-dispute`,
                    nonce: offchain!.createUpdateNonce!,
                  },
                },
              },
              // FullTransferState fields
              routingId: offchain!.routingId,
              channelNonce: offchain!.channelNonce,
            },
          },
        },
      },
      update: {
        isDefunded: transferDispute.isDefunded,
        transferId: transferDispute.transferId,
        transferStateHash: transferDispute.transferStateHash,
        transferDisputeExpiry: transferDispute.transferDisputeExpiry,
        onchainTransfer: {
          upsert: {
            create: {
              // CoreTransferState fields
              transferId: `${transferId}-dispute`,
              channelAddressId: disputedTransfer!.channelAddress,
              amountA: disputedTransfer!.balance.amount[0],
              amountB: disputedTransfer!.balance.amount[1],
              toA: disputedTransfer!.balance.to[0],
              toB: disputedTransfer!.balance.to[1],
              initialStateHash: disputedTransfer!.initialStateHash,
              // TODO: make connectOrCreate
              channel: { connect: { channelAddress: `${disputedTransfer!.channelAddress}-dispute` } },
              // TODO: make connectOrCreate
              createUpdate: {
                connect: {
                  channelAddressId_nonce: {
                    channelAddressId: `${disputedTransfer!.channelAddress}-dispute`,
                    nonce: offchain!.createUpdateNonce!,
                  },
                },
              },
              // FullTransferState fields
              routingId: offchain!.routingId,
              channelNonce: offchain!.channelNonce,
            },
            update: {
              channelAddressId: disputedTransfer!.channelAddress,
              amountA: disputedTransfer!.balance.amount[0],
              amountB: disputedTransfer!.balance.amount[1],
              toA: disputedTransfer!.balance.to[0],
              toB: disputedTransfer!.balance.to[1],
              initialStateHash: disputedTransfer!.initialStateHash,
            },
          },
        },
      },
    });
  }

  async getTransferDispute(transferId: string): Promise<TransferDispute | undefined> {
    const entity = await this.prisma.transferDispute.findUnique({
      where: {
        transferId,
      },
    });
    if (!entity) {
      return undefined;
    }
    return convertEntityToTransferDispute(entity);
  }

  async setNodeIndex(index: number, publicIdentifier: string): Promise<void> {
    await this.prisma.nodeIndex.upsert({
      where: {
        index,
      },
      create: {
        index,
        publicIdentifier,
      },
      update: {
        publicIdentifier,
      },
    });
  }

  async getNodeIndexes(): Promise<{ index: number; publicIdentifier: string }[]> {
    const entries = await this.prisma.nodeIndex.findMany();
    return entries;
  }

  async removeNodeIndexes(): Promise<void> {
    await this.prisma.nodeIndex.deleteMany({});
  }

  async clear(): Promise<void> {
    await this.prisma.balance.deleteMany({});
    await this.prisma.onchainTransaction.deleteMany({});
    await this.prisma.transfer.deleteMany({});
    await this.prisma.channel.deleteMany({});
    await this.prisma.update.deleteMany({});
    await this.prisma.configuration.deleteMany({});
    await this.prisma.nodeIndex.deleteMany({});
  }
}
