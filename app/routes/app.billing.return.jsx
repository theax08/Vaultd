import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { getAccountForShop, createAccountForShop } from "../vaultd-account.server";
import { PLAN_ORDER, PLAN_LABELS } from "../vaultd-plans";

async function isDevStore(admin) {
  try {
    const res = await admin.graphql(`{ shop { plan { partnerDevelopment } } }`);
    const { data } = await res.json();
    if (data?.shop?.plan?.partnerDevelopment === false) return false;
    return true;
  } catch {
    return true;
  }
}

export const loader = async ({ request }) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const url = new URL(request.url);
  const plan = url.searchParams.get("plan");

  if (!plan || !PLAN_ORDER.includes(plan) || plan === "FREE") {
    return redirect("/app/plans");
  }

  const dbModule = await import("../db.server");
  const db = dbModule.default;

  try {
    const isTest = await isDevStore(admin);
    const check = await billing.check({
      plans: [PLAN_LABELS[plan]],
      isTest,
    });

    if (check.hasActivePayment) {
      let account = await getAccountForShop(shopDomain);
      if (!account) {
        const result = await createAccountForShop(shopDomain);
        account = result.account;
      }
      if (account) {
        await db.vaultdAccount.update({
          where: { id: account.id },
          data: { plan },
        });
      }
      return redirect("/app/plans?billing=confirmed");
    }
  } catch (_) {
    // Le marchand a annule ou le paiement a echoue.
  }

  return redirect("/app/plans?billing=cancelled");
};
