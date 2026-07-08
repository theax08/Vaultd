import db from "../db.server";

// Fallback public, utilise par les widgets storefront quand aucun Drop ID
// n'est configure manuellement dans l'editeur de theme.
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shopDomain = (url.searchParams.get("shop") || "").trim();

  if (!shopDomain) {
    return Response.json({ drop: null });
  }

  const drop =
    (await db.drop.findFirst({
      where: { shopDomain, status: "LIVE" },
      orderBy: { startTime: "asc" },
    })) ||
    (await db.drop.findFirst({
      where: { shopDomain, status: "DRAFT", startTime: { not: null } },
      orderBy: { startTime: "asc" },
    }));

  if (!drop) {
    return Response.json({ drop: null });
  }

  return Response.json({
    drop: { id: drop.externalId, name: drop.name },
  });
};
