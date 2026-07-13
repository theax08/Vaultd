// Vocabulaire visuel "pop" partagé (cartes blanches, badges pilule, en-tête
// custom) — extrait de app.drops-history.jsx / app.live.jsx pour eviter de
// dupliquer les memes hex/radius dans chaque page admin.

import { useEffect, useState } from "react";

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
  border: "1px solid #e3e3e3",
  borderRadius: 10,
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
