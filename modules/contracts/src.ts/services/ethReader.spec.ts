import {
    ChainError,
    FullChannelState,
    IChainServiceStore,
    IChannelSigner,
    MinimalTransaction,
    Result,
    TransactionReason,
    TransactionResponseWithResult,
} from "@connext/vector-types";
import {
    ChannelSigner,
    createTestChannelState,
    expect,
    getTestLoggers,
    MemoryStoreService,
    mkAddress,
    mkBytes32,
    mkHash,
} from "@connext/vector-utils";
import { AddressZero, One, Zero } from "@ethersproject/constants";
import { JsonRpcProvider, TransactionReceipt } from "@ethersproject/providers";
import { BigNumber } from "ethers";
import { restore, reset, createStubInstance, SinonStubbedInstance, stub, SinonStub } from "sinon";

import { EthereumChainReader } from "./ethReader";

// let storeMock: SinonStubbedInstance<IChainServiceStore>;
// let signer: SinonStubbedInstance<IChannelSigner>;
let ethReader: EthereumChainReader;
let provider1337: SinonStubbedInstance<JsonRpcProvider>;
let provider1338: SinonStubbedInstance<JsonRpcProvider>;

// let sendTxWithRetriesMock: SinonStub;
// let approveMock: SinonStub;
// let getCodeMock: SinonStub;
// let getOnchainBalanceMock: SinonStub;

// let channelState: FullChannelState;


const _txResponse = {
    chainId: 1337,
    confirmations: 1,
    data: "0x",
    from: AddressZero,
    gasLimit: One,
    gasPrice: One,
    hash: mkHash(),
    nonce: 1,
    value: Zero,
    wait: () => Promise.resolve({} as TransactionReceipt),
};


const txResponse: TransactionResponseWithResult = {
    ..._txResponse,
    completed: () => Promise.resolve(Result.ok({} as any)),
};

const { log } = getTestLoggers("ethReader");
describe.only("ethReader", () => {

    beforeEach(() => {
        // eth service deps
        const _provider = createStubInstance(JsonRpcProvider);
        _provider.getTransaction.resolves(_txResponse);
        provider1337 = _provider;
        provider1338 = _provider;

        // signer = createStubInstance(ChannelSigner);
        // signer.connect.returns(signer as any);
        // (signer as any)._isSigner = true;


        // (signer as any).provider = provider1337;

        // create eth service class
        ethReader = new EthereumChainReader(
            {
                1337: provider1337,
                1338: provider1338,
            },
            log,
        );

        // stubs with default friendly behavior
        // getCodeMock = stub(ethService, "getCode").resolves(Result.ok("0x"));
        // approveMock = stub(ethService, "approveTokens").resolves(Result.ok(txResponse));
        // getOnchainBalanceMock = stub(ethService, "getOnchainBalance").resolves(Result.ok(BigNumber.from("100")));

        // channel state
        // const test = createTestChannelState("create");
        // channelState = test.channel;
        // channelState.networkContext.chainId = 1337;
        // signer.getAddress.resolves(channelState.alice);
    });


    afterEach(() => {
        restore();
        reset();
    });

    describe.skip("getChainProviders", () => {
        it("happy: getChainProvider", async () => {
            const result = await ethReader.getChainProviders();
            console.log(result)

            // expect(result.args[0]).to.eq(channelState.channelAddress);
        })
    })

    describe("getHydratedProviders", () => {
        
    })

    describe("getChannelDispute", () => { })
    describe("getRegisteredTransferByDefinition", () => { })
    describe("getRegisteredTransferByName", () => { })
    describe("getRegisteredTransfers", () => { })
    describe("getChannelFactoryBytecode", () => { })
    describe("getChannelMastercopyAddress", () => { })
    describe("getTotalDepositedA", () => { })
    describe("getTotalDepositedB", () => { })
    describe("create", () => { })
    describe("resolve", () => { })
    describe("getChannelAddress", () => { })
    describe("getCode", () => { })
    describe("getBlockNumber", () => { })
    describe("getGasPrice", () => { })
    describe("estimateGas", () => { })
    describe("getTokenAllowance", () => { })
    describe("getOnchainBalance", () => { })
    describe("getDecimals", () => { })
    describe("getWithdrawalTransactionRecord", () => { })
    describe("registerChannel", () => { })

})
