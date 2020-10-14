const { AddressZero } = require("@ethersproject/constants");

const config = {
  allowedSwaps: [
    {
      fromChainId: 1337,
      toChainId: 1338,
      fromAssetId: AddressZero,
      toAssetId: AddressZero,
      priceType: "hardcoded",
      hardcodedRate: "1",
    },
    {
      fromChainId: 1337,
      toChainId: 1338,
      fromAssetId: "0x8f0483125FCb9aaAEFA9209D8E9d7b9C8B9Fb90F",
      toAssetId: "0x8f0483125FCb9aaAEFA9209D8E9d7b9C8B9Fb90F",
      priceType: "hardcoded",
      hardcodedRate: "1",
    },
  ],
  domainName: "",
  production: false,
  rebalanceProfiles: [
    {
      chainId: 1337,
      assetId: AddressZero,
      reclaimThreshold: "200000000000000000",
      target: "100000000000000000",
      collateralizeThreshold: "50000000000000000",
    },
    {
      chainId: 1338,
      assetId: AddressZero,
      reclaimThreshold: "200000000000000000",
      target: "100000000000000000",
      collateralizeThreshold: "50000000000000000",
    },
    {
      chainId: 1337,
      assetId: "0x8f0483125FCb9aaAEFA9209D8E9d7b9C8B9Fb90F",
      reclaimThreshold: "2000000000000000000",
      target: "1000000000000000000",
      collateralizeThreshold: "500000000000000000",
    },
    {
      chainId: 1338,
      assetId: "0x8f0483125FCb9aaAEFA9209D8E9d7b9C8B9Fb90F",
      reclaimThreshold: "2000000000000000000",
      target: "1000000000000000000",
      collateralizeThreshold: "500000000000000000",
    },
  ],
};

// "Output" config by printing it (will be read into ops/start-global.sh by jq)
console.log(JSON.stringify(config));
