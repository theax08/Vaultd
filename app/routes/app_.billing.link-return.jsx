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
// host isn't carried through the billing round-trip (see app.billing.link-request.jsx
// for why), but the final redirect back into the app still needs it for
// Shopify's embedded-app bounce to re-embed the iframe instead of landing
// bare on the Railway domain. Reconstruct the equivalent value from the shop
// domain, which the ticket always carries.
function hostParamFor(shop) {
  if (!shop) return "";
  const host = Buffer.from(`admin.shopify.com/store/${shop.replace(".myshopify.com", "")}`).toString("base64url");
  return `&host=${encodeURIComponent(host)}`;
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const ticket = url.searchParams.get("ticket");

  if (!ticket) {
    return redirect(`/app/settings?link=error`);
  }

  let status = "error";
  let shop = "";
  try {
    const { decodeLinkTicket, linkShopToAccount } = await import("../vaultd-account.server");
    // No separate ?shop= param (it was pushing returnUrl past Shopify's
    // 255-char limit) — the shop is read straight from the signed ticket.
    const payload = decodeLinkTicket(ticket);

    if (payload) {
      shop = payload.shopDomain;

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

  return redirect(`/app/settings?link=${status}${hostParamFor(shop)}`);
};

export default function BillingLinkReturnPage() {
  return null;
}
