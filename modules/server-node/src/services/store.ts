import { IStoreService, FullChannelState, CoreTransferState, CreateUpdateDetails } from "@connext/vector-types";
import {
  BalanceCreateWithoutChannelInput,
  BalanceUpsertWithWhereUniqueWithoutChannelInput,
  PrismaClient,
} from "@prisma/client";

export class PrismaStore implements IStoreService {
  public prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
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
    console.log("channelEntity: ", channelEntity);
    return channelEntity as any;
  }

  async saveChannelState(channelState: FullChannelState<any>): Promise<void> {
    const channel = await this.prisma.channel.upsert({
      where: { channelAddress: channelState.channelAddress },
      create: {
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
        balances: {
          create: channelState.assetIds.reduce((cre: BalanceCreateWithoutChannelInput[], assetId, index) => {
            return [
              ...cre,
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
          }, []),
        },
        latestUpdate: channelState.latestUpdate && {
          create: {
            adjudicatorAddress: channelState.networkContext.adjudicatorAddress,
            assetId: channelState.latestUpdate!.assetId,
            merkleProofData: channelState.latestUpdate!.details.merkleProofData,
            transferDefinition: channelState.latestUpdate!.details.transferDefinition,
            transferEncodings: JSON.stringify(
              (channelState.latestUpdate!.details as CreateUpdateDetails).transferEncodings,
            ),
            transferId: channelState.latestUpdate!.details.transferId,
            transferStateHash: channelState.latestUpdate!.details.transferStateHash,
            transferTimeout: channelState.latestUpdate!.details.transferTimeout,
            signatureA: channelState.latestUpdate!.signatures[0],
            signatureB: channelState.latestUpdate!.signatures[1],
          },
        },
      },
      update: {
        latestDepositNonce: channelState.latestDepositNonce,
        merkleRoot: channelState.merkleRoot,
        nonce: channelState.nonce,
        balances: {
          upsert: channelState.assetIds.reduce(
            (upsert: BalanceUpsertWithWhereUniqueWithoutChannelInput[], assetId, index) => {
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
    console.log("channel: ", channel);
  }
  getTransferInitialStates(channelAddress: string): Promise<CoreTransferState[]> {
    throw new Error("Method not implemented.");
  }
  getTransferState(transferId: string): Promise<CoreTransferState | undefined> {
    throw new Error("Method not implemented.");
  }
}
