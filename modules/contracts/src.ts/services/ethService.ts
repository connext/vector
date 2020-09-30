import {
  FullChannelState,
  IVectorChainService,
  MinimalTransaction,
  ChainError,
  Result,
  ERC20Abi,
} from "@connext/vector-types";
import { BigNumber, constants, Contract, providers, Wallet } from "ethers";
import { BaseLogger } from "pino";

import { ChannelFactory, VectorChannel } from "../artifacts";

import { EthereumChainReader } from "./ethReader";

export class EthereumChainService extends EthereumChainReader implements IVectorChainService {
  private signers: Map<number, Wallet> = new Map();
  constructor(
    chainProviders: { [chainId: string]: providers.JsonRpcProvider },
    private readonly privateKey: string,
    log: BaseLogger,
  ) {
    super(chainProviders, log.child({ module: "EthereumChainReader" }));
    Object.entries(chainProviders).forEach(([chainId, provider]) => {
      this.signers.set(parseInt(chainId), new Wallet(privateKey, provider));
    });
  }

  public async sendWithdrawTx(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    channelState: FullChannelState<any>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    minTx: MinimalTransaction,
  ): Promise<Result<providers.TransactionResponse, ChainError>> {
    throw new Error("Method not implemented.");
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
    if (multisigCode === `0x`) {
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
          this.log.info(
            { txHash: receipt.transactionHash, method: "sendDepositATx", assetId },
            "Token approval confirmed",
          );
        }
      }

      const tx = await this.sendTxAndParseResponse(
        channelFactory.createChannel(channelState.alice, channelState.bob, channelState.networkContext.chainId),
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
        this.log.error(
          {
            method: "sendDepositTx",
            error: tx.getError()?.message,
          },
          "Error creating channel",
        );
      }
      // return tx;

      const createReceipt = await tx.getValue().wait();
      this.log.info(
        { txHash: createReceipt.transactionHash, method: "sendDepositATx", assetId },
        "Channel creation confirmed",
      );
    }

    this.log.info({ method: "sendDepositTx", assetId, amount }, "Channel is deployed, sending deposit");
    if (sender === channelState.alice) {
      this.log.info(
        { method: "sendDepositTx", sender, alice: channelState.alice, bob: channelState.bob },
        "Detected participant A",
      );
      return this.sendDepositATx(channelState, amount, assetId);
    } else {
      this.log.info(
        { method: "sendDepositTx", sender, alice: channelState.alice, bob: channelState.bob },
        "Detected participant B",
      );
      return this.sendDepositBTx(channelState, amount, assetId);
    }
  }

  private async sendTxAndParseResponse(
    txFn: Promise<providers.TransactionResponse>,
  ): Promise<Result<providers.TransactionResponse, ChainError>> {
    try {
      const tx = await txFn;
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
    const checkApprovalRes = await this.sendTxAndParseResponse(erc20.allowance(owner, spender));
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
    const approveRes = await this.sendTxAndParseResponse(erc20.approve(spender, amount));
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
    this.log.info(
      { txHash: approveTx.hash, method: "approveTokens", assetId, amount },
      "Approve token tx submitted",
    );
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
      return this.sendTxAndParseResponse(vectorChannel.depositA(assetId, amount));
    }
    return this.sendTxAndParseResponse(vectorChannel.depositA(assetId, amount, { value: amount }));
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
  ): Promise<Result<providers.TransactionResponse, ChainError>> {
    const signer = this.signers.get(chainId);
    if (!signer?._isSigner) {
      return Result.fail(new ChainError(ChainError.reasons.SignerNotFound));
    }

    return this.sendTxAndParseResponse(signer.sendTransaction(minTx));
  }
}
