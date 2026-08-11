-- CreateEnum
CREATE TYPE "P2pStatus" AS ENUM ('WAITING', 'CONNECTED', 'COMPLETED', 'EXPIRED');

-- CreateTable
CREATE TABLE "P2pTransfer" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "P2pStatus" NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "P2pTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "P2pTransfer_shareId_key" ON "P2pTransfer"("shareId");

-- CreateIndex
CREATE INDEX "P2pTransfer_shareId_idx" ON "P2pTransfer"("shareId");

-- CreateIndex
CREATE INDEX "P2pTransfer_expiresAt_idx" ON "P2pTransfer"("expiresAt");

-- CreateIndex
CREATE INDEX "P2pTransfer_status_idx" ON "P2pTransfer"("status");
