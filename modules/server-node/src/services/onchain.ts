import {
  ChainProviders,
  FullChannelState,
  IMultichainTransactionService,
  IVectorTransactionService,
  MinimalTransaction,
  OnchainError,
  Result,
  ERC20Abi,
} from "@connext/vector-types";
import { constants, providers, utils, Wallet } from "ethers";
import { ChannelFactory, VectorChannel } from "@connext/vector-contracts";
import { BaseLogger } from "pino";

export type ChainSigners = {
  [chainId: number]: providers.JsonRpcSigner;
};

export class MultichainTransactionService implements IMultichainTransactionService {
  private signers: Map<number, Wallet> = new Map();
  constructor(private readonly chainProviderUrls: ChainProviders, private readonly privateKey: string) {
    Object.entries(chainProviderUrls).forEach(([chainId, url]: [string, string]) => {
      this.signers.set(parseInt(chainId), new Wallet(privateKey, new providers.JsonRpcProvider(url)));
    });
  }

  async getCode(address: string, chainId: number): Promise<Result<string, OnchainError>> {
    const signer = this.signers.get(chainId);
    if (!signer?._isSigner) {
      return Result.fail(new OnchainError(OnchainError.reasons.SignerNotFound));
    }

    try {
      const code = await signer.provider.getCode(address);
      return Result.ok(code);
    } catch (e) {
      return Result.fail(e.message);
    }
  }

  async sendTx(
    minTx: MinimalTransaction,
    chainId: number,
  ): Promise<Result<providers.TransactionResponse, OnchainError>> {
    const signer = this.signers.get(chainId);
    if (!signer?._isSigner) {
      return Result.fail(new OnchainError(OnchainError.reasons.SignerNotFound));
    }

    try {
      const tx = await signer.sendTransaction(minTx);
      return Result.ok(tx);
    } catch (e) {
      return Result.fail(e.message);
    }
  }
}

export class VectorTransactionService implements IVectorTransactionService {
  constructor(
    private readonly onchainTransactionService: IMultichainTransactionService,
    private readonly logger: BaseLogger,
  ) {}
  async sendDepositTx(
    channelState: FullChannelState<any>,
    sender: string,
    amount: string,
    assetId: string,
  ): Promise<Result<providers.TransactionResponse, OnchainError>> {
    if (!channelState.participants.includes(sender)) {
      return Result.fail(new OnchainError(OnchainError.reasons.SenderNotInChannel));
    }
    // first check if multisig is needed to deploy
    const multisigRes = await this.onchainTransactionService.getCode(
      channelState.channelAddress,
      channelState.networkContext.chainId,
    );

    if (multisigRes.isError) {
      return Result.fail(multisigRes.getError()!);
    }

    const multisigCode = multisigRes.getValue();
    if (multisigCode === `0x`) {
      this.logger.info({ channelAddress: channelState.channelAddress }, `Deploying multisig`);
      // deploy multisig
      const channelFactory = new utils.Interface(ChannelFactory.abi);
      const data = channelFactory.encodeFunctionData("createChannel", [channelState.participants]);
      const txRes = await this.onchainTransactionService.sendTx(
        {
          to: channelState.networkContext.channelFactoryAddress,
          value: 0,
          data,
        },
        channelState.networkContext.chainId,
      );
      if (txRes.isError) {
        return Result.fail(txRes.getError()!);
      }
      const tx = txRes.getValue();
      this.logger.info({ txHash: tx.hash }, "Deployed multisig, waiting for confirmation");
      await tx.wait();
    }

    if (sender === channelState.participants[0]) {
      return this.sendDepositATx(channelState, amount, assetId);
    } else {
      return this.sendDepositBTx(channelState, amount, assetId);
    }
  }

  sendWithdrawTx(
    channelState: FullChannelState<any>,
    minTx: MinimalTransaction,
  ): Promise<Result<providers.TransactionResponse, OnchainError>> {
    throw new Error("Method not implemented.");
  }

  private async sendDepositATx(
    channelState: FullChannelState<any>,
    amount: string,
    assetId: string,
  ): Promise<Result<providers.TransactionResponse, OnchainError>> {
    const vectorChannel = new utils.Interface(VectorChannel.abi);
    const data = vectorChannel.encodeFunctionData("depositA", [amount, assetId]);
    if (assetId === constants.AddressZero) {
      return this.onchainTransactionService.sendTx(
        {
          data,
          to: channelState.channelAddress,
          value: amount,
        },
        channelState.networkContext.chainId,
      );
    } else {
      // need to approve
      this.logger.info({ assetId, channelAddress: channelState.channelAddress }, "Approving token");
      const erc20 = new utils.Interface(ERC20Abi);
      const data = erc20.encodeFunctionData("approve", [channelState.channelAddress, amount]);
      const approveRes = await this.onchainTransactionService.sendTx(
        {
          to: assetId,
          value: 0,
          data,
        },
        channelState.networkContext.chainId,
      );
      if (approveRes.isError) {
        return approveRes;
      }
      const approveTx = approveRes.getValue();
      this.logger.info({ txHash: approveTx.hash }, "Approved token, waiting for confirmation");
      await approveTx.wait();
      return this.onchainTransactionService.sendTx(
        {
          data,
          to: channelState.channelAddress,
          value: 0,
        },
        channelState.networkContext.chainId,
      );
    }
  }

  private async sendDepositBTx(
    channelState: FullChannelState<any>,
    amount: string,
    assetId: string,
  ): Promise<Result<providers.TransactionResponse, OnchainError>> {
    if (assetId === constants.AddressZero) {
      return this.onchainTransactionService.sendTx(
        {
          data: "0x",
          to: channelState.channelAddress,
          value: amount,
        },
        channelState.networkContext.chainId,
      );
    } else {
      const erc20 = new utils.Interface(ERC20Abi);
      const data = erc20.encodeFunctionData("transfer", [channelState.channelAddress, amount]);
      return this.onchainTransactionService.sendTx(
        {
          to: assetId,
          value: 0,
          data,
        },
        channelState.networkContext.chainId,
      );
    }
  }
}
