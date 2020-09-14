import {
  FullChannelState,
  CoreTransferState,
  Balance,
  LockedValueType,
  CreateUpdateDetails,
  DepositUpdateDetails,
  ResolveUpdateDetails,
  SetupUpdateDetails,
  IEngineStore,
  TransferState,
  ChannelCommitmentData,
} from "@connext/vector-types";
import {
  BalanceCreateWithoutChannelInput,
  BalanceUpsertWithWhereUniqueWithoutChannelInput,
  PrismaClient,
} from "@prisma/client";

export class PrismaStore implements IEngineStore {
  public prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
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
  saveTransferToChannel(channelAddress: string, transfer: CoreTransferState, state: TransferState): Promise<void> {
    throw new Error("Method not implemented.");
  }
  removeTransferFromChannel(channelAddress: string, transferId: string, state: TransferState): Promise<void> {
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

    // use the inputted assetIds to preserve order
    const assetIds = channelEntity!.assetIds.split(",");

    // get balances and locked value for each assetId
    const lockedValue: LockedValueType[] = [];
    const balances: Balance[] = assetIds.map((assetId) => {
      const balanceA = channelEntity.balances.find(
        (bal) => bal.assetId === assetId && bal.participant === channelEntity.participantA,
      );
      const balanceB = channelEntity.balances.find(
        (bal) => bal.assetId === assetId && bal.participant === channelEntity.participantB,
      );
      lockedValue.push({ amount: balanceA!.lockedValue });
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
              adjudicatorAddress: channelEntity.adjudicatorAddress,
              chainId: channelEntity.chainId,
              channelFactoryAddress: channelEntity.channelFactoryAddress,
              providerUrl: channelEntity.providerUrl,
              vectorChannelMastercopyAddress: channelEntity.vectorChannelMastercopyAddress,
            },
            timeout: channelEntity.timeout,
          } as SetupUpdateDetails;
          break;
        case "deposit":
          details = {
            latestDepositNonce: channelEntity.latestUpdate.latestDepositNonce,
          } as DepositUpdateDetails;
          break;
        case "create":
          details = {
            merkleProofData: channelEntity.latestUpdate.merkleProofData!,
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
            merkleProofData: channelEntity.latestUpdate.merkleProofData!,
            merkleRoot: channelEntity.latestUpdate.merkleRoot!,
            transferDefinition: channelEntity.latestUpdate.transferDefinition!,
            transferEncodings: JSON.parse(channelEntity.latestUpdate.transferEncodings!),
            transferId: channelEntity.latestUpdate.transferId!,
            transferResolver: JSON.parse(channelEntity.latestUpdate.transferResolver!),
          } as ResolveUpdateDetails;
          break;
      }
    }

    // return as FullChannelState
    return {
      assetIds,
      balances,
      channelAddress,
      latestDepositNonce: channelEntity.latestDepositNonce,
      lockedValue,
      merkleRoot: channelEntity.merkleRoot,
      networkContext: {
        adjudicatorAddress: channelEntity.adjudicatorAddress,
        chainId: channelEntity.chainId,
        channelFactoryAddress: channelEntity.channelFactoryAddress,
        providerUrl: channelEntity.providerUrl,
        vectorChannelMastercopyAddress: channelEntity.vectorChannelMastercopyAddress,
      },
      nonce: channelEntity.nonce,
      participants: [channelEntity.participantA, channelEntity.participantB],
      publicIdentifiers: [channelEntity.publicIdentifierA, channelEntity.publicIdentifierB],
      timeout: channelEntity.timeout,
      latestUpdate: channelEntity.latestUpdate
        ? {
            assetId: channelEntity.latestUpdate.assetId,
            balance: {
              amount: [channelEntity.latestUpdate.amountA, channelEntity.latestUpdate.amountB],
              to: [channelEntity.latestUpdate.toA, channelEntity.latestUpdate.toB],
            },
            channelAddress,
            details,
            fromIdentifier: channelEntity.latestUpdate.fromIdentifier,
            nonce: channelEntity.latestUpdate.nonce,
            signatures: [channelEntity.latestUpdate.signatureA!, channelEntity.latestUpdate.signatureB!],
            toIdentifier: channelEntity.latestUpdate.toIdentifier,
            type: channelEntity.latestUpdate.type,
          }
        : undefined,
    };
  }

  async saveChannelState(channelState: FullChannelState<any>): Promise<void> {
    // create the latest update db structure from the input data
    let latestUpdateModel: any;
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
        latestDepositNonce: channelState.latestUpdate?.details.latestDepositNonce,
        // create transfer
        transferInitialState: JSON.stringify(channelState.latestUpdate!.details.transferInitialState),
        merkleRoot: channelState.latestUpdate!.details.merkleRoot,
        merkleProofData: channelState.latestUpdate!.details.merkleProofData,
        transferDefinition: channelState.latestUpdate!.details.transferDefinition,
        transferEncodings: JSON.stringify(channelState.latestUpdate!.details.transferEncodings),
        transferId: channelState.latestUpdate!.details.transferId,
        transferTimeout: channelState.latestUpdate!.details.transferTimeout,

        // resolve transfer
        transferResolver: JSON.stringify(channelState.latestUpdate!.details.transferResolver),
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
        latestDepositNonce: channelState.latestDepositNonce,
        merkleRoot: channelState.merkleRoot,
        nonce: channelState.nonce,
        participantA: channelState.participants[0],
        participantB: channelState.participants[1],
        providerUrl: channelState.networkContext.providerUrl,
        publicIdentifierA: channelState.publicIdentifiers[0],
        publicIdentifierB: channelState.publicIdentifiers[1],
        timeout: channelState.timeout,
        vectorChannelMastercopyAddress: channelState.networkContext.vectorChannelMastercopyAddress,
        adjudicatorAddress: channelState.networkContext.adjudicatorAddress,
        balances: {
          create: channelState.assetIds.reduce(
            (create: BalanceCreateWithoutChannelInput[], assetId: string, index: number) => {
              return [
                ...create,
                {
                  amount: channelState.balances[index].amount[0],
                  lockedValue: channelState.lockedValue[index].amount,
                  participant: channelState.participants[0],
                  to: channelState.balances[index].to[0],
                  assetId,
                },
                {
                  amount: channelState.balances[index].amount[1],
                  lockedValue: channelState.lockedValue[index].amount,
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
        latestDepositNonce: channelState.latestDepositNonce,
        merkleRoot: channelState.merkleRoot,
        nonce: channelState.nonce,
        adjudicatorAddress: channelState.networkContext.adjudicatorAddress,
        latestUpdate: {
          connectOrCreate: {
            where: {
              channelAddressId_nonce: {
                channelAddressId: channelState.channelAddress,
                nonce: channelState.latestUpdate!.nonce,
              },
            },
            create: latestUpdateModel,
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
                    lockedValue: channelState.lockedValue[index].amount,
                    participant: channelState.participants[0],
                    to: channelState.balances[index].to[0],
                    assetId,
                  },
                  update: {
                    amount: channelState.balances[index].amount[0],
                    lockedValue: channelState.lockedValue[index].amount,
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
                    lockedValue: channelState.lockedValue[index].amount,
                    participant: channelState.participants[1],
                    to: channelState.balances[index].to[1],
                    assetId,
                  },
                  update: {
                    amount: channelState.balances[index].amount[1],
                    lockedValue: channelState.lockedValue[index].amount,
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

  getActiveTransfers(channelAddress: string): Promise<CoreTransferState[]> {
    throw new Error("Method not implemented.");
  }

  getTransferState(transferId: string): Promise<TransferState | undefined> {
    throw new Error("Method not implemented.");
  }

  getCoreTransferState(transferId: string): Promise<CoreTransferState | undefined> {
    throw new Error("Method not implemented.");
  }
}
