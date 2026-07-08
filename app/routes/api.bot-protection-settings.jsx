import { getShopSettings } from "../bot-protection.server";

// Public, appele depuis le storefront via l'app proxy. Ne renvoie jamais la
// cle secrete -- seulement si la protection est active et la cle publique
// (site key) necessaire pour afficher le widget Turnstile.
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shopDomain = (url.searchParams.get("shop") || "").trim();

  if (!shopDomain) {
    return Response.json({ enabled: false, siteKey: null });
  }

  const settings = await getShopSettings(shopDomain);
  const enabled = Boolean(
    settings.botProtectionEnabled && settings.turnstileSiteKey
  );

  return Response.json({
    enabled,
    siteKey: enabled ? settings.turnstileSiteKey : null,
  });
};
