import { useState } from "react";
import { useLoaderData, useSearchParams, Link } from "react-router";
import { authenticate } from "../shopify.server";
import { getAccountForShop, getNewlyUnlockedFeatures } from "../vaultd-account.server";
import { PLAN_ORDER } from "../vaultd-plans";
import { SECTIONS } from "../help-sections";
import {
  pagePopStyle,
  pageHeaderRowStyle,
  pageHeaderTitleRowStyle,
  pageHeaderTitleStyle,
  GridIcon,
  cardPadded,
  cardLabel,
  inputStyle,
  backLinkStyle,
  HighlightText,
  textMatches,
} from "../styles/pop-ui";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const account = await getAccountForShop(session.shop);

  if (!account) {
    return { plan: "FREE", newlyUnlocked: [] };
  }

  const newlyUnlocked = getNewlyUnlockedFeatures(account);

  if (account.lastSeenPlan !== account.plan) {
    const dbModule = await import("../db.server");
    await dbModule.default.vaultdAccount.update({
      where: { id: account.id },
      data: { lastSeenPlan: account.plan },
    });
  }

  return { plan: account.plan, newlyUnlocked };
};

export default function HelpPage() {
  const { plan, newlyUnlocked } = useLoaderData();
  const [searchParams] = useSearchParams();
  const from = searchParams.get("from") === "settings" ? "settings" : "home";
  const backTo = from === "settings" ? "/app/settings" : "/app";
  const planIndex = PLAN_ORDER.indexOf(plan);
  const [query, setQuery] = useState("");

  return (
    <div style={pagePopStyle}>
      <div style={{ ...pageHeaderRowStyle, marginBottom: 0 }}>
        <div style={pageHeaderTitleRowStyle}>
          <GridIcon />
          <h1 style={pageHeaderTitleStyle}>Help</h1>
        </div>
      </div>
      <Link to={backTo} style={backLinkStyle}>
        ← Back
      </Link>

      <div style={{ marginBottom: 14 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Help (titles & descriptions)…"
          style={{ ...inputStyle, maxWidth: 360 }}
        />
      </div>

      <div style={{ fontSize: 12, color: "#6d7175", padding: "10px 14px", background: "#f9f9f9", borderRadius: 8, border: "1px solid #e3e3e3", marginBottom: 16 }}>
        <strong style={{ color: "#303030" }}>About Vaultd:</strong> Vaultd is a drop management and analytics tool. It does not process, collect, or handle any payments from your customers. All transactions from your drops happen directly through your Shopify store checkout — Vaultd never touches your revenue.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {SECTIONS.map((section) => {
          const unlocked = PLAN_ORDER.indexOf(section.minPlan) <= planIndex;
          const isNew = newlyUnlocked.includes(section.key);
          const matches = textMatches(section.title, query) || textMatches(section.intro, query);
          return (
            <div
              key={section.key}
              style={{
                ...cardPadded,
                opacity: unlocked ? (query && !matches ? 0.4 : 1) : 0.55,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                {unlocked ? (
                  <Link
                    to={`/app/help/${section.key}?from=${from}`}
                    style={{ fontSize: 14, fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)" }}
                  >
                    <HighlightText text={section.title} query={query} />
                  </Link>
                ) : (
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>{section.title}</span>
                )}
                {isNew && (
                  <span
                    title="New on your plan"
                    style={{ width: 8, height: 8, borderRadius: "50%", background: "#c2410c" }}
                  />
                )}
                {!unlocked && <span style={cardLabel}>{section.minPlan}+</span>}
              </div>
              <p style={{ fontSize: 13, color: "#6d7175", margin: 0 }}>
                <HighlightText text={section.intro} query={query} />
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
