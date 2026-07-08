import { useState, useEffect } from "react";
import { useActionData, useLoaderData, useSubmit, useSearchParams, Link } from "react-router";
import { authenticate } from "../shopify.server";
import { getAccountForShop, createAccountForShop } from "../vaultd-account.server";
import { PLAN_ORDER, BILLABLE_PLAN_ORDER, PLAN_LABELS, PLAN_PRICES, getPlanFeatureList } from "../vaultd-plans";
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
  const { session } = await authenticate.admin(request);
  let account = null;
  try {
    account = await getAccountForShop(session.shop);
  } catch {}
  return { account };
};

// Plans payants : cles plan → label Shopify billing (doit matcher shopify.server.js).
const PAID_PLAN_KEYS = PLAN_ORDER.filter((p) => p !== "FREE");

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
  const { admin, session, billing } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const dbModule = await import("../db.server");
  const db = dbModule.default;

  const formData = await request.formData();
  const nextPlan = (formData.get("plan") || "FREE").toString();

  if (!PLAN_ORDER.includes(nextPlan)) {
    return { success: false, error: "Invalid plan." };
  }

  let account = await getAccountForShop(shopDomain);
  if (!account) {
    const result = await createAccountForShop(shopDomain);
    if (result.error) return { success: false, error: result.error };
    account = result.account;
  }

  const isTest = await isDevStore(admin);

  if (nextPlan === "FREE") {
    try {
      const check = await billing.check({
        plans: PAID_PLAN_KEYS.map((k) => PLAN_LABELS[k]),
        isTest,
      });
      if (check.appSubscriptions?.length > 0) {
        await billing.cancel({
          subscriptionId: check.appSubscriptions[0].id,
          isTest,
          prorate: false,
        });
      }
    } catch (_) {}
    await db.vaultdAccount.update({ where: { id: account.id }, data: { plan: "FREE" } });
    return { success: true, plan: "FREE", changed: account.plan !== "FREE" };
  }

  const returnUrl = `${(process.env.SHOPIFY_APP_URL || new URL(request.url).origin).replace(/\/$/, "")}/app/billing/return?plan=${nextPlan}`;
  await billing.request({
    plan: PLAN_LABELS[nextPlan],
    isTest,
    returnUrl,
  });
};

export default function PlansPage() {
  const { account } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const [searchParams] = useSearchParams();
  const from = searchParams.get("from") === "settings" ? "settings" : "home";
  const backTo = from === "settings" ? "/app/settings" : "/app";

  const currentPlan = actionData?.plan ?? account?.plan ?? "FREE";
  const billingResult = searchParams.get("billing");
  const [dismissedCongrats, setDismissedCongrats] = useState(false);
  useEffect(() => {
    setDismissedCongrats(false);
  }, [actionData, billingResult]);
  const showCongrats = Boolean(
    ((actionData?.success && actionData.changed) || billingResult === "confirmed") && !dismissedCongrats
  );

  const handleSwitch = (plan) => {
    submit({ plan }, { method: "post" });
  };

  return (
    <div style={pagePopStyle}>
      <div style={{ ...pageHeaderRowStyle, marginBottom: 0 }}>
        <div style={pageHeaderTitleRowStyle}>
          <GridIcon />
          <h1 style={pageHeaderTitleStyle}>Plans</h1>
        </div>
      </div>
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
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 14 }}>
        {BILLABLE_PLAN_ORDER.map((plan) => {
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
              <button
                type="button"
                disabled={isCurrent}
                onClick={() => handleSwitch(plan)}
                style={isCurrent ? secondaryButtonStyle : primaryButtonStyle}
              >
                {isCurrent ? "Active" : "Switch to this plan"}
              </button>
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
