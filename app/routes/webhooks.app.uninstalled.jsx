import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // If the uninstalled shop was the primary of a multi-store account,
  // nothing else ever reassigns primaryShopDomain — every remaining linked
  // shop's isPrimaryShop check would stay false forever, permanently
  // locking the whole account out of plan changes/cancellation. Hand
  // primary status to another linked shop instead.
  try {
    const settings = await db.shopSettings.findUnique({
      where: { shopDomain: shop },
      include: { account: { include: { shops: true } } },
    });
    const account = settings?.account;
    if (account?.primaryShopDomain === shop) {
      const nextPrimary = account.shops.find((s) => s.shopDomain !== shop);
      if (nextPrimary) {
        await db.vaultdAccount.update({
          where: { id: account.id },
          data: { primaryShopDomain: nextPrimary.shopDomain },
        });
      }
    }
  } catch (err) {
    console.error("[app/uninstalled] primaryShopDomain reassignment failed for", shop, err?.message ?? err);
  }

  return new Response();
};
