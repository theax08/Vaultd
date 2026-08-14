-- AlterTable
ALTER TABLE "VaultdAccount" ADD COLUMN     "emailVerifyCode" TEXT,
ADD COLUMN     "emailVerifyCodeExpiresAt" TIMESTAMP(3);
