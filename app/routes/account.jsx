import { useState } from "react";
import { Link, useLoaderData } from "react-router";
import { requireWebAccount } from "../auth.web.server";
import { PLAN_LABELS, PLAN_PRICES } from "../vaultd-plans";

export const loader = async ({ request }) => {
  const account = await requireWebAccount(request);
  return { account };
};

const PLAN_COLORS = {
  FREE: "#555",
  GROWTH: "#3b82f6",
  PRO: "#7c3aed",
  SCALE: "#0ea5e9",
  ELITE: "#ca8a04",
};

export default function AccountPage() {
  const { account } = useLoaderData();
  const [copied, setCopied] = useState(false);

  function copyId() {
    navigator.clipboard.writeText(account.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const plan = account.plan ?? "FREE";
  const planLabel = PLAN_LABELS[plan] ?? plan;
  const planPrice = PLAN_PRICES[plan] ?? "";
  const planColor = PLAN_COLORS[plan] ?? "#555";

  return (
    <div style={rootStyle}>
      {/* Header */}
      <header style={headerStyle}>
        <Link to="/" style={logoStyle}>Vaultd</Link>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 13.5, color: "#606060" }}>{account.email}</span>
          <Link to="/logout" style={logoutStyle}>Log out</Link>
        </div>
      </header>

      <div style={pageStyle}>
        <h1 style={pageTitleStyle}>My Account</h1>

        {/* Plan card */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <span style={cardTitleStyle}>Current plan</span>
            <span style={{ ...planBadgeStyle, background: planColor + "22", color: planColor, border: `1px solid ${planColor}44` }}>
              {planLabel}
            </span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.5px", margin: "8px 0 4px" }}>
            {planPrice}
          </div>
          {plan === "FREE" && (
            <p style={{ fontSize: 13, color: "#606060", margin: "0 0 16px" }}>
              Install the Shopify app to upgrade to a paid plan.
            </p>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <a
              href="/auth/login"
              style={secondaryBtnStyle}
            >
              Manage in Shopify app →
            </a>
          </div>
        </div>

        {/* Account details */}
        <div style={cardStyle}>
          <span style={cardTitleStyle}>Account details</span>
          <div style={fieldRowStyle}>
            <span style={fieldLabelStyle}>Email</span>
            <span style={fieldValueStyle}>{account.email ?? "—"}</span>
          </div>
          <div style={{ ...fieldRowStyle, alignItems: "flex-start" }}>
            <span style={fieldLabelStyle}>Account ID</span>
            <div>
              <code style={codeStyle}>{account.id}</code>
              <button onClick={copyId} style={copyBtnStyle}>
                {copied ? "Copied!" : "Copy"}
              </button>
              <p style={{ fontSize: 12, color: "#505050", margin: "6px 0 0" }}>
                Use this ID in Shopify app → Settings → Account to link your store.
              </p>
            </div>
          </div>
          <div style={fieldRowStyle}>
            <span style={fieldLabelStyle}>Member since</span>
            <span style={fieldValueStyle}>
              {new Date(account.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </span>
          </div>
        </div>

        {/* Linked Shopify stores */}
        <div style={cardStyle}>
          <span style={cardTitleStyle}>Linked Shopify stores</span>
          {account.shops.length === 0 ? (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 14, color: "#606060", margin: "0 0 16px" }}>
                No stores linked yet. Install Vaultd on your Shopify store, then link it using your Account ID above.
              </p>
              <div style={installBoxStyle}>
                <span style={{ fontSize: 13, color: "#808080" }}>To install:</span>
                <ol style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
                  <li style={{ fontSize: 13, color: "#a0a0a0" }}>
                    Go to <a href="/" style={{ color: "#c0c0c0", textDecoration: "none" }}>vaultd-production.up.railway.app</a> and enter your shop domain
                  </li>
                  <li style={{ fontSize: 13, color: "#a0a0a0" }}>Install the app on Shopify</li>
                  <li style={{ fontSize: 13, color: "#a0a0a0" }}>In the app, go to Settings → Account and enter your Account ID</li>
                </ol>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {account.shops.map((shop) => (
                <div key={shop.id} style={shopRowStyle}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                  <span style={{ fontSize: 14, color: "#e0e0e0" }}>{shop.shopDomain}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const rootStyle = {
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  background: "#0a0a0a",
  minHeight: "100vh",
  color: "#f0f0f0",
};
const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "18px 40px",
  borderBottom: "1px solid #1c1c1c",
};
const logoStyle = { fontSize: 18, fontWeight: 800, color: "#f0f0f0", textDecoration: "none", letterSpacing: "-0.5px" };
const logoutStyle = {
  fontSize: 13,
  color: "#505050",
  textDecoration: "none",
  border: "1px solid #252525",
  padding: "6px 14px",
  borderRadius: 7,
};
const pageStyle = { maxWidth: 640, margin: "0 auto", padding: "48px 24px" };
const pageTitleStyle = { fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px", margin: "0 0 28px" };
const cardStyle = {
  background: "#111",
  border: "1px solid #1e1e1e",
  borderRadius: 14,
  padding: "24px",
  marginBottom: 16,
};
const cardHeaderStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 };
const cardTitleStyle = { fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "#555" };
const planBadgeStyle = { fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20 };
const fieldRowStyle = {
  display: "flex",
  gap: 16,
  alignItems: "center",
  padding: "12px 0",
  borderTop: "1px solid #1a1a1a",
  marginTop: 14,
};
const fieldLabelStyle = { fontSize: 13, color: "#555", minWidth: 110 };
const fieldValueStyle = { fontSize: 14, color: "#c0c0c0" };
const codeStyle = {
  fontFamily: "monospace",
  fontSize: 12,
  background: "#0a0a0a",
  border: "1px solid #222",
  borderRadius: 6,
  padding: "4px 10px",
  color: "#a0a0a0",
  wordBreak: "break-all",
  display: "inline-block",
};
const copyBtnStyle = {
  background: "transparent",
  border: "1px solid #2a2a2a",
  color: "#808080",
  borderRadius: 6,
  padding: "3px 10px",
  fontSize: 12,
  cursor: "pointer",
  marginLeft: 8,
};
const secondaryBtnStyle = {
  background: "transparent",
  border: "1px solid #282828",
  color: "#a0a0a0",
  borderRadius: 8,
  padding: "9px 16px",
  fontSize: 13,
  textDecoration: "none",
  display: "inline-block",
};
const installBoxStyle = {
  background: "#0d0d0d",
  border: "1px solid #1e1e1e",
  borderRadius: 10,
  padding: "14px 18px",
};
const shopRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "#0d0d0d",
  border: "1px solid #1e1e1e",
  borderRadius: 8,
  padding: "12px 16px",
};
