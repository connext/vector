import {
  FullChannelState,
  IVectorChainService,
  MinimalTransaction,
  ChainError,
  Result,
  ERC20Abi,
  IChainServiceStore,
  TransactionReason,
} from "@connext/vector-types";
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
  ) {
    super(chainProviders, log.child({ module: "EthereumChainReader" }));
    Object.entries(chainProviders).forEach(([chainId, provider]) => {
      this.signers.set(
        parseInt(chainId),
        typeof signer === "string" ? new Wallet(signer, provider) : (signer.connect(provider) as Signer),
      );
    });
  }

  public async sendWithdrawTx(
    channelState: FullChannelState<any>,
    minTx: MinimalTransaction,
  ): Promise<Result<providers.TransactionResponse, ChainError>> {
    const signer = this.signers.get(channelState.networkContext.chainId);
    if (!signer?._isSigner) {
      return Result.fail(new ChainError(ChainError.reasons.SignerNotFound));
    }
    const sender = await signer.getAddress();

    if (channelState.alice !== sender && channelState.bob !== sender) {
      return Result.fail(new ChainError(ChainError.reasons.SenderNotInChannel));
    }

    return this.sendTxAndParseResponse(channelState.channelAddress, TransactionReason.withdraw, () =>
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

      // TODO: fix this
      const tx = await this.sendTxAndParseResponse(
        channelState.channelAddress,
        TransactionReason.deployWithDepositA,
        () =>
          channelFactory.createChannelAndDepositA(
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
          },
          "Error creating channel",
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

  private async sendTxAndParseResponse(
    channelAddress: string,
    reason: TransactionReason,
    txFn: () => Promise<providers.TransactionResponse>,
  ): Promise<Result<providers.TransactionResponse, ChainError>> {
    // Perform transaction sending within queue
    // Try to send transaction

    // Save response

    // Add listener to save receipt / failure

    try {
      const tx = await txFn();
      return Result.ok(tx);
    } catch (e) {
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
    const checkApprovalRes = await this.sendTxAndParseResponse(channelAddress, TransactionReason.approveTokens, () =>
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
    const approveRes = await this.sendTxAndParseResponse(channelAddress, TransactionReason.approveTokens, () =>
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
      return this.sendTxAndParseResponse(channelState.channelAddress, TransactionReason.depositA, () =>
        vectorChannel.depositA(assetId, amount),
      );
    }
    return this.sendTxAndParseResponse(channelState.channelAddress, TransactionReason.depositA, () =>
      vectorChannel.depositA(assetId, amount, { value: amount }),
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
      return this.sendTxAndParseResponse(channelState.channelAddress, TransactionReason.depositB, () =>
        signer.sendTransaction({
          data: "0x",
          to: channelState.channelAddress,
          value: BigNumber.from(amount),
          chainId: channelState.networkContext.chainId,
        }),
      );
    } else {
      const erc20 = new Contract(channelState.networkContext.channelFactoryAddress, ERC20Abi, signer);
      return this.sendTxAndParseResponse(channelState.channelAddress, TransactionReason.depositB, () =>
        erc20.transfer(channelState.channelAddress, amount),
      );
    }
  }
}
