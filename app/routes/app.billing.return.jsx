import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { PLAN_ORDER } from "../vaultd-plans";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan");
  const host = url.searchParams.get("host") || "";

  if (plan && PLAN_ORDER.includes(plan)) {
    try {
      const { getAccountForShop } = await import("../vaultd-account.server");
      const { default: db } = await import("../db.server");
      const account = await getAccountForShop(session.shop);
      if (account) {
        await db.vaultdAccount.update({
          where: { id: account.id },
          data: { plan },
        });
        console.log("[billing/return] plan updated to", plan, "for", session.shop);
      } else {
        // New install: account doesn't exist yet — create it with the selected plan
        const newAccount = await db.vaultdAccount.create({
          data: { plan, lastSeenPlan: plan },
        });
        await db.shopSettings.upsert({
          where: { shopDomain: session.shop },
          create: { shopDomain: session.shop, vaultdAccountId: newAccount.id },
          update: { vaultdAccountId: newAccount.id },
        });
        console.log("[billing/return] created account with plan", plan, "for", session.shop);
      }
    } catch (err) {
      console.error("[billing/return] plan update failed:", err?.message);
    }
  }

  const planParam = plan ? `&plan=${plan}` : "";
  const hostParam = host ? `&host=${encodeURIComponent(host)}` : "";
  throw redirect(`/app/plans?billing=confirmed${planParam}${hostParam}`);
};

export default function BillingReturnPage() {
  return null;
}
