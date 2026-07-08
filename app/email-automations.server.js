import { sendEmail } from "./email-provider.server";
import {
  renderTemplate,
  renderWaitlistConfirmationEmail,
  renderWaitlistRankUpdateEmail,
  renderDropLiveEmail,
  renderDropEndedEmail,
} from "./email-templates";

/**
 * Envoi de l'email "Waitlist confirmation"
 */
export async function sendWaitlistConfirmationEmail({
  to,
  boutiqueName,
  boutiqueLogo,
  brandColor,
  subject,
  body,
  dropName,
  position,
  unsubscribeUrl,
}) {
  const vars = { drop_name: dropName, position, brand_name: boutiqueName };
  const html = renderWaitlistConfirmationEmail({
    boutiqueName,
    boutiqueLogo,
    brandColor,
    bodyText: renderTemplate(body, vars),
    dropName,
    position,
    unsubscribeUrl,
  });

  await sendEmail({ to, subject: renderTemplate(subject, vars), html });
}

/**
 * Envoi de l'email "Waitlist rank update"
 */
export async function sendWaitlistRankUpdateEmail({
  to,
  boutiqueName,
  boutiqueLogo,
  brandColor,
  subject,
  body,
  dropName,
  position,
  previousPosition,
  unsubscribeUrl,
}) {
  const vars = { drop_name: dropName, position, brand_name: boutiqueName };
  const html = renderWaitlistRankUpdateEmail({
    boutiqueName,
    boutiqueLogo,
    brandColor,
    bodyText: renderTemplate(body, vars),
    dropName,
    position,
    previousPosition,
    unsubscribeUrl,
  });

  await sendEmail({ to, subject: renderTemplate(subject, vars), html });
}

/**
 * Envoi de l'email "Drop is live"
 */
export async function sendDropLiveEmail({
  to,
  boutiqueName,
  boutiqueLogo,
  brandColor,
  subject,
  body,
  dropName,
  position,
  openedLabel,
  closesInLabel,
  accessLink,
  linkValidHoursLabel,
  maxUnits,
  unsubscribeUrl,
}) {
  const vars = { drop_name: dropName, position, brand_name: boutiqueName, access_link: accessLink };
  const html = renderDropLiveEmail({
    boutiqueName,
    boutiqueLogo,
    brandColor,
    bodyText: renderTemplate(body, vars),
    dropName,
    position,
    openedLabel,
    closesInLabel,
    accessLink,
    linkValidHoursLabel,
    maxUnits,
    unsubscribeUrl,
  });

  await sendEmail({ to, subject: renderTemplate(subject, vars), html });
}

/**
 * Envoi de l'email "Drop ended"
 */
export async function sendDropEndedEmail({
  to,
  boutiqueName,
  boutiqueLogo,
  brandColor,
  subject,
  body,
  dropName,
  soldOut,
  closedAtLabel,
  itemsSold,
  selloutLabel,
  waitlistCount,
  nextDropName,
  nextDropCtaUrl,
  unsubscribeUrl,
}) {
  const vars = { drop_name: dropName, brand_name: boutiqueName };
  const html = renderDropEndedEmail({
    boutiqueName,
    boutiqueLogo,
    brandColor,
    bodyText: renderTemplate(body, vars),
    dropName,
    soldOut,
    closedAtLabel,
    itemsSold,
    selloutLabel,
    waitlistCount,
    nextDropName,
    nextDropCtaUrl,
    unsubscribeUrl,
  });

  await sendEmail({ to, subject: renderTemplate(subject, vars), html });
}
