/*
  Warnings:

  - You are about to drop the column `mnemonic` on the `configuration` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "configuration.mnemonic_unique";

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_configuration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT
);
INSERT INTO "new_configuration" ("id") SELECT "id" FROM "configuration";
DROP TABLE "configuration";
ALTER TABLE "new_configuration" RENAME TO "configuration";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
