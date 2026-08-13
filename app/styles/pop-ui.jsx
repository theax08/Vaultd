// Vocabulaire visuel "pop" partagé (cartes blanches, badges pilule, en-tête
// custom) — extrait de app.drops-history.jsx / app.live.jsx pour eviter de
// dupliquer les memes hex/radius dans chaque page admin.

import { useEffect, useState } from "react";
import { Link } from "react-router";

export const popFontFamily =
  'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif';

export const highlightMarkStyle = {
  background: "color-mix(in srgb, var(--vaultd-accent, #1a1a1a) 30%, #fff8e1)",
  color: "#1a1a1a",
  borderRadius: 3,
  padding: "0 1px",
};

// Surlignage type "Ctrl+F" : decoupe `text` sur toutes les occurrences
// (insensible a la casse) de `query` et les entoure d'un <mark> teinte de la
// couleur d'accent — le texte reste toujours noir pour garder la lisibilite.
export function HighlightText({ text, query }) {
  if (!query || !query.trim() || typeof text !== "string") return text;
  const safeQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${safeQuery})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.trim().toLowerCase() ? (
      <mark key={i} style={highlightMarkStyle}>
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export function textMatches(text, query) {
  if (!query || !query.trim()) return false;
  return typeof text === "string" && text.toLowerCase().includes(query.trim().toLowerCase());
}

export const pagePopStyle = {
  fontFamily: popFontFamily,
  padding: "20px 20px 32px",
};

export const pageHeaderRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 20,
};

export const pageHeaderTitleRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

export const pageHeaderTitleStyle = {
  fontSize: 20,
  fontWeight: 700,
  color: "var(--vaultd-accent, #1a1a1a)",
  letterSpacing: -0.3,
  margin: 0,
};

// Lien "retour" discret, integre en haut a gauche de la page (au-dessus du
// titre), plutot qu'un bouton encadre au meme niveau que l'icone/titre —
// pour ne pas avoir l'air d'une action au meme rang que le titre de page.
export const backLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 13,
  fontWeight: 600,
  color: "#6d7175",
  textDecoration: "none",
  marginTop: 2,
  marginBottom: 16,
};

// Icone "grille" par defaut (4 carres), reprise de Drop History. Les pages
// peuvent passer un autre <svg> si une icone plus parlante existe.
export function GridIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ color: "var(--vaultd-accent, #505050)" }}
    >
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="11" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="2" y="11" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="11" y="11" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export const card = {
  background: "#ffffff",
  border: 0,
  borderRadius: 10,
  boxShadow: "var(--vd-ring)",
};

export const cardPadded = {
  ...card,
  padding: "16px 18px",
};

export const cardLabel = {
  fontSize: 10.5,
  fontWeight: 700,
  color: "var(--vaultd-accent, #919191)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  marginBottom: 7,
};

const PILL_TONES = {
  success: { background: "#f0fdf4", color: "#007a5a", border: "1px solid #d1fae5" },
  warning: { background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa" },
  neutral: { background: "#f2f2f2", color: "#6d7175", border: "1px solid #e3e3e3" },
};

export function pillBadge(tone = "neutral") {
  return {
    ...(PILL_TONES[tone] ?? PILL_TONES.neutral),
    borderRadius: 20,
    padding: "2px 10px",
    fontSize: 12,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
  };
}

// Le seul systeme de couleur autorise dans l'app (VAULTD-DESIGN.md) : l'etat
// d'un drop. La DB ne connait que DRAFT/LIVE/ENDED — "scheduled" est un
// sous-etat purement visuel (DRAFT + autoLaunch + startTime futur), derive
// ici sans toucher au champ status reel ni a la logique d'auto-launch.
export function getDropDisplayStatus(drop) {
  if (!drop) return "draft";
  if (drop.status === "LIVE") return "live";
  if (drop.status === "ENDED") return "ended";
  if (drop.autoLaunch && drop.startTime && new Date(drop.startTime) > new Date()) {
    return "scheduled";
  }
  return "draft";
}

const DROP_STATUS_LABELS = {
  draft: "Draft",
  scheduled: "Scheduled",
  live: "Live",
  ended: "Ended",
};

// Pastille d'etat — section 4 de VAULTD-DESIGN.md. S'appuie sur les classes
// .vd-pill/.vd-dot injectees via GLOBAL_POP_CSS (le pouls du point "live"
// est une @keyframes, impossible a exprimer en style inline).
export function StatusPill({ status, label }) {
  return (
    <span className={`vd-pill vd-pill--${status}`}>
      <span className="vd-dot" />
      {label ?? DROP_STATUS_LABELS[status] ?? status}
    </span>
  );
}

// Ligne/carte de drop — meme logique de classes que StatusPill, pour le
// listere de 3px sur le bord gauche (section 4 : un ::before, pas un
// border-left, pour ne pas casser le border-radius des autres cotes).
export function dropCardClassName(status, extraClassName = "") {
  return ["vd-drop", `vd-drop--${status}`, extraClassName].filter(Boolean).join(" ");
}

// Chasse fixe tabulaire pour tout ce qui est chiffre (section 3 de
// VAULTD-DESIGN.md) : revenus, stocks, compteurs de file, comptes a rebours,
// pourcentages, durees, IDs de drop, dates numeriques.
export const monoNumberStyle = {
  fontFamily: "var(--vd-mono)",
  fontVariantNumeric: "tabular-nums",
};

export const primaryButtonStyle = {
  background: "var(--vaultd-accent, #1a1a1a)",
  color: "#ffffff",
  border: "none",
  padding: "8px 16px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
};

export const primaryButtonDisabledStyle = {
  ...primaryButtonStyle,
  background: "#bdbdbd",
  cursor: "default",
};

export const secondaryButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 16px",
  border: "1px solid #c9cccf",
  borderRadius: 8,
  background: "#ffffff",
  fontSize: 13,
  fontWeight: 500,
  color: "#303030",
  whiteSpace: "nowrap",
  cursor: "pointer",
};

export const destructiveTextButtonStyle = {
  ...secondaryButtonStyle,
  border: "none",
  background: "transparent",
  color: "#c2410c",
  fontWeight: 600,
};

export function toggleSwitchStyle(checked) {
  return {
    width: 38,
    height: 22,
    borderRadius: 999,
    background: checked ? "var(--vaultd-accent, #1a1a1a)" : "#e3e3e3",
    position: "relative",
    cursor: "pointer",
    transition: "background-color 0.15s ease",
    flexShrink: 0,
    border: "none",
    padding: 0,
  };
}

export const toggleSwitchKnobStyle = (checked) => ({
  position: "absolute",
  top: 2,
  left: checked ? 18 : 2,
  width: 18,
  height: 18,
  borderRadius: "50%",
  background: "#ffffff",
  transition: "left 0.15s ease",
  boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
});

export const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 12px",
  border: "1px solid #c9cccf",
  borderRadius: 8,
  fontSize: 14,
  fontFamily: "inherit",
  color: "#1a1a1a",
  background: "#ffffff",
};

export const textareaStyle = {
  ...inputStyle,
  resize: "vertical",
  fontFamily:
    '"SF Mono","Fira Code",ui-monospace,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
};

export const labelTextStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: "#1a1a1a",
  marginBottom: 6,
  display: "block",
};

export const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

export const modalCardStyle = {
  background: "#ffffff",
  borderRadius: 12,
  boxShadow: "0 4px 24px rgba(0, 0, 0, 0.18)",
  padding: 24,
  width: "480px",
  maxWidth: "90vw",
  maxHeight: "85vh",
  overflowY: "auto",
};

// Injecte une fois dans app.jsx : sans ca, aucun bouton de l'app ne donne de
// retour visuel au clic (les styles sont en JS inline, donc pas de :active
// possible sans une vraie regle CSS globale).
export const GLOBAL_POP_CSS = `
  button:active:not(:disabled) {
    filter: brightness(0.85);
    transform: translateY(1px);
  }
  a:active {
    filter: brightness(0.85);
  }
  input:focus, textarea:focus, select:focus {
    outline: none;
    border-color: var(--vaultd-accent, #1a1a1a) !important;
    box-shadow: 0 0 0 1px var(--vaultd-accent, #1a1a1a);
  }
  input:-webkit-autofill,
  input:-webkit-autofill:hover,
  input:-webkit-autofill:focus {
    -webkit-text-fill-color: #1a1a1a;
    -webkit-box-shadow: 0 0 0px 1000px #ffffff inset;
    box-shadow: 0 0 0px 1000px #ffffff inset;
    transition: background-color 5000s ease-in-out 0s;
  }

  /* VAULTD-DESIGN.md section 4 — pastille d'etat + ligne de drop. Le seul
     systeme de couleur autorise dans l'app : l'etat d'un drop. */
  .vd-pill {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase;
    padding: 3px 9px 3px 7px; border-radius: 5px;
  }
  .vd-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }

  .vd-pill--draft { background: var(--vd-draft-bg); color: var(--vd-draft-fg); }
  .vd-pill--draft .vd-dot { background: transparent; box-shadow: inset 0 0 0 1.5px var(--vd-draft); }

  .vd-pill--scheduled { background: var(--vd-sched-bg); color: var(--vd-sched-fg); }
  .vd-pill--scheduled .vd-dot { background: var(--vd-sched); }

  .vd-pill--live { background: var(--vd-live-bg); color: var(--vd-live-fg); }
  .vd-pill--live .vd-dot { background: var(--vd-live); animation: vd-pulse 1.7s ease-in-out infinite; }

  .vd-pill--ended { background: var(--vd-ended-bg); color: var(--vd-ended-fg); }
  .vd-pill--ended .vd-dot { background: var(--vd-ended); }

  @keyframes vd-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: .35; transform: scale(.8); }
  }
  @media (prefers-reduced-motion: reduce) {
    .vd-pill--live .vd-dot { animation: none; }
  }

  .vd-drop {
    position: relative; overflow: hidden;
    background: var(--vd-card); border: 0;
    border-radius: var(--vd-radius);
    box-shadow: var(--vd-ring);
    transition: box-shadow .15s ease;
  }
  .vd-drop:hover { box-shadow: var(--vd-ring-hover); }
  .vd-drop::before {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  }
  .vd-drop--draft::before     { background: var(--vd-draft); }
  .vd-drop--scheduled::before { background: var(--vd-sched); }
  .vd-drop--live::before      { background: var(--vd-live); }
  .vd-drop--ended::before     { background: var(--vd-ended); }

  /* Emails screen — clickable {{tag}} chips (VAULTD-DESIGN-emails.md 8.4) */
  .vd-tag-chip { transition: box-shadow .12s ease, background-color .12s ease; }
  .vd-tag-chip:hover { background: #ffffff !important; box-shadow: var(--vd-ring-hover); }
`;

export const successBannerStyle = {
  padding: "8px 12px",
  borderRadius: 8,
  backgroundColor: "#f0fdf4",
  color: "#007a5a",
  border: "1px solid #d1fae5",
  fontSize: 13,
  fontWeight: 500,
};

export const errorBannerStyle = {
  padding: "8px 12px",
  borderRadius: 8,
  backgroundColor: "#fff7ed",
  color: "#c2410c",
  border: "1px solid #fed7aa",
  fontSize: 13,
  fontWeight: 500,
};

// Banniere de feedback (succes/erreur) qui se referme seule apres un delai
// proportionnel a la longueur du message (5 a 10s), pour ne pas polluer la
// page avec un message "Changes saved" qui reste affiche indefiniment.
// `dismissKey` doit changer a chaque nouvelle soumission (ex. l'objet
// actionData lui-meme) pour reafficher la banniere a chaque nouveau message.
export function AutoDismissBanner({ message, tone = "success", dismissKey, style }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const delay = Math.min(10000, Math.max(5000, message.length * 80));
    const timer = setTimeout(() => setVisible(false), delay);
    return () => clearTimeout(timer);
  }, [dismissKey, message]);

  if (!visible) return null;

  return (
    <div style={{ ...(tone === "error" ? errorBannerStyle : successBannerStyle), ...style }}>
      {message}
    </div>
  );
}

// Vaultd est entierement payant — sans plan actif, une page feature (Drops,
// Waitlists, Live, Drops History...) doit afficher ceci a la place de son
// contenu reel, plutot que de rediriger (les redirections serveur cassent la
// navigation embarquee et ont deja cause des boucles par le passe).
export function PlanLockedPage({ planName = "Growth", description }) {
  return (
    <div style={{ fontFamily: popFontFamily, minHeight: "100vh", display: "flex" }}>
      <div
        style={{
          ...cardPadded,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "56px 24px",
          borderRadius: 0,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>
          Available on the {planName} plan
        </div>
        <p style={{ fontSize: 13.5, color: "#6d7175", margin: "0 auto 22px", maxWidth: 380 }}>
          {description}
        </p>
        <Link to="/app/plans" style={{ ...primaryButtonStyle, display: "inline-block", textDecoration: "none" }}>
          View plans →
        </Link>
      </div>
    </div>
  );
}
