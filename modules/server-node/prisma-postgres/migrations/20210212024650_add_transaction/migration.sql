/*
  Warnings:

  - The migration will add a unique constraint covering the columns `[onchainTransactionId]` on the table `transfer`. If there are existing duplicate values, the migration will fail.

*/
-- AlterTable
ALTER TABLE "transfer" ADD COLUMN     "onchainTransactionId" TEXT,
ADD COLUMN     "transactionHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "transfer.onchainTransactionId_unique" ON "transfer"("onchainTransactionId");

-- AddForeignKey
ALTER TABLE "transfer" ADD FOREIGN KEY ("transactionHash") REFERENCES "onchain_transaction"("transactionHash") ON DELETE SET NULL ON UPDATE CASCADE;
