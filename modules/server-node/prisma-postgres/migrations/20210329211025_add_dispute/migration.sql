/*
  Warnings:

  - You are about to drop the column `inDispute` on the `channel` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "channel" DROP COLUMN "inDispute";

-- CreateTable
CREATE TABLE "ChannelDispute" (
    "channelAddress" TEXT NOT NULL,
    "channelStateHash" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "merkleRoot" TEXT NOT NULL,
    "consensusExpiry" TEXT NOT NULL,
    "defundExpiry" TEXT NOT NULL,
    "offchainChannelId" TEXT NOT NULL,
    "onchainChannelId" TEXT,

    PRIMARY KEY ("channelAddress")
);

-- CreateTable
CREATE TABLE "TransferDispute" (
    "transferId" TEXT NOT NULL,
    "transferStateHash" TEXT NOT NULL,
    "transferDisputeExpiry" TEXT NOT NULL,
    "isDefunded" BOOLEAN NOT NULL,
    "offchainTransferId" TEXT NOT NULL,
    "onchainTransferId" TEXT,

    PRIMARY KEY ("transferId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelDispute_offchainChannelId_unique" ON "ChannelDispute"("offchainChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelDispute_onchainChannelId_unique" ON "ChannelDispute"("onchainChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferDispute_offchainTransferId_unique" ON "TransferDispute"("offchainTransferId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferDispute_onchainTransferId_unique" ON "TransferDispute"("onchainTransferId");

-- AddForeignKey
ALTER TABLE "ChannelDispute" ADD FOREIGN KEY ("offchainChannelId") REFERENCES "channel"("channelAddress") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelDispute" ADD FOREIGN KEY ("onchainChannelId") REFERENCES "channel"("channelAddress") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferDispute" ADD FOREIGN KEY ("offchainTransferId") REFERENCES "transfer"("transferId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferDispute" ADD FOREIGN KEY ("onchainTransferId") REFERENCES "transfer"("transferId") ON DELETE SET NULL ON UPDATE CASCADE;
