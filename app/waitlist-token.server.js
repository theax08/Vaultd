import crypto from "node:crypto";

// Jeton signe (HMAC, sans stockage DB) que le widget storefront recupere
// aupres de NOTRE serveur au chargement de la page et renvoie a
// l'inscription. Remplace le timestamp "rendered_at" precedent, qui etait
// juste une valeur mise dans le formulaire par le navigateur du client —
// donc librement falsifiable par un POST direct sans jamais charger la
// vraie page. Ici, `issuedAt` est fixe par NOUS au moment ou le jeton est
// emis : impossible a forger sans connaitre le secret serveur. Meme
// principe que createLinkTicket dans vaultd-account.server.js.
const WAITLIST_TOKEN_SECRET = process.env.SHOPIFY_API_SECRET || "vaultd-waitlist-token-fallback";

// Au-dela, on prefere qu'un onglet reste ouvert tres longtemps redemande un
// jeton frais (le widget le fait automatiquement en arriere-plan) plutot
// que d'accepter un jeton emis il y a des jours.
const WAITLIST_TOKEN_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function signWaitlistPayload(payloadB64) {
  return crypto.createHmac("sha256", WAITLIST_TOKEN_SECRET).update(payloadB64).digest("base64url").slice(0, 22);
}

export function createWaitlistToken(shopDomain) {
  const payloadB64 = Buffer.from(`wl|${shopDomain}|${Date.now()}`).toString("base64url");
  return `${payloadB64}.${signWaitlistPayload(payloadB64)}`;
}

// Renvoie le timestamp d'emission (ms) si le jeton est valide pour CE shop
// et pas trop vieux, sinon null.
export function verifyWaitlistToken(token, shopDomain) {
  if (!token || !token.includes(".")) return null;
  const [payloadB64, sig] = token.split(".");
  const expectedSig = signWaitlistPayload(payloadB64);
  const sigBuf = Buffer.from(sig || "");
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  let kind, shop, issuedAtStr;
  try {
    [kind, shop, issuedAtStr] = Buffer.from(payloadB64, "base64url").toString().split("|");
  } catch {
    return null;
  }
  const issuedAt = Number(issuedAtStr);
  if (kind !== "wl" || shop !== shopDomain || !issuedAt) return null;
  if (Date.now() - issuedAt > WAITLIST_TOKEN_MAX_AGE_MS) return null;

  return issuedAt;
}
