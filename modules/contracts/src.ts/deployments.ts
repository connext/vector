/* eslint-disable import/order */

// To easily add deployments for a new network, copy paste one of the following blocks
//   then, search/replace network name (eg rinkeby) + chain id (eg 4)

export const deployments = {} as any;

////////////////////////////////////////
// 1 - mainnet
import * as mainnetChannelFactory from "../deployments/mainnet/ChannelFactory.json";
import * as mainnetChannelMastercopy from "../deployments/mainnet/ChannelMastercopy.json";
import * as mainnetHashlockTransfer from "../deployments/mainnet/HashlockTransfer.json";
import * as mainnetTestToken from "../deployments/mainnet/TestToken.json";
import * as mainnetTransferRegistry from "../deployments/mainnet/TransferRegistry.json";
import * as mainnetWithdraw from "../deployments/mainnet/Withdraw.json";
const mainnetDeployment = {
  ChannelFactory: mainnetChannelFactory,
  ChannelMastercopy: mainnetChannelMastercopy,
  HashlockTransfer: mainnetHashlockTransfer,
  TestToken: mainnetTestToken,
  TransferRegistry: mainnetTransferRegistry,
  Withdraw: mainnetWithdraw,
};
deployments.mainnet = mainnetDeployment;
deployments["1"] = mainnetDeployment;

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
// 137 - matic
import * as maticChannelFactory from "../deployments/matic/ChannelFactory.json";
import * as maticChannelMastercopy from "../deployments/matic/ChannelMastercopy.json";
import * as maticHashlockTransfer from "../deployments/matic/HashlockTransfer.json";
import * as maticTestToken from "../deployments/matic/TestToken.json";
import * as maticTransferRegistry from "../deployments/matic/TransferRegistry.json";
import * as maticWithdraw from "../deployments/matic/Withdraw.json";
const maticDeployment = {
  ChannelFactory: maticChannelFactory,
  ChannelMastercopy: maticChannelMastercopy,
  HashlockTransfer: maticHashlockTransfer,
  TestToken: maticTestToken,
  TransferRegistry: maticTransferRegistry,
  Withdraw: maticWithdraw,
};
deployments.matic = maticDeployment;
deployments["137"] = maticDeployment;

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
// 79377087078960 - arbitrumtest
import * as arbitrumtestChannelFactory from "../deployments/arbitrumtest/ChannelFactory.json";
import * as arbitrumtestChannelMastercopy from "../deployments/arbitrumtest/ChannelMastercopy.json";
import * as arbitrumtestHashlockTransfer from "../deployments/arbitrumtest/HashlockTransfer.json";
import * as arbitrumtestTestToken from "../deployments/arbitrumtest/TestToken.json";
import * as arbitrumtestTransferRegistry from "../deployments/arbitrumtest/TransferRegistry.json";
import * as arbitrumtestWithdraw from "../deployments/arbitrumtest/Withdraw.json";
const arbitrumtestDeployment = {
  ChannelFactory: arbitrumtestChannelFactory,
  ChannelMastercopy: arbitrumtestChannelMastercopy,
  HashlockTransfer: arbitrumtestHashlockTransfer,
  TestToken: arbitrumtestTestToken,
  TransferRegistry: arbitrumtestTransferRegistry,
  Withdraw: arbitrumtestWithdraw,
};
deployments.arbitrumtest = arbitrumtestDeployment;
deployments["79377087078960"] = arbitrumtestDeployment;

////////////////////////////////////////
// 100 - xdai
import * as xdaiChannelFactory from "../deployments/xdai/ChannelFactory.json";
import * as xdaiChannelMastercopy from "../deployments/xdai/ChannelMastercopy.json";
import * as xdaiHashlockTransfer from "../deployments/xdai/HashlockTransfer.json";
import * as xdaiTestToken from "../deployments/xdai/TestToken.json";
import * as xdaiTransferRegistry from "../deployments/xdai/TransferRegistry.json";
import * as xdaiWithdraw from "../deployments/xdai/Withdraw.json";
const xdaiDeployment = {
  ChannelFactory: xdaiChannelFactory,
  ChannelMastercopy: xdaiChannelMastercopy,
  HashlockTransfer: xdaiHashlockTransfer,
  TestToken: xdaiTestToken,
  TransferRegistry: xdaiTransferRegistry,
  Withdraw: xdaiWithdraw,
};
deployments.xdai = xdaiDeployment;
deployments["100"] = xdaiDeployment;

////////////////////////////////////////
// 97 - bsc testnet
import * as bsctestnetChannelFactory from "../deployments/bsctestnet/ChannelFactory.json";
import * as bsctestnetChannelMastercopy from "../deployments/bsctestnet/ChannelMastercopy.json";
import * as bsctestnetHashlockTransfer from "../deployments/bsctestnet/HashlockTransfer.json";
import * as bsctestnetTestToken from "../deployments/bsctestnet/TestToken.json";
import * as bsctestnetTransferRegistry from "../deployments/bsctestnet/TransferRegistry.json";
import * as bsctestnetWithdraw from "../deployments/bsctestnet/Withdraw.json";
const bsctestnetDeployment = {
  ChannelFactory: bsctestnetChannelFactory,
  ChannelMastercopy: bsctestnetChannelMastercopy,
  HashlockTransfer: bsctestnetHashlockTransfer,
  TestToken: bsctestnetTestToken,
  TransferRegistry: bsctestnetTransferRegistry,
  Withdraw: bsctestnetWithdraw,
};
deployments.bsctestnet = bsctestnetDeployment;
deployments["97"] = bsctestnetDeployment;

////////////////////////////////////////
// 56 - bsc
import * as bscChannelFactory from "../deployments/bsc/ChannelFactory.json";
import * as bscChannelMastercopy from "../deployments/bsc/ChannelMastercopy.json";
import * as bscHashlockTransfer from "../deployments/bsc/HashlockTransfer.json";
import * as bscTestToken from "../deployments/bsc/TestToken.json";
import * as bscTransferRegistry from "../deployments/bsc/TransferRegistry.json";
import * as bscWithdraw from "../deployments/bsc/Withdraw.json";
const bscDeployment = {
  ChannelFactory: bscChannelFactory,
  ChannelMastercopy: bscChannelMastercopy,
  HashlockTransfer: bscHashlockTransfer,
  TestToken: bscTestToken,
  TransferRegistry: bscTransferRegistry,
  Withdraw: bscWithdraw,
};
deployments.bsc = bscDeployment;
deployments["56"] = bscDeployment;
