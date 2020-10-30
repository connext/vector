import {
  FullChannelState,
  Balance,
  CreateUpdateDetails,
  DepositUpdateDetails,
  ResolveUpdateDetails,
  SetupUpdateDetails,
  ChannelCommitmentData,
  FullTransferState,
  UpdateType,
  EngineEvent,
  IEngineStore,
  WithdrawCommitmentJson,
  StoredTransaction,
  TransactionReason,
  StoredTransactionStatus,
} from "@connext/vector-types";
import { getRandomBytes32, getSignerAddressFromPublicIdentifier } from "@connext/vector-utils";
import {
  BalanceCreateWithoutChannelInput,
  BalanceUpsertWithWhereUniqueWithoutChannelInput,
  Channel,
  PrismaClient,
  Update,
  Balance as BalanceEntity,
  UpdateCreateInput,
  Transfer,
  TransferUpdateManyWithoutChannelInput,
  TransferCreateWithoutChannelInput,
  OnchainTransaction,
} from "@prisma/client";
import { BigNumber, providers } from "ethers";

export interface IServerNodeStore extends IEngineStore {
  registerSubscription<T extends EngineEvent>(publicIdentifier: string, event: T, url: string): Promise<void>;
  getSubscription<T extends EngineEvent>(publicIdentifier: string, event: T): Promise<string | undefined>;
  getSubscriptions(publicIdentifier: string): Promise<{ [event: string]: string }>;
  setMnemonic(mnemonic: string): Promise<void>;
  getMnemonic(): Promise<string | undefined>;
  setNodeIndex(index: number, publicIdentifier: string): Promise<void>;
  getNodeIndexes(): Promise<{ index: number; publicIdentifier: string }[]>;
  removeNodeIndexes(): Promise<void>;
}

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
    chainId: onchainEntity.chainId,
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
    latestUpdate: Update;
  },
): FullChannelState => {
  // use the inputted assetIds to preserve order
  const assetIds = channelEntity?.assetIds ? channelEntity.assetIds.split(",") : [];

  // get balances and locked value for each assetId
  const processedDepositsA: string[] = [];
  const processedDepositsB: string[] = [];
  const balances: Balance[] = assetIds.map(assetId => {
    const balanceA = channelEntity.balances.find(
      bal => bal.assetId === assetId && bal.participant === channelEntity.participantA,
    );
    processedDepositsA.push(balanceA?.processedDeposit ?? "0");
    const balanceB = channelEntity.balances.find(
      bal => bal.assetId === assetId && bal.participant === channelEntity.participantB,
    );
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
            chainId: channelEntity.chainId,
            channelFactoryAddress: channelEntity.channelFactoryAddress,
            providerUrl: channelEntity.providerUrl,
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
    networkContext: {
      chainId: channelEntity.chainId,
      channelFactoryAddress: channelEntity.channelFactoryAddress,
      channelMastercopyAddress: channelEntity.channelMastercopyAddress,
      transferRegistryAddress: channelEntity.transferRegistryAddress,
      providerUrl: channelEntity.providerUrl,
    },
    nonce: channelEntity.nonce,
    alice: channelEntity.participantA,
    aliceIdentifier: channelEntity.publicIdentifierA,
    bob: channelEntity.participantB,
    bobIdentifier: channelEntity.publicIdentifierB,
    timeout: channelEntity.timeout,
    latestUpdate: {
      assetId: channelEntity.latestUpdate.assetId,
      balance: {
        amount: [channelEntity.latestUpdate.amountA, channelEntity.latestUpdate.amountB],
        to: [channelEntity.latestUpdate.toA, channelEntity.latestUpdate.toB],
      },
      channelAddress: channelEntity.channelAddress,
      details,
      fromIdentifier: channelEntity.latestUpdate.fromIdentifier,
      nonce: channelEntity.latestUpdate.nonce,
      aliceSignature: channelEntity.latestUpdate.signatureA ?? undefined,
      bobSignature: channelEntity.latestUpdate.signatureB ?? undefined,
      toIdentifier: channelEntity.latestUpdate.toIdentifier,
      type: channelEntity.latestUpdate.type,
    },
    defundNonce: channelEntity.nonce.toString(),
    inDispute: channelEntity.inDispute,
  };
  return channel;
};

const convertTransferEntityToFullTransferState = (
  transfer: Transfer & { channel: Channel | null; createUpdate: Update | null; resolveUpdate: Update | null },
) => {
  const fullTransfer: FullTransferState = {
    inDispute: transfer.inDispute,
    channelFactoryAddress: transfer.channel!.channelFactoryAddress,
    assetId: transfer.createUpdate!.assetId,
    chainId: transfer.channel!.chainId,
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
    transferEncodings: transfer.createUpdate!.transferEncodings!.split("$"),
    transferId: transfer.createUpdate!.transferId!,
    transferState: JSON.parse(transfer.createUpdate!.transferInitialState!),
    transferTimeout: transfer.createUpdate!.transferTimeout!,
    meta: transfer.createUpdate!.meta ? JSON.parse(transfer.createUpdate!.meta) : undefined,
    transferResolver: transfer.resolveUpdate?.transferResolver
      ? JSON.parse(transfer.resolveUpdate?.transferResolver)
      : undefined,
  };
  return fullTransfer;
};

export class PrismaStore implements IServerNodeStore {
  public prisma: PrismaClient;

  constructor(private readonly dbUrl?: string) {
    this.prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  }

  async getTransactionByHash(transactionHash: string): Promise<StoredTransaction | undefined> {
    const entity = await this.prisma.onchainTransaction.findOne({
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
    response: providers.TransactionResponse,
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
        chainId: response.chainId,
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
        chainId: response.chainId,
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

  async saveTransactionReceipt(channelAddress: string, transaction: providers.TransactionReceipt): Promise<void> {
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

  async getWithdrawalCommitment(transferId: string): Promise<WithdrawCommitmentJson | undefined> {
    const entity = await this.prisma.transfer.findOne({
      where: { transferId },
      include: { channel: true, createUpdate: true, resolveUpdate: true },
    });
    if (!entity) {
      return undefined;
    }

    const initialState = JSON.parse(entity.createUpdate?.transferInitialState ?? "{}");
    const resolver = JSON.parse(entity.resolveUpdate?.transferResolver ?? "{}");

    // TODO: will this return invalid jsons if the transfer is resolved
    const aliceIsInitiator =
      entity.channel!.participantA === getSignerAddressFromPublicIdentifier(entity.createUpdate!.fromIdentifier);

    return {
      aliceSignature: aliceIsInitiator ? initialState.initiatorSignature : resolver.responderSignature,
      bobSignature: aliceIsInitiator ? resolver.responderSignature : initialState.initiatorSignature,
      channelAddress: entity.channelAddressId,
      alice: entity.channel!.participantA,
      bob: entity.channel!.participantB,
      recipient: initialState.balance.to[0],
      assetId: entity.createUpdate!.assetId,
      amount: BigNumber.from(initialState.balance.amount[0])
        .sub(initialState.fee)
        .toString(),
      nonce: initialState.nonce,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  saveWithdrawalCommitment(transferId: string, withdrawCommitment: WithdrawCommitmentJson): Promise<void> {
    // All information is stored in the transfer entity already (see getter)
    // So no need to save commitment explicitly
    return Promise.resolve();
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
    const sub = await this.prisma.eventSubscription.findOne({
      where: { publicIdentifier_event: { publicIdentifier, event } },
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

  getChannelCommitment(channelAddress: string): Promise<ChannelCommitmentData | undefined> {
    throw new Error("Method not implemented.");
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

  async getChannelState(channelAddress: string): Promise<FullChannelState<any> | undefined> {
    const channelEntity = await this.prisma.channel.findOne({
      where: { channelAddress },
      include: { balances: true, latestUpdate: true },
    });
    if (!channelEntity) {
      return undefined;
    }

    return convertChannelEntityToFullChannelState(channelEntity);
  }

  async getChannelStateByParticipants(
    participantA: string,
    participantB: string,
    chainId: number,
  ): Promise<FullChannelState<any> | undefined> {
    const [channelEntity] = await this.prisma.channel.findMany({
      where: {
        OR: [
          {
            participantA,
            participantB,
            chainId,
          },
          {
            participantA: participantB,
            participantB: participantA,
            chainId,
          },
        ],
      },
      include: { balances: true, latestUpdate: true },
    });
    if (!channelEntity) {
      return undefined;
    }

    return convertChannelEntityToFullChannelState(channelEntity);
  }

  async getChannelStates(): Promise<FullChannelState[]> {
    const channelEntities = await this.prisma.channel.findMany({ include: { balances: true, latestUpdate: true } });
    return channelEntities.map(convertChannelEntityToFullChannelState);
  }

  async saveChannelState(
    channelState: FullChannelState,
    commitment: ChannelCommitmentData,
    transfer?: FullTransferState,
  ): Promise<void> {
    const createTransferEntity: TransferCreateWithoutChannelInput | undefined =
      channelState.latestUpdate.type === UpdateType.create
        ? {
            inDispute: false,
            channelAddressId: channelState.channelAddress,
            transferId: transfer!.transferId,
            routingId: transfer!.meta.routingId ?? getRandomBytes32(),
            amountA: transfer!.balance.amount[0],
            toA: transfer!.balance.to[0],
            amountB: transfer!.balance.amount[1],
            toB: transfer!.balance.to[1],
            initialStateHash: transfer!.initialStateHash,
          }
        : undefined;

    const activeTransfers: TransferUpdateManyWithoutChannelInput | undefined =
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
    let latestUpdateModel: UpdateCreateInput | undefined;
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
        inDispute: false,
        assetIds,
        activeTransfers: {
          ...activeTransfers,
          disconnect: undefined,
        } as any,
        chainId: channelState.networkContext.chainId,
        channelAddress: channelState.channelAddress,
        channelFactoryAddress: channelState.networkContext.channelFactoryAddress,
        channelMastercopyAddress: channelState.networkContext.channelMastercopyAddress,
        transferRegistryAddress: channelState.networkContext.transferRegistryAddress,
        merkleRoot: channelState.merkleRoot,
        nonce: channelState.nonce,
        participantA: channelState.alice,
        participantB: channelState.bob,
        providerUrl: channelState.networkContext.providerUrl,
        publicIdentifierA: channelState.aliceIdentifier,
        publicIdentifierB: channelState.bobIdentifier,
        timeout: channelState.timeout,
        defundNonce: channelState.defundNonce,
        balances: {
          create: channelState.assetIds.reduce(
            (create: BalanceCreateWithoutChannelInput[], assetId: string, index: number) => {
              return [
                ...create,
                {
                  amount: channelState.balances[index].amount[0],
                  participant: channelState.alice,
                  to: channelState.balances[index].to[0],
                  assetId,
                  processedDeposit: channelState.processedDepositsA[index],
                },
                {
                  amount: channelState.balances[index].amount[1],
                  participant: channelState.bob,
                  to: channelState.balances[index].to[1],
                  assetId,
                  processedDeposit: channelState.processedDepositsB[index],
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
            (upsert: BalanceUpsertWithWhereUniqueWithoutChannelInput[], assetId: string, index: number) => {
              return [
                ...upsert,
                {
                  create: {
                    amount: channelState.balances[index].amount[0],
                    participant: channelState.alice,
                    to: channelState.balances[index].to[0],
                    processedDeposit: channelState.processedDepositsA[index],
                    assetId,
                  },
                  update: {
                    amount: channelState.balances[index].amount[0],
                    to: channelState.balances[index].to[0],
                    processedDeposit: channelState.processedDepositsA[index],
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
                    assetId,
                  },
                  update: {
                    amount: channelState.balances[index].amount[1],
                    to: channelState.balances[index].to[1],
                    processedDeposit: channelState.processedDepositsB[index],
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

  async getActiveTransfers(channelAddress: string): Promise<FullTransferState[]> {
    const transferEntities = await this.prisma.transfer.findMany({
      where: { channelAddress },
      include: { channel: true, createUpdate: true, resolveUpdate: true },
    });
    const transfers = transferEntities.map(convertTransferEntityToFullTransferState);
    return transfers;
  }

  async getTransferState(transferId: string): Promise<FullTransferState | undefined> {
    // should be only 1, verify this is always true
    const transfer = await this.prisma.transfer.findOne({
      where: { transferId },
      include: { channel: true, createUpdate: true, resolveUpdate: true },
    });

    if (!transfer) {
      return undefined;
    }

    // not ideal, but if the channel has been detatched we need to re-attach it separatedly... todo: use join queries
    if (!transfer.channel) {
      const channel = await this.prisma.channel.findOne({ where: { channelAddress: transfer.channelAddressId } });
      transfer.channel = channel;
    }

    return convertTransferEntityToFullTransferState(transfer);
  }

  async getTransferByRoutingId(channelAddress: string, routingId: string): Promise<FullTransferState | undefined> {
    const transfer = await this.prisma.transfer.findOne({
      where: { routingId_channelAddressId: { routingId, channelAddressId: channelAddress } },
      include: { channel: true, createUpdate: true, resolveUpdate: true },
    });

    if (!transfer) {
      return undefined;
    }

    // not ideal, but if the channel has been detatched we need to re-attach it separatedly... todo: use join queries
    if (!transfer.channel) {
      const channel = await this.prisma.channel.findOne({ where: { channelAddress: transfer.channelAddressId } });
      transfer.channel = channel;
    }

    return convertTransferEntityToFullTransferState(transfer);
  }

  async getTransfersByRoutingId(routingId: string): Promise<FullTransferState[]> {
    const transfers = await this.prisma.transfer.findMany({
      where: { routingId },
      include: {
        channel: true,
        createUpdate: true,
        resolveUpdate: true,
      },
    });

    for (const transfer of transfers) {
      if (!transfer.channel) {
        const channel = await this.prisma.channel.findOne({ where: { channelAddress: transfer.channelAddressId } });
        transfer.channel = channel;
      }
    }

    return transfers.map(convertTransferEntityToFullTransferState);
  }

  async setMnemonic(mnemonic: string): Promise<void> {
    await this.prisma.configuration.upsert({
      where: {
        id: 0,
      },
      create: {
        id: 0,
        mnemonic,
      },
      update: {
        mnemonic,
      },
    });
  }

  async getMnemonic(): Promise<string | undefined> {
    const config = await this.prisma.configuration.findOne({ where: { id: 0 } });
    if (!config) {
      return undefined;
    }
    return config.mnemonic;
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
