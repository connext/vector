-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_transfer" (
    "transferId" TEXT NOT NULL PRIMARY KEY,
    "routingId" TEXT NOT NULL,
    "inDispute" BOOLEAN NOT NULL,
    "channelNonce" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "transactionHash" TEXT,
    FOREIGN KEY ("createUpdateChannelAddressId", "createUpdateNonce") REFERENCES "update" ("channelAddressId", "nonce") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("resolveUpdateChannelAddressId", "resolveUpdateNonce") REFERENCES "update" ("channelAddressId", "nonce") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("transactionHash") REFERENCES "onchain_transaction" ("transactionHash") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("channelAddress") REFERENCES "channel" ("channelAddress") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_transfer" ("transferId", "routingId", "inDispute", "channelNonce", "createdAt", "amountA", "amountB", "toA", "toB", "initialStateHash", "channelAddress", "channelAddressId", "createUpdateChannelAddressId", "createUpdateNonce", "resolveUpdateChannelAddressId", "resolveUpdateNonce") SELECT "transferId", "routingId", "inDispute", "channelNonce", "createdAt", "amountA", "amountB", "toA", "toB", "initialStateHash", "channelAddress", "channelAddressId", "createUpdateChannelAddressId", "createUpdateNonce", "resolveUpdateChannelAddressId", "resolveUpdateNonce" FROM "transfer";
DROP TABLE "transfer";
ALTER TABLE "new_transfer" RENAME TO "transfer";
CREATE UNIQUE INDEX "transfer.routingId_channelAddressId_unique" ON "transfer"("routingId", "channelAddressId");
CREATE UNIQUE INDEX "transfer_createUpdateChannelAddressId_createUpdateNonce_unique" ON "transfer"("createUpdateChannelAddressId", "createUpdateNonce");
CREATE UNIQUE INDEX "transfer_resolveUpdateChannelAddressId_resolveUpdateNonce_unique" ON "transfer"("resolveUpdateChannelAddressId", "resolveUpdateNonce");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
