import db from "../db.server";

// Sert le logo d'une EmailAutomation comme une vraie image HTTP, decodee a
// partir du data: URI base64 stocke en base. Necessaire parce que les
// clients mail (Gmail, Outlook...) bloquent ou cassent les <img src="data:...">
// directement inlines dans le HTML d'un email.
//
// logoUrl est stocke tel quel depuis le formulaire (app.emails.jsx) — sans
// cette liste blanche, un Content-Type arbitraire (ex: text/html) pourrait
// etre reflete tel quel sur cette route publique et non authentifiee.
// SVG volontairement exclu : un SVG peut contenir du <script> qui s'execute
// si l'URL est ouverte directement dans un navigateur (pas seulement dans un
// <img> d'email) — un marchand pourrait s'en servir pour du XSS stocke sur
// le domaine vaultd.pro.
const ALLOWED_LOGO_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export const loader = async ({ params }) => {
  const automation = await db.emailAutomation.findUnique({
    where: { id: params.automationId },
    select: { logoUrl: true },
  });

  const dataUrl = automation?.logoUrl || "";
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return new Response("Not found", { status: 404 });
  }

  const [, mimeType, base64Payload] = match;
  if (!ALLOWED_LOGO_MIME_TYPES.has(mimeType.toLowerCase())) {
    return new Response("Not found", { status: 404 });
  }
  const buffer = Buffer.from(base64Payload, "base64");

  return new Response(buffer, {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=86400",
    },
  });
};
