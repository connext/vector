-- CreateTable
CREATE TABLE "QueuedUpdate" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channelAddress" TEXT NOT NULL,
    "updateData" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "context" TEXT,

    PRIMARY KEY ("id")
);
