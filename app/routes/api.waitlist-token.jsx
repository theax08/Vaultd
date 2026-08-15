import { createWaitlistToken } from "../waitlist-token.server";
import { verifyAppProxySignature } from "../verify-app-proxy.server";

// Public, appele depuis le storefront via l'app proxy au chargement de la
// page (voir waitlist-form.liquid). Emet un jeton signe que le widget
// renverra a l'inscription pour prouver que la requete est bien passee par
// notre serveur avant l'envoi, au lieu d'un timestamp en clair falsifiable.
export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (!verifyAppProxySignature(url)) {
    return Response.json({ token: null }, { status: 401 });
  }

  const shopDomain = (url.searchParams.get("shop") || "").trim();

  if (!shopDomain) {
    return Response.json({ token: null });
  }

  return Response.json({ token: createWaitlistToken(shopDomain) });
};
