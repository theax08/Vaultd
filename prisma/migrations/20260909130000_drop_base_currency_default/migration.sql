-- Drop.baseCurrency portait @default("USD") : chaque drop cree se retrouvait
-- estampille dollar quelle que soit la devise reelle de la boutique, et
-- getDropCurrency lit ce champ avant de se rabattre sur la devise boutique.
-- Resultat : un drop LIVE sans commande affichait "$0.00" sur une boutique
-- en euros, puis basculait sur l'euro apres la premiere vente.
ALTER TABLE "Drop" ALTER COLUMN "baseCurrency" DROP DEFAULT;

-- Remise a NULL la ou la valeur ne peut pas etre correcte. Un drop qui a des
-- commandes ne lit jamais baseCurrency (la devise des commandes reelles est
-- prioritaire), donc on ne touche qu'aux drops sans commande, ou "USD" est au
-- mieux une supposition. NULL fait proprement tomber sur la devise boutique.
UPDATE "Drop"
SET "baseCurrency" = NULL
WHERE NOT EXISTS (
  SELECT 1 FROM "DropOrder" o WHERE o."dropId" = "Drop"."id"
);
