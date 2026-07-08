import db from "../db.server";

// Sert le logo d'une EmailAutomation comme une vraie image HTTP, decodee a
// partir du data: URI base64 stocke en base. Necessaire parce que les
// clients mail (Gmail, Outlook...) bloquent ou cassent les <img src="data:...">
// directement inlines dans le HTML d'un email.
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
  const buffer = Buffer.from(base64Payload, "base64");

  return new Response(buffer, {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=86400",
    },
  });
};
