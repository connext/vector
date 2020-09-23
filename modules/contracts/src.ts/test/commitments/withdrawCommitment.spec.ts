import { BigNumber, Contract, ContractFactory, Wallet } from "ethers";
import { ChannelMastercopy, ERC20 } from "../../artifacts";
import { provider } from "../utils";

describe.only("withdrawCommitment", () => {
    let deployer: Wallet;
    let channelMastercopy: Contract;
    let token: Contract;

    beforeEach(async () => {
        deployer = provider.getWallets()[0];
        channelMastercopy = await new ContractFactory(ChannelMastercopy.abi, ChannelMastercopy.bytecode, deployer).deploy();
        await channelMastercopy.deployed();
        token = await new ContractFactory(ERC20.abi, ERC20.bytecode, deployer).deploy();
        await channelMastercopy.deployed();

        // Fund with Eth and tokens
        deployer.sendTransaction({to: channelMastercopy.address, value: BigNumber.from("10000")})
        token.functions.transfer(deployer.address, channelMastercopy.address, BigNumber.from("100"));
    })
        
    it("can create the commitment", () => {

    })

    it("can successfully withdraw Eth", async () => {

    })

    it("can successfully withdraw Tokens", async () => {

    })
})