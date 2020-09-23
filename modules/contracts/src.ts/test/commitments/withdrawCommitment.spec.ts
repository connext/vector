import { getRandomChannelSigner, signChannelMessage, stringify } from "@connext/vector-utils";
import { BigNumber, constants, Contract, ContractFactory, Wallet } from "ethers";
import { ChannelMastercopy, TestToken } from "../../artifacts";
import { WithdrawCommitment } from "../../commitments";
import { expect, provider } from "../utils";

describe.only("withdrawCommitment", () => {
    let deployer: Wallet;
    let channelMastercopy: Contract;
    let token: Contract;

    const participantA = getRandomChannelSigner(provider);
    const participantB = getRandomChannelSigner(provider);
    const amount = "50"

    beforeEach(async () => {
        deployer = provider.getWallets()[0];
        channelMastercopy = await new ContractFactory(ChannelMastercopy.abi, ChannelMastercopy.bytecode, deployer).deploy();
        await channelMastercopy.deployed();
        token = await new ContractFactory(TestToken.abi, TestToken.bytecode, deployer).deploy("Test", "TST");
        await channelMastercopy.deployed();
        await channelMastercopy.setup([participantA.address, participantB.address])

        // Fund with Eth and tokens
        await deployer.sendTransaction({to: channelMastercopy.address, value: BigNumber.from(amount).mul(2)})
        await token.mint(channelMastercopy.address, BigNumber.from(amount).mul(2));
    })
        
    it("can create the commitment", () => {
        const commitment = new WithdrawCommitment(
            channelMastercopy.address,
            [participantA.address, participantB.address],
            participantA.address,
            constants.AddressZero,
            amount,
            "1"
        )
        expect(commitment).to.be.ok
    })

    it("can successfully withdraw Eth", async () => {
        const commitment = new WithdrawCommitment(
            channelMastercopy.address,
            [participantA.address, participantB.address],
            participantA.address,
            constants.AddressZero,
            amount,
            "1"
        )
        const signatureA = await participantA.signMessage(commitment.hashToSign())
        const signatureB = await participantB.signMessage(commitment.hashToSign())
        await commitment.addSignatures(signatureA, signatureB);

        const tx = await commitment.getSignedTransaction();

        // Check before balance
        expect((await channelMastercopy.getBalance(constants.AddressZero)).eq(BigNumber.from(amount).mul(2)))
        await deployer.sendTransaction(tx)

        // Check after balance
        expect((await channelMastercopy.getBalance(constants.AddressZero)).eq(BigNumber.from(amount)))
    })

    it("can successfully withdraw Tokens", async () => {
        const commitment = new WithdrawCommitment(
            channelMastercopy.address,
            [participantA.address, participantB.address],
            participantA.address,
            token.address,
            amount,
            "1"
        )
        const signatureA = await participantA.signMessage(commitment.hashToSign())
        const signatureB = await participantB.signMessage(commitment.hashToSign())
        await commitment.addSignatures(signatureA, signatureB);

        const tx = await commitment.getSignedTransaction();

        // Check before balance
        expect((await channelMastercopy.getBalance(token.address)).eq(BigNumber.from(amount).mul(2)))
        await deployer.sendTransaction(tx)

        // Check after balance
        expect((await channelMastercopy.getBalance(token.address)).eq(BigNumber.from(amount)))
    })
})