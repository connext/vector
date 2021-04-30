/*
  Warnings:

  - You are about to drop the column `merkleProofData` on the `update` table. All the data in the column will be lost.
  - Added the required column `encodedCoreState` to the `transfer` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
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
    "encodedCoreState" TEXT NOT NULL,
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
CREATE TABLE "new_update" (
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
    "meta" TEXT,
    "responder" TEXT,
    "transferResolver" TEXT,
    "merkleRoot" TEXT,

    PRIMARY KEY ("channelAddressId", "nonce"),
    FOREIGN KEY ("channelAddress") REFERENCES "channel" ("channelAddress") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_update" ("channelAddress", "channelAddressId", "createdAt", "fromIdentifier", "toIdentifier", "type", "nonce", "amountA", "amountB", "toA", "toB", "assetId", "signatureA", "signatureB", "totalDepositsAlice", "totalDepositsBob", "transferAmountA", "transferAmountB", "transferToA", "transferToB", "transferId", "transferDefinition", "transferTimeout", "transferInitialState", "transferEncodings", "meta", "responder", "transferResolver", "merkleRoot") SELECT "channelAddress", "channelAddressId", "createdAt", "fromIdentifier", "toIdentifier", "type", "nonce", "amountA", "amountB", "toA", "toB", "assetId", "signatureA", "signatureB", "totalDepositsAlice", "totalDepositsBob", "transferAmountA", "transferAmountB", "transferToA", "transferToB", "transferId", "transferDefinition", "transferTimeout", "transferInitialState", "transferEncodings", "meta", "responder", "transferResolver", "merkleRoot" FROM "update";
DROP TABLE "update";
ALTER TABLE "new_update" RENAME TO "update";
CREATE UNIQUE INDEX "update_channelAddress_unique" ON "update"("channelAddress");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
