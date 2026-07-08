import db from "./db.server";
import { sendEmail } from "./email-provider.server";

const SUPPORT_FROM = process.env.SUPPORT_FROM_EMAIL || "Vaultd Support <support@vaultd.app>";
const SUPPORT_NOTIFY = process.env.SUPPORT_NOTIFY_EMAIL || "support@vaultd.app";
const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || "mail.vaultd.app";

function makeTitle(text) {
  const trimmed = text.trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}

export async function listTicketsForShop(shopDomain) {
  return db.supportTicket.findMany({
    where: { shopDomain },
    orderBy: { updatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function getTicketForShop(ticketId, shopDomain) {
  return db.supportTicket.findFirst({
    where: { id: ticketId, shopDomain },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function createTicket({ shopDomain, plan, customerEmail, firstMessages }) {
  const title = makeTitle(firstMessages[0]?.body || "New conversation");
  return db.supportTicket.create({
    data: {
      shopDomain,
      plan,
      customerEmail: customerEmail || null,
      title,
      messages: { create: firstMessages },
    },
    include: { messages: true },
  });
}

export async function appendMessage(ticketId, sender, body) {
  await db.supportMessage.create({ data: { ticketId, sender, body } });
  await db.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
}

export async function resolveTicket(ticketId, shopDomain) {
  await db.supportTicket.updateMany({
    where: { id: ticketId, shopDomain },
    data: { status: "RESOLVED" },
  });
}

// Appele depuis le webhook inbound-email quand l'equipe Vaultd repond par
// email. Ajoute le message cote owner et active le point de notif marchand.
export async function addOwnerReplyToTicket(ticketId, body) {
  const ticket = await db.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, status: true, customerEmail: true, title: true },
  });
  if (!ticket || ticket.status === "RESOLVED") return null;

  await db.supportMessage.create({ data: { ticketId, sender: "owner", body } });
  await db.supportTicket.update({
    where: { id: ticketId },
    data: { updatedAt: new Date(), hasUnreadOwnerReply: true },
  });

  if (ticket.customerEmail) {
    await notifyCustomerOfReply({ customerEmail: ticket.customerEmail, title: ticket.title, body });
  }

  return ticket;
}

// Marque le ticket comme lu (le marchand a vu la reponse).
export async function markTicketRead(ticketId, shopDomain) {
  await db.supportTicket.updateMany({
    where: { id: ticketId, shopDomain },
    data: { hasUnreadOwnerReply: false },
  });
}

// Verifie si la boutique a au moins un ticket avec une reponse non lue.
export async function hasUnreadOwnerReplies(shopDomain) {
  const count = await db.supportTicket.count({
    where: { shopDomain, hasUnreadOwnerReply: true },
  });
  return count > 0;
}

// Notifie l'equipe Vaultd qu'un marchand attend une reponse.
// Le reply-to est un alias unique au ticket — quand l'equipe repond a cet
// email, le webhook inbound-email recoit la reponse et la synchro dans le
// chat in-app automatiquement.
export async function notifyOwnerOfNewMessage({ shopDomain, plan, title, body, ticketId }) {
  const replyTo = `reply+${ticketId}@${INBOUND_DOMAIN}`;
  try {
    await sendEmail({
      to: SUPPORT_NOTIFY,
      from: SUPPORT_FROM,
      replyTo,
      subject: `[Vaultd support · ${plan}] ${shopDomain} — ${title}`,
      html: `<p><strong>Shop:</strong> ${shopDomain}</p><p><strong>Plan:</strong> ${plan}</p><p><strong>Ticket:</strong> ${ticketId}</p><p><strong>Message:</strong></p><p>${body.replace(/</g, "&lt;")}</p><p style="color:#888;font-size:12px">Reply to this email to respond in the in-app chat. Your reply will be delivered to the merchant directly.</p>`,
    });
  } catch (err) {
    console.error("notifyOwnerOfNewMessage failed", err);
  }
}

// Envoie la reponse de l'equipe Vaultd au marchand. Le from est toujours
// "Vaultd Support" pour ne jamais exposer l'adresse personnelle de l'equipe.
export async function notifyCustomerOfReply({ customerEmail, title, body }) {
  if (!customerEmail) return;
  try {
    await sendEmail({
      to: customerEmail,
      from: SUPPORT_FROM,
      subject: `Re: ${title} — Vaultd Support`,
      html: `<p>${body.replace(/</g, "&lt;")}</p><p style="color:#888;font-size:12px;margin-top:16px">You can also reply directly from the Support page inside Vaultd.</p>`,
    });
  } catch (err) {
    console.error("notifyCustomerOfReply failed", err);
  }
}
