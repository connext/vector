/* eslint-disable import/order */

// To easily add deployments for a new network, copy paste one of the following blocks
//   then, search/replace network name (eg rinkeby) + chain id (eg 4)

export const deployments = {} as any;

////////////////////////////////////////
// 4 - rinkeby
import * as rinkebyChannelFactory from "../deployments/rinkeby/ChannelFactory.json";
import * as rinkebyChannelMastercopy from "../deployments/rinkeby/ChannelMastercopy.json";
import * as rinkebyHashlockTransfer from "../deployments/rinkeby/HashlockTransfer.json";
import * as rinkebyTestToken from "../deployments/rinkeby/TestToken.json";
import * as rinkebyTransferRegistry from "../deployments/rinkeby/TransferRegistry.json";
import * as rinkebyWithdraw from "../deployments/rinkeby/Withdraw.json";
const rinkebyDeployment = {
  ChannelFactory: rinkebyChannelFactory,
  ChannelMastercopy: rinkebyChannelMastercopy,
  HashlockTransfer: rinkebyHashlockTransfer,
  TestToken: rinkebyTestToken,
  TransferRegistry: rinkebyTransferRegistry,
  Withdraw: rinkebyWithdraw,
};
deployments.rinkeby = rinkebyDeployment;
deployments["4"] = rinkebyDeployment;

////////////////////////////////////////
// 5 - goerli
import * as goerliChannelFactory from "../deployments/goerli/ChannelFactory.json";
import * as goerliChannelMastercopy from "../deployments/goerli/ChannelMastercopy.json";
import * as goerliHashlockTransfer from "../deployments/goerli/HashlockTransfer.json";
import * as goerliTestToken from "../deployments/goerli/TestToken.json";
import * as goerliTransferRegistry from "../deployments/goerli/TransferRegistry.json";
import * as goerliWithdraw from "../deployments/goerli/Withdraw.json";
const goerliDeployment = {
  ChannelFactory: goerliChannelFactory,
  ChannelMastercopy: goerliChannelMastercopy,
  HashlockTransfer: goerliHashlockTransfer,
  TestToken: goerliTestToken,
  TransferRegistry: goerliTransferRegistry,
  Withdraw: goerliWithdraw,
};
deployments.goerli = goerliDeployment;
deployments["5"] = goerliDeployment;

////////////////////////////////////////
// 42 - kovan
import * as kovanChannelFactory from "../deployments/kovan/ChannelFactory.json";
import * as kovanChannelMastercopy from "../deployments/kovan/ChannelMastercopy.json";
import * as kovanHashlockTransfer from "../deployments/kovan/HashlockTransfer.json";
import * as kovanTestToken from "../deployments/kovan/TestToken.json";
import * as kovanTransferRegistry from "../deployments/kovan/TransferRegistry.json";
import * as kovanWithdraw from "../deployments/kovan/Withdraw.json";
const kovanDeployment = {
  ChannelFactory: kovanChannelFactory,
  ChannelMastercopy: kovanChannelMastercopy,
  HashlockTransfer: kovanHashlockTransfer,
  TestToken: kovanTestToken,
  TransferRegistry: kovanTransferRegistry,
  Withdraw: kovanWithdraw,
};
deployments.kovan = kovanDeployment;
deployments["42"] = kovanDeployment;

////////////////////////////////////////
// 80001 - mumbai
import * as mumbaiChannelFactory from "../deployments/mumbai/ChannelFactory.json";
import * as mumbaiChannelMastercopy from "../deployments/mumbai/ChannelMastercopy.json";
import * as mumbaiHashlockTransfer from "../deployments/mumbai/HashlockTransfer.json";
import * as mumbaiTestToken from "../deployments/mumbai/TestToken.json";
import * as mumbaiTransferRegistry from "../deployments/mumbai/TransferRegistry.json";
import * as mumbaiWithdraw from "../deployments/mumbai/Withdraw.json";
const mumbaiDeployment = {
  ChannelFactory: mumbaiChannelFactory,
  ChannelMastercopy: mumbaiChannelMastercopy,
  HashlockTransfer: mumbaiHashlockTransfer,
  TestToken: mumbaiTestToken,
  TransferRegistry: mumbaiTransferRegistry,
  Withdraw: mumbaiWithdraw,
};
deployments.mumbai = mumbaiDeployment;
deployments["80001"] = mumbaiDeployment;

////////////////////////////////////////
// 152709604825713 - arbitrum
import * as arbitrumChannelFactory from "../deployments/arbitrum/ChannelFactory.json";
import * as arbitrumChannelMastercopy from "../deployments/arbitrum/ChannelMastercopy.json";
import * as arbitrumHashlockTransfer from "../deployments/arbitrum/HashlockTransfer.json";
import * as arbitrumTestToken from "../deployments/arbitrum/TestToken.json";
import * as arbitrumTransferRegistry from "../deployments/arbitrum/TransferRegistry.json";
import * as arbitrumWithdraw from "../deployments/arbitrum/Withdraw.json";
const arbitrumDeployment = {
  ChannelFactory: arbitrumChannelFactory,
  ChannelMastercopy: arbitrumChannelMastercopy,
  HashlockTransfer: arbitrumHashlockTransfer,
  TestToken: arbitrumTestToken,
  TransferRegistry: arbitrumTransferRegistry,
  Withdraw: arbitrumWithdraw,
};
deployments.arbitrum = arbitrumDeployment;
deployments["152709604825713"] = arbitrumDeployment;
