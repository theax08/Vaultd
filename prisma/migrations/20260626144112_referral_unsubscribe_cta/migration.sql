-- AlterTable
ALTER TABLE "Drop" ADD COLUMN     "referralPointsPerShare" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "EmailAutomation" ADD COLUMN     "ctaUrl" TEXT;

-- AlterTable
ALTER TABLE "WaitlistEntry" ADD COLUMN     "unsubscribedAt" TIMESTAMP(3);
