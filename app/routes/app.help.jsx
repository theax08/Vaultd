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
  card,
  inputStyle,
  backLinkStyle,
  HighlightText,
  textMatches,
} from "../styles/pop-ui";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const account = await getAccountForShop(session.shop);

  if (!account) {
    return { plan: null, newlyUnlocked: [] };
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
        <strong style={{ color: "#303030" }}>About Vaultd:</strong> Vaultd is a drop management and analytics tool. It does not process, collect, or handle any payments from your customers. All transactions from your drops happen directly through your Shopify store checkout.
      </div>

      {/* Une seule carte, entrees separees par un filet — au lieu de six
          ecrans de cartes pleine largeur (VAULTD-DESIGN §11.3) */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {SECTIONS.map((section, i) => {
          const unlocked = PLAN_ORDER.indexOf(section.minPlan) <= planIndex;
          const isNew = newlyUnlocked.includes(section.key);
          const matches = textMatches(section.title, query) || textMatches(section.intro, query);
          const rowStyle = {
            display: "block",
            padding: "14px 16px",
            borderTop: i > 0 ? "1px solid var(--vd-hairline, #e3e3e3)" : "none",
            opacity: unlocked ? (query && !matches ? 0.4 : 1) : 0.7,
            textDecoration: "none",
            color: "inherit",
          };
          const content = (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: unlocked ? "var(--vaultd-accent, #1a1a1a)" : "#1a1a1a", flex: 1, minWidth: 0 }}>
                  <HighlightText text={section.title} query={query} />
                </span>
                {isNew && (
                  <span
                    title="New on your plan"
                    style={{ width: 8, height: 8, borderRadius: "50%", background: "#c2410c", flexShrink: 0 }}
                  />
                )}
                {!unlocked && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--vd-ink-3, #8B93A0)",
                      background: "var(--vd-subtle, #F5F6F7)",
                      borderRadius: 4,
                      padding: "2px 7px",
                      flexShrink: 0,
                    }}
                  >
                    {section.minPlan}
                  </span>
                )}
                {unlocked && <ChevronIcon />}
              </div>
              <p style={{ fontSize: 13, color: "#6d7175", margin: 0 }}>
                <HighlightText text={section.intro} query={query} />
              </p>
            </>
          );
          return unlocked ? (
            <Link
              key={section.key}
              to={`/app/help/${section.key}?from=${from}`}
              className="vd-help-row"
              style={rowStyle}
            >
              {content}
            </Link>
          ) : (
            <div key={section.key} style={rowStyle}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, color: "#919191" }}>
      <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
