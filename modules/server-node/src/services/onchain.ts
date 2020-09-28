import {
  FullChannelState,
  IVectorTransactionService,
  MinimalTransaction,
  OnchainError,
  Result,
  ERC20Abi,
} from "@connext/vector-types";
import { BigNumber, constants, Contract, providers, Wallet } from "ethers";
import { ChannelFactory, VectorChannel, VectorOnchainService } from "@connext/vector-contracts";
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
    // alice needs to deploy the multisig
    if (multisigCode === `0x`) {
      this.logger.info(
        { method: "sendDepositTx", channelAddress: channelState.channelAddress, assetId, amount },
        `Deploying channel with deposit`,
      );
      // deploy multisig
      const channelFactory = new Contract(
        channelState.networkContext.channelFactoryAddress,
        ChannelFactory.abi,
        signer,
      );

      channelFactory.once(channelFactory.filters.ChannelCreation(), data => {
        console.log(`Channel created: ${JSON.stringify(data)}`);
      });

      if (assetId !== constants.AddressZero) {
        // approve tokens
        const approveRes = await this.approveTokens(
          channelState.networkContext.channelFactoryAddress,
          sender,
          amount,
          assetId,
          channelState.networkContext.chainId,
        );
        if (approveRes.isError) {
          return Result.fail(approveRes.getError()!);
        }
        if (approveRes.getValue()) {
          const receipt = await approveRes.getValue()!.wait();
          this.logger.info(
            { txHash: receipt.transactionHash, method: "sendDepositATx", assetId },
            "Token approval confirmed",
          );
        }
      }

      const tx = await this.sendTxAndParseResponse(
        channelFactory.createChannel(
          channelState.participants[0],
          channelState.participants[1],
          channelState.networkContext.chainId,
        ),
      );

      // TODO: fix this
      // const tx = await this.sendTxAndParseResponse(
      //   channelFactory.createChannelAndDepositA(
      //     channelState.participants[0],
      //     channelState.participants[1],
      //     channelState.networkContext.chainId,
      //     assetId,
      //     amount,
      //   ),
      // );
      if (tx.isError) {
        this.logger.error(
          {
            method: "sendDepositTx",
            error: tx.getError()?.message,
          },
          "Error creating channel",
        );
      }
      // return tx;

      const createReceipt = await tx.getValue().wait();
      this.logger.info(
        { txHash: createReceipt.transactionHash, method: "sendDepositATx", assetId },
        "Channel creation confirmed",
      );
    }

    this.logger.info({ method: "sendDepositTx", assetId, amount }, "Channel is deployed, sending deposit");
    if (sender === channelState.participants[0]) {
      this.logger.info(
        { method: "sendDepositTx", sender, participants: channelState.participants },
        "Detected participant A",
      );
      return this.sendDepositATx(channelState, amount, assetId);
    } else {
      this.logger.info(
        { method: "sendDepositTx", sender, participants: channelState.participants },
        "Detected participant B",
      );
      return this.sendDepositBTx(channelState, amount, assetId);
    }
  }

  sendWithdrawTx(
    channelState: FullChannelState<any>,
    minTx: MinimalTransaction,
  ): Promise<Result<providers.TransactionResponse, OnchainError>> {
    throw new Error("Method not implemented.");
  }

  private async approveTokens(
    spender: string,
    owner: string,
    amount: string,
    assetId: string,
    chainId: number,
  ): Promise<Result<providers.TransactionResponse | undefined, OnchainError>> {
    const signer = this.signers.get(chainId);
    if (!signer?._isSigner) {
      return Result.fail(new OnchainError(OnchainError.reasons.SignerNotFound));
    }

    this.logger.info({ assetId, channelAddress: spender }, "Approving token");
    const erc20 = new Contract(assetId, ERC20Abi, signer);
    const checkApprovalRes = await this.sendTxAndParseResponse(erc20.allowance(owner, spender));
    if (checkApprovalRes.isError) {
      this.logger.error(
        {
          method: "approveTokens",
          spender,
          owner,
          assetId,
          error: checkApprovalRes.getError()?.message,
        },
        "Error checking approved tokens for deposit A",
      );
      return checkApprovalRes;
    }

    if (BigNumber.from(checkApprovalRes.getValue()).gte(amount)) {
      this.logger.info(
        {
          method: "approveTokens",
          assetId,
          spender,
          owner,
          approved: checkApprovalRes.getValue().toString(),
        },
        "Allowance is sufficient",
      );
      return Result.ok(undefined);
    }
    const approveRes = await this.sendTxAndParseResponse(erc20.approve(spender, amount));
    if (approveRes.isError) {
      this.logger.error(
        {
          method: "approveTokens",
          spender,
          error: approveRes.getError()?.message,
        },
        "Error approving tokens for deposit A",
      );
      return approveRes;
    }
    const approveTx = approveRes.getValue();
    this.logger.info(
      { txHash: approveTx.hash, method: "approveTokens", assetId, amount },
      "Approve token tx submitted",
    );
    return approveRes;
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

    const vectorChannel = new Contract(channelState.channelAddress, VectorChannel.abi, signer);
    if (assetId !== constants.AddressZero) {
      // need to approve
      this.logger.info({ assetId, channelAddress: channelState.channelAddress }, "Approving token");
      const approveRes = await this.approveTokens(
        channelState.channelAddress,
        channelState.participants[0],
        amount,
        assetId,
        channelState.networkContext.chainId,
      );
      if (approveRes.isError) {
        this.logger.error(
          {
            method: "sendDepositATx",
            channelAddress: channelState.channelAddress,
            error: approveRes.getError()?.message,
          },
          "Error approving tokens for deposit A",
        );
        return Result.fail(approveRes.getError()!);
      }
      const approveTx = approveRes.getValue();
      if (approveTx) {
        await approveTx.wait();
      }
      this.logger.info({ txHash: approveTx?.hash, method: "sendDepositATx", assetId }, "Token approval confirmed");
      return this.sendTxAndParseResponse(vectorChannel.depositA(assetId, amount));
    }
    return this.sendTxAndParseResponse(vectorChannel.depositA(assetId, amount, { value: amount }));
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
          value: BigNumber.from(amount),
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
