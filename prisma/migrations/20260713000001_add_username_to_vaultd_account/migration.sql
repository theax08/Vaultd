-- AlterTable
ALTER TABLE "VaultdAccount" ADD COLUMN "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "VaultdAccount_username_key" ON "VaultdAccount"("username");
