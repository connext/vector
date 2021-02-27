/*
  Warnings:

  - You are about to drop the column `providerUrl` on the `channel` table. All the data in the column will be lost.

*/
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
    "inDispute" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_channel" ("channelAddress", "publicIdentifierA", "publicIdentifierB", "participantA", "participantB", "assetIds", "timeout", "nonce", "merkleRoot", "channelFactoryAddress", "transferRegistryAddress", "chainId", "inDispute", "createdAt") SELECT "channelAddress", "publicIdentifierA", "publicIdentifierB", "participantA", "participantB", "assetIds", "timeout", "nonce", "merkleRoot", "channelFactoryAddress", "transferRegistryAddress", "chainId", "inDispute", "createdAt" FROM "channel";
DROP TABLE "channel";
ALTER TABLE "new_channel" RENAME TO "channel";
CREATE UNIQUE INDEX "channel.publicIdentifierA_publicIdentifierB_chainId_unique" ON "channel"("publicIdentifierA", "publicIdentifierB", "chainId");
CREATE UNIQUE INDEX "channel.participantA_participantB_chainId_unique" ON "channel"("participantA", "participantB", "chainId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
