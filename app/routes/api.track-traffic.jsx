import db from "../db.server";

const KNOWN_SOURCES = new Set([
  "instagram",
  "tiktok",
  "facebook",
  "twitter",
  "vaultd_email",
  "other",
]);

// Public, appele depuis le storefront (widget waitlist) une fois par visite
// pour alimenter reellement le "Traffic sources" de la live page -- avant
// ce endpoint, la table DropTrafficSource n'etait jamais ecrite nulle part.
export const action = async ({ request }) => {
  try {
    const formData = await request.formData();
    const externalDropId = (formData.get("dropId") || "").toString().trim();
    let source = (formData.get("source") || "other").toString().trim();

    if (!KNOWN_SOURCES.has(source)) source = "other";
    if (!externalDropId) {
      return new Response(JSON.stringify({ success: false }), { status: 400 });
    }

    const drop = await db.drop.findFirst({ where: { externalId: externalDropId } });
    if (!drop) {
      return new Response(JSON.stringify({ success: false }), { status: 404 });
    }

    await db.dropTrafficSource.upsert({
      where: { dropId_source: { dropId: drop.id, source } },
      create: {
        dropId: drop.id,
        shopDomain: drop.shopDomain,
        source,
        visitors: 1,
      },
      update: {
        visitors: { increment: 1 },
      },
    });

    return Response.json({ success: true });
  } catch (err) {
    console.error("track-traffic: failed", err);
    return new Response(JSON.stringify({ success: false }), { status: 500 });
  }
};
