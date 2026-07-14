// app/routes/app.jsx
import { useEffect } from "react";
import { Outlet, useLoaderData, useRouteError, useNavigate, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { getAccountForShop } from "../vaultd-account.server";
import { COLOR_OPTIONS, PLAN_FEATURES, PLAN_ORDER } from "../vaultd-plans";
import { hasUnreadOwnerReplies } from "../support.server";
import { GLOBAL_POP_CSS } from "../styles/pop-ui";

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
  // Only gate if the DB is reachable and no plan found.
  // If DB is unreachable let the user through to avoid locking everyone out.
  const hasPlan = !accountDbReady || PLAN_ORDER.includes(plan);

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
  const navigate = useNavigate();
  const location = useLocation();

  const gateExempt =
    location.pathname.startsWith("/app/plans") ||
    location.pathname.startsWith("/app/billing") ||
    location.pathname.startsWith("/app/settings");

  // Client-side redirects: server-side redirects drop the Shopify session JWT,
  // which causes authenticate.admin to trigger OAuth inside the iframe (blank screen).
  useEffect(() => {
    if (!hasPlan && !gateExempt) {
      navigate("/app/plans?from=gate");
    }
  }, [hasPlan, gateExempt]);

  useEffect(() => {
    if (needsOnboarding && !location.pathname.startsWith("/app/settings")) {
      navigate("/app/settings?onboarding=1");
    }
  }, [needsOnboarding, location.pathname]);

  const gated = !hasPlan && !gateExempt;

  return (
    <AppProvider embedded apiKey={apiKey}>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_POP_CSS }} />
      {!gated && (
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
      )}
      {/* Outlet must always mount so React Router can attach child routes.
          Hiding via CSS avoids the hydration mismatch caused by a conditional Outlet. */}
      <div
        style={{
          "--vaultd-accent": accentColor,
          ...(gated ? { visibility: "hidden", pointerEvents: "none" } : {}),
        }}
      >
        <Outlet />
      </div>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};