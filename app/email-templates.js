// app/email-templates.js
//
// 4 templates email (confirmation waitlist, rank update, drop live, drop
// ended) qui partagent une coquille HTML commune (header marque + footer).
// Le texte libre (bodyText) est edite par le marchand dans app.emails.jsx ;
// les blocs de donnees (position, stats, boutons CTA) sont fixes et toujours
// remplis avec les vraies valeurs du drop — jamais editables en texte brut.

export function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Remplace les placeholders {{drop_name}}, {{position}}, {{brand_name}}...
 * dans un texte libre (subject ou body edites par le marchand).
 */
export function renderTemplate(text, vars) {
  return String(text || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    return vars[key] != null ? String(vars[key]) : "";
  });
}

function paragraphsHtml(bodyText) {
  return String(bodyText || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) => `
      <p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.6; color: #444444;">
        ${escapeHtml(p).replace(/\n/g, "<br/>")}
      </p>`
    )
    .join("");
}

function infoBox({ label, value, sub, tone = "neutral" }) {
  const palette = {
    neutral: { bg: "#f5f5f7", fg: "#111111" },
    success: { bg: "#e9f9ee", fg: "#0a6b2d" },
    critical: { bg: "#fdecec", fg: "#b42318" },
  }[tone];

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 0 0 16px 0; background-color: ${palette.bg}; border-radius: 12px;">
      <tr>
        <td style="padding: 16px 16px 14px 16px;">
          <div style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #8a8a8a; margin-bottom: 4px;">
            ${escapeHtml(label)}
          </div>
          <div style="font-size: 28px; font-weight: 800; color: ${palette.fg}; margin-bottom: 4px;">
            ${value}
          </div>
          ${sub ? `<div style="font-size: 13px; color: #555555; line-height: 1.5;">${sub}</div>` : ""}
        </td>
      </tr>
    </table>`;
}

function boxRow(boxes) {
  const width = Math.floor(100 / boxes.length);
  const cells = boxes
    .map(
      (b, i) => `
        <td valign="top" width="${width}%" style="padding-${i === 0 ? "right" : "left"}: 6px; padding-bottom: 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f5f5f7; border-radius: 10px;">
            <tr>
              <td style="padding: 12px 12px 10px 12px;">
                <div style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #8a8a8a; margin-bottom: 4px;">
                  ${escapeHtml(b.label)}
                </div>
                <div style="font-size: 13px; font-weight: 600; color: ${b.color || "#111111"};">
                  ${b.value}
                </div>
              </td>
            </tr>
          </table>
        </td>`
    )
    .join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 0 0 16px 0;">
      <tr>${cells}</tr>
    </table>`;
}

function darkBanner(leftHtml, rightHtml) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 0 0 16px 0; background-color: #111111; border-radius: 10px;">
      <tr>
        <td style="padding: 12px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td align="left" style="color: #ffffff; font-size: 13px; font-weight: 700;">${leftHtml}</td>
              <td align="right" style="color: #d0d0d0; font-size: 12px;">${rightHtml}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function ctaButton(href, label, brandColor) {
  if (!href) return "";
  // Pas de "width: 100%" sur le <a> en plus du padding : sur Outlook et pas
  // mal de clients mobiles, ca fait deborder le bouton hors de sa cellule
  // (le padding s'additionne au 100% au lieu de venir de l'interieur). Le
  // <td align="center"> + display:block suffit a occuper toute la largeur
  // disponible sans ce bug.
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 8px 0 16px 0; table-layout: fixed;">
      <tr>
        <td align="center" style="padding: 0;">
          <a href="${escapeHtml(href)}" style="display: block; box-sizing: border-box; text-align: center; text-decoration: none; background-color: ${brandColor || "#1a1a1a"}; color: #ffffff; font-size: 14px; font-weight: 600; padding: 14px 16px; border-radius: 8px;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

function shell({ boutiqueName, boutiqueLogo, brandColor, titleHtml, contentHtml, unsubscribeUrl }) {
  return `
<!DOCTYPE html>
<html lang="en" style="margin:0; padding:0;">
  <head>
    <meta charset="UTF-8" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
  </head>
  <body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111111;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f4f4f4; margin: 0; padding: 24px 0;">
      <tr>
        <td align="center" style="padding: 0 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 640px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e5e5e5;">
            <tr>
              <td style="background-color: ${brandColor || "#1a1a1a"}; height: 4px; line-height: 4px; font-size: 0;">&nbsp;</td>
            </tr>

            <tr>
              <td style="padding: 16px 24px 12px 24px; border-bottom: 1px solid #f0f0f0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td align="left" valign="middle">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          ${boutiqueLogo ? `<td valign="middle">
                            <img src="${escapeHtml(boutiqueLogo)}" alt="${escapeHtml(boutiqueName || "")}" width="32" height="32" style="display: block; border-radius: 999px; object-fit: cover;" />
                          </td>
                          <td width="8" style="font-size: 0;">&nbsp;</td>` : ""}
                          <td valign="middle">
                            <span style="font-size: 16px; font-weight: 700; color: #111111;">${escapeHtml(boutiqueName || "")}</span>
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td align="right" valign="middle" style="font-size: 11px; color: #a0a0a0; white-space: nowrap;">
                      Powered by Vaultd
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding: 24px 24px 20px 24px;">
                <h1 style="margin: 0 0 8px 0; font-size: 26px; line-height: 1.2; font-weight: 800; color: #111111;">
                  ${titleHtml}
                </h1>
                ${contentHtml}
              </td>
            </tr>

            <tr>
              <td style="padding: 16px 24px 20px 24px; border-top: 1px solid #f0f0f0; font-size: 11px; color: #888888;">
                <p style="margin: 0 0 8px 0; line-height: 1.5;">
                  You received this because of your activity on the <strong>${escapeHtml(boutiqueName || "")}</strong> waitlist. If this wasn't you, please
                  ${unsubscribeUrl ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color: #555555; text-decoration: underline;">unsubscribe</a>` : "unsubscribe"}.
                </p>
                <div style="margin: 8px 0; height: 1px; background-color: #e5e5e5;"></div>
                <p style="margin: 8px 0 0 0; text-align: center;">
                  <strong>${escapeHtml(boutiqueName || "")} × Vaultd</strong>
                </p>
              </td>
            </tr>
          </table>
          <div style="height: 24px; line-height: 24px; font-size: 0;">&nbsp;</div>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
}

const REMINDER_PARAGRAPH = `
  <p style="margin: 0 0 0 0; font-size: 12px; line-height: 1.6; color: #8a6116;">
    🕒 Keep an eye on this inbox — when the drop goes live, your personal access link will be sent directly here. Links are time-limited, so act fast when it arrives.
  </p>`;

export function renderWaitlistConfirmationEmail({
  boutiqueName,
  boutiqueLogo,
  brandColor,
  bodyText,
  dropName,
  position,
  unsubscribeUrl,
}) {
  const contentHtml = `
    ${paragraphsHtml(bodyText)}
    ${infoBox({
      label: "Your position",
      value: `#${position}`,
      sub: `on the <strong>${escapeHtml(dropName || "")}</strong> waitlist.`,
    })}
    ${boxRow([
      { label: "Drop", value: escapeHtml(dropName || "") },
      { label: "Status", value: "✓ Confirmed", color: "#176f37" },
    ])}
    ${REMINDER_PARAGRAPH}`;

  return shell({
    boutiqueName,
    boutiqueLogo,
    brandColor,
    titleHtml: "You're in.",
    contentHtml,
    unsubscribeUrl,
  });
}

export function renderWaitlistRankUpdateEmail({
  boutiqueName,
  boutiqueLogo,
  brandColor,
  bodyText,
  dropName,
  position,
  previousPosition,
  unsubscribeUrl,
}) {
  const movedUp = previousPosition != null && position < previousPosition;
  const delta = previousPosition != null ? Math.abs(position - previousPosition) : null;
  const deltaHtml =
    delta != null
      ? `<span style="font-size: 14px; font-weight: 700; color: ${movedUp ? "#0a6b2d" : "#b42318"}; margin-left: 8px;">${movedUp ? "↑" : "↓"} ${movedUp ? "+" : "-"}${delta}</span>`
      : "";

  const contentHtml = `
    ${paragraphsHtml(bodyText)}
    ${infoBox({
      label: "Your position",
      value: `#${position}${deltaHtml}`,
      sub: `on the <strong>${escapeHtml(dropName || "")}</strong> waitlist.`,
      tone: movedUp ? "success" : "critical",
    })}
    ${boxRow([
      { label: "Drop", value: escapeHtml(dropName || "") },
      { label: "Status", value: "✓ Confirmed", color: "#176f37" },
    ])}
    ${REMINDER_PARAGRAPH}`;

  return shell({
    boutiqueName,
    boutiqueLogo,
    brandColor,
    titleHtml: "Your position was updated.",
    contentHtml,
    unsubscribeUrl,
  });
}

export function renderDropLiveEmail({
  boutiqueName,
  boutiqueLogo,
  brandColor,
  bodyText,
  dropName,
  position,
  openedLabel,
  closesInLabel,
  accessLink,
  linkValidHoursLabel,
  maxUnits,
  unsubscribeUrl,
}) {
  const contentHtml = `
    ${paragraphsHtml(bodyText)}
    ${darkBanner(
      `<span style="color:#4ade80;">●</span> LIVE NOW`,
      `Opened ${escapeHtml(openedLabel || "")}${closesInLabel ? ` · Closes in ${escapeHtml(closesInLabel)}` : ""}`
    )}
    ${infoBox({
      label: "Your position",
      value: position != null ? `#${position}` : "—",
      sub: `Priority access${linkValidHoursLabel ? ` — link valid for ${escapeHtml(linkValidHoursLabel)}` : ""}.`,
    })}
    ${ctaButton(accessLink, `→ Access ${dropName || "the drop"}`, brandColor)}
    ${
      linkValidHoursLabel
        ? `<p style="margin: 0 0 16px 0; font-size: 12px; line-height: 1.6; color: #8a6116;">🕒 Your link expires in ${escapeHtml(linkValidHoursLabel)}. After that, your spot goes to the next in line.</p>`
        : ""
    }
    ${boxRow([
      { label: "Drop", value: escapeHtml(dropName || "") },
      { label: "Units available", value: maxUnits != null ? `${maxUnits} items` : "—" },
    ])}`;

  return shell({
    boutiqueName,
    boutiqueLogo,
    brandColor,
    titleHtml: "It's on.",
    contentHtml,
    unsubscribeUrl,
  });
}

export function renderDropEndedEmail({
  boutiqueName,
  boutiqueLogo,
  brandColor,
  bodyText,
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
  const contentHtml = `
    ${paragraphsHtml(bodyText)}
    ${darkBanner(
      `<span style="color:#9aa0a6;">●</span> ${soldOut ? "SOLD OUT" : "PARTIAL"} · DROP CLOSED`,
      escapeHtml(closedAtLabel || "")
    )}
    ${boxRow([
      { label: "Items sold", value: String(itemsSold ?? 0) },
      { label: "Sell-out time", value: escapeHtml(selloutLabel || "—") },
      { label: "On waitlist", value: String(waitlistCount ?? 0) },
    ])}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 0 0 16px 0; background-color: #111111; border-radius: 10px;">
      <tr>
        <td style="padding: 16px 16px 18px 16px;">
          <div style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #9aa0a6; margin-bottom: 6px;">Coming next</div>
          <div style="font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: 4px;">
            ${nextDropName ? escapeHtml(nextDropName) + " is loading." : "Stay tuned for our next drop."}
          </div>
          <div style="font-size: 13px; color: #d0d0d0; margin-bottom: ${nextDropCtaUrl ? "12" : "0"}px;">
            Be first on the list — the waitlist opens soon.
          </div>
          ${
            nextDropCtaUrl
              ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td>
                  <a href="${escapeHtml(nextDropCtaUrl)}" style="display: inline-block; text-decoration: none; background-color: #ffffff; color: #111111; font-size: 13px; font-weight: 600; padding: 10px 16px; border-radius: 8px;">Join the waitlist →</a>
                </td></tr></table>`
              : ""
          }
        </td>
      </tr>
    </table>`;

  return shell({
    boutiqueName,
    boutiqueLogo,
    brandColor,
    titleHtml: "It's a wrap.",
    contentHtml,
    unsubscribeUrl,
  });
}
