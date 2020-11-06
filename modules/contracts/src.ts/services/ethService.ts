import {
  FullChannelState,
  IVectorChainService,
  MinimalTransaction,
  ChainError,
  Result,
  ERC20Abi,
  IChainServiceStore,
  TransactionReason,
  FullTransferState,
} from "@connext/vector-types";
import { delay, encodeTransferResolver, encodeTransferState } from "@connext/vector-utils";
import { BigNumber, constants, Contract, providers, Signer, Wallet } from "ethers";
import { BaseLogger } from "pino";
import PriorityQueue from "p-queue";

import { ChannelFactory, VectorChannel } from "../artifacts";

import { EthereumChainReader } from "./ethReader";

export class EthereumChainService extends EthereumChainReader implements IVectorChainService {
  private signers: Map<number, Signer> = new Map();
  private queue: PriorityQueue = new PriorityQueue({ concurrency: 1 });
  constructor(
    private readonly store: IChainServiceStore,
    chainProviders: { [chainId: string]: providers.JsonRpcProvider },
    signer: string | Signer,
    log: BaseLogger,
    private readonly defaultRetries = 1,
  ) {
    super(chainProviders, log.child({ module: "EthereumChainReader" }));
    Object.entries(chainProviders).forEach(([chainId, provider]) => {
      this.signers.set(
        parseInt(chainId),
        typeof signer === "string" ? new Wallet(signer, provider) : (signer.connect(provider) as Signer),
      );
    });
  }

  async sendDisputeChannelTx(
    channelState: FullChannelState,
  ): Promise<Result<providers.TransactionResponse, ChainError>> {
    const signer = this.signers.get(channelState.networkContext.chainId);
    if (!signer?._isSigner) {
      return Result.fail(new ChainError(ChainError.reasons.SignerNotFound));
    }

    if (!channelState.latestUpdate.aliceSignature || !channelState.latestUpdate.bobSignature) {
      return Result.fail(new ChainError(ChainError.reasons.MissingSigs));
    }
    return this.sendTxWithRetries(channelState.channelAddress, TransactionReason.disputeChannel, () => {
      const channel = new Contract(channelState.channelAddress, VectorChannel.abi, signer);
      return channel.disputeChannel(
        channelState,
        channelState.latestUpdate.aliceSignature,
        channelState.latestUpdate.bobSignature,
      );
    });
  }

  async sendDefundChannelTx(
    channelState: FullChannelState,
  ): Promise<Result<providers.TransactionResponse, ChainError>> {
    const signer = this.signers.get(channelState.networkContext.chainId);
    if (!signer?._isSigner) {
      return Result.fail(new ChainError(ChainError.reasons.SignerNotFound));
    }

    if (!channelState.latestUpdate.aliceSignature || !channelState.latestUpdate.bobSignature) {
      return Result.fail(new ChainError(ChainError.reasons.MissingSigs));
    }
    return this.sendTxWithRetries(channelState.channelAddress, TransactionReason.defundChannel, () => {
      const channel = new Contract(channelState.channelAddress, VectorChannel.abi, signer);
      return channel.defundChannel(channelState);
    });
  }

  async sendDisputeTransferTx(
    transferState: FullTransferState,
    merkleProof: string[],
  ): Promise<Result<providers.TransactionResponse, ChainError>> {
    const signer = this.signers.get(transferState.chainId);
    if (!signer?._isSigner) {
      return Result.fail(new ChainError(ChainError.reasons.SignerNotFound));
    }

    return this.sendTxWithRetries(transferState.channelAddress, TransactionReason.disputeTransfer, () => {
      const channel = new Contract(transferState.channelAddress, VectorChannel.abi, signer);
      return channel.disputeTransfer(transferState, merkleProof);
    });
  }

  async sendDefundTransferTx(
    transferState: FullTransferState,
  ): Promise<Result<providers.TransactionResponse, ChainError>> {
    const signer = this.signers.get(transferState.chainId);
    if (!signer?._isSigner) {
      return Result.fail(new ChainError(ChainError.reasons.SignerNotFound));
    }

    if (!transferState.transferResolver) {
      return Result.fail(new ChainError(ChainError.reasons.ResolverNeeded));
    }

    // TODO: should this be checked? is there some other option?
    if (transferState.balance.amount[1] !== "0") {
      return Result.fail(new ChainError(ChainError.reasons.NotInitialState));
    }

    const encodedState = encodeTransferState(transferState.transferState, transferState.transferEncodings[0]);
    const encodedResolver = encodeTransferResolver(transferState.transferResolver, transferState.transferEncodings[1]);

    return this.sendTxWithRetries(transferState.channelAddress, TransactionReason.defundTransfer, () => {
      const channel = new Contract(transferState.channelAddress, VectorChannel.abi, signer);
      return channel.defundTransfer(transferState, encodedState, encodedResolver);
    });
  }

  public async sendWithdrawTx(
    channelState: FullChannelState,
    minTx: MinimalTransaction,
  ): Promise<Result<providers.TransactionResponse, ChainError>> {
    const method = "sendWithdrawTx";
    const signer = this.signers.get(channelState.networkContext.chainId);
    if (!signer?._isSigner) {
      return Result.fail(new ChainError(ChainError.reasons.SignerNotFound));
    }
    const sender = await signer.getAddress();

    if (channelState.alice !== sender && channelState.bob !== sender) {
      return Result.fail(new ChainError(ChainError.reasons.SenderNotInChannel));
    }

    // check if multisig must be deployed
    const multisigRes = await this.getCode(channelState.channelAddress, channelState.networkContext.chainId);

    if (multisigRes.isError) {
      return Result.fail(multisigRes.getError()!);
    }

    if (multisigRes.getValue() === `0x`) {
      // Deploy multisig tx
      this.log.info({ channelAddress: channelState.channelAddress, sender, method }, "Deploying channel");
      const channelFactory = new Contract(
        channelState.networkContext.channelFactoryAddress,
        ChannelFactory.abi,
        signer,
      );
      const deployCompleted = new Promise(resolve =>
        channelFactory.once(channelFactory.filters.ChannelCreation(), data => {
          this.log.info({ method, data: JSON.stringify(data) }, "Caught channel created event");
          resolve();
        }),
      );
      const txRes = await this.sendTxWithRetries(channelState.channelAddress, TransactionReason.deploy, () =>
        channelFactory.createChannel(channelState.alice, channelState.bob, channelState.networkContext.chainId),
      );
      if (txRes.isError) {
        return Result.fail(
          new ChainError(ChainError.reasons.FailedToDeploy, {
            method,
            error: txRes.getError()!.message,
            channel: channelState.channelAddress,
            chainId: channelState.networkContext.chainId,
          }),
        );
      }
      const deployTx = txRes.getValue();
      this.log.info({ method, deployTx: deployTx.hash }, "Deploy tx broadcast");
      await deployCompleted;
      this.log.debug({ method }, "Deploy tx mined");
    }

    this.log.info({ sender, method, channel: channelState.channelAddress }, "Sending withdraw tx to chain");
    return this.sendTxWithRetries(channelState.channelAddress, TransactionReason.withdraw, () =>
      signer.sendTransaction(minTx),
    );
  }

  public async sendDepositTx(
    channelState: FullChannelState<any>,
    sender: string,
    amount: string,
    assetId: string,
  ): Promise<Result<providers.TransactionResponse, ChainError>> {
    const signer = this.signers.get(channelState.networkContext.chainId);
    if (!signer?._isSigner) {
      return Result.fail(new ChainError(ChainError.reasons.SignerNotFound));
    }

    if (channelState.alice !== sender && channelState.bob !== sender) {
      return Result.fail(new ChainError(ChainError.reasons.SenderNotInChannel));
    }
    // first check if multisig is needed to deploy
    const multisigRes = await this.getCode(channelState.channelAddress, channelState.networkContext.chainId);

    if (multisigRes.isError) {
      return Result.fail(multisigRes.getError()!);
    }

    const multisigCode = multisigRes.getValue();
    // alice needs to deploy the multisig
    if (multisigCode === `0x` && sender === channelState.alice) {
      this.log.info(
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
        this.log.info({ method: "sendDepositTx" }, `Channel created event: ${JSON.stringify(data)}`);
      });

      if (assetId !== constants.AddressZero) {
        // approve tokens
        const approveRes = await this.approveTokens(
          channelState.channelAddress,
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
          this.log.info(
            { txHash: receipt.transactionHash, method: "sendDepositATx", assetId },
            "Token approval confirmed",
          );
        }
      }

      const tx = await this.sendTxWithRetries(channelState.channelAddress, TransactionReason.deployWithDepositA, () =>
        channelFactory.createChannelAndDepositAlice(
          channelState.alice,
          channelState.bob,
          channelState.networkContext.chainId,
          assetId,
          amount,
          { value: amount },
        ),
      );
      if (tx.isError) {
        this.log.error(
          {
            method: "sendDepositTx",
            error: tx.getError()?.message,
            channel: channelState.channelAddress,
            chainId: channelState.networkContext.chainId,
          },
          "Error creating channel",
        );
        return Result.fail(
          new ChainError(ChainError.reasons.FailedToDeploy, {
            error: tx.getError()!.message,
            channel: channelState.channelAddress,
            chainId: channelState.networkContext.chainId,
          }),
        );
      }

      const createReceipt = await tx.getValue().wait();
      this.log.info(
        { txHash: createReceipt.transactionHash, method: "sendDepositATx", assetId },
        "Channel creation confirmed",
      );
      return tx;
    }

    this.log.info({ method: "sendDepositTx", assetId, amount }, "Channel is deployed, sending deposit");
    if (sender === channelState.alice) {
      this.log.info(
        { method: "sendDepositTx", sender, alice: channelState.alice, bob: channelState.bob },
        "Detected participant A, sending tx",
      );
      const txRes = await this.sendDepositATx(channelState, amount, assetId);
      if (txRes.isError) {
        this.log.error({ method: "sendDepositTx", error: txRes.getError()?.message }, "Error sending tx");
      } else {
        this.log.info({ method: "sendDepositTx", txHash: txRes.getValue().hash }, "Submitted tx");
      }
      return txRes;
    } else {
      this.log.info(
        { method: "sendDepositTx", sender, alice: channelState.alice, bob: channelState.bob },
        "Detected participant B, sendng tx",
      );
      const txRes = await this.sendDepositBTx(channelState, amount, assetId);
      if (txRes.isError) {
        this.log.error({ method: "sendDepositTx", error: txRes.getError()?.message }, "Error sending tx");
      } else {
        this.log.info({ method: "sendDepositTx", txHash: txRes.getValue().hash }, "Submitted tx");
      }
      return txRes;
    }
  }

  private async sendTxWithRetries(
    channelAddress: string,
    reason: TransactionReason,
    txFn: () => Promise<providers.TransactionResponse>,
  ): Promise<Result<providers.TransactionResponse, ChainError>> {
    const errors = [];
    for (let attempt = 1; attempt++; attempt < this.defaultRetries) {
      this.log.info(
        {
          retries: this.defaultRetries,
          attempt,
          channelAddress,
          reason,
        },
        "Attempting to send tx",
      );
      const response = await this.sendTxAndParseResponse(channelAddress, reason, txFn);
      if (!response.isError) {
        return response;
      }
      // Otherwise, handle error
      const error = response.getError()!;
      if (!error.canRetry) {
        this.log.error({ error: error.message, channelAddress, reason }, "Failed to send tx, will not retry");
        return response;
      }
      // wait before retrying
      errors.push(error);
      this.log.warn(
        { error: error.message, channelAddress, attempt, retries: this.defaultRetries },
        "Tx failed, waiting before retry",
      );
      await delay(1000);
    }
    return Result.fail(
      new ChainError(ChainError.reasons.FailedToSendTx, {
        errors: errors.map(e => e.message).toString(),
        retries: this.defaultRetries,
        channelAddress,
        reason,
      }),
    );
  }

  private async sendTxAndParseResponse(
    channelAddress: string,
    reason: TransactionReason,
    txFn: () => Promise<providers.TransactionResponse>,
  ): Promise<Result<providers.TransactionResponse, ChainError>> {
    // TODO: add retries on specific errors
    try {
      const response = await this.queue.add(async () => {
        const response = await txFn();
        await this.store.saveTransactionResponse(channelAddress, reason, response);
        // Register callbacks for saving tx, then return
        response
          .wait() // TODO: confirmation blocks?
          .then(receipt => this.store.saveTransactionReceipt(channelAddress, receipt))
          .catch(e => this.store.saveTransactionFailure(channelAddress, response.hash, e.message));
        return response;
      });
      return Result.ok(response);
    } catch (e) {
      // Don't save tx if it failed to submit, only if it fails to mine
      let error = e;
      if (e.message.includes("sender doesn't have enough funds")) {
        error = new ChainError(ChainError.reasons.NotEnoughFunds);
      }
      return Result.fail(error);
    }
  }

  private async approveTokens(
    channelAddress: string,
    spender: string,
    owner: string,
    amount: string,
    assetId: string,
    chainId: number,
  ): Promise<Result<providers.TransactionResponse | undefined, ChainError>> {
    const signer = this.signers.get(chainId);
    if (!signer?._isSigner) {
      return Result.fail(new ChainError(ChainError.reasons.SignerNotFound));
    }

    this.log.info({ assetId, channelAddress: spender }, "Approving token");
    const erc20 = new Contract(assetId, ERC20Abi, signer);
    const checkApprovalRes = await this.sendTxWithRetries(channelAddress, TransactionReason.approveTokens, () =>
      erc20.allowance(owner, spender),
    );
    if (checkApprovalRes.isError) {
      this.log.error(
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
      this.log.info(
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
    const approveRes = await this.sendTxWithRetries(channelAddress, TransactionReason.approveTokens, () =>
      erc20.approve(spender, amount),
    );
    if (approveRes.isError) {
      this.log.error(
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
    this.log.info({ txHash: approveTx.hash, method: "approveTokens", assetId, amount }, "Approve token tx submitted");
    return approveRes;
  }

  private async sendDepositATx(
    channelState: FullChannelState<any>,
    amount: string,
    assetId: string,
  ): Promise<Result<providers.TransactionResponse, ChainError>> {
    const signer = this.signers.get(channelState.networkContext.chainId);
    if (!signer?._isSigner) {
      return Result.fail(new ChainError(ChainError.reasons.SignerNotFound));
    }

    const vectorChannel = new Contract(channelState.channelAddress, VectorChannel.abi, signer);
    if (assetId !== constants.AddressZero) {
      // need to approve
      this.log.info({ assetId, channelAddress: channelState.channelAddress }, "Approving token");
      const approveRes = await this.approveTokens(
        channelState.channelAddress,
        channelState.channelAddress,
        channelState.alice,
        amount,
        assetId,
        channelState.networkContext.chainId,
      );
      if (approveRes.isError) {
        this.log.error(
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
      this.log.info({ txHash: approveTx?.hash, method: "sendDepositATx", assetId }, "Token approval confirmed");
      return this.sendTxWithRetries(channelState.channelAddress, TransactionReason.depositA, () =>
        vectorChannel.depositAlice(assetId, amount),
      );
    }
    return this.sendTxWithRetries(channelState.channelAddress, TransactionReason.depositA, () =>
      vectorChannel.depositAlice(assetId, amount, { value: amount }),
    );
  }

  private async sendDepositBTx(
    channelState: FullChannelState<any>,
    amount: string,
    assetId: string,
  ): Promise<Result<providers.TransactionResponse, ChainError>> {
    const signer = this.signers.get(channelState.networkContext.chainId);
    if (!signer?._isSigner) {
      return Result.fail(new ChainError(ChainError.reasons.SignerNotFound));
    }

    if (assetId === constants.AddressZero) {
      return this.sendTxWithRetries(channelState.channelAddress, TransactionReason.depositB, () =>
        signer.sendTransaction({
          data: "0x",
          to: channelState.channelAddress,
          value: BigNumber.from(amount),
          chainId: channelState.networkContext.chainId,
        }),
      );
    } else {
      const erc20 = new Contract(channelState.networkContext.channelFactoryAddress, ERC20Abi, signer);
      return this.sendTxWithRetries(channelState.channelAddress, TransactionReason.depositB, () =>
        erc20.transfer(channelState.channelAddress, amount),
      );
    }
  }
}
