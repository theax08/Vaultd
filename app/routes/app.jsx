// app/routes/app.jsx
import { Link, Outlet, useLoaderData, useRouteError, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { getAccountForShop } from "../vaultd-account.server";
import { COLOR_OPTIONS, PLAN_FEATURES, PLAN_ORDER } from "../vaultd-plans";
import { hasUnreadOwnerReplies } from "../support.server";
import { GLOBAL_POP_CSS, primaryButtonStyle } from "../styles/pop-ui";

const ACCENT_HEX = COLOR_OPTIONS.reduce((acc, o) => {
  acc[o.key] = o.hex;
  return acc;
}, {});

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  let account = null;
  let hasSupportUnread = false;
  let accountDbReady = false;
  try {
    account = await getAccountForShop(session.shop);
    accountDbReady = true;
  } catch {}
  try {
    hasSupportUnread = await hasUnreadOwnerReplies(session.shop);
  } catch {}

  const plan = account?.plan ?? null;
  // Gate only if DB is up AND account exists AND plan is invalid.
  // New installs (no account yet) always pass — let them explore.
  const hasPlan = !accountDbReady || account === null || PLAN_ORDER.includes(plan);
  const features = PLAN_FEATURES[plan] ?? [];

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    accentColor: ACCENT_HEX[account?.appearanceColor] || ACCENT_HEX.black,
    hasNewFeatures: account ? account.lastSeenPlan !== account.plan : false,
    features,
    hasSupportUnread,
    needsOnboarding: accountDbReady && !account,
    hasPlan,
  };
};

export default function App() {
  const { apiKey, accentColor, features, hasSupportUnread, needsOnboarding, hasPlan } = useLoaderData();
  const location = useLocation();

  const gateExempt =
    location.pathname.startsWith("/app/plans") ||
    location.pathname.startsWith("/app/billing") ||
    location.pathname.startsWith("/app/settings");

  const gated = !hasPlan && !gateExempt;

  return (
    <AppProvider embedded apiKey={apiKey}>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_POP_CSS }} />
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/drops">Drops</s-link>
        <s-link href="/app/waitlists">Waitlists</s-link>
        {features.includes("automated_emails") && (
          <s-link href="/app/emails">Emails</s-link>
        )}
        <s-link href="/app/drops-history">Drops History</s-link>
        <s-link href="/app/settings">Settings</s-link>
      </s-app-nav>
      <div style={{ "--vaultd-accent": accentColor, position: "relative" }}>
        {/* Gate overlay: rendered on top without any navigation or URL change.
            Using a React Router Link preserves the App Bridge session context. */}
        {gated && (
          <div style={{
            position: "fixed", inset: 0,
            background: "rgba(255,255,255,0.97)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            zIndex: 9999, gap: 16,
          }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
              Choose a plan to access Vaultd
            </p>
            <p style={{ fontSize: 14, color: "#6d7175", margin: 0 }}>
              Select a plan to unlock all features.
            </p>
            <Link to="/app/plans?from=gate" style={{ ...primaryButtonStyle, textDecoration: "none" }}>
              View plans
            </Link>
          </div>
        )}
        <Outlet />
      </div>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  try {
    return boundary.error(error);
  } catch {
    // boundary.error re-throws non-ErrorResponse errors (e.g. client-side
    // deserialization loses the constructor name) — show visible fallback.
    return (
      <div style={{ padding: 32, fontFamily: "system-ui, sans-serif", color: "#1a1a1a" }}>
        <p style={{ fontSize: 15, margin: 0 }}>
          Something went wrong. Please refresh the page.
        </p>
      </div>
    );
  }
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};