import {
  FullChannelState,
  IVectorTransactionService,
  MinimalTransaction,
  OnchainError,
  Result,
  ERC20Abi,
} from "@connext/vector-types";
import { constants, Contract, providers, Wallet } from "ethers";
import { ChannelFactory, ChannelMastercopy, VectorOnchainService } from "@connext/vector-contracts";
import { BaseLogger } from "pino";

export type ChainSigners = {
  [chainId: number]: providers.JsonRpcSigner;
};

export class VectorTransactionService extends VectorOnchainService implements IVectorTransactionService {
  private signers: Map<number, Wallet> = new Map();
  constructor(
    private readonly _chainProviders: { [chainId: string]: providers.JsonRpcProvider },
    private readonly privateKey: string,
    private readonly logger: BaseLogger,
  ) {
    super(_chainProviders, logger.child({ module: "VectorOnchainService" }));
    Object.entries(_chainProviders).forEach(([chainId, provider]) => {
      this.signers.set(parseInt(chainId), new Wallet(privateKey, provider));
    });
  }

  private async sendTxAndParseResponse(
    txFn: Promise<providers.TransactionResponse>,
  ): Promise<Result<providers.TransactionResponse, OnchainError>> {
    try {
      const tx = await txFn;
      return Result.ok(tx);
    } catch (e) {
      let error = e;
      if (e.message.includes("sender doesn't have enough funds")) {
        error = new OnchainError(OnchainError.reasons.NotEnoughFunds);
      }
      return Result.fail(error);
    }
  }

  async sendDepositTx(
    channelState: FullChannelState<any>,
    sender: string,
    amount: string,
    assetId: string,
  ): Promise<Result<providers.TransactionResponse, OnchainError>> {
    const signer = this.signers.get(channelState.networkContext.chainId);
    if (!signer?._isSigner) {
      return Result.fail(new OnchainError(OnchainError.reasons.SignerNotFound));
    }

    if (!channelState.participants.includes(sender)) {
      return Result.fail(new OnchainError(OnchainError.reasons.SenderNotInChannel));
    }
    // first check if multisig is needed to deploy
    const multisigRes = await this.getCode(channelState.channelAddress, channelState.networkContext.chainId);

    if (multisigRes.isError) {
      return Result.fail(multisigRes.getError()!);
    }

    const multisigCode = multisigRes.getValue();
    if (multisigCode === `0x`) {
      this.logger.info({ method: "sendDepositTx", channelAddress: channelState.channelAddress }, `Deploying multisig`);
      // deploy multisig
      const channelFactory = new Contract(
        channelState.networkContext.channelFactoryAddress,
        ChannelFactory.abi,
        signer,
      );
      const created = new Promise(res => {
        channelFactory.once(channelFactory.filters.ChannelCreation(), res);
      });
      const txRes = await this.sendTxAndParseResponse(
        channelFactory.createChannel(channelState.participants[0], channelState.participants[1]),
      );
      if (txRes.isError) {
        this.logger.error(
          {
            method: "sendDepositTx",
            channelAddress: channelState.channelAddress,
            error: txRes.getError()?.message,
          },
          "Error deploying multisig",
        );
        return Result.fail(txRes.getError()!);
      }
      const tx = txRes.getValue();
      this.logger.info({ method: "sendDepositTx", txHash: tx.hash }, "Deployed multisig, waiting for confirmation");
      const txReceipt = await tx.wait();
      const channelAddress = (await created) as string;
      console.log("sendDepositTx:::::channelAddress: ", channelAddress);
      this.logger.info(
        {
          method: "sendDepositTx",
          txHash: txReceipt.transactionHash,
          logs: txReceipt.logs,
          events: (txReceipt as any).events,
        },
        "Multisig deposit confirmed",
      );
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
    const signer = this.signers.get(channelState.networkContext.chainId);
    if (!signer?._isSigner) {
      return Result.fail(new OnchainError(OnchainError.reasons.SignerNotFound));
    }

    if (assetId !== constants.AddressZero) {
      // need to approve
      this.logger.info({ assetId, channelAddress: channelState.channelAddress }, "Approving token");
      const erc20 = new Contract(channelState.networkContext.channelFactoryAddress, ERC20Abi, signer);
      const approveRes = await this.sendTxAndParseResponse(erc20.approve(channelState.channelAddress, amount));
      if (approveRes.isError) {
        this.logger.error(
          {
            method: "sendDepositATx",
            channelAddress: channelState.channelAddress,
            error: approveRes.getError()?.message,
          },
          "Error approving tokens for deposit A",
        );
        return approveRes;
      }
      const approveTx = approveRes.getValue();
      this.logger.info(
        { txHash: approveTx.hash, method: "sendDepositATx", assetId },
        "Approved token, waiting for confirmation",
      );
      await approveTx.wait();
      this.logger.info({ txHash: approveTx.hash, method: "sendDepositATx", assetId }, "Token approval confirmed");
    }
    const vectorChannel = new Contract(channelState.channelAddress, ChannelMastercopy.abi, signer);
    return this.sendTxAndParseResponse(vectorChannel.depositA(amount, assetId));
  }

  private async sendDepositBTx(
    channelState: FullChannelState<any>,
    amount: string,
    assetId: string,
  ): Promise<Result<providers.TransactionResponse, OnchainError>> {
    const signer = this.signers.get(channelState.networkContext.chainId);
    if (!signer?._isSigner) {
      return Result.fail(new OnchainError(OnchainError.reasons.SignerNotFound));
    }

    if (assetId === constants.AddressZero) {
      return this.sendTx(
        {
          data: "0x",
          to: channelState.channelAddress,
          value: amount,
        },
        channelState.networkContext.chainId,
      );
    } else {
      const erc20 = new Contract(channelState.networkContext.channelFactoryAddress, ERC20Abi, signer);
      return this.sendTxAndParseResponse(erc20.transfer(channelState.channelAddress, amount));
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

    return this.sendTxAndParseResponse(signer.sendTransaction(minTx));
  }
}
