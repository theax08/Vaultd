import { redirect } from "react-router";
import { unauthenticated } from "../shopify.server";
import { getAccountForShop, createAccountForShop } from "../vaultd-account.server";
import { PLAN_ORDER, PLAN_LABELS } from "../vaultd-plans";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan");
  const shop = url.searchParams.get("shop");

  const shopHandle = shop?.replace(".myshopify.com", "");

  const toAdmin = (path = "") =>
    shopHandle
      ? `https://admin.shopify.com/store/${shopHandle}/apps/${process.env.SHOPIFY_APP_HANDLE || "vaultd"}/app/${path}`
      : `/app/${path}`;

  if (!plan || !PLAN_ORDER.includes(plan) || plan === "FREE" || !shop) {
    return redirect(toAdmin("plans"));
  }

  const dbModule = await import("../db.server");
  const db = dbModule.default;

  try {
    const { admin } = await unauthenticated.admin(shop);

    // Fetch app handle dynamically so the redirect URL is always correct
    let appHandle = process.env.SHOPIFY_APP_HANDLE || null;
    try {
      const appRes = await admin.graphql(`{ app { handle } }`);
      const { data: appData } = await appRes.json();
      if (appData?.app?.handle) appHandle = appData.app.handle;
    } catch {}

    const toAdminWithHandle = (path = "") =>
      shopHandle && appHandle
        ? `https://admin.shopify.com/store/${shopHandle}/apps/${appHandle}/app/${path}`
        : `/app/${path}`;

    // Verify the subscription is active on Shopify
    const res = await admin.graphql(`{
      currentAppInstallation {
        activeSubscriptions { name status }
      }
    }`);
    const { data } = await res.json();
    const subs = data?.currentAppInstallation?.activeSubscriptions ?? [];
    const isActive = subs.some(
      (s) => s.name === PLAN_LABELS[plan] && s.status === "ACTIVE"
    );

    if (isActive) {
      let account = await getAccountForShop(shop);
      if (!account) {
        const result = await createAccountForShop(shop);
        account = result.account;
      }
      if (account) {
        await db.vaultdAccount.update({
          where: { id: account.id },
          data: { plan },
        });
      }
      return redirect(toAdminWithHandle("plans?billing=confirmed"));
    }

    return redirect(toAdminWithHandle("plans?billing=cancelled"));
  } catch (_) {
    return redirect(toAdmin("plans?billing=cancelled"));
  }
};
