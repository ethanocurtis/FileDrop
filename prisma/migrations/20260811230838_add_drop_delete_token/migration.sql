-- AlterTable
ALTER TABLE "Drop" ADD COLUMN "deleteToken" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Drop_deleteToken_key" ON "Drop"("deleteToken");
