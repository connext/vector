/*
  Warnings:

  - You are about to drop the column `merkleProofData` on the `update` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_update" (
    "id" TEXT,
    "idSignature" TEXT,
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
CREATE UNIQUE INDEX "update.id_unique" ON "update"("id");
CREATE UNIQUE INDEX "update_channelAddress_unique" ON "update"("channelAddress");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
