/*
  Warnings:

  - The primary key for the `update` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `merkleProofData` on the `update` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[channelAddressId,nonce]` on the table `update` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `id` to the `update` table without a default value. This is not possible if the table is not empty.
  - Added the required column `idSignature` to the `update` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "onchain_transaction" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "update" DROP CONSTRAINT "update_pkey",
DROP COLUMN "merkleProofData",
ADD COLUMN     "id" TEXT NOT NULL,
ADD COLUMN     "idSignature" TEXT NOT NULL,
ADD PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "update.channelAddressId_nonce_unique" ON "update"("channelAddressId", "nonce");
