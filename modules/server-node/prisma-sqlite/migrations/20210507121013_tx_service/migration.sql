/*
  Warnings:

  - You are about to drop the `ChannelDispute` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TransferDispute` table. If the table is not empty, all the data it contains will be lost.
  - The primary key for the `onchain_transaction` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `transactionHash` on the `onchain_transaction` table. All the data in the column will be lost.
  - You are about to drop the column `gasLimit` on the `onchain_transaction` table. All the data in the column will be lost.
  - You are about to drop the column `gasPrice` on the `onchain_transaction` table. All the data in the column will be lost.
  - You are about to drop the column `timestamp` on the `onchain_transaction` table. All the data in the column will be lost.
  - You are about to drop the column `raw` on the `onchain_transaction` table. All the data in the column will be lost.
  - You are about to drop the column `blockHash` on the `onchain_transaction` table. All the data in the column will be lost.
  - You are about to drop the column `blockNumber` on the `onchain_transaction` table. All the data in the column will be lost.
  - You are about to drop the column `contractAddress` on the `onchain_transaction` table. All the data in the column will be lost.
  - You are about to drop the column `transactionIndex` on the `onchain_transaction` table. All the data in the column will be lost.
  - You are about to drop the column `root` on the `onchain_transaction` table. All the data in the column will be lost.
  - You are about to drop the column `gasUsed` on the `onchain_transaction` table. All the data in the column will be lost.
  - You are about to drop the column `logsBloom` on the `onchain_transaction` table. All the data in the column will be lost.
  - You are about to drop the column `logs` on the `onchain_transaction` table. All the data in the column will be lost.
  - You are about to drop the column `cumulativeGasUsed` on the `onchain_transaction` table. All the data in the column will be lost.
  - You are about to drop the column `byzantium` on the `onchain_transaction` table. All the data in the column will be lost.
  - The required column `id` was added to the `onchain_transaction` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- DropIndex
DROP INDEX "onchain_transaction.transactionHash_chainId_unique";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ChannelDispute";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TransferDispute";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "channel_dispute" (
    "channelAddress" TEXT NOT NULL PRIMARY KEY,
    "channelStateHash" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "merkleRoot" TEXT NOT NULL,
    "consensusExpiry" TEXT NOT NULL,
    "defundExpiry" TEXT NOT NULL,
    FOREIGN KEY ("channelAddress") REFERENCES "channel" ("channelAddress") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transfer_dispute" (
    "transferId" TEXT NOT NULL PRIMARY KEY,
    "transferStateHash" TEXT NOT NULL,
    "transferDisputeExpiry" TEXT NOT NULL,
    "isDefunded" BOOLEAN NOT NULL,
    FOREIGN KEY ("transferId") REFERENCES "transfer" ("transferId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "onchain_transaction_attempt" (
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onchainTransactionId" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL PRIMARY KEY,
    "gasLimit" TEXT NOT NULL,
    "gasPrice" TEXT NOT NULL,
    FOREIGN KEY ("onchainTransactionId") REFERENCES "onchain_transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "onchain_transaction_receipt" (
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "status" INTEGER
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_onchain_transaction" (
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
    "confirmedTransactionHash" TEXT,
    FOREIGN KEY ("channelAddress") REFERENCES "channel" ("channelAddress") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("confirmedTransactionHash") REFERENCES "onchain_transaction_receipt" ("transactionHash") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_onchain_transaction" ("to", "from", "data", "value", "chainId", "nonce", "status", "reason", "error", "channelAddress", "createdAt") SELECT "to", "from", "data", "value", "chainId", "nonce", "status", "reason", "error", "channelAddress", "createdAt" FROM "onchain_transaction";
DROP TABLE "onchain_transaction";
ALTER TABLE "new_onchain_transaction" RENAME TO "onchain_transaction";
CREATE UNIQUE INDEX "onchain_transaction_confirmedTransactionHash_unique" ON "onchain_transaction"("confirmedTransactionHash");
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
    FOREIGN KEY ("onchainTransactionId") REFERENCES "onchain_transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("channelAddress") REFERENCES "channel" ("channelAddress") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_transfer" ("transferId", "routingId", "channelNonce", "createdAt", "onchainTransactionId", "transactionHash", "amountA", "amountB", "toA", "toB", "initialStateHash", "channelAddress", "channelAddressId", "createUpdateChannelAddressId", "createUpdateNonce", "resolveUpdateChannelAddressId", "resolveUpdateNonce") SELECT "transferId", "routingId", "channelNonce", "createdAt", "onchainTransactionId", "transactionHash", "amountA", "amountB", "toA", "toB", "initialStateHash", "channelAddress", "channelAddressId", "createUpdateChannelAddressId", "createUpdateNonce", "resolveUpdateChannelAddressId", "resolveUpdateNonce" FROM "transfer";
DROP TABLE "transfer";
ALTER TABLE "new_transfer" RENAME TO "transfer";
CREATE UNIQUE INDEX "transfer.routingId_channelAddressId_unique" ON "transfer"("routingId", "channelAddressId");
CREATE UNIQUE INDEX "transfer_createUpdateChannelAddressId_createUpdateNonce_unique" ON "transfer"("createUpdateChannelAddressId", "createUpdateNonce");
CREATE UNIQUE INDEX "transfer_resolveUpdateChannelAddressId_resolveUpdateNonce_unique" ON "transfer"("resolveUpdateChannelAddressId", "resolveUpdateNonce");
CREATE UNIQUE INDEX "transfer_onchainTransactionId_unique" ON "transfer"("onchainTransactionId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
