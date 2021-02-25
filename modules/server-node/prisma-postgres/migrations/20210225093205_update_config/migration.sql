/*
  Warnings:

  - You are about to drop the column `mnemonic` on the `configuration` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "configuration.mnemonic_unique";

-- AlterTable
ALTER TABLE "configuration" DROP COLUMN "mnemonic";
