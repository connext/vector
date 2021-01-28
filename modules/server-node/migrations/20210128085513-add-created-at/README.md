# Migration `20210128085513-add-created-at`

This migration has been generated at 1/28/2021, 8:55:13 AM.
You can check out the [state of the schema](./schema.prisma) after the migration.

## Database Steps

```sql
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_channel" (
    "channelAddress" TEXT NOT NULL,
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
    "providerUrl" TEXT NOT NULL,
    "inDispute" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("channelAddress")
);
INSERT INTO "new_channel" ("channelAddress", "publicIdentifierA", "publicIdentifierB", "participantA", "participantB", "assetIds", "timeout", "nonce", "merkleRoot", "channelFactoryAddress", "transferRegistryAddress", "chainId", "providerUrl", "inDispute") SELECT "channelAddress", "publicIdentifierA", "publicIdentifierB", "participantA", "participantB", "assetIds", "timeout", "nonce", "merkleRoot", "channelFactoryAddress", "transferRegistryAddress", "chainId", "providerUrl", "inDispute" FROM "channel";
DROP TABLE "channel";
ALTER TABLE "new_channel" RENAME TO "channel";
CREATE UNIQUE INDEX "channel.publicIdentifierA_publicIdentifierB_chainId_unique" ON "channel"("publicIdentifierA", "publicIdentifierB", "chainId");
CREATE UNIQUE INDEX "channel.participantA_participantB_chainId_unique" ON "channel"("participantA", "participantB", "chainId");
CREATE TABLE "new_onchain_transaction" (
    "transactionHash" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "gasLimit" TEXT NOT NULL,
    "gasPrice" TEXT NOT NULL,
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
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "reason" TEXT NOT NULL,
    "error" TEXT,
    "channelAddress" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY ("channelAddress") REFERENCES "channel"("channelAddress") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("transactionHash")
);
INSERT INTO "new_onchain_transaction" ("transactionHash", "to", "from", "data", "value", "chainId", "nonce", "gasLimit", "gasPrice", "timestamp", "raw", "blockHash", "blockNumber", "contractAddress", "transactionIndex", "root", "gasUsed", "logsBloom", "logs", "cumulativeGasUsed", "byzantium", "status", "reason", "error", "channelAddress") SELECT "transactionHash", "to", "from", "data", "value", "chainId", "nonce", "gasLimit", "gasPrice", "timestamp", "raw", "blockHash", "blockNumber", "contractAddress", "transactionIndex", "root", "gasUsed", "logsBloom", "logs", "cumulativeGasUsed", "byzantium", "status", "reason", "error", "channelAddress" FROM "onchain_transaction";
DROP TABLE "onchain_transaction";
ALTER TABLE "new_onchain_transaction" RENAME TO "onchain_transaction";
CREATE UNIQUE INDEX "onchain_transaction.transactionHash_chainId_unique" ON "onchain_transaction"("transactionHash", "chainId");
CREATE TABLE "new_transfer" (
    "transferId" TEXT NOT NULL,
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

    FOREIGN KEY ("createUpdateChannelAddressId","createUpdateNonce") REFERENCES "update"("channelAddressId","nonce") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("resolveUpdateChannelAddressId","resolveUpdateNonce") REFERENCES "update"("channelAddressId","nonce") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("channelAddress") REFERENCES "channel"("channelAddress") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("transferId")
);
INSERT INTO "new_transfer" ("transferId", "routingId", "amountA", "amountB", "toA", "toB", "initialStateHash", "channelAddress", "channelAddressId", "createUpdateChannelAddressId", "createUpdateNonce", "resolveUpdateChannelAddressId", "resolveUpdateNonce", "inDispute", "channelNonce") SELECT "transferId", "routingId", "amountA", "amountB", "toA", "toB", "initialStateHash", "channelAddress", "channelAddressId", "createUpdateChannelAddressId", "createUpdateNonce", "resolveUpdateChannelAddressId", "resolveUpdateNonce", "inDispute", "channelNonce" FROM "transfer";
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
    "merkleProofData" TEXT,
    "meta" TEXT,
    "responder" TEXT,
    "transferResolver" TEXT,
    "merkleRoot" TEXT,

    FOREIGN KEY ("channelAddress") REFERENCES "channel"("channelAddress") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("channelAddressId","nonce")
);
INSERT INTO "new_update" ("channelAddress", "channelAddressId", "fromIdentifier", "toIdentifier", "type", "nonce", "amountA", "amountB", "toA", "toB", "assetId", "signatureA", "signatureB", "totalDepositsAlice", "totalDepositsBob", "transferAmountA", "transferAmountB", "transferToA", "transferToB", "transferId", "transferDefinition", "transferTimeout", "transferInitialState", "transferEncodings", "merkleProofData", "meta", "responder", "transferResolver", "merkleRoot") SELECT "channelAddress", "channelAddressId", "fromIdentifier", "toIdentifier", "type", "nonce", "amountA", "amountB", "toA", "toB", "assetId", "signatureA", "signatureB", "totalDepositsAlice", "totalDepositsBob", "transferAmountA", "transferAmountB", "transferToA", "transferToB", "transferId", "transferDefinition", "transferTimeout", "transferInitialState", "transferEncodings", "merkleProofData", "meta", "responder", "transferResolver", "merkleRoot" FROM "update";
DROP TABLE "update";
ALTER TABLE "new_update" RENAME TO "update";
CREATE UNIQUE INDEX "update_channelAddress_unique" ON "update"("channelAddress");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON

PRAGMA foreign_keys=off;
DROP TABLE "QueuedUpdate";
PRAGMA foreign_keys=on
```

## Changes

```diff
diff --git schema.prisma schema.prisma
migration 20201219012400-queued-update..20210128085513-add-created-at
--- datamodel.dml
+++ datamodel.dml
@@ -1,12 +1,13 @@
 generator client {
   provider      = "prisma-client-js"
   binaryTargets = ["native"]
+  output        = "./src/generated/db-client"
 }
 datasource db {
   provider = ["postgresql", "sqlite"]
-  url = "***"
+  url = "***"
 }
 model Balance {
   participant      String
@@ -41,8 +42,10 @@
   inDispute               Boolean
   activeTransfers Transfer[]
+  createdAt DateTime @default(now())
+
   OnchainTransaction OnchainTransaction[]
   @@unique([publicIdentifierA, publicIdentifierB, chainId])
   @@unique([participantA, participantB, chainId])
   @@map(name: "channel")
@@ -52,8 +55,9 @@
   // COMMON PARAMS
   channelAddress   String?
   channel          Channel? @relation(fields: [channelAddress], references: [channelAddress])
   channelAddressId String // required for ID so that relation can be removed
+  createdAt        DateTime @default(now())
   fromIdentifier String
   toIdentifier   String
   type           String
@@ -101,11 +105,13 @@
   @@map(name: "update")
 }
 model Transfer {
-  transferId String  @id
-  routingId  String
-  inDispute  Boolean
+  transferId   String   @id
+  routingId    String
+  inDispute    Boolean
+  channelNonce Int
+  createdAt    DateTime @default(now())
   createUpdate  Update? @relation(name: "CreatedTransfer", fields: [createUpdateChannelAddressId, createUpdateNonce], references: [channelAddressId, nonce])
   resolveUpdate Update? @relation(name: "ResolvedTransfer", fields: [resolveUpdateChannelAddressId, resolveUpdateNonce], references: [channelAddressId, nonce])
@@ -175,8 +181,10 @@
   error          String?
   channelAddress String
   channel        Channel @relation(fields: [channelAddress], references: [channelAddress])
+  createdAt DateTime @default(now())
+
   @@unique([transactionHash, chainId])
   @@map(name: "onchain_transaction")
 }
@@ -192,14 +200,4 @@
   publicIdentifier String @unique
   @@map(name: "node_index")
 }
-
-// Router Models
-model QueuedUpdate {
-  id             String @id @default(uuid())
-  type           String
-  channelAddress String
-  updateData     String
-  status         String
-  context        String?
-}
```


