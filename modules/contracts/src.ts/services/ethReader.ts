import * as evm from "@connext/pure-evm-wasm";
import { Balance, ERC20Abi, FullTransferState, IVectorChainReader, Result, ChainError } from "@connext/vector-types";
import { BigNumber, constants, Contract, providers } from "ethers";
import { defaultAbiCoder } from "ethers/lib/utils";
import pino from "pino";

import { ChannelFactory, ChannelMastercopy, TransferDefinition } from "../artifacts";

// https://github.com/rustwasm/wasm-bindgen/issues/700#issuecomment-419708471
const execEvmBytecode = (bytecode: string, payload: string): Uint8Array =>
  evm.exec(
    Uint8Array.from(Buffer.from(bytecode.replace(/^0x/, ""), "hex")),
    Uint8Array.from(Buffer.from(payload.replace(/^0x/, ""), "hex")),
  );

export class EthereumChainReader implements IVectorChainReader {
  constructor(
    public readonly chainProviders: { [chainId: string]: providers.JsonRpcProvider },
    public readonly log: pino.BaseLogger = pino(),
  ) {}

  async getTransferStateEncoding(
    transferDefinition: string,
    chainId: number,
    bytecode?: string,
  ): Promise<Result<string, ChainError>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }
    const def = new Contract(transferDefinition, TransferDefinition.abi, provider);
    if (bytecode) {
      const evm = this.tryEvm(def.interface.encodeFunctionData("stateEncoding"), bytecode);
      if (!evm.isError) {
        const decoded = def.interface.decodeFunctionResult("stateEncoding", evm.getValue()!)[0];
        return Result.ok(decoded);
      }
    }
    try {
      const encoding = await def.stateEncoding();
      return Result.ok(encoding);
    } catch (e) {
      return Result.fail(new ChainError(e.message));
    }
  }

  async getTransferResolverEncoding(
    transferDefinition: string,
    chainId: number,
    bytecode?: string,
  ): Promise<Result<string, ChainError>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }
    const def = new Contract(transferDefinition, TransferDefinition.abi, provider);
    if (bytecode) {
      const evm = this.tryEvm(def.interface.encodeFunctionData("resolverEncoding"), bytecode);
      if (!evm.isError) {
        const decoded = def.interface.decodeFunctionResult("resolverEncoding", evm.getValue()!)[0];
        return Result.ok(decoded);
      }
    }
    try {
      const encoding = await def.resolverEncoding();
      return Result.ok(encoding);
    } catch (e) {
      return Result.fail(new ChainError(e.message));
    }
  }

  async getChannelFactoryBytecode(channelFactoryAddress: string, chainId: number): Promise<Result<string, ChainError>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }
    try {
      const factory = new Contract(channelFactoryAddress, ChannelFactory.abi, provider);
      const proxyBytecode = await factory.proxyCreationCode();
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
          assetId === constants.AddressZero
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
    let totalDepositedA: BigNumber;
    try {
      totalDepositedA = await channelContract.totalDepositedA(assetId);
    } catch (e) {
      // TODO: check for reason?
      // Channel contract was not deployed, use 0 value
      totalDepositedA = BigNumber.from(0);
    }
    return Result.ok(totalDepositedA);
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
    let totalDepositedB: BigNumber;
    try {
      totalDepositedB = await channelContract.totalDepositedB(assetId);
    } catch (e) {
      // TODO: check for reason?
      // Channel contract was not deployed, use onchain value
      const deposited = await this.getChannelOnchainBalance(channelAddress, chainId, assetId);
      if (deposited.isError) {
        return deposited;
      }
      totalDepositedB = deposited.getValue();
    }
    return Result.ok(totalDepositedB);
  }

  async create(transfer: FullTransferState, chainId: number, bytecode?: string): Promise<Result<boolean, ChainError>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }
    const encodedState = defaultAbiCoder.encode([transfer.transferEncodings[0]], [transfer.transferState]);
    const contract = new Contract(transfer.transferDefinition, TransferDefinition.abi, provider);
    if (bytecode) {
      const evmRes = this.tryEvm(contract.interface.encodeFunctionData("create", [encodedState]), bytecode);
      if (!evmRes.isError) {
        const decoded = contract.interface.decodeFunctionResult("create", evmRes.getValue()!)[0];
        return Result.ok(decoded);
      }
    }
    this.log.debug(
      { transferDefinition: transfer.transferDefinition, transferId: transfer.transferId },
      "Calling create onchain",
    );
    try {
      const valid = await contract.create(encodedState);
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
    try {
      encodedState = defaultAbiCoder.encode([transfer.transferEncodings[0]], [transfer.transferState]);
      encodedResolver = defaultAbiCoder.encode([transfer.transferEncodings[1]], [transfer.transferResolver]);
    } catch (e) {
      return Result.fail(e);
    }

    // Use pure-evm if possible
    const contract = new Contract(transfer.transferDefinition, TransferDefinition.abi, provider);
    if (bytecode) {
      const evmRes = this.tryEvm(
        contract.interface.encodeFunctionData("resolve", [encodedState, encodedResolver]),
        bytecode,
      );
      if (!evmRes.isError) {
        const decoded = contract.interface.decodeFunctionResult("resolve", evmRes.getValue()!)[0];
        return Result.ok(decoded);
      }
    }
    this.log.debug(
      { transferDefinition: transfer.transferDefinition, transferId: transfer.transferId },
      "Calling resolve onchain",
    );
    try {
      const ret = await contract.resolve(encodedState, encodedResolver);
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
    responder: string,
    channelFactoryAddress: string,
    chainId: number,
  ): Promise<Result<string, ChainError>> {
    // Get provider
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new ChainError(ChainError.reasons.ProviderNotFound));
    }
    const vectorChannel = new Contract(channelFactoryAddress, ChannelFactory.abi, provider);
    try {
      const derivedAddress = await vectorChannel.getChannelAddress(alice, responder, chainId);
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

  private tryEvm(encodedFunctionData: string, bytecode: string): Result<Uint8Array, Error> {
    try {
      const output = execEvmBytecode(bytecode, encodedFunctionData);
      return Result.ok(output);
    } catch (e) {
      this.log.debug({ error: e.message }, `Pure-evm failed`);
      return Result.fail(e);
    }
  }
}
