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
  modalOverlayStyle,
  modalCardStyle,
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
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

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

      <div style={{ textAlign: "center", marginTop: 24 }}>
        <button
          type="button"
          onClick={() => setShowPrivacyPolicy(true)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontSize: 12.5,
            color: "var(--vd-ink-3, #8B93A0)",
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          Privacy Policy
        </button>
      </div>

      {showPrivacyPolicy && (
        <div style={modalOverlayStyle} onClick={() => setShowPrivacyPolicy(false)}>
          <div
            style={{ ...modalCardStyle, width: "640px", textAlign: "left" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 2px 0", color: "#1a1a1a" }}>
              Vaultd: Privacy Policy
            </h2>
            <p style={{ fontSize: 12, color: "#6d7175", margin: "0 0 18px 0" }}>July 2, 2026</p>

            <p style={pStyle}>
              Vaultd ("we," "our," or "us") is committed to protecting the privacy of merchants who use our Shopify
              application and the customers who interact with our services. This Privacy Policy outlines how we
              collect, use, and disclose personal data.
            </p>

            <h3 style={h3Style}>1. Information We Collect</h3>
            <p style={pStyle}>As a Shopify App, Vaultd accesses data via the Shopify API and through user interactions:</p>
            <ul style={ulStyle}>
              <li><strong>Merchant Data:</strong> Shop name, shop email, shop domain, and plan details to manage your Vaultd account. If you create a Vaultd account password (for linking multiple stores), it is stored as a one-way hash — we never store plain-text passwords.</li>
              <li><strong>Customer &amp; Drop Data:</strong> For the purpose of providing waitlists, referrals, and live analytics, we collect customer email addresses (when they sign up for a waitlist), traffic referral sources, and anonymized interaction data (conversion rates, sales velocity).</li>
              <li><strong>Security Data:</strong> IP addresses and, when a merchant enables Cloudflare Turnstile bot protection, device signals processed by Cloudflare — solely for the purpose of bot protection and preventing scalping.</li>
            </ul>

            <h3 style={h3Style}>2. How We Use Your Information</h3>
            <p style={pStyle}>We use the collected information to:</p>
            <ul style={ulStyle}>
              <li>Provide, operate, and maintain the Vaultd platform.</li>
              <li>Process and manage pre-launch waitlists and referral loops.</li>
              <li>Generate real-time analytics and post-drop performance charts for merchants.</li>
              <li>Protect store inventory against automated bot attacks.</li>
              <li>Process subscription billing through Shopify.</li>
            </ul>

            <h3 style={h3Style}>3. Data Sharing and Third Parties</h3>
            <p style={pStyle}>
              We do not sell personal data. We only share information with third-party service providers strictly
              necessary to run our app — namely Resend (email delivery to your customers) and Cloudflare Turnstile
              (bot protection, when enabled) — or when required by law.
            </p>

            <h3 style={h3Style}>4. Data Retention</h3>
            <p style={pStyle}>
              We retain customer data (like waitlist emails) only for as long as necessary to fulfill the services
              requested by the merchant. Merchants can request data deletion at any time. When you uninstall Vaultd,
              Shopify's mandatory data redaction process automatically triggers permanent deletion of your store's
              data 48 hours after uninstallation.
            </p>

            <h3 style={h3Style}>5. GDPR &amp; CCPA Compliance</h3>
            <p style={pStyle}>
              If you or your customers are located in the EU or California, you have the right to access, correct,
              or delete your personal data. Vaultd complies with Shopify's mandatory privacy webhooks to
              automatically process deletion requests.
            </p>

            <h3 style={h3Style}>6. Contact Us</h3>
            <p style={{ ...pStyle, marginBottom: 0 }}>
              If you have any questions about this Privacy Policy, please contact us at:{" "}
              <a href="mailto:support@vaultd.pro?subject=Privacy%20Policy" style={{ color: "#1a1a1a" }}>support@vaultd.pro</a>
              {" "}— please name the subject "Privacy Policy" or the email won't be read.
            </p>

            <div style={{ textAlign: "right", marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setShowPrivacyPolicy(false)}
                style={{
                  background: "#1a1a1a",
                  color: "#fff",
                  border: "none",
                  borderRadius: 7,
                  padding: "8px 16px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const pStyle = { fontSize: 13, color: "#303030", lineHeight: 1.6, margin: "0 0 14px 0" };
const h3Style = { fontSize: 14, fontWeight: 700, color: "#1a1a1a", margin: "18px 0 6px 0" };
const ulStyle = { paddingLeft: 18, margin: "0 0 14px 0", display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "#303030", lineHeight: 1.6 };

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, color: "#919191" }}>
      <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
