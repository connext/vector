/*
  Warnings:

  - You are about to drop the `balance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `channel` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `configuration` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `event-subscription` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `node_index` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `onchain_transaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `transfer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `update` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "channel.participantA_participantB_chainId_unique";

-- DropIndex
DROP INDEX "event-subscription.publicIdentifier_event_unique";

-- DropIndex
DROP INDEX "channel.publicIdentifierA_publicIdentifierB_chainId_unique";

-- DropIndex
DROP INDEX "node_index.publicIdentifier_unique";

-- DropIndex
DROP INDEX "update_channelAddress_unique";

-- DropIndex
DROP INDEX "transfer.routingId_channelAddressId_unique";

-- DropIndex
DROP INDEX "transfer_resolveUpdateChannelAddressId_resolveUpdateNonce_unique";

-- DropIndex
DROP INDEX "transfer_createUpdateChannelAddressId_createUpdateNonce_unique";

-- DropIndex
DROP INDEX "onchain_transaction.transactionHash_chainId_unique";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "balance";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "channel";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "configuration";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "event-subscription";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "node_index";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "onchain_transaction";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "transfer";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "update";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Balance" (
    "participant" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "processedDeposit" TEXT NOT NULL,
    "defundNonce" TEXT NOT NULL,
    "channelAddress" TEXT NOT NULL,

    PRIMARY KEY ("participant", "channelAddress", "assetId"),
    FOREIGN KEY ("channelAddress") REFERENCES "Channel" ("channelAddress") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Channel" (
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

-- CreateTable
CREATE TABLE "Update" (
    "channelAddress" TEXT,
    "channelAddressId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromIdentifier" TEXT NOT NULL,
    "toIdentifier" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "amountA" TEXT NOT NULL,
    "amountB" TEXT NOT NULL,
    "toA" TEXT NOT NULL,
    "toB" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "signatureA" TEXT,
    "signatureB" TEXT,
    "totalDepositsAlice" TEXT,
    "totalDepositsBob" TEXT,
    "transferAmountA" TEXT,
    "transferAmountB" TEXT,
    "transferToA" TEXT,
    "transferToB" TEXT,
    "transferId" TEXT,
    "transferDefinition" TEXT,
    "transferTimeout" TEXT,
    "transferInitialState" TEXT,
    "transferEncodings" TEXT,
    "merkleProofData" TEXT,
    "meta" TEXT,
    "responder" TEXT,
    "transferResolver" TEXT,
    "merkleRoot" TEXT,

    PRIMARY KEY ("channelAddressId", "nonce"),
    FOREIGN KEY ("channelAddress") REFERENCES "Channel" ("channelAddress") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transfer" (
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
    FOREIGN KEY ("createUpdateChannelAddressId", "createUpdateNonce") REFERENCES "Update" ("channelAddressId", "nonce") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("resolveUpdateChannelAddressId", "resolveUpdateNonce") REFERENCES "Update" ("channelAddressId", "nonce") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("onchainTransactionId") REFERENCES "OnchainTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("channelAddress") REFERENCES "Channel" ("channelAddress") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event" TEXT NOT NULL,
    "publicIdentifier" TEXT NOT NULL,
    "url" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "OnchainTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" TEXT,
    "nonce" INTEGER,
    "to" TEXT,
    "from" TEXT,
    "data" TEXT,
    "value" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "reason" TEXT NOT NULL,
    "error" TEXT,
    "channelAddress" TEXT NOT NULL,
    FOREIGN KEY ("channelAddress") REFERENCES "Channel" ("channelAddress") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OnchainTransactionAttempt" (
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onchainTransactionId" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL PRIMARY KEY,
    "gasLimit" TEXT NOT NULL,
    "gasPrice" TEXT NOT NULL,
    FOREIGN KEY ("onchainTransactionId") REFERENCES "OnchainTransaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OnchainTransactionReceipt" (
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onchainTransactionId" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL PRIMARY KEY,
    "timestamp" TEXT,
    "raw" TEXT,
    "blockHash" TEXT,
    "blockNumber" INTEGER,
    "contractAddress" TEXT,
    "transactionIndex" INTEGER,
    "root" TEXT,
    "gasUsed" TEXT,
    "logsBloom" TEXT,
    "logs" TEXT,
    "cumulativeGasUsed" TEXT,
    "byzantium" BOOLEAN,
    "status" INTEGER,
    FOREIGN KEY ("onchainTransactionId") REFERENCES "OnchainTransaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Configuration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT
);

-- CreateTable
CREATE TABLE "NodeIndex" (
    "index" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "publicIdentifier" TEXT NOT NULL
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChannelDispute" (
    "channelAddress" TEXT NOT NULL PRIMARY KEY,
    "channelStateHash" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "merkleRoot" TEXT NOT NULL,
    "consensusExpiry" TEXT NOT NULL,
    "defundExpiry" TEXT NOT NULL,
    FOREIGN KEY ("channelAddress") REFERENCES "Channel" ("channelAddress") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChannelDispute" ("channelAddress", "channelStateHash", "nonce", "merkleRoot", "consensusExpiry", "defundExpiry") SELECT "channelAddress", "channelStateHash", "nonce", "merkleRoot", "consensusExpiry", "defundExpiry" FROM "ChannelDispute";
DROP TABLE "ChannelDispute";
ALTER TABLE "new_ChannelDispute" RENAME TO "ChannelDispute";
CREATE TABLE "new_TransferDispute" (
    "transferId" TEXT NOT NULL PRIMARY KEY,
    "transferStateHash" TEXT NOT NULL,
    "transferDisputeExpiry" TEXT NOT NULL,
    "isDefunded" BOOLEAN NOT NULL,
    FOREIGN KEY ("transferId") REFERENCES "Transfer" ("transferId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TransferDispute" ("transferId", "transferStateHash", "transferDisputeExpiry", "isDefunded") SELECT "transferId", "transferStateHash", "transferDisputeExpiry", "isDefunded" FROM "TransferDispute";
DROP TABLE "TransferDispute";
ALTER TABLE "new_TransferDispute" RENAME TO "TransferDispute";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE UNIQUE INDEX "Channel.publicIdentifierA_publicIdentifierB_chainId_unique" ON "Channel"("publicIdentifierA", "publicIdentifierB", "chainId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel.participantA_participantB_chainId_unique" ON "Channel"("participantA", "participantB", "chainId");

-- CreateIndex
CREATE UNIQUE INDEX "Update_channelAddress_unique" ON "Update"("channelAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer.routingId_channelAddressId_unique" ON "Transfer"("routingId", "channelAddressId");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_createUpdateChannelAddressId_createUpdateNonce_unique" ON "Transfer"("createUpdateChannelAddressId", "createUpdateNonce");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_resolveUpdateChannelAddressId_resolveUpdateNonce_unique" ON "Transfer"("resolveUpdateChannelAddressId", "resolveUpdateNonce");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_onchainTransactionId_unique" ON "Transfer"("onchainTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "EventSubscription.publicIdentifier_event_unique" ON "EventSubscription"("publicIdentifier", "event");

-- CreateIndex
CREATE UNIQUE INDEX "OnchainTransactionReceipt_onchainTransactionId_unique" ON "OnchainTransactionReceipt"("onchainTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeIndex.publicIdentifier_unique" ON "NodeIndex"("publicIdentifier");
