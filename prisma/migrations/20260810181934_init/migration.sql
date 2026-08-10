-- CreateEnum
CREATE TYPE "DropStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'DELETED');

-- CreateTable
CREATE TABLE "Drop" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "passwordHash" TEXT,
    "maxDownloads" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "burnAfterRead" BOOLEAN NOT NULL DEFAULT false,
    "status" "DropStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Drop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadFile" (
    "id" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "sanitizedFileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "status" "DropStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Drop_shareId_key" ON "Drop"("shareId");

-- CreateIndex
CREATE INDEX "Drop_shareId_idx" ON "Drop"("shareId");

-- CreateIndex
CREATE INDEX "Drop_expiresAt_idx" ON "Drop"("expiresAt");

-- CreateIndex
CREATE INDEX "Drop_status_idx" ON "Drop"("status");

-- CreateIndex
CREATE INDEX "UploadFile_dropId_idx" ON "UploadFile"("dropId");

-- CreateIndex
CREATE INDEX "UploadFile_storageKey_idx" ON "UploadFile"("storageKey");

-- AddForeignKey
ALTER TABLE "UploadFile" ADD CONSTRAINT "UploadFile_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
