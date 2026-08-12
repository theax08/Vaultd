import { Outlet, useLoaderData, useRouteError } from "react-router";
import { useState, useEffect } from "react";
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
  const { apiKey, accentColor, features } = useLoaderData();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const inner = (
    <>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_POP_CSS }} />
      {/* s-app-nav/s-link are plain custom elements (no <script> tags of
          their own), so unlike AppProvider they carry no hydration risk —
          gating them behind `mounted` only delayed them past the point
          where Shopify admin's shell looks for s-app-nav to relocate into
          its native chrome, leaving raw unupgraded text in the iframe. */}
      <s-app-nav>
        <s-link href="/app/home">Home</s-link>
        <s-link href="/app/drops">Drops</s-link>
        <s-link href="/app/waitlists">Waitlists</s-link>
        {features.includes("waitlist") && (
          <s-link href="/app/emails">Emails</s-link>
        )}
        <s-link href="/app/drops-history">Drops History</s-link>
        <s-link href="/app/settings">Settings</s-link>
      </s-app-nav>
      <div style={{ "--vaultd-accent": accentColor, position: "relative" }}>
        <Outlet />
      </div>
    </>
  );

  // AppProvider renders raw <script src> tags with no React context of its
  // own (see node_modules AppProvider.tsx). SSR hoists those to <link
  // rel="preload">, but the client's initial render would still emit real
  // <script> tags at the same spot -> structural mismatch -> React #418/#423
  // during hydration, which kills App Bridge's nav listener. Deferring
  // AppProvider until after mount keeps SSR and the first client render
  // identical (no scripts at all); App Bridge attaches ~one tick later.
  if (!mounted) return inner;

  return (
    <AppProvider embedded apiKey={apiKey}>
      {inner}
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  try {
    return boundary.error(error);
  } catch {
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
