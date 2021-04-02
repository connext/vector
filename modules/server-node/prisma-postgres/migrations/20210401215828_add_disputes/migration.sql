/*
  Warnings:

  - You are about to drop the column `inDispute` on the `channel` table. All the data in the column will be lost.
  - You are about to drop the column `inDispute` on the `transfer` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "channel" DROP COLUMN "inDispute";

-- AlterTable
ALTER TABLE "transfer" DROP COLUMN "inDispute";

-- CreateTable
CREATE TABLE "ChannelDispute" (
    "channelAddress" TEXT NOT NULL,
    "channelStateHash" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "merkleRoot" TEXT NOT NULL,
    "consensusExpiry" TEXT NOT NULL,
    "defundExpiry" TEXT NOT NULL,

    PRIMARY KEY ("channelAddress")
);

-- CreateTable
CREATE TABLE "TransferDispute" (
    "transferId" TEXT NOT NULL,
    "transferStateHash" TEXT NOT NULL,
    "transferDisputeExpiry" TEXT NOT NULL,
    "isDefunded" BOOLEAN NOT NULL,

    PRIMARY KEY ("transferId")
);

-- AddForeignKey
ALTER TABLE "ChannelDispute" ADD FOREIGN KEY ("channelAddress") REFERENCES "channel"("channelAddress") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferDispute" ADD FOREIGN KEY ("transferId") REFERENCES "transfer"("transferId") ON DELETE CASCADE ON UPDATE CASCADE;
