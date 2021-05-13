/*
  Warnings:

  - You are about to drop the column `confirmedTransactionHash` on the `onchain_transaction` table. All the data in the column will be lost.
  - Added the required column `onchainTransactionId` to the `onchain_transaction_receipt` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "onchain_transaction_confirmedTransactionHash_unique";

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
    FOREIGN KEY ("channelAddress") REFERENCES "channel" ("channelAddress") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_onchain_transaction" ("id", "createdAt", "chainId", "nonce", "to", "from", "data", "value", "status", "reason", "error", "channelAddress") SELECT "id", "createdAt", "chainId", "nonce", "to", "from", "data", "value", "status", "reason", "error", "channelAddress" FROM "onchain_transaction";
DROP TABLE "onchain_transaction";
ALTER TABLE "new_onchain_transaction" RENAME TO "onchain_transaction";
CREATE TABLE "new_onchain_transaction_receipt" (
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
    FOREIGN KEY ("onchainTransactionId") REFERENCES "onchain_transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_onchain_transaction_receipt" ("createdAt", "transactionHash", "timestamp", "raw", "blockHash", "blockNumber", "contractAddress", "transactionIndex", "root", "gasUsed", "logsBloom", "logs", "cumulativeGasUsed", "byzantium", "status") SELECT "createdAt", "transactionHash", "timestamp", "raw", "blockHash", "blockNumber", "contractAddress", "transactionIndex", "root", "gasUsed", "logsBloom", "logs", "cumulativeGasUsed", "byzantium", "status" FROM "onchain_transaction_receipt";
DROP TABLE "onchain_transaction_receipt";
ALTER TABLE "new_onchain_transaction_receipt" RENAME TO "onchain_transaction_receipt";
CREATE UNIQUE INDEX "onchain_transaction_receipt_onchainTransactionId_unique" ON "onchain_transaction_receipt"("onchainTransactionId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
