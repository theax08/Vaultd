-- AlterTable
ALTER TABLE "VaultdAccount" ADD COLUMN     "primaryShopDomain" TEXT;

-- Backfill: the earliest-linked shop on each existing account becomes its
-- primary (the shop that should own plan-tier billing going forward).
UPDATE "VaultdAccount" a
SET "primaryShopDomain" = s."shopDomain"
FROM (
  SELECT DISTINCT ON ("vaultdAccountId") "vaultdAccountId", "shopDomain"
  FROM "ShopSettings"
  WHERE "vaultdAccountId" IS NOT NULL
  ORDER BY "vaultdAccountId", "createdAt" ASC
) s
WHERE a.id = s."vaultdAccountId";
