import { useState, useEffect } from "react";
import { useActionData, useLoaderData, useSubmit, useSearchParams, Link } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { PLAN_ORDER, PLAN_LABELS, PLAN_PRICES, getPlanFeatureList } from "../vaultd-plans";
import {
  pagePopStyle,
  pageHeaderRowStyle,
  pageHeaderTitleRowStyle,
  pageHeaderTitleStyle,
  GridIcon,
  cardPadded,
  pillBadge,
  primaryButtonStyle,
  secondaryButtonStyle,
  backLinkStyle,
  modalOverlayStyle,
  modalCardStyle,
  AutoDismissBanner,
} from "../styles/pop-ui";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { getAccountForShop } = await import("../vaultd-account.server");
  let account = null;
  try {
    account = await getAccountForShop(session.shop);
  } catch {}

  // Build the Shopify Admin URL base for billing links.
  // Prefer the decoded ?host= param (exact); fall back to deriving it from the
  // shop domain — admin.shopify.com/store/{handle} is always correct for
  // partner-hosted stores, even when ?host= is absent (e.g. client-side nav).
  let shopifyAdminBase = null;
  let appHandle = null;
  try {
    const rawHost = new URL(request.url).searchParams.get("host");
    if (rawHost) {
      shopifyAdminBase = Buffer.from(rawHost, "base64url").toString();
    } else {
      shopifyAdminBase = `admin.shopify.com/store/${session.shop.replace(".myshopify.com", "")}`;
    }
    const res = await admin.graphql(`{ app { handle } }`);
    const { data } = await res.json();
    appHandle = data?.app?.handle ?? null;
  } catch {}

  return { account, shop: session.shop, shopifyAdminBase, appHandle };
};

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

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const dbModule = await import("../db.server");
  const db = dbModule.default;

  const formData = await request.formData();
  const nextPlan = (formData.get("plan") || "").toString();

  if (!PLAN_ORDER.includes(nextPlan)) {
    return { success: false, error: "Invalid plan. Use the billing flow to switch plans." };
  }

  return { success: false, error: "Use /app/billing/request for paid plans." };
};

export default function PlansPage() {
  const { account, shop, shopifyAdminBase, appHandle } = useLoaderData();

  const getBillingHref = (plan) => {
    if (shopifyAdminBase && appHandle) {
      return `https://${shopifyAdminBase}/apps/${appHandle}/app/billing/request?plan=${plan}`;
    }
    return `/app/billing/request?plan=${plan}&shop=${shop}`;
  };
  const actionData = useActionData();
  const submit = useSubmit();
  const [searchParams] = useSearchParams();
  const from = searchParams.get("from") === "settings" ? "settings" : "home";
  const backTo = from === "settings" ? "/app/settings" : "/app/home";

  const billingResult = searchParams.get("billing");
  const billingDebug = searchParams.get("debug") || "";
  // Quand billing=confirmed, le plan vient du parametre URL (plus fiable que
  // lire la DB juste apres le redirect — evite l'affichage "No subscription").
  const billingPlan = billingResult === "confirmed" ? searchParams.get("plan") : null;
  const currentPlan = actionData?.plan ?? billingPlan ?? account?.plan ?? null;
  const [dismissedCongrats, setDismissedCongrats] = useState(false);
  useEffect(() => {
    setDismissedCongrats(false);
  }, [actionData, billingResult]);
  const showCongrats = Boolean(
    ((actionData?.success && actionData.changed) || billingResult === "confirmed") &&
    PLAN_ORDER.includes(currentPlan) &&
    !dismissedCongrats
  );

  return (
    <div style={{ ...pagePopStyle, minHeight: "100vh" }}>
      <Link to={backTo} style={backLinkStyle}>
        ← Back
      </Link>

      {(actionData?.error || billingResult === "error" || billingResult === "cancelled") && (
        <div style={{ marginBottom: 16 }}>
          <AutoDismissBanner
            tone="error"
            message={
              actionData?.error ||
              (billingResult === "cancelled" ? "Billing was cancelled." : "Billing failed. Please try again.")
            }
            dismissKey={actionData || billingResult}
          />
          {billingDebug && (
            <div style={{ marginTop: 8, padding: "8px 12px", background: "#fff3cd", borderRadius: 6, fontSize: 11.5, color: "#5a4000", fontFamily: "monospace", wordBreak: "break-all" }}>
              {billingDebug}
            </div>
          )}
        </div>
      )}

      {!currentPlan && (
        <div style={{ marginBottom: 16, padding: "12px 16px", background: "#fff3cd", borderRadius: 8, border: "1px solid #ffc107", fontSize: 13.5, color: "#303030" }}>
          <strong>No active plan.</strong> Select a plan below to access Vaultd.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 14 }}>
        {PLAN_ORDER.map((plan) => {
          const isCurrent = plan === currentPlan;
          const featureList = getPlanFeatureList(plan);
          return (
            <div
              key={plan}
              style={{
                ...cardPadded,
                border: isCurrent ? "2px solid var(--vaultd-accent, #1a1a1a)" : "1px solid #e3e3e3",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div>
                {isCurrent && <span style={pillBadge("success")}>Current plan</span>}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{PLAN_LABELS[plan]}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>{PLAN_PRICES[plan]}</div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                {featureList.map((line) => (
                  <li key={line} style={{ fontSize: 12.5, color: "#6d7175" }}>
                    {line}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <button type="button" disabled style={secondaryButtonStyle}>
                  Active
                </button>
              ) : (
                <button
                  type="button"
                  style={primaryButtonStyle}
                  onClick={() => { window.top.location.href = getBillingHref(plan); }}
                >
                  Switch to this plan
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 12, color: "#919191", marginTop: 16 }}>
        Per-store add-on: +$50/month per additional store.
      </p>
      <p style={{ fontSize: 12, color: "#919191", marginTop: 8, padding: "10px 14px", background: "#f9f9f9", borderRadius: 8, border: "1px solid #e3e3e3" }}>
        <strong style={{ color: "#1a1a1a" }}>Note:</strong> Vaultd is a drop management and analytics tool. It does not process, collect, or handle any payments from your customers. All transactions from your drops happen directly through your Shopify store checkout.
      </p>

      {showCongrats && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)", margin: "0 0 8px 0" }}>
              Congrats and welcome on {PLAN_LABELS[currentPlan]}!
            </h2>
            <p style={{ fontSize: 13.5, color: "#303030", margin: "0 0 14px 0" }}>
              With this plan, you can now use:
            </p>
            <ul style={{ margin: "0 0 18px 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
              {getPlanFeatureList(currentPlan).map((line) => (
                <li key={line} style={{ fontSize: 13.5, color: "#1a1a1a" }}>
                  {line}
                </li>
              ))}
            </ul>
            <button type="button" style={primaryButtonStyle} onClick={() => setDismissedCongrats(true)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
