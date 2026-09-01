import { authenticate } from "../shopify.server";
import { PLAN_LABELS, STORE_ADDON_LABEL } from "../vaultd-plans";

// Map "Vaultd Growth" → "GROWTH", etc.
const NAME_TO_KEY = Object.fromEntries(
  Object.entries(PLAN_LABELS).map(([key, label]) => [label, key])
);

const ACTIVE_STATUSES = new Set(["ACTIVE", "PENDING"]);

export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);

  const sub = payload?.app_subscription;
  if (!sub) return new Response(null, { status: 200 });

  const planName = sub.name;
  const status = sub.status;

  const dbModule = await import("../db.server");
  const db = dbModule.default;

  const settings = await db.shopSettings.findUnique({
    where: { shopDomain: shop },
    select: { vaultdAccountId: true, account: { select: { primaryShopDomain: true, plan: true } } },
  });

  if (!settings?.vaultdAccountId) return new Response(null, { status: 200 });

  // Add-on d'une boutique liee a un AUTRE compte Elite : ce n'est pas un
  // changement de palier de plan, ca ne doit jamais toucher le champ `plan`
  // du compte partage (qui pourrait appartenir a une boutique tierce payant
  // le plein tarif). Si l'add-on tombe inactif, on delie juste CETTE
  // boutique — le compte et ses autres boutiques ne sont pas affectes.
  if (planName === STORE_ADDON_LABEL) {
    if (!ACTIVE_STATUSES.has(status)) {
      await db.shopSettings.update({
        where: { shopDomain: shop },
        data: { vaultdAccountId: null },
      });
    }
    return new Response(null, { status: 200 });
  }

  // Nom de subscription non reconnu (ni un palier de plan, ni l'add-on) :
  // on ignore plutot que de reinitialiser le plan par defaut.
  const planKey = NAME_TO_KEY[planName];
  if (!planKey) return new Response(null, { status: 200 });

  // A linked (secondary) store's own plan-tier subscription must never
  // overwrite the shared account's plan — only the primary store's
  // subscription is authoritative for that shared field. Without this, any
  // linked store could independently subscribe/cancel a plan tier and
  // silently downgrade or lock out every other store sharing the account.
  if (settings.account?.primaryShopDomain && settings.account.primaryShopDomain !== shop) {
    console.warn("[billing webhook] ignoring plan-tier update from non-primary shop", shop);
    return new Response(null, { status: 200 });
  }

  if (ACTIVE_STATUSES.has(status)) {
    await db.vaultdAccount.update({
      where: { id: settings.vaultdAccountId },
      data: { plan: planKey },
    });
    return new Response(null, { status: 200 });
  }

  // Switching plans cancels the old subscription and creates a new one
  // (ApplyImmediately replacement) — both webhooks fire within moments of
  // each other with no delivery-order guarantee. If this "cancelled" event
  // for the OLD plan arrives AFTER the "active" event for the NEW plan
  // already updated account.plan, blindly resetting to FREE here would
  // wipe out the plan the merchant just switched to — looking, from the
  // merchant's side, like the plan "removed itself" right after
  // subscribing. Only reset when the account's current plan still matches
  // THIS subscription's plan, so a stale/late event for an
  // already-superseded plan is a safe no-op instead.
  if (settings.account?.plan === planKey) {
    await db.vaultdAccount.update({
      where: { id: settings.vaultdAccountId },
      data: { plan: "FREE" },
    });
  }

  return new Response(null, { status: 200 });
};
