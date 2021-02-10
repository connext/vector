-- CreateTable
CREATE TABLE "QueuedUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "channelAddress" TEXT NOT NULL,
    "updateData" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "context" TEXT
);
