import { redirect } from "react-router";
import { unauthenticated } from "../shopify.server";
import { PLAN_ORDER, PLAN_LABELS } from "../vaultd-plans";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan") || "";
  const shop = url.searchParams.get("shop") || "";
  const host = url.searchParams.get("host") || "";

  const back = new URLSearchParams();
  if (host) back.set("host", host);
  if (shop) back.set("shop", shop);

  if (!plan || !PLAN_ORDER.includes(plan) || !shop) {
    back.set("billing", "error");
    return redirect(`/app/plans?${back}`);
  }

  // Update the plan in our DB, then redirect back into the app. This route
  // has no way to verify the request actually came from Shopify's real
  // billing redirect (no signature, no session) — it's just a GET with
  // plan/shop in the querystring, so anyone could craft this URL directly.
  // The GraphQL check below is the ONLY thing standing between "typed this
  // URL" and "got a paid plan for free" — a verification failure must NOT
  // be treated as success. A legitimate subscription still gets synced
  // moments later regardless, via the signed app_subscriptions/update
  // webhook (webhooks.app.subscriptions.update.jsx), so failing closed here
  // only delays the confirmation banner, it doesn't block real merchants.
  try {
    const { getAccountForShop, createAccountForShop } = await import("../vaultd-account.server");
    const { default: db } = await import("../db.server");

    // Verify with Shopify that the subscription is active.
    let planConfirmed = false;
    let verificationFailed = false;
    try {
      const { admin } = await unauthenticated.admin(shop);
      const res = await admin.graphql(`{
        currentAppInstallation { activeSubscriptions { name status } }
      }`);
      const { data } = await res.json();
      const subs = data?.currentAppInstallation?.activeSubscriptions ?? [];
      planConfirmed = subs.some(
        (s) => s.name === PLAN_LABELS[plan] && s.status === "ACTIVE"
      );
    } catch (err) {
      console.error("[billing/return] verification failed for", shop, err?.message ?? err);
      verificationFailed = true;
    }

    if (verificationFailed) {
      back.set("billing", "error");
      back.set(
        "debug",
        "Could not confirm your subscription right away. If you completed checkout, it'll activate within a minute — refresh this page."
      );
      return redirect(`/app/plans?${back}`);
    }

    if (planConfirmed) {
      let account = await getAccountForShop(shop);
      let isNewAccount = false;
      if (!account) {
        const result = await createAccountForShop(shop);
        account = result?.account ?? null;
        isNewAccount = true;
      }

      // A linked (secondary) store must never overwrite the shared account's
      // plan — that field is shared with the primary store (and any other
      // linked stores), which may already be paying for a different tier.
      if (account && account.primaryShopDomain && account.primaryShopDomain !== shop) {
        back.set("billing", "error");
        back.set(
          "debug",
          "This store shares a plan with another store. Plan changes must be made from the primary store."
        );
        return redirect(`/app/plans?${back}`);
      }

      if (account) {
        await db.vaultdAccount.update({
          where: { id: account.id },
          // lastSeenPlan only on a brand-new account, so this first plan
          // isn't shown as a "newly unlocked" feature on Help. On an
          // existing account, leave lastSeenPlan alone so a genuine
          // upgrade still surfaces what's new.
          data: isNewAccount ? { plan, lastSeenPlan: plan } : { plan },
        });
      }
      back.set("billing", "confirmed");
      back.set("plan", plan);
    } else {
      back.set("billing", "cancelled");
    }
  } catch {
    // DB error — still redirect, congrats banner won't show.
    back.set("billing", "error");
  }

  return redirect(`/app/plans?${back}`);
};

// Required by React Router v7 file-based routing even for redirect-only routes.
export default function BillingReturn() {
  return null;
}
