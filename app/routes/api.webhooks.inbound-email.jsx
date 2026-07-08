// Webhook Resend inbound : recu quand l'equipe Vaultd repond par email a un ticket.
//
// Configuration requise :
// 1. Resend → Inbound → ajouter le domaine mail.vaultd.pro
// 2. MX record : mail.vaultd.pro → inbound.resend.com (prio 10)
// 3. INBOUND_EMAIL_DOMAIN=mail.vaultd.pro dans .env
// 4. Webhook URL dans Resend : https://<app>/api/webhooks/inbound-email
// 5. INBOUND_WEBHOOK_SECRET=whsec_... dans .env (secret Svix fourni par Resend)

import { Webhook } from "svix";
import { addOwnerReplyToTicket } from "../support.server";

const INBOUND_SECRET = process.env.INBOUND_WEBHOOK_SECRET;

function extractReplyText(text) {
  if (!text) return "";
  const cutMarkers = [
    /^On .+wrote:$/m,
    /^-----Original Message-----/m,
    /^_{10,}/m,
    /^>{1,}\s/m,
    /^--\s*$/m,
  ];
  let result = text;
  for (const marker of cutMarkers) {
    const match = result.search(marker);
    if (match > 0) result = result.slice(0, match);
  }
  return result.trim();
}

function extractTicketId(toAddresses) {
  for (const addr of toAddresses || []) {
    const email = (addr.email || addr || "").toLowerCase();
    const match = email.match(/^reply\+([a-z0-9]+)@/);
    if (match) return match[1];
  }
  return null;
}

export const action = async ({ request }) => {
  const rawBody = await request.text();

  // Verification de signature Svix (whsec_...) si le secret est configure.
  if (INBOUND_SECRET) {
    const wh = new Webhook(INBOUND_SECRET);
    try {
      wh.verify(rawBody, {
        "svix-id": request.headers.get("svix-id") ?? "",
        "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
        "svix-signature": request.headers.get("svix-signature") ?? "",
      });
    } catch {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // Resend inbound enveloppe dans { type, data }
  const email = payload.data ?? payload;

  const ticketId = extractTicketId(email.to || []);
  if (!ticketId) return new Response("No ticket ID in To address", { status: 422 });

  const replyText = extractReplyText(email.text || "");
  if (!replyText) return new Response("Empty reply body", { status: 422 });

  await addOwnerReplyToTicket(ticketId, replyText);

  return new Response("OK", { status: 200 });
};
