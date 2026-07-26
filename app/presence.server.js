// Presence "live now" en memoire, sans migration Prisma — meme logique que
// le cache court de api.drop-status.jsx : cette donnee est par nature
// ephemere (qui est sur le site LA, maintenant), pas besoin de survivre a
// un redemarrage ni d'etre interrogeable historiquement. Le total cumule
// de visiteurs (utilise dans Drop History) reste dans DropTrafficSource,
// inchange — ceci ne fait qu'ajouter le compteur temps reel affiche sur la
// page Live pendant qu'un drop tourne.
//
// Limite a connaitre (comme le cache de drop-status) : local a chaque
// instance du serveur. Sur plusieurs instances, il faudrait un store
// partage (Redis) pour un compte identique partout.
const ACTIVE_WINDOW_MS = 45 * 1000;
const presenceByDrop = new Map(); // externalDropId -> Map<visitorId, lastSeenMs>

export function recordPresence(externalDropId, visitorId) {
  if (!externalDropId || !visitorId) return;
  let visitors = presenceByDrop.get(externalDropId);
  if (!visitors) {
    visitors = new Map();
    presenceByDrop.set(externalDropId, visitors);
  }
  visitors.set(visitorId, Date.now());
}

export function getActivePresenceCount(externalDropId) {
  if (!externalDropId) return 0;
  const visitors = presenceByDrop.get(externalDropId);
  if (!visitors) return 0;

  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  let count = 0;
  for (const [visitorId, lastSeen] of visitors) {
    if (lastSeen >= cutoff) {
      count++;
    } else {
      visitors.delete(visitorId); // nettoyage opportuniste
    }
  }
  if (visitors.size === 0) presenceByDrop.delete(externalDropId);
  return count;
}
