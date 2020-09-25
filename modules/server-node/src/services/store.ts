import {
  FullChannelState,
  Balance,
  CreateUpdateDetails,
  DepositUpdateDetails,
  ResolveUpdateDetails,
  SetupUpdateDetails,
  IVectorStore,
  ChannelCommitmentData,
  FullTransferState,
  UpdateType,
} from "@connext/vector-types";
import {
  BalanceCreateWithoutChannelInput,
  BalanceUpsertWithWhereUniqueWithoutChannelInput,
  Channel,
  PrismaClient,
  Update,
  Balance as BalanceEntity,
  UpdateCreateInput,
  Transfer,
} from "@prisma/client";

const convertChannelEntityToFullChannelState = (
  channelEntity: Channel & {
    balances: BalanceEntity[];
    latestUpdate: Update;
  },
): FullChannelState => {
  // use the inputted assetIds to preserve order
  const assetIds = channelEntity!.assetIds ? channelEntity!.assetIds?.split(",") : [];

  // get balances and locked value for each assetId
  const balances: Balance[] = assetIds.map(assetId => {
    const balanceA = channelEntity.balances.find(
      bal => bal.assetId === assetId && bal.participant === channelEntity.participantA,
    );
    const balanceB = channelEntity.balances.find(
      bal => bal.assetId === assetId && bal.participant === channelEntity.participantB,
    );
    return {
      amount: [balanceA!.amount, balanceB!.amount],
      to: [balanceA!.to, balanceB!.to],
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
            channelMastercopyAddress: channelEntity.channelMastercopyAddress,
          },
          timeout: channelEntity.timeout,
        } as SetupUpdateDetails;
        break;
      case "deposit":
        details = {
        } as DepositUpdateDetails;
        break;
      case "create":
        details = {
          merkleProofData: channelEntity.latestUpdate.merkleProofData!.split(","),
          merkleRoot: channelEntity.latestUpdate.merkleRoot!,
          transferDefinition: channelEntity.latestUpdate.transferDefinition!,
          transferTimeout: channelEntity.latestUpdate.transferTimeout!,
          transferId: channelEntity.latestUpdate.transferId!,
          transferEncodings: JSON.parse(channelEntity.latestUpdate.transferEncodings!),
          transferInitialState: JSON.parse(channelEntity.latestUpdate.transferInitialState!),
        } as CreateUpdateDetails;
        break;
      case "resolve":
        details = {
          merkleProofData: channelEntity.latestUpdate.merkleProofData!.split(","),
          merkleRoot: channelEntity.latestUpdate.merkleRoot!,
          transferDefinition: channelEntity.latestUpdate.transferDefinition!,
          transferEncodings: JSON.parse(channelEntity.latestUpdate.transferEncodings!),
          transferId: channelEntity.latestUpdate.transferId!,
          transferResolver: JSON.parse(channelEntity.latestUpdate.transferResolver!),
        } as ResolveUpdateDetails;
        break;
    }
  }

  const channel = {
    assetIds,
    balances,
    channelAddress: channelEntity.channelAddress,
    merkleRoot: channelEntity.merkleRoot,
    processedDepositsA: [],
    processedDepositsB: [],
    networkContext: {
      chainId: channelEntity.chainId,
      channelFactoryAddress: channelEntity.channelFactoryAddress,
      providerUrl: channelEntity.providerUrl,
      channelMastercopyAddress: channelEntity.channelMastercopyAddress,
    },
    nonce: channelEntity.nonce,
    participants: [channelEntity.participantA, channelEntity.participantB],
    publicIdentifiers: [channelEntity.publicIdentifierA, channelEntity.publicIdentifierB],
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
      signatures: [channelEntity.latestUpdate.signatureA!, channelEntity.latestUpdate.signatureB!],
      toIdentifier: channelEntity.latestUpdate.toIdentifier,
      type: channelEntity.latestUpdate.type,
    },
  };
  return channel;
};

const convertTransferEntityToFullTransferState = (
  transfer: Transfer & {
    createUpdate: Update & {
      channel: Channel | null;
    };
    resolveUpdate:
      | (Update & {
          channel: Channel | null;
        })
      | null;
  },
) => {
  const fullTransfer: FullTransferState = {
    channelFactoryAddress: transfer.createUpdate.channel!.channelFactoryAddress,
    assetId: transfer.createUpdate.assetId,
    chainId: transfer.createUpdate.channel!.chainId,
    channelAddress: transfer.createUpdate.channelAddress!,
    initialBalance: {
      amount: [transfer.initialAmountA, transfer.initialAmountB],
      to: [transfer.initialToA, transfer.initialAmountB],
    },
    initialStateHash: transfer.initialStateHash,
    transferDefinition: transfer.createUpdate.transferDefinition!,
    transferEncodings: transfer.createUpdate.transferEncodings!.split(","),
    transferId: transfer.createUpdate.transferId!,
    transferState: JSON.parse(transfer.createUpdate.transferInitialState!),
    transferTimeout: transfer.createUpdate.transferTimeout!,
    meta: transfer.createUpdate.meta ? JSON.parse(transfer.createUpdate.meta) : undefined,
    transferResolver: transfer.resolveUpdate?.transferResolver
      ? JSON.parse(transfer.resolveUpdate?.transferResolver)
      : undefined,
  };
  return fullTransfer;
};

export class PrismaStore implements IVectorStore {
  public prisma: PrismaClient;

  constructor(private readonly dbUrl?: string) {
    this.prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
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
    const channelEntity = await this.prisma.channel.findOne({
      where: {
        participantA_participantB_chainId: {
          chainId,
          participantA,
          participantB,
        },
      },
      include: { balances: true, latestUpdate: true },
    });
    if (!channelEntity) {
      return undefined;
    }

    return convertChannelEntityToFullChannelState(channelEntity);
  }

  async getChannelStates(): Promise<FullChannelState<any>[]> {
    const channelEntities = await this.prisma.channel.findMany({ include: { balances: true, latestUpdate: true } });
    return channelEntities.map(convertChannelEntityToFullChannelState);
  }

  async saveChannelState(
    channelState: FullChannelState,
    commitment: ChannelCommitmentData,
    transfer?: FullTransferState,
  ): Promise<void> {
    // create the latest update db structure from the input data
    let latestUpdateModel: UpdateCreateInput | undefined;
    if (channelState.latestUpdate) {
      latestUpdateModel = {
        channelAddressId: channelState.channelAddress,
        fromIdentifier: channelState.latestUpdate!.fromIdentifier,
        toIdentifier: channelState.latestUpdate!.toIdentifier,
        nonce: channelState.latestUpdate!.nonce,
        signatureA: channelState.latestUpdate?.signatures[0],
        signatureB: channelState.latestUpdate?.signatures[1],
        amountA: channelState.latestUpdate!.balance.amount[0],
        amountB: channelState.latestUpdate!.balance.amount[1],
        toA: channelState.latestUpdate!.balance.to[0],
        toB: channelState.latestUpdate!.balance.to[1],
        type: channelState.latestUpdate!.type,
        assetId: channelState.latestUpdate!.assetId,

        // details
        // deposit
        // create transfer
        transferInitialState: (channelState.latestUpdate!.details as CreateUpdateDetails).transferInitialState
          ? JSON.stringify((channelState.latestUpdate!.details as CreateUpdateDetails).transferInitialState)
          : undefined,
        merkleRoot: (channelState.latestUpdate!.details as CreateUpdateDetails).merkleRoot,
        merkleProofData: (channelState.latestUpdate!.details as CreateUpdateDetails).merkleProofData?.join(),
        transferDefinition: (channelState.latestUpdate!.details as CreateUpdateDetails).transferDefinition,
        transferEncodings: (channelState.latestUpdate!.details as CreateUpdateDetails).transferEncodings
          ? JSON.stringify((channelState.latestUpdate!.details as CreateUpdateDetails).transferEncodings)
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
          transfer?.meta?.routingId && channelState.latestUpdate.type === UpdateType.create
            ? {
                connectOrCreate: {
                  where: {
                    routingId: transfer.meta.routingId,
                  },
                  create: {
                    routingId: transfer.meta.routingId,
                    initialAmountA: transfer.initialBalance.amount[0],
                    initialToA: transfer.initialBalance.to[0],
                    initialAmountB: transfer.initialBalance.amount[1],
                    initialToB: transfer.initialBalance.to[1],
                    initialStateHash: transfer.initialStateHash,
                  },
                },
              }
            : undefined,

        // if resolve, add resolvedTransfer by routingId
        resolvedTransfer:
          transfer?.meta?.routingId && channelState.latestUpdate.type === UpdateType.resolve
            ? {
                connect: {
                  routingId: transfer?.meta?.routingId,
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
        chainId: channelState.networkContext.chainId,
        channelAddress: channelState.channelAddress,
        channelFactoryAddress: channelState.networkContext.channelFactoryAddress,
        merkleRoot: channelState.merkleRoot,
        nonce: channelState.nonce,
        participantA: channelState.participants[0],
        participantB: channelState.participants[1],
        providerUrl: channelState.networkContext.providerUrl,
        publicIdentifierA: channelState.publicIdentifiers[0],
        publicIdentifierB: channelState.publicIdentifiers[1],
        timeout: channelState.timeout,
        channelMastercopyAddress: channelState.networkContext.channelMastercopyAddress,
        balances: {
          create: channelState.assetIds.reduce(
            (create: BalanceCreateWithoutChannelInput[], assetId: string, index: number) => {
              return [
                ...create,
                {
                  amount: channelState.balances[index].amount[0],
                  participant: channelState.participants[0],
                  to: channelState.balances[index].to[0],
                  assetId,
                },
                {
                  amount: channelState.balances[index].amount[1],
                  participant: channelState.participants[1],
                  to: channelState.balances[index].to[1],
                  assetId,
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
                    participant: channelState.participants[0],
                    to: channelState.balances[index].to[0],
                    assetId,
                  },
                  update: {
                    amount: channelState.balances[index].amount[0],
                    to: channelState.balances[index].to[0],
                  },
                  where: {
                    participant_channelAddress_assetId: {
                      participant: channelState.participants[0],
                      channelAddress: channelState.channelAddress,
                      assetId,
                    },
                  },
                },
                {
                  create: {
                    amount: channelState.balances[index].amount[1],
                    participant: channelState.participants[1],
                    to: channelState.balances[index].to[1],
                    assetId,
                  },
                  update: {
                    amount: channelState.balances[index].amount[1],
                    to: channelState.balances[index].to[1],
                  },
                  where: {
                    participant_channelAddress_assetId: {
                      participant: channelState.participants[1],
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
      include: { balances: true, latestUpdate: true },
    });
  }

  async getActiveTransfers(channelAddress: string): Promise<FullTransferState[]> {
    const transferEntities = await this.prisma.transfer.findMany({
      where: { AND: [{ createUpdate: { channelAddressId: channelAddress } }, { resolveUpdateChannelAddressId: null }] },
      include: {
        createUpdate: {
          include: {
            channel: true,
          },
        },
        resolveUpdate: {
          include: {
            channel: true,
          },
        },
      },
    });
    return transferEntities.map(convertTransferEntityToFullTransferState);
  }

  async getTransferState(transferId: string): Promise<FullTransferState | undefined> {
    // should be only 1, verify this is always true
    const [transfer] = await this.prisma.transfer.findMany({
      where: {
        OR: [
          {
            createUpdate: {
              transferId,
            },
          },
          {
            resolveUpdate: {
              transferId,
            },
          },
        ],
      },
      include: {
        createUpdate: {
          include: {
            channel: true,
          },
        },
        resolveUpdate: {
          include: {
            channel: true,
          },
        },
      },
    });

    if (!transfer) {
      return undefined;
    }

    return convertTransferEntityToFullTransferState(transfer);
  }

  async clear(): Promise<void> {
    await this.prisma.channel.deleteMany({});
    await this.prisma.balance.deleteMany({});
    await this.prisma.update.deleteMany({});
    await this.prisma.transfer.deleteMany({});
  }
}
