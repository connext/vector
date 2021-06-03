/*
  Warnings:

  - You are about to drop the column `merkleProofData` on the `update` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[id]` on the table `update` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "onchain_transaction" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "update" DROP COLUMN "merkleProofData",
ADD COLUMN     "id" TEXT,
ADD COLUMN     "idSignature" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "update.id_unique" ON "update"("id");
