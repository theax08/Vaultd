import crypto from "node:crypto";

// Verifie qu'une requete adressee a un endpoint storefront (api.waitlist.jsx,
// api.drop-status.jsx, etc.) est bien passee par le vrai App Proxy Shopify,
// pas juste appelee directement sur notre propre domaine avec un `shop=`
// invente. Sans ca, n'importe qui pouvait interroger les donnees (statut de
// drop, initiales de la waitlist...) de N'IMPORTE QUELLE boutique Vaultd en
// sautant completement la boutique/le proxy.
//
// Algorithme documente par Shopify (shopify.dev/docs/apps/build/online-store/
// app-proxies/authenticate-app-proxies) : retirer "signature", regrouper les
// valeurs multiples avec des virgules, trier les paires "cle=valeur" par
// ordre alphabetique, les concatener SANS separateur, puis HMAC-SHA256 avec
// le client secret de l'app, encode en hex.
export function verifyAppProxySignature(url) {
  const signature = url.searchParams.get("signature");
  if (!signature) return false;

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) return false;

  const grouped = new Map();
  for (const [key, value] of url.searchParams.entries()) {
    if (key === "signature") continue;
    grouped.set(key, grouped.has(key) ? `${grouped.get(key)},${value}` : value);
  }

  const message = [...grouped.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("");

  const computed = crypto.createHmac("sha256", secret).update(message).digest("hex");

  const sigBuf = Buffer.from(signature);
  const computedBuf = Buffer.from(computed);
  if (sigBuf.length !== computedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, computedBuf);
}
