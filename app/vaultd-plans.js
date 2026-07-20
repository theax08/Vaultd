// Constantes de plans/fonctionnalites partagees entre code serveur et
// composants client (donc PAS dans vaultd-account.server.js — un fichier
// .server est retire du bundle client par React Router, ce qui casse les
// imports utilises directement dans le JSX d'une route).

// Tous les plans sont payants — pas de plan gratuit.
// L'app est completement verrouillée sans abonnement actif.
export const PLAN_ORDER = ["GROWTH", "PRO", "SCALE", "ELITE"];

export const PLAN_LABELS = {
  GROWTH: "Vaultd Growth",
  PRO: "Vaultd Pro",
  SCALE: "Vaultd Scale",
  ELITE: "Vaultd Elite",
};

export const PLAN_PRICES = {
  GROWTH: "$49/month",
  PRO: "$149/month",
  SCALE: "$299/month",
  ELITE: "$499/month",
};

// Limites reelles appliquees par plan. null = illimite.
export const PLAN_LIMITS = {
  GROWTH: { maxDropsPerMonth: 3, maxUnitsPerDrop: 200 },
  PRO: { maxDropsPerMonth: 10, maxUnitsPerDrop: 500 },
  SCALE: { maxDropsPerMonth: null, maxUnitsPerDrop: 1500 },
  ELITE: { maxDropsPerMonth: null, maxUnitsPerDrop: null },
};

// Fonctionnalites debloquees a chaque palier, cumulatif (un plan herite de
// toutes les cles des paliers inferieurs).
const PLAN_FEATURE_ADDITIONS = {
  GROWTH: ["waitlist", "waitlist_limit", "drop_history", "hype_widgets"],
  PRO: ["automated_emails", "color_blue", "color_red"],
  SCALE: ["automatic_launch", "unlimited_drops", "color_violet"],
  ELITE: ["bot_protection", "multi_store", "priority_support", "color_gold"],
};

const FEATURE_LABELS = {
  waitlist: "Waitlist",
  waitlist_limit: "Waitlist size limit",
  drop_history: "Drop history & analytics",
  hype_widgets: "Hype building widgets",
  automated_emails: "Automated customer emails",
  automatic_launch: "Automatic launch & close",
  bot_protection: "Bot protection",
  multi_store: "Multi-store accounts",
  priority_support: "Priority support",
  color_blue: "Blue accent color",
  color_red: "Red accent color",
  color_violet: "Violet accent color",
  color_gold: "Gold accent color",
};

export const PLAN_FEATURES = (() => {
  const result = {};
  let cumulative = [];
  for (const plan of PLAN_ORDER) {
    cumulative = [...cumulative, ...PLAN_FEATURE_ADDITIONS[plan]];
    result[plan] = cumulative;
  }
  return result;
})();

function dropsLine(plan) {
  const limits = PLAN_LIMITS[plan];
  if (!limits) return null;
  const n = limits.maxDropsPerMonth;
  return n == null ? "Unlimited drops" : `${n} drop${n > 1 ? "s" : ""}/month`;
}

function unitsLine(plan) {
  const limits = PLAN_LIMITS[plan];
  if (!limits) return null;
  const n = limits.maxUnitsPerDrop;
  return n == null ? "Unlimited units per drop" : `Up to ${n} units/drop`;
}

// Liste complete (cumulative) des lignes a afficher pour un plan donne.
export function getPlanFeatureList(plan) {
  if (!plan || !PLAN_ORDER.includes(plan)) return [];
  const allKeys = (PLAN_FEATURES[plan] ?? []).filter((key) => key !== "unlimited_drops");
  const colorKeys = allKeys.filter((key) => key.startsWith("color_"));
  const featureKeys = allKeys.filter((key) => !key.startsWith("color_"));
  const labels = [...featureKeys, ...colorKeys].map((key) => FEATURE_LABELS[key]);
  return [...labels, dropsLine(plan), unitsLine(plan)].filter(Boolean);
}

export const PLAN_SUMMARIES = PLAN_ORDER.reduce((acc, plan) => {
  acc[plan] = {
    label: PLAN_LABELS[plan],
    price: PLAN_PRICES[plan],
    quota: getPlanFeatureList(plan).join(" · "),
  };
  return acc;
}, {});

// Apparence : chaque plan debloque sa couleur ET conserve celles des paliers
// inferieurs (gating cumulatif). Noir disponible sur tous les plans payants.
export const COLOR_OPTIONS = [
  { key: "black", hex: "#1a1a1a", minPlan: "GROWTH" },
  { key: "blue", hex: "#3b82f6", minPlan: "PRO" },
  { key: "red", hex: "#dc2626", minPlan: "PRO" },
  { key: "violet", hex: "#7c3aed", minPlan: "SCALE" },
  { key: "gold", hex: "#ca8a04", minPlan: "ELITE" },
];

export function canUseColor(plan, color) {
  const option = COLOR_OPTIONS.find((o) => o.key === color);
  if (!option) return false;
  return PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(option.minPlan);
}

export function getNewlyUnlockedFeatures(account) {
  const seen = new Set(PLAN_FEATURES[account.lastSeenPlan] ?? []);
  const current = PLAN_FEATURES[account.plan] ?? [];
  return current.filter((key) => !seen.has(key));
}
