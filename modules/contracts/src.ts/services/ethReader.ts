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
} from "@connext/vector-types";
import { encodeBalance, encodeTransferResolver, encodeTransferState } from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { JsonRpcProvider } from "@ethersproject/providers";
import pino from "pino";

import { ChannelFactory, ChannelMastercopy, TransferDefinition, TransferRegistry, VectorChannel } from "../artifacts";

// https://github.com/rustwasm/wasm-bindgen/issues/700#issuecomment-419708471
const execEvmBytecode = (bytecode: string, payload: string): Uint8Array =>
  evm.exec(
    Uint8Array.from(Buffer.from(bytecode.replace(/^0x/, ""), "hex")),
    Uint8Array.from(Buffer.from(payload.replace(/^0x/, ""), "hex")),
  );

export class EthereumChainReader implements IVectorChainReader {
  private transferRegistries: Map<string, RegisteredTransfer[]> = new Map();
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
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }

    try {
      const res = await provider.send("eth_syncing", []);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getChannelDispute(
    channelAddress: string,
    chainId: number,
  ): Promise<Result<ChannelDispute | undefined, ChainError>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }

    try {
      const code = await this.getCode(channelAddress, chainId);
      if (code.isError) {
        return Result.fail(code.getError()!);
      }
      if (code.getValue() === "0x") {
        // channel is not deployed
        return Result.ok(undefined);
      }
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
        defundNonce: dispute.defundNonce.toString(),
      });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getRegisteredTransferByDefinition(
    definition: Address,
    transferRegistry: string,
    chainId: number,
    bytecode?: string,
  ): Promise<Result<RegisteredTransfer, ChainError>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }

    if (!this.transferRegistries.has(chainId.toString())) {
      // Registry for chain not loaded, load into memory
      const loadRes = await this.loadRegistry(transferRegistry, chainId, bytecode);
      if (loadRes.isError) {
        return Result.fail(loadRes.getError()!);
      }
    }

    const registry = this.transferRegistries.get(chainId.toString())!;
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
  }

  async getRegisteredTransferByName(
    name: TransferName,
    transferRegistry: string,
    chainId: number,
    bytecode?: string,
  ): Promise<Result<RegisteredTransfer, ChainError>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }

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
  }

  async getRegisteredTransfers(
    transferRegistry: string,
    chainId: number,
    bytecode?: string,
  ): Promise<Result<RegisteredTransfer[], ChainError>> {
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
  }

  async getChannelFactoryBytecode(channelFactoryAddress: string, chainId: number): Promise<Result<string, ChainError>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }
    try {
      const factory = new Contract(channelFactoryAddress, ChannelFactory.abi, provider);
      const proxyBytecode = await factory.getProxyCreationCode();
      return Result.ok(proxyBytecode);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getChannelMastercopyAddress(
    channelFactoryAddress: string,
    chainId: number,
  ): Promise<Result<string, ChainError>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }
    try {
      const factory = new Contract(channelFactoryAddress, ChannelFactory.abi, provider);
      const mastercopy = await factory.getMastercopy();
      return Result.ok(mastercopy);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getChannelOnchainBalance(
    channelAddress: string,
    chainId: number,
    assetId: string,
  ): Promise<Result<BigNumber, ChainError>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }
    const channelContract = new Contract(channelAddress, ChannelMastercopy.abi, provider);
    let onchainBalance: BigNumber;
    try {
      onchainBalance = await channelContract.getBalance(assetId);
    } catch (e) {
      // Likely means channel contract was not deployed
      // TODO: check for reason?
      try {
        onchainBalance =
          assetId === AddressZero
            ? await provider!.getBalance(channelAddress)
            : await new Contract(assetId, ERC20Abi, provider).balanceOf(channelAddress);
      } catch (e) {
        return Result.fail(e);
      }
    }
    return Result.ok(onchainBalance);
  }

  async getTotalDepositedA(
    channelAddress: string,
    chainId: number,
    assetId: string,
  ): Promise<Result<BigNumber, ChainError>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }

    const channelContract = new Contract(channelAddress, ChannelMastercopy.abi, provider);
    let totalDepositsAlice: BigNumber;
    try {
      totalDepositsAlice = await channelContract.getTotalDepositsAlice(assetId);
    } catch (e) {
      // TODO: check for reason?
      // Channel contract was not deployed, use 0 value
      totalDepositsAlice = BigNumber.from(0);
    }
    return Result.ok(totalDepositsAlice);
  }

  async getTotalDepositedB(
    channelAddress: string,
    chainId: number,
    assetId: string,
  ): Promise<Result<BigNumber, ChainError>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }

    const channelContract = new Contract(channelAddress, ChannelMastercopy.abi, provider);
    let totalDepositsBob: BigNumber;
    try {
      totalDepositsBob = await channelContract.getTotalDepositsBob(assetId);
    } catch (e) {
      // TODO: check for reason?
      // Channel contract was not deployed, use onchain value
      const deposited = await this.getChannelOnchainBalance(channelAddress, chainId, assetId);
      if (deposited.isError) {
        return deposited;
      }
      totalDepositsBob = deposited.getValue();
    }
    return Result.ok(totalDepositsBob);
  }

  async create(
    initialState: TransferState,
    balance: Balance,
    transferDefinition: string,
    transferRegistryAddress: string,
    chainId: number,
    bytecode?: string,
  ): Promise<Result<boolean, ChainError>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }
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
  }

  async resolve(transfer: FullTransferState, chainId: number, bytecode?: string): Promise<Result<Balance, ChainError>> {
    // Get provider
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }

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
  }

  async getChannelAddress(
    alice: string,
    bob: string,
    channelFactoryAddress: string,
    chainId: number,
  ): Promise<Result<string, ChainError>> {
    // Get provider
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }
    const channelFactory = new Contract(channelFactoryAddress, ChannelFactory.abi, provider);
    try {
      const derivedAddress = await channelFactory.getChannelAddress(alice, bob);
      return Result.ok(derivedAddress);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getCode(address: string, chainId: number): Promise<Result<string, ChainError>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }
    try {
      const code = await provider.getCode(address);
      return Result.ok(code);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getBlockNumber(chainId: number): Promise<Result<number, ChainError>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }
    try {
      const blockNumber = await provider.getBlockNumber();
      return Result.ok(blockNumber);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getTokenAllowance(
    tokenAddress: string,
    owner: string,
    spender: string,
    chainId: number,
  ): Promise<Result<BigNumber, ChainError>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }

    const erc20 = new Contract(tokenAddress, ERC20Abi, provider);
    try {
      const res = await erc20.allowance(owner, spender);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
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
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }
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
        return Result.fail(new ChainError(e.message, { chainId, transferRegistry, name }));
      }
    }
    const cleaned = registered.map((r: RegisteredTransfer) => {
      return {
        name: r.name,
        definition: r.definition,
        stateEncoding: tidy(r.stateEncoding),
        resolverEncoding: tidy(r.resolverEncoding),
      };
    });
    this.transferRegistries.set(chainId.toString(), cleaned);
    return Result.ok(cleaned);
  }
}
