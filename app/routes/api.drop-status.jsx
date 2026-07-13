import db from "../db.server";
import { getAccountForShop } from "../vaultd-account.server";
import { PLAN_FEATURES } from "../vaultd-plans";

// Lecture seule, publique (appelee depuis le storefront via l'app proxy).
// Sert a la fois le widget countdown et le widget social proof, pour ne
// garder qu'un seul endroit qui calcule l'etat reel d'un drop.
//
// Cache en memoire avec une courte TTL : avec des gros clients (grosses
// communautes), des centaines/milliers de visiteurs peuvent ouvrir la
// meme page de drop en meme temps et poller toutes les 20s. Sans cache,
// chaque visiteur declenche sa propre requete DB. Avec une TTL de 5s, tous
// les visiteurs d'un meme drop partagent le meme resultat le temps de la
// fenetre, donc le nombre de requetes DB ne depend (presque) plus du
// nombre de visiteurs simultanes, seulement du nombre de drops actifs.
// Limite a connaitre : ce cache est local a chaque instance du serveur ;
// si l'app tourne un jour derriere plusieurs instances, il faudrait un
// cache partage (Redis) pour un effet identique sur toutes les instances.
const CACHE_TTL_MS = 5000;
const statusCache = new Map();

function cacheKey(shopDomain, externalDropId) {
  return shopDomain + "::" + (externalDropId || "__auto__");
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shopDomain = (url.searchParams.get("shop") || "").trim();
  const externalDropId = (url.searchParams.get("dropId") || "").trim();

  if (!shopDomain) {
    return jsonError("Missing shop", 400);
  }

  // Countdown et social proof sont des "hype widgets" Pro+ : sous ce
  // palier on repond comme s'il n'y avait pas de drop, pour que le widget
  // se cache silencieusement sur le storefront au lieu d'afficher une
  // erreur ou des donnees a un visiteur d'une boutique non eligible.
  const account = await getAccountForShop(shopDomain);
  const plan = account?.plan ?? null;
  if (!(PLAN_FEATURES[plan] ?? []).includes("hype_widgets")) {
    return Response.json({ drop: null });
  }

  const key = cacheKey(shopDomain, externalDropId);
  const cached = statusCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.payload, {
      headers: { "Cache-Control": "public, max-age=3" },
    });
  }

  let drop;
  if (externalDropId) {
    drop = await db.drop.findFirst({
      where: { shopDomain, externalId: externalDropId },
    });
  } else {
    // Pas de drop explicite : on prend le LIVE en cours, sinon le prochain
    // DRAFT programme le plus proche dans le temps.
    drop =
      (await db.drop.findFirst({
        where: { shopDomain, status: "LIVE" },
        orderBy: { startTime: "asc" },
      })) ||
      (await db.drop.findFirst({
        where: { shopDomain, status: "DRAFT", startTime: { not: null } },
        orderBy: { startTime: "asc" },
      }));
  }

  if (!drop) {
    const payload = { drop: null };
    statusCache.set(key, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
    return Response.json(payload);
  }

  // Deux requetes legeres et indexees plutot qu'un findMany complet : un
  // count() (O(1) cote DB) pour le total, et un take:4 pour les avatars.
  // Sur un drop a 50k inscrits avec plein de visiteurs qui pollent toutes
  // les 20s, charger toute la table a chaque appel serait couteux en DB.
  const [waitlistCount, recentEntries] = await Promise.all([
    db.waitlistEntry.count({
      where: { dropId: drop.id, unsubscribedAt: null },
    }),
    db.waitlistEntry.findMany({
      where: { dropId: drop.id, unsubscribedAt: null },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { email: true },
    }),
  ]);

  const recentInitials = recentEntries.map((e) =>
    (e.email || "?").trim().charAt(0).toUpperCase()
  );

  const maxWaitlistSize = drop.maxWaitlistSize;
  const capacityPct =
    maxWaitlistSize != null && maxWaitlistSize > 0
      ? Math.min(100, Math.round((waitlistCount / maxWaitlistSize) * 100))
      : null;
  const spotsLeft =
    maxWaitlistSize != null ? Math.max(0, maxWaitlistSize - waitlistCount) : null;

  const payload = {
    drop: {
      id: drop.externalId,
      name: drop.name,
      status: drop.status,
      startTime: drop.startTime,
      endTime: drop.endTime,
      maxWaitlistSize,
    },
    waitlistCount,
    recentInitials,
    capacityPct,
    spotsLeft,
  };
  statusCache.set(key, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
  return Response.json(payload, {
    headers: { "Cache-Control": "public, max-age=3" },
  });
};

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
