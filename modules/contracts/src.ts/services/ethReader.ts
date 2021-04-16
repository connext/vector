import * as evm from "@connext/pure-evm-wasm";
import {
  Address,
  tidy,
  Balance,
  ERC20Abi,
  FullTransferState,
  IVectorChainReader,
  Result,
  ChainError,
  ChainProviders,
  RegisteredTransfer,
  TransferName,
  ChannelDispute,
  TransferState,
  HydratedProviders,
  WithdrawCommitmentJson,
  ETH_READER_MAX_RETRIES,
  ChainReaderEventMap,
  ChainReaderEvent,
  ChainReaderEvents,
  ChannelDisputedPayload,
  ChannelDefundedPayload,
  TransferDisputedPayload,
  TransferDefundedPayload,
  CoreChannelState,
  CoreTransferState,
  TransferDispute,
  jsonifyError,
} from "@connext/vector-types";
import axios from "axios";
import { encodeBalance, encodeTransferResolver, encodeTransferState } from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { JsonRpcProvider, TransactionRequest } from "@ethersproject/providers";
import pino from "pino";

import { ChannelFactory, ChannelMastercopy, TransferDefinition, TransferRegistry, VectorChannel } from "../artifacts";
import { Evt } from "evt";

// https://github.com/rustwasm/wasm-bindgen/issues/700#issuecomment-419708471
const execEvmBytecode = (bytecode: string, payload: string): Uint8Array =>
  evm.exec(
    Uint8Array.from(Buffer.from(bytecode.replace(/^0x/, ""), "hex")),
    Uint8Array.from(Buffer.from(payload.replace(/^0x/, ""), "hex")),
  );

export class EthereumChainReader implements IVectorChainReader {
  private transferRegistries: Map<string, RegisteredTransfer[]> = new Map();
  protected disputeEvts: { [eventName in ChainReaderEvent]: Evt<ChainReaderEventMap[eventName]> } = {
    [ChainReaderEvents.CHANNEL_DISPUTED]: new Evt(),
    [ChainReaderEvents.CHANNEL_DEFUNDED]: new Evt(),
    [ChainReaderEvents.TRANSFER_DISPUTED]: new Evt(),
    [ChainReaderEvents.TRANSFER_DEFUNDED]: new Evt(),
  };
  private contracts: Map<string, Contract> = new Map();
  constructor(
    public readonly chainProviders: { [chainId: string]: JsonRpcProvider },
    public readonly log: pino.BaseLogger,
  ) {}

  getChainProviders(): Result<ChainProviders, ChainError> {
    const ret: ChainProviders = {};
    Object.entries(this.chainProviders).forEach(([name, value]) => {
      ret[parseInt(name)] = value.connection.url;
    });
    return Result.ok(ret);
  }

  getHydratedProviders(): Result<HydratedProviders, ChainError> {
    return Result.ok(this.chainProviders);
  }

  async getSyncing(
    chainId: number,
  ): Promise<
    Result<
      | boolean
      | {
          startingBlock: string;
          currentBlock: string;
          highestBlock: string;
        },
      ChainError
    >
  > {
    return await this.retryWrapper<
      | boolean
      | {
          startingBlock: string;
          currentBlock: string;
          highestBlock: string;
        }
    >(chainId, async (provider: JsonRpcProvider) => {
      try {
        const res = await provider.send("eth_syncing", []);
        return Result.ok(res);
      } catch (e) {
        return Result.fail(e);
      }
    });
  }

  async getChannelDispute(
    channelAddress: string,
    chainId: number,
  ): Promise<Result<ChannelDispute | undefined, ChainError>> {
    const code = await this.getCode(channelAddress, chainId);
    if (code.isError) {
      return Result.fail(code.getError()!);
    }

    if (code.getValue() === "0x" || code.getValue() === undefined) {
      // channel is not deployed
      return Result.ok(undefined);
    }
    return await this.retryWrapper<ChannelDispute | undefined>(chainId, async (provider: JsonRpcProvider) => {
      try {
        const dispute = await new Contract(channelAddress, VectorChannel.abi, provider).getChannelDispute();
        if (dispute.channelStateHash === HashZero) {
          return Result.ok(undefined);
        }
        return Result.ok({
          channelStateHash: dispute.channelStateHash,
          nonce: dispute.nonce.toString(),
          merkleRoot: dispute.merkleRoot,
          consensusExpiry: dispute.consensusExpiry.toString(),
          defundExpiry: dispute.defundExpiry.toString(),
        });
      } catch (e) {
        return Result.fail(e);
      }
    });
  }

  async getRegisteredTransferByDefinition(
    definition: Address,
    transferRegistry: string,
    chainId: number,
    bytecode?: string,
  ): Promise<Result<RegisteredTransfer, ChainError>> {
    return await this.retryWrapper<RegisteredTransfer>(chainId, async (provider: JsonRpcProvider) => {
      let registry = this.transferRegistries.get(chainId.toString())!;
      if (!this.transferRegistries.has(chainId.toString())) {
        // Registry for chain not loaded, load into memory
        const loadRes = await this.loadRegistry(transferRegistry, chainId, bytecode);
        if (loadRes.isError) {
          return Result.fail(loadRes.getError()!);
        }
        registry = loadRes.getValue();
      }

      const info = registry.find((r) => r.definition === definition);
      if (!info) {
        return Result.fail(
          new ChainError(ChainError.reasons.TransferNotRegistered, {
            definition,
            transferRegistry,
            chainId,
          }),
        );
      }
      return Result.ok(info);
    });
  }

  async getRegisteredTransferByName(
    name: TransferName,
    transferRegistry: string,
    chainId: number,
    bytecode?: string,
  ): Promise<Result<RegisteredTransfer, ChainError>> {
    return await this.retryWrapper<RegisteredTransfer>(chainId, async (provider: JsonRpcProvider) => {
      let registry = this.transferRegistries.get(chainId.toString());
      if (!registry) {
        // Registry for chain not loaded, load into memory
        const loadRes = await this.loadRegistry(transferRegistry, chainId, bytecode);
        if (loadRes.isError) {
          return Result.fail(loadRes.getError()!);
        }
        registry = loadRes.getValue();
      }

      const info = registry!.find((r) => r.name === name);
      if (!info) {
        return Result.fail(
          new ChainError(ChainError.reasons.TransferNotRegistered, {
            name,
            transferRegistry,
            chainId,
          }),
        );
      }
      return Result.ok(info);
    });
  }

  async getRegisteredTransfers(
    transferRegistry: string,
    chainId: number,
    bytecode?: string,
  ): Promise<Result<RegisteredTransfer[], ChainError>> {
    return await this.retryWrapper<RegisteredTransfer[]>(chainId, async () => {
      let registry = this.transferRegistries.get(chainId.toString());
      if (!registry) {
        // Registry for chain not loaded, load into memory
        const loadRes = await this.loadRegistry(transferRegistry, chainId, bytecode);
        if (loadRes.isError) {
          return Result.fail(loadRes.getError()!);
        }
        registry = loadRes.getValue();
      }
      return Result.ok(registry);
    });
  }

  async getChannelFactoryBytecode(channelFactoryAddress: string, chainId: number): Promise<Result<string, ChainError>> {
    return await this.retryWrapper<string>(chainId, async (provider: JsonRpcProvider) => {
      try {
        const factory = new Contract(channelFactoryAddress, ChannelFactory.abi, provider);
        const proxyBytecode = await factory.getProxyCreationCode();
        return Result.ok(proxyBytecode);
      } catch (e) {
        return Result.fail(e);
      }
    });
  }

  async getChannelMastercopyAddress(
    channelFactoryAddress: string,
    chainId: number,
  ): Promise<Result<string, ChainError>> {
    return await this.retryWrapper<string>(chainId, async (provider: JsonRpcProvider) => {
      try {
        const factory = new Contract(channelFactoryAddress, ChannelFactory.abi, provider);
        const mastercopy = await factory.getMastercopy();
        return Result.ok(mastercopy);
      } catch (e) {
        return Result.fail(e);
      }
    });
  }

  async getTotalDepositedA(
    channelAddress: string,
    chainId: number,
    assetId: string,
  ): Promise<Result<BigNumber, ChainError>> {
    return await this.retryWrapper<BigNumber>(chainId, async (provider: JsonRpcProvider) => {
      const code = await this.getCode(channelAddress, chainId);
      if (code.isError) {
        return Result.fail(code.getError()!);
      }
      if (code.getValue() === "0x") {
        // contract *must* be deployed for alice to have a balance
        return Result.ok(BigNumber.from(0));
      }

      const channelContract = new Contract(channelAddress, ChannelMastercopy.abi, provider);
      try {
        const totalDepositsAlice = await channelContract.getTotalDepositsAlice(assetId);
        return Result.ok(totalDepositsAlice);
      } catch (e) {
        return Result.fail(e);
      }
    });
  }

  async getTotalDepositedB(
    channelAddress: string,
    chainId: number,
    assetId: string,
  ): Promise<Result<BigNumber, ChainError>> {
    return await this.retryWrapper<BigNumber>(chainId, async (provider: JsonRpcProvider) => {
      const code = await this.getCode(channelAddress, chainId);
      if (code.isError) {
        return Result.fail(code.getError()!);
      }
      if (code.getValue() === "0x") {
        // all balance at channel address *must* be for bob
        return this.getOnchainBalance(assetId, channelAddress, chainId);
      }

      const channelContract = new Contract(channelAddress, ChannelMastercopy.abi, provider);
      try {
        const totalDepositsBob = await channelContract.getTotalDepositsBob(assetId);
        return Result.ok(totalDepositsBob);
      } catch (e) {
        return Result.fail(e);
      }
    });
  }

  async create(
    initialState: TransferState,
    balance: Balance,
    transferDefinition: string,
    transferRegistryAddress: string,
    chainId: number,
    bytecode?: string,
  ): Promise<Result<boolean, ChainError>> {
    return await this.retryWrapper<boolean>(chainId, async (provider: JsonRpcProvider) => {
      // Get encoding
      const registryRes = await this.getRegisteredTransferByDefinition(
        transferDefinition,
        transferRegistryAddress,
        chainId,
        bytecode,
      );
      if (registryRes.isError) {
        return Result.fail(registryRes.getError()!);
      }
      // Try to encode
      let encodedState: string;
      let encodedBalance: string;
      try {
        encodedState = encodeTransferState(initialState, registryRes.getValue().stateEncoding);
        encodedBalance = encodeBalance(balance);
      } catch (e) {
        return Result.fail(e);
      }
      const contract = new Contract(transferDefinition, TransferDefinition.abi, provider);
      if (bytecode) {
        const evmRes = this.tryEvm(
          contract.interface.encodeFunctionData("create", [encodedBalance, encodedState]),
          bytecode,
        );
        if (!evmRes.isError) {
          const decoded = contract.interface.decodeFunctionResult("create", evmRes.getValue()!)[0];
          return Result.ok(decoded);
        }
      }
      this.log.debug(
        {
          transferDefinition,
        },
        "Calling create onchain",
      );
      try {
        const valid = await contract.create(encodedBalance, encodedState);
        return Result.ok(valid);
      } catch (e) {
        return Result.fail(e);
      }
    });
  }

  async resolve(transfer: FullTransferState, chainId: number, bytecode?: string): Promise<Result<Balance, ChainError>> {
    return await this.retryWrapper<Balance>(chainId, async (provider: JsonRpcProvider) => {
      // Try to encode
      let encodedState: string;
      let encodedResolver: string;
      let encodedBalance: string;
      try {
        encodedState = encodeTransferState(transfer.transferState, transfer.transferEncodings[0]);
        encodedResolver = encodeTransferResolver(transfer.transferResolver!, transfer.transferEncodings[1]);
        encodedBalance = encodeBalance(transfer.balance);
      } catch (e) {
        return Result.fail(e);
      }

      // Use pure-evm if possible
      const contract = new Contract(transfer.transferDefinition, TransferDefinition.abi, provider);
      if (bytecode) {
        const evmRes = this.tryEvm(
          contract.interface.encodeFunctionData("resolve", [encodedBalance, encodedState, encodedResolver]),
          bytecode,
        );
        if (!evmRes.isError) {
          const decoded = contract.interface.decodeFunctionResult("resolve", evmRes.getValue()!)[0];
          return Result.ok(decoded);
        }
      }
      this.log.debug(
        {
          transferDefinition: transfer.transferDefinition,
          transferId: transfer.transferId,
        },
        "Calling resolve onchain",
      );
      try {
        const ret = await contract.resolve(encodedBalance, encodedState, encodedResolver);
        return Result.ok({
          to: ret.to,
          amount: ret.amount.map((a: BigNumber) => a.toString()),
        });
      } catch (e) {
        return Result.fail(e);
      }
    });
  }

  async getChannelAddress(
    alice: string,
    bob: string,
    channelFactoryAddress: string,
    chainId: number,
  ): Promise<Result<string, ChainError>> {
    return await this.retryWrapper<string>(chainId, async (provider: JsonRpcProvider) => {
      const channelFactory = new Contract(channelFactoryAddress, ChannelFactory.abi, provider);
      try {
        const derivedAddress = await channelFactory.getChannelAddress(alice, bob);
        return Result.ok(derivedAddress);
      } catch (e) {
        return Result.fail(e);
      }
    });
  }

  async getCode(address: string, chainId: number): Promise<Result<string, ChainError>> {
    return await this.retryWrapper<string>(chainId, async (provider: JsonRpcProvider) => {
      try {
        const code = await provider.getCode(address);
        return Result.ok(code);
      } catch (e) {
        return Result.fail(e);
      }
    });
  }

  async getBlockNumber(chainId: number): Promise<Result<number, ChainError>> {
    return await this.retryWrapper<number>(chainId, async (provider: JsonRpcProvider) => {
      try {
        const blockNumber = await provider.getBlockNumber();
        return Result.ok(blockNumber);
      } catch (e) {
        return Result.fail(e);
      }
    });
  }

  async getGasPrice(chainId: number): Promise<Result<BigNumber, ChainError>> {
    return await this.retryWrapper<BigNumber>(chainId, async (provider: JsonRpcProvider) => {
      let gasPrice: BigNumber | undefined = undefined;
      if (chainId === 1) {
        try {
          const gasNowResponse = await axios.get(`https://www.gasnow.org/api/v3/gas/price`);
          const { rapid } = gasNowResponse.data;
          gasPrice = typeof rapid !== "undefined" ? BigNumber.from(rapid) : undefined;
        } catch (e) {
          this.log.warn({ error: e }, "Gasnow failed, using provider");
        }
      }
      if (!gasPrice) {
        try {
          gasPrice = await provider.getGasPrice();
        } catch (e) {
          return Result.fail(e);
        }
      }
      return Result.ok(gasPrice);
    });
  }

  async estimateGas(chainId: number, transaction: TransactionRequest): Promise<Result<BigNumber, ChainError>> {
    return await this.retryWrapper<BigNumber>(chainId, async (provider: JsonRpcProvider) => {
      try {
        const gas = await provider.estimateGas(transaction);
        return Result.ok(gas);
      } catch (e) {
        return Result.fail(e);
      }
    });
  }

  async getTokenAllowance(
    tokenAddress: string,
    owner: string,
    spender: string,
    chainId: number,
  ): Promise<Result<BigNumber, ChainError>> {
    return await this.retryWrapper<BigNumber>(chainId, async (provider: JsonRpcProvider) => {
      const erc20 = new Contract(tokenAddress, ERC20Abi, provider);
      try {
        const res = await erc20.allowance(owner, spender);
        return Result.ok(res);
      } catch (e) {
        return Result.fail(e);
      }
    });
  }

  async getOnchainBalance(assetId: string, balanceOf: string, chainId: number): Promise<Result<BigNumber, ChainError>> {
    return await this.retryWrapper<BigNumber>(chainId, async (provider: JsonRpcProvider) => {
      try {
        const onchainBalance =
          assetId === AddressZero
            ? await provider.getBalance(balanceOf)
            : await new Contract(assetId, ERC20Abi, provider).balanceOf(balanceOf);
        return Result.ok(onchainBalance);
      } catch (e) {
        return Result.fail(e);
      }
    });
  }

  async getDecimals(assetId: string, chainId: number): Promise<Result<number, ChainError>> {
    return await this.retryWrapper<number>(chainId, async (provider: JsonRpcProvider) => {
      try {
        const decimals = assetId === AddressZero ? 18 : await new Contract(assetId, ERC20Abi, provider).decimals();
        return Result.ok(decimals);
      } catch (e) {
        return Result.fail(e);
      }
    });
  }

  async getWithdrawalTransactionRecord(
    withdrawData: WithdrawCommitmentJson,
    channelAddress: string,
    chainId: number,
  ): Promise<Result<boolean, ChainError>> {
    return await this.retryWrapper<boolean>(chainId, async (provider: JsonRpcProvider) => {
      // check if it was deployed
      const code = await this.getCode(channelAddress, chainId);
      if (code.isError) {
        return Result.fail(code.getError()!);
      }
      if (code.getValue() === "0x") {
        // channel must always be deployed for a withdrawal
        // to be submitted
        return Result.ok(false);
      }
      const channel = new Contract(channelAddress, VectorChannel.abi, provider);
      try {
        const record = await channel.getWithdrawalTransactionRecord({
          channelAddress,
          assetId: withdrawData.assetId,
          recipient: withdrawData.recipient,
          amount: withdrawData.amount,
          nonce: withdrawData.nonce,
          callTo: withdrawData.callTo,
          callData: withdrawData.callData,
        });
        return Result.ok(record);
      } catch (e) {
        return Result.fail(e);
      }
    });
  }

  // // When you are checking for disputes that have happened while you were
  // // offline, you query the `getChannelDispute` function onchain. This will
  // // give you the `ChannelDispute` record, but *not* the `CoreChannelState`
  // // that was disputed. To find the `CoreChannelState` that was disputed,
  // // you need to look at the emitted event corresponding to the
  // // `ChannelDispute`.
  // async getCoreChannelState(): Promise<Result<CoreChannelState, ChainError>> {
  //   // Get the expiry from dispute
  //   // Find the approximate timestamp for when the dispute event was emitted
  //   // Binary search from blocks to find which one corresponds to the timestamp
  //   // for the emitted dispute
  //   // Get events for that block
  //   // Parse events + return the core channel state
  // }

  async registerChannel(channelAddress: string, chainId: number): Promise<Result<void, ChainError>> {
    return this.retryWrapper<void>(chainId, async (provider: JsonRpcProvider) => {
      if (this.contracts.has(channelAddress)) {
        // channel is already registered
        return Result.ok(undefined);
      }
      // Create channel contract
      const contract = new Contract(channelAddress, ChannelMastercopy.abi, provider);

      // Create helpers to clean contract-emitted types. Ethers emits
      // very oddly structured types, and any uint256 is a BigNumber.
      // Clean that bad boi up
      const processCCS = (state: any): CoreChannelState => {
        return {
          channelAddress: state.channelAddress,
          alice: state.alice,
          bob: state.bob,
          assetIds: state.assetIds,
          balances: state.balances.map((balance: any) => {
            return {
              amount: balance.amount.map((a: BigNumber) => a.toString()),
              to: balance.to,
            };
          }),
          processedDepositsA: state.processedDepositsA.map((deposit: BigNumber) => deposit.toString()),
          processedDepositsB: state.processedDepositsB.map((deposit: BigNumber) => deposit.toString()),
          defundNonces: state.defundNonces.map((nonce: BigNumber) => nonce.toString()),
          timeout: state.timeout.toString(),
          nonce: state.nonce.toNumber(),
          merkleRoot: state.merkleRoot,
        };
      };

      const processChannelDispute = (dispute: any): ChannelDispute => {
        return {
          channelStateHash: dispute.channelStateHash,
          nonce: dispute.nonce.toString(),
          merkleRoot: dispute.merkleRoot,
          consensusExpiry: dispute.consensusExpiry.toString(),
          defundExpiry: dispute.defundExpiry.toString(),
        };
      };

      const processCTS = (state: any): CoreTransferState => {
        return {
          channelAddress: state.channelAddress,
          transferId: state.transferId,
          transferDefinition: state.transferDefinition,
          initiator: state.initiator,
          responder: state.responder,
          assetId: state.assetId,
          balance: {
            amount: state.balance.amount.map((a: BigNumber) => a.toString()),
            to: state.balance.to,
          },
          transferTimeout: state.transferTimeout.toString(),
          initialStateHash: state.initialStateHash,
        };
      };

      const processTransferDispute = (state: any, dispute: any): TransferDispute => {
        return {
          transferId: state.transferId,
          transferDisputeExpiry: dispute.transferDisputeExpiry.toString(),
          isDefunded: dispute.isDefunded,
          transferStateHash: dispute.transferStateHash,
        };
      };

      // Register all dispute event listeners
      contract.on("ChannelDisputed", async (disputer, state, dispute) => {
        const payload: ChannelDisputedPayload = {
          disputer,
          state: processCCS(state),
          dispute: processChannelDispute(dispute),
        };
        this.disputeEvts[ChainReaderEvents.CHANNEL_DISPUTED].post(payload);
      });

      contract.on("ChannelDefunded", async (defunder, state, dispute, assets) => {
        const payload: ChannelDefundedPayload = {
          defunder,
          state: processCCS(state),
          dispute: processChannelDispute(dispute),
          defundedAssets: assets,
        };
        this.disputeEvts[ChainReaderEvents.CHANNEL_DEFUNDED].post(payload);
      });

      contract.on("TransferDisputed", async (disputer, state, dispute) => {
        const payload: TransferDisputedPayload = {
          disputer,
          state: processCTS(state),
          dispute: processTransferDispute(state, dispute),
        };
        this.disputeEvts[ChainReaderEvents.TRANSFER_DISPUTED].post(payload);
      });

      contract.on(
        "TransferDefunded",
        async (defunder, state, dispute, encodedInitialState, encodedTransferResolver, balance) => {
          const payload: TransferDefundedPayload = {
            defunder,
            state: processCTS(state),
            dispute: processTransferDispute(state, dispute),
            encodedInitialState,
            encodedTransferResolver,
            balance: {
              amount: balance.amount.map((a: BigNumber) => a.toString()),
              to: balance.to,
            },
          };
          this.disputeEvts[ChainReaderEvents.TRANSFER_DEFUNDED].post(payload);
        },
      );

      this.contracts.set(channelAddress, contract);
      return Result.ok(undefined);
    });
  }

  ////////////////////////////
  /// CHAIN READER EVENTS
  public on<T extends ChainReaderEvent>(
    event: T,
    callback: (payload: ChainReaderEventMap[T]) => void | Promise<void>,
    filter: (payload: ChainReaderEventMap[T]) => boolean = () => true,
  ): void {
    (this.disputeEvts[event].pipe(filter) as Evt<ChainReaderEventMap[T]>).attach(callback);
  }

  public once<T extends ChainReaderEvent>(
    event: T,
    callback: (payload: ChainReaderEventMap[T]) => void | Promise<void>,
    filter: (payload: ChainReaderEventMap[T]) => boolean = () => true,
  ): void {
    (this.disputeEvts[event].pipe(filter) as Evt<ChainReaderEventMap[T]>).attachOnce(callback);
  }

  public off<T extends ChainReaderEvent>(event?: T): void {
    if (event) {
      this.disputeEvts[event].detach();
      return;
    }
    Object.values(this.disputeEvts).forEach((evt) => evt.detach());
  }

  public waitFor<T extends ChainReaderEvent>(
    event: T,
    timeout: number,
    filter: (payload: ChainReaderEventMap[T]) => boolean = () => true,
  ): Promise<ChainReaderEventMap[T]> {
    return this.disputeEvts[event].pipe(filter).waitFor(timeout) as Promise<ChainReaderEventMap[T]>;
  }

  private tryEvm(encodedFunctionData: string, bytecode: string): Result<Uint8Array, Error> {
    try {
      const output = execEvmBytecode(bytecode, encodedFunctionData);
      return Result.ok(output);
    } catch (e) {
      this.log.debug({ error: e.message }, `Pure-evm failed`);
      return Result.fail(e);
    }
  }

  private async loadRegistry(
    transferRegistry: string,
    chainId: number,
    bytecode?: string,
  ): Promise<Result<RegisteredTransfer[], ChainError>> {
    return await this.retryWrapper<RegisteredTransfer[]>(chainId, async (provider: JsonRpcProvider) => {
      // Registry for chain not loaded, load into memory
      const registry = new Contract(transferRegistry, TransferRegistry.abi, provider);
      let registered;
      if (bytecode) {
        // Try with evm first
        const evm = this.tryEvm(registry.interface.encodeFunctionData("getTransferDefinitions"), bytecode);

        if (!evm.isError) {
          try {
            registered = registry.interface.decodeFunctionResult("getTransferDefinitions", evm.getValue()!)[0];
          } catch (e) {}
        }
      }
      if (!registered) {
        try {
          registered = await registry.getTransferDefinitions();
        } catch (e) {
          return Result.fail(new ChainError(e.message, { chainId, transferRegistry }));
        }
      }
      const cleaned = registered.map((r: RegisteredTransfer) => {
        return {
          name: r.name,
          definition: r.definition,
          stateEncoding: tidy(r.stateEncoding),
          resolverEncoding: tidy(r.resolverEncoding),
          encodedCancel: r.encodedCancel,
        };
      });
      this.transferRegistries.set(chainId.toString(), cleaned);
      return Result.ok(cleaned);
    });
  }

  private async retryWrapper<T>(
    chainId: number,
    targetMethod: (provider: JsonRpcProvider) => Promise<Result<T, ChainError>>,
  ): Promise<Result<T, ChainError>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }
    let res = await targetMethod(provider);
    let retries;
    const errors: { [attempt: number]: string | undefined } = {};
    if (!res.isError) {
      return res;
    }

    errors[0] = res.getError()?.message;
    for (retries = 1; retries < ETH_READER_MAX_RETRIES; retries++) {
      res = await targetMethod(provider);
      if (!res.isError) {
        break;
      }
      errors[retries] = res.getError()?.message;
    }
    return res.isError
      ? Result.fail(
          new ChainError(`Could not execute rpc method`, {
            chainId,
            errors,
          }),
        )
      : res;
  }
}
