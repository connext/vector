import {
  FullChannelState,
  IVectorTransactionService,
  MinimalTransaction,
  OnchainError,
  Result,
  ERC20Abi,
} from "@connext/vector-types";
import { constants, providers, utils, Wallet } from "ethers";
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
    const multisigRes = await this.getCode(channelState.channelAddress, channelState.networkContext.chainId);

    if (multisigRes.isError) {
      return Result.fail(multisigRes.getError()!);
    }

    const multisigCode = multisigRes.getValue();
    if (multisigCode === `0x`) {
      this.logger.info({ method: "sendDepositTx", channelAddress: channelState.channelAddress }, `Deploying multisig`);
      // deploy multisig
      const channelFactory = new utils.Interface(ChannelFactory.abi);
      const data = channelFactory.encodeFunctionData("createChannel", [
        channelState.participants[0],
        channelState.participants[1],
      ]);
      console.log(
        "channelState.networkContext.channelFactoryAddress: ",
        channelState.networkContext.channelFactoryAddress,
      );
      const txRes = await this.sendTx(
        {
          to: channelState.networkContext.channelFactoryAddress,
          value: 0,
          data,
        },
        channelState.networkContext.chainId,
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
      await tx.wait();
      this.logger.info({ method: "sendDepositTx", txHash: tx.hash }, "Multisig deposit confirmed");
    }

    if (sender === channelState.participants[0]) {
      return this.sendInitiatorDepositTx(channelState, amount, assetId);
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

  private async sendInitiatorDepositTx(
    channelState: FullChannelState<any>,
    amount: string,
    assetId: string,
  ): Promise<Result<providers.TransactionResponse, OnchainError>> {
    const vectorChannel = new utils.Interface(ChannelMastercopy.abi);
    const data = vectorChannel.encodeFunctionData("initiatorDeposit", [amount, assetId]);
    if (assetId === constants.AddressZero) {
      return this.sendTx(
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
      const approveRes = await this.sendTx(
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
      return this.sendTx(
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
      return this.sendTx(
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
      return this.sendTx(
        {
          to: assetId,
          value: 0,
          data,
        },
        channelState.networkContext.chainId,
      );
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
      let error = e;
      if (e.message.includes("sender doesn't have enough funds")) {
        error = new OnchainError(OnchainError.reasons.NotEnoughFunds);
      }
      return Result.fail(error);
    }
  }
}
