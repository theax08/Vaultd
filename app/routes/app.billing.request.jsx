import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { PLAN_ORDER, PLAN_LABELS } from "../vaultd-plans";

// Si la query GraphQL echoue on joue la securite : isTest:true.
// Sur un vrai store en prod la query reussit et retourne false.
async function isDevStore(admin) {
  try {
    const res = await admin.graphql(`{ shop { plan { partnerDevelopment } } }`);
    const { data } = await res.json();
    if (data?.shop?.plan?.partnerDevelopment === false) return false;
    return true;
  } catch {
    return true;
  }
}

export const loader = async ({ request }) => {
  const { admin, billing } = await authenticate.admin(request);
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan");

  if (!plan || !PLAN_ORDER.includes(plan) || plan === "FREE") {
    return redirect("/app/plans");
  }

  const isTest = await isDevStore(admin);
  const returnUrl = `${(process.env.SHOPIFY_APP_URL || new URL(request.url).origin).replace(/\/$/, "")}/app/billing/return?plan=${plan}`;

  try {
    await billing.request({
      plan: PLAN_LABELS[plan],
      isTest,
      returnUrl,
    });
  } catch (err) {
    // billing.request jette un Response (redirect vers Shopify) — on re-jette.
    // Si c'est une vraie erreur on redirige vers Plans plutot que d'afficher
    // Application Error.
    if (err instanceof Response) throw err;
    return redirect(`/app/plans?billing=error`);
  }
};

// Composant vide — le loader redirige toujours, ce composant ne doit jamais
// s'afficher. Sans default export React Router peut planter sur certaines
// versions si le loader ne redirige pas.
export default function BillingRequestPage() {
  return null;
}
