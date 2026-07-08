import db from "./db.server";

// Honeypot + timing sont toujours actifs (gratuits, invisibles). Turnstile
// est le morceau "Elite" : il faut une cle Cloudflare configuree par le
// marchand dans Vaultd > Settings pour qu'il s'active.
const MIN_SUBMIT_DELAY_MS = 1200;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_PER_IP = 8;

// Fenetre glissante en memoire : suffisant pour une seule instance de
// serveur. Cle = shopDomain + ip.
const submissionLog = new Map();

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

export async function getShopSettings(shopDomain) {
  let settings = await db.shopSettings.findUnique({ where: { shopDomain } });
  if (!settings) {
    settings = await db.shopSettings.create({ data: { shopDomain } });
  }
  return settings;
}

// Honeypot : un champ cache que seuls les bots remplissent.
export function isHoneypotTripped(formData) {
  const value = (formData.get("hp_field") || "").toString().trim();
  return value.length > 0;
}

// Un humain ne peut pas remplir le formulaire en moins de ~1s ; un bot qui
// POST directement sans charger/rendre la page le fait quasi instantanement.
export function isSubmissionTooFast(formData) {
  const renderedAt = Number(formData.get("rendered_at") || 0);
  if (!renderedAt) return true; // champ absent = pas passe par le vrai formulaire
  return Date.now() - renderedAt < MIN_SUBMIT_DELAY_MS;
}

// Limite le nombre d'inscriptions par IP sur une fenetre glissante, pour
// freiner les scripts qui spamment des emails jetables depuis une seule
// machine. Ne bloque pas un reseau partage normal (limite assez large).
export function isRateLimited(request, shopDomain) {
  const ip = getClientIp(request);
  const key = `${shopDomain}::${ip}`;
  const now = Date.now();

  const timestamps = (submissionLog.get(key) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );

  if (timestamps.length >= RATE_LIMIT_MAX_PER_IP) {
    submissionLog.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  submissionLog.set(key, timestamps);
  return false;
}

// Verifie le token Cloudflare Turnstile auprès de l'API Cloudflare.
export async function verifyTurnstileToken(secretKey, token, request) {
  if (!token) return false;
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: secretKey,
          response: token,
          remoteip: getClientIp(request),
        }),
      }
    );
    const data = await res.json();
    return Boolean(data.success);
  } catch (err) {
    console.error("bot-protection: turnstile verify failed", err);
    // Si Cloudflare est injoignable, on ne bloque pas tout le monde pour ca.
    return true;
  }
}

// Point d'entree unique appele par api.waitlist.jsx. Retourne null si la
// soumission est consideree legitime, ou une raison (string) si elle doit
// etre rejetee.
export async function checkBotProtection(request, formData, shopDomain) {
  if (isHoneypotTripped(formData)) return "honeypot";
  if (isSubmissionTooFast(formData)) return "too_fast";
  if (isRateLimited(request, shopDomain)) return "rate_limited";

  const settings = await getShopSettings(shopDomain);
  if (settings.botProtectionEnabled && settings.turnstileSecretKey) {
    const token = (formData.get("cf-turnstile-response") || "").toString();
    const valid = await verifyTurnstileToken(
      settings.turnstileSecretKey,
      token,
      request
    );
    if (!valid) return "turnstile";
  }

  return null;
}
