/*
  Warnings:

  - The primary key for the `update` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `merkleProofData` on the `update` table. All the data in the column will be lost.
  - Added the required column `id` to the `update` table without a default value. This is not possible if the table is not empty.
  - Added the required column `idSignature` to the `update` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_update" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "idSignature" TEXT NOT NULL,
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
    FOREIGN KEY ("channelAddress") REFERENCES "channel" ("channelAddress") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_update" ("channelAddress", "channelAddressId", "createdAt", "fromIdentifier", "toIdentifier", "type", "nonce", "amountA", "amountB", "toA", "toB", "assetId", "signatureA", "signatureB", "totalDepositsAlice", "totalDepositsBob", "transferAmountA", "transferAmountB", "transferToA", "transferToB", "transferId", "transferDefinition", "transferTimeout", "transferInitialState", "transferEncodings", "meta", "responder", "transferResolver", "merkleRoot") SELECT "channelAddress", "channelAddressId", "createdAt", "fromIdentifier", "toIdentifier", "type", "nonce", "amountA", "amountB", "toA", "toB", "assetId", "signatureA", "signatureB", "totalDepositsAlice", "totalDepositsBob", "transferAmountA", "transferAmountB", "transferToA", "transferToB", "transferId", "transferDefinition", "transferTimeout", "transferInitialState", "transferEncodings", "meta", "responder", "transferResolver", "merkleRoot" FROM "update";
DROP TABLE "update";
ALTER TABLE "new_update" RENAME TO "update";
CREATE UNIQUE INDEX "update.channelAddressId_nonce_unique" ON "update"("channelAddressId", "nonce");
CREATE UNIQUE INDEX "update_channelAddress_unique" ON "update"("channelAddress");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
