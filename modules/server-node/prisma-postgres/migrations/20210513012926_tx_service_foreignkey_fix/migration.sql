/*
  Warnings:

  - You are about to drop the column `confirmedTransactionHash` on the `onchain_transaction` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[onchainTransactionId]` on the table `onchain_transaction_receipt` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `onchainTransactionId` to the `onchain_transaction_receipt` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "onchain_transaction" DROP CONSTRAINT "onchain_transaction_confirmedTransactionHash_fkey";

-- DropIndex
DROP INDEX "onchain_transaction_confirmedTransactionHash_unique";

-- AlterTable
ALTER TABLE "onchain_transaction" DROP COLUMN "confirmedTransactionHash";

-- AlterTable
ALTER TABLE "onchain_transaction_receipt" ADD COLUMN     "onchainTransactionId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "onchain_transaction_receipt_onchainTransactionId_unique" ON "onchain_transaction_receipt"("onchainTransactionId");

-- AddForeignKey
ALTER TABLE "onchain_transaction_receipt" ADD FOREIGN KEY ("onchainTransactionId") REFERENCES "onchain_transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
