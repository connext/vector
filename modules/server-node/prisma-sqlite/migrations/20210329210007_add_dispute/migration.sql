/*
  Warnings:

  - You are about to drop the column `inDispute` on the `channel` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "ChannelDispute" (
    "channelAddress" TEXT NOT NULL PRIMARY KEY,
    "channelStateHash" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "merkleRoot" TEXT NOT NULL,
    "consensusExpiry" TEXT NOT NULL,
    "defundExpiry" TEXT NOT NULL,
    "offchainChannelId" TEXT NOT NULL,
    "onchainChannelId" TEXT,
    FOREIGN KEY ("offchainChannelId") REFERENCES "channel" ("channelAddress") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("onchainChannelId") REFERENCES "channel" ("channelAddress") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransferDispute" (
    "transferId" TEXT NOT NULL PRIMARY KEY,
    "transferStateHash" TEXT NOT NULL,
    "transferDisputeExpiry" TEXT NOT NULL,
    "isDefunded" BOOLEAN NOT NULL,
    "offchainTransferId" TEXT NOT NULL,
    "onchainTransferId" TEXT,
    FOREIGN KEY ("offchainTransferId") REFERENCES "transfer" ("transferId") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("onchainTransferId") REFERENCES "transfer" ("transferId") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_channel" (
    "channelAddress" TEXT NOT NULL PRIMARY KEY,
    "publicIdentifierA" TEXT NOT NULL,
    "publicIdentifierB" TEXT NOT NULL,
    "participantA" TEXT NOT NULL,
    "participantB" TEXT NOT NULL,
    "assetIds" TEXT NOT NULL,
    "timeout" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "merkleRoot" TEXT NOT NULL,
    "channelFactoryAddress" TEXT NOT NULL,
    "transferRegistryAddress" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_channel" ("channelAddress", "publicIdentifierA", "publicIdentifierB", "participantA", "participantB", "assetIds", "timeout", "nonce", "merkleRoot", "channelFactoryAddress", "transferRegistryAddress", "chainId", "createdAt") SELECT "channelAddress", "publicIdentifierA", "publicIdentifierB", "participantA", "participantB", "assetIds", "timeout", "nonce", "merkleRoot", "channelFactoryAddress", "transferRegistryAddress", "chainId", "createdAt" FROM "channel";
DROP TABLE "channel";
ALTER TABLE "new_channel" RENAME TO "channel";
CREATE UNIQUE INDEX "channel.publicIdentifierA_publicIdentifierB_chainId_unique" ON "channel"("publicIdentifierA", "publicIdentifierB", "chainId");
CREATE UNIQUE INDEX "channel.participantA_participantB_chainId_unique" ON "channel"("participantA", "participantB", "chainId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE UNIQUE INDEX "ChannelDispute_offchainChannelId_unique" ON "ChannelDispute"("offchainChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelDispute_onchainChannelId_unique" ON "ChannelDispute"("onchainChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferDispute_offchainTransferId_unique" ON "TransferDispute"("offchainTransferId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferDispute_onchainTransferId_unique" ON "TransferDispute"("onchainTransferId");
