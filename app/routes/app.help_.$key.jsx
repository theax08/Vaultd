import { useLoaderData, useSearchParams, Link } from "react-router";
import { authenticate } from "../shopify.server";
import { getAccountForShop } from "../vaultd-account.server";
import { PLAN_ORDER } from "../vaultd-plans";
import { getSection } from "../help-sections";
import {
  popFontFamily,
  pageHeaderTitleRowStyle,
  pageHeaderTitleStyle,
  GridIcon,
  card,
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

export default function HelpDetailPage() {
  const { section, unlocked } = useLoaderData();
  const [searchParams] = useSearchParams();
  const from = searchParams.get("from") === "settings" ? "settings" : "home";

  return (
    <div style={{ fontFamily: popFontFamily, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ ...card, flex: 1, borderRadius: 0, padding: "20px 20px 32px" }}>
        <div style={{ maxWidth: 680 }}>
          <Link to={`/app/help?from=${from}`} style={backLinkStyle}>
            ← Back
          </Link>

          <div style={{ ...pageHeaderTitleRowStyle, marginBottom: 16 }}>
            <GridIcon />
            <h1 style={pageHeaderTitleStyle}>{section.title}</h1>
          </div>

          {!unlocked && (
            <div style={{ marginBottom: 16, color: "#c2410c", fontSize: 13.5 }}>
              This feature requires the {section.minPlan} plan or higher.{" "}
              <Link to={`/app/plans?from=${from}`} style={{ color: "#c2410c", fontWeight: 700 }}>
                View plans →
              </Link>
            </div>
          )}

          <p style={{ fontSize: 13.5, color: "#303030", margin: "0 0 20px 0", lineHeight: 1.6 }}>{section.intro}</p>

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
    </div>
  );
}
