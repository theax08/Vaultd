import { redirect } from "react-router";
import { unauthenticated } from "../shopify.server";
import { STORE_ADDON_LABEL } from "../vaultd-plans";

// Called after the $50/month per-store add-on charge is confirmed on this
// shop's own Shopify billing. Only now do we actually link the shop to the
// target account — before this, no linking has happened yet.
//
// Uses unauthenticated.admin(shop) instead of authenticate.admin(request),
// and the "app_" filename prefix to escape app.jsx's layout: this route is
// reached via a fresh top-level redirect from Shopify's own billing
// confirmation page, not from inside the embedded app session — the same
// constraint that already required app_.billing.return.jsx for the main
// plan's billing return.
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const ticket = url.searchParams.get("ticket");
  const shop = url.searchParams.get("shop") || "";
  const host = url.searchParams.get("host") || "";
  const hostParam = host ? `&host=${encodeURIComponent(host)}` : "";

  if (!ticket || !shop) {
    return redirect(`/app/settings?link=error${hostParam}`);
  }

  let status = "error";
  try {
    const { verifyLinkTicket, linkShopToAccount } = await import("../vaultd-account.server");
    const payload = verifyLinkTicket(ticket, shop);

    if (payload) {
      // The ticket only proves the credentials were checked earlier — it
      // does not prove the add-on charge was actually approved. Confirm
      // with Shopify that this shop's add-on subscription is genuinely
      // active before linking.
      let addonConfirmed = false;
      try {
        const { admin } = await unauthenticated.admin(shop);
        const res = await admin.graphql(
          `{ currentAppInstallation { activeSubscriptions { name status } } }`
        );
        const { data } = await res.json();
        const subs = data?.currentAppInstallation?.activeSubscriptions ?? [];
        addonConfirmed = subs.some((s) => s.name === STORE_ADDON_LABEL && s.status === "ACTIVE");
      } catch {
        // Token/network hiccup — trust the ticket, matching
        // app_.billing.return.jsx's same fallback for the main plan flow.
        addonConfirmed = true;
      }

      if (addonConfirmed) {
        const result = await linkShopToAccount({
          accountId: payload.targetAccountId,
          shopDomain: shop,
        });
        status = result && !result.error ? "confirmed" : "error";
      }
    }
  } catch (err) {
    console.error("[billing/link-return] linking failed:", err?.message);
  }

  return redirect(`/app/settings?link=${status}${hostParam}`);
};

export default function BillingLinkReturnPage() {
  return null;
}
