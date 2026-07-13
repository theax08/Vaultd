/*
  Warnings:

  - A unique constraint covering the columns `[dropId,source]` on the table `DropTrafficSource` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Drop" ADD COLUMN     "peakVelocity" DOUBLE PRECISION DEFAULT 0;

-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN     "vaultdAccountId" TEXT;

-- CreateTable
CREATE TABLE "VaultdAccount" (
    "id" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "lastSeenPlan" TEXT NOT NULL DEFAULT 'FREE',
    "appearanceColor" TEXT NOT NULL DEFAULT 'black',
    "email" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "vaultdAccountId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "customerEmail" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "hasUnreadOwnerReply" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PasswordResetCode_vaultdAccountId_idx" ON "PasswordResetCode"("vaultdAccountId");

-- CreateIndex
CREATE INDEX "SupportTicket_shopDomain_updatedAt_idx" ON "SupportTicket"("shopDomain", "updatedAt");

-- CreateIndex
CREATE INDEX "SupportTicket_status_plan_idx" ON "SupportTicket"("status", "plan");

-- CreateIndex
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DropTrafficSource_dropId_source_key" ON "DropTrafficSource"("dropId", "source");

-- AddForeignKey
ALTER TABLE "ShopSettings" ADD CONSTRAINT "ShopSettings_vaultdAccountId_fkey" FOREIGN KEY ("vaultdAccountId") REFERENCES "VaultdAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetCode" ADD CONSTRAINT "PasswordResetCode_vaultdAccountId_fkey" FOREIGN KEY ("vaultdAccountId") REFERENCES "VaultdAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
