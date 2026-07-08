import db from "../db.server";

export const loader = async ({ request }) => {
  const secret = request.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_SUPPORT_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return Response.json({ error: "?shop= required" }, { status: 400 });
  }

  const deleteSession = url.searchParams.get("delete") === "1";

  if (deleteSession) {
    const result = await db.session.deleteMany({ where: { shop } });
    return Response.json({ shop, deleted: result.count });
  }

  const sessions = await db.session.findMany({
    where: { shop },
    select: { id: true, shop: true, isOnline: true, expires: true, accessToken: true },
  });

  return Response.json({
    shop,
    sessionCount: sessions.length,
    sessions: sessions.map((s) => ({
      id: s.id,
      shop: s.shop,
      isOnline: s.isOnline,
      expires: s.expires,
      hasToken: !!s.accessToken,
    })),
  });
};
