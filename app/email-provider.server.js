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