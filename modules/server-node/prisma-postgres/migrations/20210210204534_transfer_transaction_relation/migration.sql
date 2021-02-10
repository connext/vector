/*
  Warnings:

  - The migration will add a unique constraint covering the columns `[transactionHash]` on the table `onchain_transaction`. If there are existing duplicate values, the migration will fail.

*/
-- AlterTable
ALTER TABLE "transfer" ADD COLUMN     "transactionHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "onchain_transaction.transactionHash_unique" ON "onchain_transaction"("transactionHash");

-- AddForeignKey
ALTER TABLE "transfer" ADD FOREIGN KEY ("transactionHash") REFERENCES "onchain_transaction"("transactionHash") ON DELETE SET NULL ON UPDATE CASCADE;
