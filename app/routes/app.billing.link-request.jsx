import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { STORE_ADDON_LABEL } from "../vaultd-plans";

// Triggers the $50/month per-store add-on charge on THIS shop's own Shopify
// billing, right before it joins another store's Elite account. The ticket
// (issued by app.settings.jsx after verifying the target account's
// credentials) proves the merchant already passed that check for this shop.
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const ticket = url.searchParams.get("ticket");

  if (!ticket) {
    return redirect("/app/settings?link=error&debug=missing_ticket");
  }

  const { admin, session, billing } = await authenticate.admin(request);

  const { verifyLinkTicket } = await import("../vaultd-account.server");
  const payload = verifyLinkTicket(ticket, session.shop);
  if (!payload) {
    return redirect("/app/settings?link=error&debug=" + encodeURIComponent("Link request expired. Please try again."));
  }

  const rawBase = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;
  const baseUrl = (rawBase.startsWith("http") ? rawBase : `https://${rawBase}`).replace(/\/$/, "");
  // No &host= here — it roughly doubles returnUrl length once base64-encoded,
  // and Shopify caps returnUrl at 255 chars. /app/settings already derives an
  // equivalent admin base straight from the shop domain when host is absent.
  const returnUrl = `${baseUrl}/app/billing/link-return?ticket=${encodeURIComponent(ticket)}`;

  let isTest = false;
  try {
    const shopRes = await admin.graphql(`{ shop { plan { partnerDevelopment } } }`);
    const { data } = await shopRes.json();
    isTest = data?.shop?.plan?.partnerDevelopment === true;
  } catch {}

  try {
    await billing.request({
      plan: STORE_ADDON_LABEL,
      isTest,
      returnUrl,
    });
    return redirect("/app/settings?link=error&debug=no_redirect");
  } catch (err) {
    if (err instanceof Response && err.status >= 300 && err.status < 400) {
      throw err;
    }

    if (err?.response?.code) {
      const code = err.response.code;
      const body =
        typeof err.response.body === "string" ? err.response.body : JSON.stringify(err.response.body ?? "");
      console.error("[billing/link-request] Shopify API error:", code, body.slice(0, 500));
      return redirect(
        `/app/settings?link=error&debug=${encodeURIComponent(`HTTP ${code}: ${body.slice(0, 120)}`)}`
      );
    }

    const errMsg = err?.message ?? String(err);
    const errData = err?.errorData ? JSON.stringify(err.errorData).slice(0, 300) : "";
    console.error("[billing/link-request] error:", errMsg, errData, "isTest:", isTest);
    return redirect(`/app/settings?link=error&debug=${encodeURIComponent((errMsg + " " + errData).trim().slice(0, 300))}`);
  }
};

export default function BillingLinkRequestPage() {
  return null;
}
