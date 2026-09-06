-- AlterTable
ALTER TABLE "Drop" ADD COLUMN "earlyAccessEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "earlyAccessThreshold" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN "earlyAccessMinutesBefore" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN "earlyAccessSentAt" TIMESTAMP(3),
ADD COLUMN "storePassword" TEXT;
