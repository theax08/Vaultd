import { authenticate } from "../shopify.server";
import { PLAN_LABELS } from "../vaultd-plans";

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
  const planKey = NAME_TO_KEY[planName]; // undefined si FREE ou inconnu

  const dbModule = await import("../db.server");
  const db = dbModule.default;

  const settings = await db.shopSettings.findUnique({
    where: { shopDomain: shop },
    select: { vaultdAccountId: true },
  });

  if (!settings?.vaultdAccountId) return new Response(null, { status: 200 });

  const newPlan = planKey && ACTIVE_STATUSES.has(status) ? planKey : "FREE";

  await db.vaultdAccount.update({
    where: { id: settings.vaultdAccountId },
    data: { plan: newPlan },
  });

  return new Response(null, { status: 200 });
};
