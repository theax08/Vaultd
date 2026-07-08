// Construit le lien "Unsubscribe" inclus dans tous les emails marchand.
// L'id de la WaitlistEntry est un cuid opaque, deja utilise publiquement
// comme referralCode pour d'autres entrees, donc reutilisable tel quel ici.
export function buildUnsubscribeUrl(waitlistEntryId) {
  const baseUrl = process.env.SHOPIFY_APP_URL || process.env.APP_URL || "";
  return `${baseUrl}/api/waitlist/unsubscribe?id=${encodeURIComponent(waitlistEntryId)}`;
}

// Construit une vraie URL HTTP pour le logo d'une automation email, au lieu
// d'inserer le data: URI base64 directement dans le HTML. Gmail/Outlook et
// la plupart des clients mail bloquent ou affichent casse les images en
// data: URI -- il faut une URL hebergee pour que le logo s'affiche reellement.
export function buildLogoUrl(automation) {
  if (!automation?.logoUrl) return "";
  const baseUrl = process.env.SHOPIFY_APP_URL || process.env.APP_URL || "";
  return `${baseUrl}/api/logo/${encodeURIComponent(automation.id)}`;
}
