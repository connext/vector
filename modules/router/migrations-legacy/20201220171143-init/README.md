# Migration `20201220171143-init`

This migration has been generated at 12/20/2020, 5:11:43 PM.
You can check out the [state of the schema](./schema.prisma) after the migration.

## Database Steps

```sql
CREATE TABLE "QueuedUpdate" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channelAddress" TEXT NOT NULL,
    "updateData" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "context" TEXT,

    PRIMARY KEY ("id")
)
```

## Changes

```diff
diff --git schema.prisma schema.prisma
migration ..20201220171143-init
--- datamodel.dml
+++ datamodel.dml
@@ -1,0 +1,19 @@
+generator client {
+  provider      = "prisma-client-js"
+  binaryTargets = ["native"]
+  output        = "./src/generated/db-client"
+}
+
+datasource db {
+  provider = ["postgresql", "sqlite"]
+  url = "***"
+}
+
+model QueuedUpdate {
+  id             String @id @default(uuid())
+  type           String
+  channelAddress String
+  updateData     String
+  status         String
+  context        String?
+}
```


