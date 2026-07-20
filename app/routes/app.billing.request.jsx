import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { PLAN_ORDER, PLAN_LABELS } from "../vaultd-plans";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan");
  const host = url.searchParams.get("host") || "";

  if (!plan || !PLAN_ORDER.includes(plan)) {
    return redirect("/app/plans");
  }

  const { admin, session, billing } = await authenticate.admin(request);

  const rawBase = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;
  const baseUrl = (rawBase.startsWith("http") ? rawBase : `https://${rawBase}`).replace(/\/$/, "");
  const returnUrl = `${baseUrl}/app/billing/return?plan=${plan}&shop=${session.shop}${host ? `&host=${encodeURIComponent(host)}` : ""}`;

  // isTest: true only works on partner development stores. On real stores (even in dev),
  // Shopify may block test subscriptions → 403. Check the store type first.
  let isTest = false;
  try {
    const shopRes = await admin.graphql(`{ shop { plan { partnerDevelopment } } }`);
    const { data } = await shopRes.json();
    isTest = data?.shop?.plan?.partnerDevelopment === true;
  } catch {}

  console.log("[billing] plan:", PLAN_LABELS[plan], "isTest:", isTest, "returnUrl:", returnUrl);

  try {
    await billing.request({
      plan: PLAN_LABELS[plan],
      isTest,
      returnUrl,
    });
    return redirect("/app/plans?billing=error&debug=no_redirect");
  } catch (err) {
    if (err instanceof Response && err.status >= 300 && err.status < 400) {
      console.log("[billing] success — exit-iframe redirect");
      throw err;
    }

    if (err?.response?.code === 403) {
      // 403 on billing is NOT a stale-token issue — the token is valid for other API calls.
      // Deleting the session doesn't help; Token Exchange gives a fresh token that also fails.
      // Most common causes: billing not enabled in Partner Dashboard, or test billing blocked.
      const body =
        typeof err.response.body === "string"
          ? err.response.body
          : JSON.stringify(err.response.body ?? "");
      console.error("[billing] 403 Forbidden — billing blocked (isTest:", isTest, "). body:", body.slice(0, 300));
      return redirect(
        `/app/plans?billing=error&debug=${encodeURIComponent("Billing access denied (403). Check that billing is enabled in your Shopify Partner Dashboard.")}`
      );
    }

    if (err?.response?.code) {
      const code = err.response.code;
      const body =
        typeof err.response.body === "string"
          ? err.response.body
          : JSON.stringify(err.response.body ?? "");
      console.error("[billing] Shopify API error:", code, body.slice(0, 500));
      return redirect(
        `/app/plans?billing=error&debug=${encodeURIComponent(`HTTP ${code}: ${body.slice(0, 120)}`)}`
      );
    }

    const errMsg = err?.message ?? String(err);
    const errData = err?.errorData ? JSON.stringify(err.errorData).slice(0, 200) : "";
    console.error("[billing] error:", errMsg, errData);
    return redirect(
      `/app/plans?billing=error&debug=${encodeURIComponent((errMsg + " " + errData).trim().slice(0, 200))}`
    );
  }
};

export default function BillingRequestPage() {
  return null;
}
