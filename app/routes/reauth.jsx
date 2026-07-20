// Top-level route (NOT under app.jsx) so thrown Responses are returned as
// the raw HTTP document, not caught by app.jsx's ErrorBoundary.
//
// When billing fails with a 403 (access token stale/revoked), the billing
// route deletes the stale session and redirects here. We throw an App Bridge
// HTML response that navigates window.top to the Shopify OAuth install URL,
// forcing a full OAuth flow (not Token Exchange) → fresh token with billing
// permissions.
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    throw new Response("Missing shop parameter", { status: 400 });
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
