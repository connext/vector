/*
  Warnings:

  - You are about to drop the column `merkleProofData` on the `update` table. All the data in the column will be lost.
  - Added the required column `encodedCoreState` to the `transfer` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "transfer" ADD COLUMN     "encodedCoreState" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "update" DROP COLUMN "merkleProofData";
