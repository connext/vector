-- AlterTable
ALTER TABLE "transfer" ADD COLUMN     "transactionHash" TEXT;

-- AddForeignKey
ALTER TABLE "transfer" ADD FOREIGN KEY ("transactionHash") REFERENCES "onchain_transaction"("transactionHash") ON DELETE SET NULL ON UPDATE CASCADE;
