import db from "./db.server";

// La devise d'une boutique ne change quasi jamais : on la lit une fois via
// l'API Admin puis on la garde sur ShopSettings, au lieu d'interroger
// Shopify a chaque affichage d'un montant.
//
// Retourne null si elle n'a pas pu etre determinee — c'est a l'appelant
// (formatMoney) de decider du repli, pas a cette fonction d'inventer USD.
export async function getShopCurrency(shopDomain, admin) {
  try {
    const settings = await db.shopSettings.findUnique({
      where: { shopDomain },
      select: { currencyCode: true },
    });
    if (settings?.currencyCode) return settings.currencyCode;
  } catch (err) {
    console.error("shop-currency: read failed", shopDomain, err?.message ?? err);
  }

  if (!admin) return null;

  try {
    const res = await admin.graphql(`{ shop { currencyCode } }`);
    const { data } = await res.json();
    const code = data?.shop?.currencyCode || null;
    if (!code) return null;

    await db.shopSettings.upsert({
      where: { shopDomain },
      create: { shopDomain, currencyCode: code },
      update: { currencyCode: code },
    });
    return code;
  } catch (err) {
    console.error("shop-currency: lookup failed", shopDomain, err?.message ?? err);
    return null;
  }
}

// Devise a utiliser pour un drop precis : celle de ses commandes reelles en
// priorite (source la plus fiable, c'est ce que le client a paye), sinon
// celle enregistree sur le drop, sinon celle de la boutique.
export async function getDropCurrency(drop, shopDomain, admin) {
  try {
    const order = await db.dropOrder.findFirst({
      where: { dropId: drop.id },
      select: { currencyCode: true },
    });
    if (order?.currencyCode) return order.currencyCode;
  } catch (err) {
    console.error("shop-currency: drop order lookup failed", drop.id, err?.message ?? err);
  }
  if (drop.baseCurrency) return drop.baseCurrency;
  return getShopCurrency(shopDomain, admin);
}
