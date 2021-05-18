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
-- DropForeignKey
ALTER TABLE "balance" DROP CONSTRAINT "balance_channelAddress_fkey";

-- DropForeignKey
ALTER TABLE "onchain_transaction" DROP CONSTRAINT "onchain_transaction_channelAddress_fkey";

-- DropForeignKey
ALTER TABLE "transfer" DROP CONSTRAINT "transfer_channelAddress_fkey";

-- DropForeignKey
ALTER TABLE "transfer" DROP CONSTRAINT "transfer_createUpdateChannelAddressId_createUpdateNonce_fkey";

-- DropForeignKey
ALTER TABLE "transfer" DROP CONSTRAINT "transfer_resolveUpdateChannelAddressId_resolveUpdateNonce_fkey";

-- DropForeignKey
ALTER TABLE "transfer" DROP CONSTRAINT "transfer_transactionHash_fkey";

-- DropForeignKey
ALTER TABLE "update" DROP CONSTRAINT "update_channelAddress_fkey";

-- DropForeignKey
ALTER TABLE "ChannelDispute" DROP CONSTRAINT "ChannelDispute_channelAddress_fkey";

-- DropForeignKey
ALTER TABLE "TransferDispute" DROP CONSTRAINT "TransferDispute_transferId_fkey";

-- DropTable
DROP TABLE "balance";

-- DropTable
DROP TABLE "channel";

-- DropTable
DROP TABLE "configuration";

-- DropTable
DROP TABLE "event-subscription";

-- DropTable
DROP TABLE "node_index";

-- DropTable
DROP TABLE "onchain_transaction";

-- DropTable
DROP TABLE "transfer";

-- DropTable
DROP TABLE "update";

-- CreateTable
CREATE TABLE "Balance" (
    "participant" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "processedDeposit" TEXT NOT NULL,
    "defundNonce" TEXT NOT NULL,
    "channelAddress" TEXT NOT NULL,

    PRIMARY KEY ("participant","channelAddress","assetId")
);

-- CreateTable
CREATE TABLE "Channel" (
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("channelAddress")
);

-- CreateTable
CREATE TABLE "Update" (
    "channelAddress" TEXT,
    "channelAddressId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

    PRIMARY KEY ("channelAddressId","nonce")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "transferId" TEXT NOT NULL,
    "routingId" TEXT NOT NULL,
    "channelNonce" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

    PRIMARY KEY ("transferId")
);

-- CreateTable
CREATE TABLE "EventSubscription" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "publicIdentifier" TEXT NOT NULL,
    "url" TEXT NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnchainTransaction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" TEXT,
    "nonce" INTEGER,
    "to" TEXT,
    "from" TEXT,
    "data" TEXT,
    "value" TEXT,
    "status" TEXT NOT NULL DEFAULT E'submitted',
    "reason" TEXT NOT NULL,
    "error" TEXT,
    "channelAddress" TEXT NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnchainTransactionAttempt" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onchainTransactionId" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "gasLimit" TEXT NOT NULL,
    "gasPrice" TEXT NOT NULL,

    PRIMARY KEY ("transactionHash")
);

-- CreateTable
CREATE TABLE "OnchainTransactionReceipt" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onchainTransactionId" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
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

    PRIMARY KEY ("transactionHash")
);

-- CreateTable
CREATE TABLE "Configuration" (
    "id" INTEGER NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeIndex" (
    "index" INTEGER NOT NULL,
    "publicIdentifier" TEXT NOT NULL,

    PRIMARY KEY ("index")
);

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

-- AddForeignKey
ALTER TABLE "Balance" ADD FOREIGN KEY ("channelAddress") REFERENCES "Channel"("channelAddress") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Update" ADD FOREIGN KEY ("channelAddress") REFERENCES "Channel"("channelAddress") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD FOREIGN KEY ("createUpdateChannelAddressId", "createUpdateNonce") REFERENCES "Update"("channelAddressId", "nonce") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD FOREIGN KEY ("resolveUpdateChannelAddressId", "resolveUpdateNonce") REFERENCES "Update"("channelAddressId", "nonce") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD FOREIGN KEY ("onchainTransactionId") REFERENCES "OnchainTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD FOREIGN KEY ("channelAddress") REFERENCES "Channel"("channelAddress") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnchainTransaction" ADD FOREIGN KEY ("channelAddress") REFERENCES "Channel"("channelAddress") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnchainTransactionAttempt" ADD FOREIGN KEY ("onchainTransactionId") REFERENCES "OnchainTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnchainTransactionReceipt" ADD FOREIGN KEY ("onchainTransactionId") REFERENCES "OnchainTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelDispute" ADD FOREIGN KEY ("channelAddress") REFERENCES "Channel"("channelAddress") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferDispute" ADD FOREIGN KEY ("transferId") REFERENCES "Transfer"("transferId") ON DELETE CASCADE ON UPDATE CASCADE;
