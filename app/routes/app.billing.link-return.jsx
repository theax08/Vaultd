import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

// Called after the $50/month per-store add-on charge is confirmed on this
// shop's own Shopify billing. Only now do we actually link the shop to the
// target account — before this, no linking has happened yet.
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const ticket = url.searchParams.get("ticket");
  const host = url.searchParams.get("host") || "";

  let linkResult = null;
  if (ticket) {
    try {
      const { verifyLinkTicket, linkShopToAccount } = await import("../vaultd-account.server");
      const payload = verifyLinkTicket(ticket, session.shop);
      if (payload) {
        linkResult = await linkShopToAccount({
          accountId: payload.targetAccountId,
          shopDomain: session.shop,
        });
      }
    } catch (err) {
      console.error("[billing/link-return] linking failed:", err?.message);
    }
  }

  const hostParam = host ? `&host=${encodeURIComponent(host)}` : "";
  const status = linkResult && !linkResult.error ? "confirmed" : "error";
  throw redirect(`/app/settings?link=${status}${hostParam}`);
};

export default function BillingLinkReturnPage() {
  return null;
}
