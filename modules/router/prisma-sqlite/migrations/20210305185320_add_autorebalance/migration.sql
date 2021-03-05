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

-- CreateIndex
CREATE UNIQUE INDEX "AutoRebalance.fromChainId_toChainId_fromAssetId_toAssetId_unique" ON "AutoRebalance"("fromChainId", "toChainId", "fromAssetId", "toAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoRebalance.approveHash_unique" ON "AutoRebalance"("approveHash");

-- CreateIndex
CREATE UNIQUE INDEX "AutoRebalance.completeHash_unique" ON "AutoRebalance"("completeHash");

-- CreateIndex
CREATE UNIQUE INDEX "AutoRebalance.executeHash_unique" ON "AutoRebalance"("executeHash");
