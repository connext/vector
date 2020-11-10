const eth = require("ethers");

const provider = new eth.providers.JsonRpcProvider(Cypress.env("NETWORK"));
const funder = eth.Wallet.fromMnemonic(Cypress.env("MNEMONIC")).connect(provider);
const cashout = eth.Wallet.createRandom().connect(provider);
// const tokenArtifacts = require("@openzeppelin/contracts/build/contracts/ERC20Mintable.json");
// const addressBook = require("../../.chaindata/addresses/1337-1338.json");
// const origin = Cypress.env("publicUrl").substring(Cypress.env("publicUrl").indexOf("://") + 3);
// const tokenAddress = addressBook["1337"].Token.address.toLowerCase();
// const token = new eth.Contract(tokenAddress, tokenArtifacts.abi, funder);

// const gasMoney = "0.005";
const from = "0x627306090abaB3A6e1400e9345bC60c78a8BEf57";

// Exported object, attach anything to this that you want available in tests
const my = {};

my.getChannelAddress = () => {
  return cy.wrap(
    new Cypress.Promise((resolve, reject) => {
      cy.get(".ant-statistic-content-value")
        .invoke("text")
        .then(address => {
          cy.log(`Got Channel address: ${address}`);
          resolve(address);
        });
    }),
  );
};

my.getNodeBalance = () => {
  return cy.wrap(
    new Cypress.Promise((resolve, reject) => {
      cy.get(".ant-table-row > :nth-child(2)")
        .invoke("text")
        .then(balance => {
          cy.log(`Got Node Balance: ${balance}`);
          resolve(balance);
        });
    }),
  );
};

my.getCounterpartyBalance = () => {
  return cy.wrap(
    new Cypress.Promise((resolve, reject) => {
      cy.get(".ant-table-row > :nth-child(3)")
        .invoke("text")
        .then(balance => {
          cy.log(`Got Counterparty Balance: ${balance}`);
          resolve(balance);
        });
    }),
  );
};

my.getOnchainEtherBalance = (address = cashout.address) => {
  return cy.wrap(
    new Cypress.Promise((resolve, reject) => {
      return cy.wrap(cashout.provider.getBalance(address)).then(balance => {
        cy.log(`Onchain ether balance is ${balance.toString()} for ${address}`);
        resolve(balance.toString());
      });
    }),
  );
};

my.deposit = value => {
  return cy.wrap(
    new Cypress.Promise((resolve, reject) => {
      cy.get(
        ":nth-child(1) > .ant-col-18 > .ant-form-item-control-input > .ant-form-item-control-input-content > .ant-input-group-wrapper > .ant-input-wrapper > .ant-input-group-addon > .ant-btn",
      ).click();
      my.getChannelAddress().then(address => {
        cy.log(`Depositing ${value} eth into channel ${address}`);
        return cy
          .wrap(
            funder.sendTransaction({
              to: address,
              value: eth.utils.parseEther(value),
            }),
          )
          .then(tx => {
            return cy.wrap(funder.provider.waitForTransaction(tx.hash)).then(() => {
              my.getNodeBalance().should("not.contain", "0.00");
              my.getNodeBalance().then(resolve);
              //   cy.contains("span", /processing swap/i).should("exist");
              //   cy.contains("span", /swap was successful/i).should("exist");
              //   cy.resolve(my.getChannelTokenBalance).should("not.contain", "0.00");
              //   my.getChannelTokenBalance().then(resolve);
            });
          });
      });
    }),
  );
};

my.withdraw = (value, address) => {
  return cy.wrap(
    new Cypress.Promise((resolve, reject) => {
      cy.get("#withdraw_assetId").first().click({ force: true }).type('0x0000000000000000000000000000000000000000', { force: true })
      cy.get("#withdraw_recipient").type(address);
      cy.get("#withdraw_amount").type(value);
      cy.get(
        ":nth-child(4) > .ant-col > .ant-form-item-control-input > .ant-form-item-control-input-content > .ant-btn",
      ).click();

      cy.log(`Withdraw ${value} eth into channel ${address}`);
      my.getCounterpartyBalance().should("not.contain", "0.00");
      return my.getCounterpartyBalance().then(resolve);
    }),
  );
};

// my.getAddress = () => {
//   return cy.wrap(
//     new Cypress.Promise((resolve, reject) => {
//       my.goToDeposit();
//       cy.contains("button", my.addressRegex)
//         .invoke("text")
//         .then(address => {
//           cy.log(`Got address: ${address}`);
//           my.goBack();
//           resolve(address);
//         });
//     }),
//   );
// };

// function sendTransaction(receiver) {
//   var privateKey = Buffer.from(PrivateKey, "hex");

//   console.log(from);
//   cy.wrap(web3.eth.getTransactionCount(from)).as("account_nonce");
//   cy.wait("@account_nonce", { timeout: 10000 });
//   console.log(account_nonce);

//   var rawTx = {
//     nonce: account_nonce,
//     gasPrice: "0x09184e72a000",
//     gasLimit: "0x2710",
//     to: receiver,
//     value: "0x00",
//   };

//   var tx = new Tx(rawTx);
//   tx.sign(privateKey);

//   var serializedTx = tx.serialize();

//   console.log(serializedTx.toString("hex"));
//   let txHash;

//   web3.eth.sendSignedTransaction("0x" + serializedTx.toString("hex")).then(async logs => {
//     console.log("Sent: " + logs.transactionHash);
//     txHash = logs.transactionHash;
//   });

//   return txHash;
// }

export default my;
