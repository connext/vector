/*
  Warnings:

  - You are about to drop the column `inDispute` on the `channel` table. All the data in the column will be lost.
  - You are about to drop the column `inDispute` on the `transfer` table. All the data in the column will be lost.

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
CREATE TABLE "new_transfer" (
    "transferId" TEXT NOT NULL PRIMARY KEY,
    "routingId" TEXT NOT NULL,
    "channelNonce" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onchainTransactionId" TEXT,
    "transactionHash" TEXT,
    "amountA" TEXT NOT NULL,
    "amountB" TEXT NOT NULL,
    "toA" TEXT NOT NULL,
    "toB" TEXT NOT NULL,
    "initialStateHash" TEXT NOT NULL,
    "channelAddress" TEXT,
    "channelAddressId" TEXT NOT NULL,
    "createUpdateChannelAddressId" TEXT,
    "createUpdateNonce" INTEGER,
    "resolveUpdateChannelAddressId" TEXT,
    "resolveUpdateNonce" INTEGER,
    FOREIGN KEY ("createUpdateChannelAddressId", "createUpdateNonce") REFERENCES "update" ("channelAddressId", "nonce") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("resolveUpdateChannelAddressId", "resolveUpdateNonce") REFERENCES "update" ("channelAddressId", "nonce") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("transactionHash") REFERENCES "onchain_transaction" ("transactionHash") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("channelAddress") REFERENCES "channel" ("channelAddress") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_transfer" ("transferId", "routingId", "channelNonce", "createdAt", "onchainTransactionId", "transactionHash", "amountA", "amountB", "toA", "toB", "initialStateHash", "channelAddress", "channelAddressId", "createUpdateChannelAddressId", "createUpdateNonce", "resolveUpdateChannelAddressId", "resolveUpdateNonce") SELECT "transferId", "routingId", "channelNonce", "createdAt", "onchainTransactionId", "transactionHash", "amountA", "amountB", "toA", "toB", "initialStateHash", "channelAddress", "channelAddressId", "createUpdateChannelAddressId", "createUpdateNonce", "resolveUpdateChannelAddressId", "resolveUpdateNonce" FROM "transfer";
DROP TABLE "transfer";
ALTER TABLE "new_transfer" RENAME TO "transfer";
CREATE UNIQUE INDEX "transfer.routingId_channelAddressId_unique" ON "transfer"("routingId", "channelAddressId");
CREATE UNIQUE INDEX "transfer_createUpdateChannelAddressId_createUpdateNonce_unique" ON "transfer"("createUpdateChannelAddressId", "createUpdateNonce");
CREATE UNIQUE INDEX "transfer_resolveUpdateChannelAddressId_resolveUpdateNonce_unique" ON "transfer"("resolveUpdateChannelAddressId", "resolveUpdateNonce");
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
