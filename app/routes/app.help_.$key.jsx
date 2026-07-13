import { useLoaderData, useSearchParams, Link } from "react-router";
import { authenticate } from "../shopify.server";
import { getAccountForShop } from "../vaultd-account.server";
import { PLAN_ORDER } from "../vaultd-plans";
import { getSection } from "../help-sections";
import {
  pagePopStyle,
  pageHeaderRowStyle,
  pageHeaderTitleRowStyle,
  pageHeaderTitleStyle,
  GridIcon,
  cardPadded,
  cardLabel,
  backLinkStyle,
} from "../styles/pop-ui";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const account = await getAccountForShop(session.shop);
  const plan = account?.plan ?? null;

  const section = getSection(params.key);
  if (!section) {
    throw new Response("Not found", { status: 404 });
  }

  const unlocked = PLAN_ORDER.indexOf(section.minPlan) <= PLAN_ORDER.indexOf(plan);

  return { section, unlocked };
};

// Illustration generique inline (pas de vrais assets produit disponibles) :
// un simple visuel decoratif pour donner du contexte visuel a chaque
// fonctionnalite sans dependre d'images externes.
function SectionIllustration() {
  return (
    <svg width="100%" height="120" viewBox="0 0 400 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="400" height="120" rx="10" fill="#f7f7f7" />
      <rect x="24" y="40" width="160" height="14" rx="7" fill="var(--vaultd-accent, #1a1a1a)" opacity="0.85" />
      <rect x="24" y="64" width="240" height="10" rx="5" fill="#d8d8d8" />
      <rect x="24" y="82" width="200" height="10" rx="5" fill="#d8d8d8" />
      <circle cx="350" cy="60" r="28" fill="var(--vaultd-accent, #1a1a1a)" opacity="0.12" />
      <circle cx="350" cy="60" r="14" fill="var(--vaultd-accent, #1a1a1a)" opacity="0.3" />
    </svg>
  );
}

export default function HelpDetailPage() {
  const { section, unlocked } = useLoaderData();
  const [searchParams] = useSearchParams();
  const from = searchParams.get("from") === "settings" ? "settings" : "home";

  return (
    <div style={pagePopStyle}>
      <div style={{ ...pageHeaderRowStyle, marginBottom: 0 }}>
        <div style={pageHeaderTitleRowStyle}>
          <GridIcon />
          <h1 style={pageHeaderTitleStyle}>{section.title}</h1>
        </div>
      </div>
      <Link to={`/app/help?from=${from}`} style={backLinkStyle}>
        ← Back
      </Link>

      {!unlocked && (
        <div style={{ ...cardPadded, marginBottom: 16, color: "#c2410c", fontSize: 13.5 }}>
          This feature requires the {section.minPlan} plan or higher.{" "}
          <Link to={`/app/plans?from=${from}`} style={{ color: "#c2410c", fontWeight: 700 }}>
            View plans →
          </Link>
        </div>
      )}

      <div style={{ ...cardPadded, maxWidth: 640 }}>
        <SectionIllustration />
        <p style={{ fontSize: 13.5, color: "#303030", margin: "16px 0 14px 0" }}>{section.intro}</p>

        <div style={cardLabel}>TIPS</div>
        <ul style={{ margin: "8px 0 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
          {section.tips.map((tip, i) => (
            <li key={i} style={{ fontSize: 13, color: "#303030" }}>
              {tip}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
