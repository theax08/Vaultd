// app/email-provider.server.js
import { Resend } from "resend";

// Vaultd heberge l'envoi pour tous les marchands depuis un domaine unique
// verifie dans Resend (EMAIL_FROM) — les marchands n'ont rien a configurer.
let resend = null;

function getResendClient() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

function extractFromAddress(raw) {
  const match = /<([^>]+)>/.exec(raw || "");
  return match ? match[1] : raw;
}

// Nom d'affichage personnalise par boutique ("Ma Boutique" plutot que
// "Vaultd Drops" pour tout le monde), adresse d'envoi toujours fixe sur le
// domaine verifie Resend (EMAIL_FROM) — RFC 5322 accepte "Nom <adresse>",
// donc le client mail affiche le nom de la boutique sans que le marchand
// ait besoin de verifier son propre domaine.
//
// boutiqueName vient d'un champ que le marchand controle lui-meme
// (brandName) — jamais utilise tel quel dans un header email : un retour a
// la ligne permettrait d'injecter un header arbitraire (ex: Bcc), et un
// `<`/`>` casserait le format "Nom <adresse>" pour y glisser une autre
// adresse a la place de la notre.
export function buildFromHeader(boutiqueName) {
  const baseAddress = extractFromAddress(process.env.EMAIL_FROM) || "no-reply@vaultd.app";
  const cleanName = (boutiqueName || "")
    .replace(/[\r\n]/g, " ")
    .replace(/[<>"]/g, "")
    .trim()
    .slice(0, 78);

  if (!cleanName) {
    return process.env.EMAIL_FROM || baseAddress;
  }
  return `${cleanName} <${baseAddress}>`;
}

/**
 * Envoie un email HTML de base
 * @param {{ to: string, subject: string, html: string, from?: string, replyTo?: string }} params
 */
export async function sendEmail({ to, subject, html, from, replyTo }) {
  const fromAddress = from || process.env.EMAIL_FROM || "no-reply@vaultd.app";

  if (!process.env.RESEND_API_KEY) {
    console.error("sendEmail: RESEND_API_KEY is not set, skipping send to", to);
    return;
  }

  const resendClient = getResendClient();
  if (!resendClient) {
    return;
  }

  const { error } = await resendClient.emails.send({
    from: fromAddress,
    to,
    subject,
    html,
    ...(replyTo ? { reply_to: replyTo } : {}),
  });

  if (error) {
    console.error("sendEmail: Resend error for", to, error);
    throw new Error(error.message || "Resend send failed");
  }
}