import crypto from "node:crypto";

// Comparaison a temps constant : `!==` sur des strings s'arrete au premier
// octet different, ce qui fuit (en theorie, via le timing reseau) combien de
// caracteres du bon secret ont ete devines. Faible risque pratique ici, mais
// autant fermer la porte puisque ADMIN_SUPPORT_SECRET protege aussi
// api.admin.set-plan.jsx (attribution de plan gratuite).
export function isValidAdminSecret(provided) {
  const expected = process.env.ADMIN_SUPPORT_SECRET;
  if (!provided || !expected) return false;

  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}
