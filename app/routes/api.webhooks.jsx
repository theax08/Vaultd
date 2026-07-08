import { authenticate } from "../shopify.server";
import db from "../db.server";

// Handler unifié pour les 3 webhooks de conformité RGPD Shopify.
// Le topic détermine l'action : data_request (accusé de réception),
// customers/redact (suppression client), shop/redact (suppression boutique).
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  if (topic === "CUSTOMERS_DATA_REQUEST") {
    // Shopify demande qu'on accuse réception. Vaultd ne transmet pas les données
    // directement via API — le marchand est responsable de répondre au client.
  }

  if (topic === "CUSTOMERS_REDACT") {
    const email = payload?.customer?.email;
    if (email) {
      await db.waitlistEntry.deleteMany({
        where: { email, drop: { shopDomain: shop } },
      });
    }
  }

  if (topic === "SHOP_REDACT") {
    // Déclenché 48h après désinstallation : suppression complète de toutes
    // les données du marchand dans l'ordre FK-safe.
    await db.waitlistEntry.deleteMany({ where: { drop: { shopDomain: shop } } });
    await db.dropOrder.deleteMany({ where: { shopDomain: shop } });
    await db.dropProductStats.deleteMany({ where: { shopDomain: shop } });
    await db.dropTrafficSource.deleteMany({ where: { shopDomain: shop } });
    await db.dropEvent.deleteMany({ where: { shopDomain: shop } });
    await db.dropHistory.deleteMany({ where: { shopDomain: shop } });
    await db.drop.deleteMany({ where: { shopDomain: shop } });
    await db.emailAutomation.deleteMany({ where: { shopDomain: shop } });
    await db.supportMessage.deleteMany({ where: { ticket: { shopDomain: shop } } });
    await db.supportTicket.deleteMany({ where: { shopDomain: shop } });
    await db.shopSettings.deleteMany({ where: { shopDomain: shop } });
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
