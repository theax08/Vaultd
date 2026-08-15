// Top-level route (NOT under app.jsx) so thrown Responses are returned as
// the raw HTTP document, not caught by app.jsx's ErrorBoundary.
//
// When billing fails with a 403 (access token stale/revoked), the billing
// route deletes the stale session and redirects here. We throw an App Bridge
// HTML response that navigates window.top to the Shopify OAuth install URL,
// forcing a full OAuth flow (not Token Exchange) → fresh token with billing
// permissions.
// Un shop qui ne matche pas ce format pourrait rediriger window.top vers un
// domaine arbitraire (open redirect) et, pire, un `shop` contenant
// "</script>" casserait hors du <script> ci-dessous (l'HTML est parse avant
// le JS : la sequence litterale </script> ferme la balise meme a l'interieur
// d'une string JS) pour injecter du HTML/JS arbitraire sur le domaine
// vaultd.pro — un XSS reflechi classique.
const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop || !SHOP_DOMAIN_RE.test(shop)) {
    throw new Response("Missing or invalid shop parameter", { status: 400 });
  }

  const apiKey = process.env.SHOPIFY_API_KEY || "";
  // Shopify's "re-install" URL: triggers a full OAuth consent flow.
  // Using window.open(_top) exits the Shopify Admin iframe first.
  const installUrl = `https://${shop}/admin/oauth/install?client_id=${apiKey}`;
  const appBridgeUrl = "https://cdn.shopify.com/shopifycloud/app-bridge.js";

  throw new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>` +
      `<script data-api-key=${JSON.stringify(apiKey)} src="${appBridgeUrl}"></script>` +
      `<script>window.open(${JSON.stringify(installUrl)},"_top")</script>` +
      `</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
};

export default function ReauthPage() {
  return null;
}
