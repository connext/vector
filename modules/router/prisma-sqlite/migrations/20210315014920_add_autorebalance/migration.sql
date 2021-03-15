-- CreateTable
CREATE TABLE "AutoRebalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "approveHash" TEXT,
    "executeHash" TEXT,
    "completeHash" TEXT,
    "fromChainId" TEXT NOT NULL,
    "fromAssetId" TEXT NOT NULL,
    "toChainId" TEXT NOT NULL,
    "toAssetId" TEXT NOT NULL,
    "priceType" TEXT NOT NULL,
    "hardcodedRate" TEXT NOT NULL,
    "rebalancerUrl" TEXT,
    "rebalanceThresholdPct" INTEGER,
    "percentageFee" INTEGER,
    "flatFee" TEXT,
    "gasSubsidyPercentage" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
