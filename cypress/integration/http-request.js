const carolUrl = "http://localhost:8005"; // Node A
const daveUrl = "http://localhost:8006"; // Node B

const router = "http://localhost:8007";

const sugerDaddy = "0x627306090abaB3A6e1400e9345bC60c78a8BEf57";
const assetId = "0x0000000000000000000000000000000000000000";
const chainId = 1337;
const amount = "0xDE0B6B3A7640000"; // 1 ETH

const adminToken = "cxt1234";

const hr = {};

// CLEAR STORE
// POST {{aliceUrl}}/clear-store
// Content-Type: application/json

// {
//   "adminToken": "{{adminToken}}"
// }
hr.clearStore = Url => {
  cy.request({
    method: "POST",
    url: `${Url}/clear-store`,
    adminToken: adminToken,
  });
};

/// GET Config
// GET {{carolUrl}}/config
hr.getPublicIdentifier = Url => {
  return cy.wrap(
    new Cypress.Promise( async(resolve, reject) => {
      await cy.request(`${Url}/config`).then(response => {
        const publicIdentifier = response.body[0].publicIdentifier;
        console.log(publicIdentifier);
        resolve(cy.wrap(publicIdentifier));
      });
    }),
  );
};

/// GET CHANNEL
// GET {{carolUrl}}/{{carolPublicIdentifier}}/channels/{{channelAddress}}
hr.getChannel = (Url, channelAddress) => {
  return cy.wrap(
    new Cypress.Promise((resolve, reject) => {
      publicIdentifier = hr.getPublicIdentifier(Url);
      cy.request(`${Url}/${publicIdentifier}/channels/${channelAddress}`).then(response => {
        resolve(response);
      });
    }),
  );
};

/// GET CHANNEL BY PARTICIPANTS
// GET {{carolUrl}}/{{carolPublicIdentifier}}/channels/counterparty/{{rogerPublicIdentifier}}/chain-id/{{chainId}}
hr.getChannelByParticipants = Url => {
  return cy.wrap(
    new Cypress.Promise((resolve, reject) => {
      const publicIdentifier = hr.getPublicIdentifier(Url);
      const counterpartyIdentifier = hr.getPublicIdentifier(router);
      console.log(publicIdentifier, counterpartyIdentifier);
      cy.request(`${Url}/${publicIdentifier}/channels/counterparty/${counterpartyIdentifier}/chain-id/${chainId}`).then(
        response => {
          resolve(response);
        },
      );
    }),
  );
};

// Setup Channel
// POST {{carolUrl}}/setup
// Content-Type: application/json

// {
//   "counterpartyIdentifier": "{{rogerPublicIdentifier}}",
//   "publicIdentifier": "{{carolPublicIdentifier}}",
//   "chainId": "{{chainId}}",
//   "timeout": "36000"
// }
hr.setupChannel = Url => {
  return cy.wrap(
    new Cypress.Promise((resolve, reject) => {
      const params = {};
      params.counterpartyIdentifier = hr.getPublicIdentifier(router);
      params.publicIdentifier = hr.getPublicIdentifier(Url);
      params.chainId = chainId;
      params.timeout = "36000";
      cy.request({
        method: "POST",
        url: `${Url}/setup`,
        body: params,
      }).then(response => {
        resolve(response);
      });
    }),
  );
};

// Reconcile Deposit
// POST {{carolUrl}}/deposit
// Content-Type: application/json

// {
//   "channelAddress": "0x08d324c5CA1CC52c185f9b026a7ed50994632167",
//   "assetId": "0x0000000000000000000000000000000000000000",
//   "publicIdentifier": "{{carolPublicIdentifier}}"
// }
hr.reconcileDeposit = (Url, channelAddress) => {
  cy.wrap(
    new Cypress.Promise((resolve, reject) => {
      const params = {};
      params.channelAddress = channelAddress;
      params.assetId = assetId;
      params.publicIdentifier = hr.getPublicIdentifier(Url);
      cy.request({
        method: "POST",
        url: `${Url}/deposit`,
        body: params,
      }).then(response => {
        resolve(response);
      });
    }),
  );
};

// # 1 ETH
// @amount = 0xDE0B6B3A7640000

// ### SEND ETH
// POST {{ethNode}}
// Content-Type: application/json

// {
//   "jsonrpc":"2.0",
//   "method":"eth_sendTransaction",
//   "params":[{
//     "from": "{{sugarDaddy}}",
//     "to": "0x08d324c5CA1CC52c185f9b026a7ed50994632167",
//     "value": "{{amount}}",
//     "data": "0x0"
//   }],
//   "id":1
// }

hr.sendEth = receiver => {
  cy.wrap(
    new Cypress.Promise((resolve, reject) => {
      const tx = {};
      tx.from = sugerDaddy;
      tx.to = receiver;
      tx.value = amount;
      tx.data = "0x0";
      cy.request({
        jsonrpc: "2.0",
        method: "eth_sendTransaction",
        params: [tx],
        id: 1,
      }).then(response => {
        resolve(response);
      });
    }),
  );
};

export default hr;
