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

////////////////////////////////////////
// 256 - hecotestnet
import * as hecotestnetChannelFactory from "../deployments/hecotestnet/ChannelFactory.json";
import * as hecotestnetChannelMastercopy from "../deployments/hecotestnet/ChannelMastercopy.json";
import * as hecotestnetHashlockTransfer from "../deployments/hecotestnet/HashlockTransfer.json";
import * as hecotestnetTestToken from "../deployments/hecotestnet/TestToken.json";
import * as hecotestnetTransferRegistry from "../deployments/hecotestnet/TransferRegistry.json";
import * as hecotestnetWithdraw from "../deployments/hecotestnet/Withdraw.json";
const hecotestnetDeployment = {
  ChannelFactory: hecotestnetChannelFactory,
  ChannelMastercopy: hecotestnetChannelMastercopy,
  HashlockTransfer: hecotestnetHashlockTransfer,
  TestToken: hecotestnetTestToken,
  TransferRegistry: hecotestnetTransferRegistry,
  Withdraw: hecotestnetWithdraw,
};
deployments.hecotestnet = hecotestnetDeployment;
deployments["256"] = hecotestnetDeployment;

////////////////////////////////////////
// 128 - heco
import * as hecoChannelFactory from "../deployments/heco/ChannelFactory.json";
import * as hecoChannelMastercopy from "../deployments/heco/ChannelMastercopy.json";
import * as hecoHashlockTransfer from "../deployments/heco/HashlockTransfer.json";
import * as hecoTestToken from "../deployments/heco/TestToken.json";
import * as hecoTransferRegistry from "../deployments/heco/TransferRegistry.json";
import * as hecoWithdraw from "../deployments/heco/Withdraw.json";
const hecoDeployment = {
  ChannelFactory: hecoChannelFactory,
  ChannelMastercopy: hecoChannelMastercopy,
  HashlockTransfer: hecoHashlockTransfer,
  TestToken: hecoTestToken,
  TransferRegistry: hecoTransferRegistry,
  Withdraw: hecoWithdraw,
};
deployments.heco = hecoDeployment;
deployments["128"] = hecoDeployment;

////////////////////////////////////////
// 43113 - avalanchefuji
import * as avalanchefujiChannelFactory from "../deployments/avalanchefuji/ChannelFactory.json";
import * as avalanchefujiChannelMastercopy from "../deployments/avalanchefuji/ChannelMastercopy.json";
import * as avalanchefujiHashlockTransfer from "../deployments/avalanchefuji/HashlockTransfer.json";
import * as avalanchefujiTestToken from "../deployments/avalanchefuji/TestToken.json";
import * as avalanchefujiTransferRegistry from "../deployments/avalanchefuji/TransferRegistry.json";
import * as avalanchefujiWithdraw from "../deployments/avalanchefuji/Withdraw.json";
const avalanchefujiDeployment = {
  ChannelFactory: avalanchefujiChannelFactory,
  ChannelMastercopy: avalanchefujiChannelMastercopy,
  HashlockTransfer: avalanchefujiHashlockTransfer,
  TestToken: avalanchefujiTestToken,
  TransferRegistry: avalanchefujiTransferRegistry,
  Withdraw: avalanchefujiWithdraw,
};
deployments.avalanchefuji = avalanchefujiDeployment;
deployments["43113"] = avalanchefujiDeployment;

////////////////////////////////////////
// 43114 - avalanche
import * as avalancheChannelFactory from "../deployments/avalanche/ChannelFactory.json";
import * as avalancheChannelMastercopy from "../deployments/avalanche/ChannelMastercopy.json";
import * as avalancheHashlockTransfer from "../deployments/avalanche/HashlockTransfer.json";
import * as avalancheTestToken from "../deployments/avalanche/TestToken.json";
import * as avalancheTransferRegistry from "../deployments/avalanche/TransferRegistry.json";
import * as avalancheWithdraw from "../deployments/avalanche/Withdraw.json";
const avalancheDeployment = {
  ChannelFactory: avalancheChannelFactory,
  ChannelMastercopy: avalancheChannelMastercopy,
  HashlockTransfer: avalancheHashlockTransfer,
  TestToken: avalancheTestToken,
  TransferRegistry: avalancheTransferRegistry,
  Withdraw: avalancheWithdraw,
};
deployments.avalanche = avalancheDeployment;
deployments["43114"] = avalancheDeployment;

////////////////////////////////////////
// 250 - fantom
import * as fantomChannelFactory from "../deployments/fantom/ChannelFactory.json";
import * as fantomChannelMastercopy from "../deployments/fantom/ChannelMastercopy.json";
import * as fantomHashlockTransfer from "../deployments/fantom/HashlockTransfer.json";
import * as fantomTestToken from "../deployments/fantom/TestToken.json";
import * as fantomTransferRegistry from "../deployments/fantom/TransferRegistry.json";
import * as fantomWithdraw from "../deployments/fantom/Withdraw.json";
const fantomDeployment = {
  ChannelFactory: fantomChannelFactory,
  ChannelMastercopy: fantomChannelMastercopy,
  HashlockTransfer: fantomHashlockTransfer,
  TestToken: fantomTestToken,
  TransferRegistry: fantomTransferRegistry,
  Withdraw: fantomWithdraw,
};
deployments.fantom = fantomDeployment;
deployments["250"] = fantomDeployment;

////////////////////////////////////////
// 1287 - moonbasealpha
import * as moonbasealphaChannelFactory from "../deployments/moonbasealpha/ChannelFactory.json";
import * as moonbasealphaChannelMastercopy from "../deployments/moonbasealpha/ChannelMastercopy.json";
import * as moonbasealphaHashlockTransfer from "../deployments/moonbasealpha/HashlockTransfer.json";
import * as moonbasealphaTestToken from "../deployments/moonbasealpha/TestToken.json";
import * as moonbasealphaTransferRegistry from "../deployments/moonbasealpha/TransferRegistry.json";
import * as moonbasealphaWithdraw from "../deployments/moonbasealpha/Withdraw.json";
const moonbasealphaDeployment = {
  ChannelFactory: moonbasealphaChannelFactory,
  ChannelMastercopy: moonbasealphaChannelMastercopy,
  HashlockTransfer: moonbasealphaHashlockTransfer,
  TestToken: moonbasealphaTestToken,
  TransferRegistry: moonbasealphaTransferRegistry,
  Withdraw: moonbasealphaWithdraw,
};
deployments.moonbasealpha = moonbasealphaDeployment;
deployments["1287"] = moonbasealphaDeployment;

////////////////////////////////////////
// 212984383488152 - arbitrumtest4
import * as arbitrumtest4ChannelFactory from "../deployments/arbitrumtest4/ChannelFactory.json";
import * as arbitrumtest4ChannelMastercopy from "../deployments/arbitrumtest4/ChannelMastercopy.json";
import * as arbitrumtest4HashlockTransfer from "../deployments/arbitrumtest4/HashlockTransfer.json";
import * as arbitrumtest4TestToken from "../deployments/arbitrumtest4/TestToken.json";
import * as arbitrumtest4TransferRegistry from "../deployments/arbitrumtest4/TransferRegistry.json";
import * as arbitrumtest4Withdraw from "../deployments/arbitrumtest4/Withdraw.json";
const arbitrumtest4Deployment = {
  ChannelFactory: arbitrumtest4ChannelFactory,
  ChannelMastercopy: arbitrumtest4ChannelMastercopy,
  HashlockTransfer: arbitrumtest4HashlockTransfer,
  TestToken: arbitrumtest4TestToken,
  TransferRegistry: arbitrumtest4TransferRegistry,
  Withdraw: arbitrumtest4Withdraw,
};
deployments.arbitrumtest4 = arbitrumtest4Deployment;
deployments["212984383488152"] = arbitrumtest4Deployment;
