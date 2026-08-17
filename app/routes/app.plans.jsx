import { useState, useEffect } from "react";
import { useActionData, useLoaderData, useSubmit, useFetcher, useSearchParams, Link } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { PLAN_ORDER, PLAN_LABELS, PLAN_PRICES, getPlanFeatureList, TRIAL_ELIGIBLE_PLANS, getTrialStatus } from "../vaultd-plans";
import {
  pagePopStyle,
  pageHeaderRowStyle,
  pageHeaderTitleRowStyle,
  pageHeaderTitleStyle,
  GridIcon,
  cardPadded,
  primaryButtonStyle,
  secondaryButtonStyle,
  backLinkStyle,
  modalOverlayStyle,
  modalCardStyle,
  AutoDismissBanner,
  monoNumberStyle,
} from "../styles/pop-ui";

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M2.2 6.3 4.7 8.8 9.8 3.4" stroke="var(--vd-ink-3, #8B93A0)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Toutes les lignes affichees d'emblee — pas de "+n more" a deplier
// (le marchand doit voir tout ce que l'offre inclut sans un clic de plus).
function PlanFeatureList({ features }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
      {features.map((line) => (
        <li key={line} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#6d7175" }}>
          <CheckIcon />
          <span style={/^[\d]/.test(line) ? monoNumberStyle : undefined}>{line}</span>
        </li>
      ))}
    </ul>
  );
}

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

  const isPrimaryShop = !account?.primaryShopDomain || account.primaryShopDomain === session.shop;
  const trialStatus = getTrialStatus(account);

  // Le loader ne doit renvoyer que ce que le client affiche vraiment — pas
  // l'objet account Prisma complet, qui inclut passwordHash et
  // emailVerifyCode (le code de verification d'email en clair, qui
  // permettrait de "verifier" un email sans jamais avoir recu le mail).
  const accountForClient = account
    ? { plan: account.plan, shopsCount: account.shops?.length ?? 1 }
    : null;

  return { account: accountForClient, shop: session.shop, shopifyAdminBase, appHandle, isPrimaryShop, trialStatus };
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
  const { admin, session, billing } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const dbModule = await import("../db.server");
  const db = dbModule.default;

  const formData = await request.formData();
  const intent = (formData.get("intent") || "").toString();

  if (intent === "cancel_subscription") {
    try {
      const { getAccountForShop: getAccountForCancelCheck } = await import("../vaultd-account.server");
      const accountForCheck = await getAccountForCancelCheck(shopDomain);
      if (accountForCheck?.primaryShopDomain && accountForCheck.primaryShopDomain !== shopDomain) {
        return {
          success: false,
          error: "This store shares a plan with another store. Cancel it from the primary store instead — or disconnect this store from the account in Settings.",
        };
      }

      const res = await admin.graphql(`{
        currentAppInstallation { activeSubscriptions { id name status } }
      }`);
      const { data } = await res.json();
      const subs = data?.currentAppInstallation?.activeSubscriptions ?? [];
      const planNames = new Set(Object.values(PLAN_LABELS));
      const activeSub = subs.find((s) => planNames.has(s.name) && s.status === "ACTIVE");

      if (!activeSub) {
        return {
          success: false,
          error: "No active plan subscription found for this store. If this store joined another store's plan, disconnect it from Settings instead.",
        };
      }

      // No proration — merchant keeps access until Shopify closes out the
      // current billing period, but no partial refund is issued.
      await billing.cancel({ session, subscriptionId: activeSub.id, prorate: false });

      const { getAccountForShop } = await import("../vaultd-account.server");
      const account = await getAccountForShop(shopDomain);
      if (account) {
        // Mirror what the subscriptions/update webhook will also do shortly
        // after — set it here too for immediate UI feedback (same pattern
        // as the billing/return confirm flow).
        await db.vaultdAccount.update({ where: { id: account.id }, data: { plan: "FREE" } });
      }

      return { success: true, cancelled: true };
    } catch (err) {
      console.error("[billing] cancel error:", err?.message ?? err);
      return { success: false, error: "Could not cancel your subscription. Please try again or contact support." };
    }
  }

  const nextPlan = (formData.get("plan") || "").toString();

  if (!PLAN_ORDER.includes(nextPlan)) {
    return { success: false, error: "Invalid plan. Use the billing flow to switch plans." };
  }

  return { success: false, error: "Use /app/billing/request for paid plans." };
};

export default function PlansPage() {
  const { account, shop, shopifyAdminBase, appHandle, isPrimaryShop, trialStatus } = useLoaderData();

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
  const dbPlan = PLAN_ORDER.includes(account?.plan) ? account.plan : null;
  const currentPlan = actionData?.plan ?? billingPlan ?? dbPlan;
  const [dismissedCongrats, setDismissedCongrats] = useState(false);
  useEffect(() => {
    setDismissedCongrats(false);
  }, [actionData, billingResult]);
  const showCongrats = Boolean(
    ((actionData?.success && actionData.changed) || billingResult === "confirmed") &&
    PLAN_ORDER.includes(currentPlan) &&
    !dismissedCongrats
  );

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const cancelFetcher = useFetcher();
  const cancelling = cancelFetcher.state !== "idle";
  const cancelError = cancelFetcher.data?.success === false ? cancelFetcher.data.error : null;
  useEffect(() => {
    if (cancelFetcher.data?.success) {
      setShowCancelConfirm(false);
    }
  }, [cancelFetcher.data]);
  const linkedStoreCount = (account?.shopsCount ?? 1) - 1;

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

      {!currentPlan && isPrimaryShop && (
        <div style={{ marginBottom: 16, padding: "12px 16px", background: "#fff3cd", borderRadius: 8, border: "1px solid #ffc107", fontSize: 13.5, color: "#303030" }}>
          <strong>No active plan.</strong> Select a plan below to access Vaultd.
        </div>
      )}

      {trialStatus.isActive && (
        <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--vd-subtle, #F5F6F7)", borderRadius: 8, fontSize: 13.5, color: "#303030" }}>
          <strong>Free trial active</strong> — ends {new Date(trialStatus.endsAt).toLocaleDateString("en-US")}. You can switch plans once your trial ends.
        </div>
      )}

      {!isPrimaryShop && (
        <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--vd-subtle, #F5F6F7)", borderRadius: 8, fontSize: 13.5, color: "#303030" }}>
          <strong>This store shares a plan with another store.</strong> Plan changes can only be made from the primary store. To leave that shared account, use Settings → Account → Disconnect.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 14, alignItems: "stretch" }}>
        {PLAN_ORDER.map((plan) => {
          const isCurrent = plan === currentPlan;
          const featureList = getPlanFeatureList(plan);
          const [amount, period] = PLAN_PRICES[plan].split("/");
          return (
            <div
              key={plan}
              style={{
                ...cardPadded,
                boxShadow: isCurrent
                  ? "0 0 0 1.5px var(--vd-ink, #14181F), 0 1px 2px rgba(20,24,31,.05)"
                  : cardPadded.boxShadow,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div>
                {isCurrent && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      background: "var(--vd-subtle, #F5F6F7)",
                      color: "var(--vd-ink-2, #5C6470)",
                      borderRadius: 20,
                      padding: "2px 10px",
                      fontSize: 11.5,
                      fontWeight: 600,
                    }}
                  >
                    Current plan
                  </span>
                )}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{PLAN_LABELS[plan]}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 26, fontWeight: 600, color: "#1a1a1a", ...monoNumberStyle }}>{amount}</span>
                {period && <span style={{ fontSize: 13, fontWeight: 400, color: "var(--vd-ink-3, #8B93A0)" }}>/ {period}</span>}
              </div>
              {!isCurrent && !trialStatus.hasUsedTrial && TRIAL_ELIGIBLE_PLANS.includes(plan) && (
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--vaultd-accent, #1a1a1a)" }}>
                  7-day free trial
                </div>
              )}
              <PlanFeatureList features={featureList} />
              {isCurrent ? (
                <button type="button" disabled style={secondaryButtonStyle}>
                  Current plan
                </button>
              ) : !isPrimaryShop ? (
                <button type="button" disabled style={secondaryButtonStyle} title="Only the primary store can change the shared plan">
                  Switch to this plan
                </button>
              ) : trialStatus.isActive ? (
                <button type="button" disabled style={secondaryButtonStyle} title={`Available once your free trial ends (${new Date(trialStatus.endsAt).toLocaleDateString("en-US")})`}>
                  Switch to this plan
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

      {currentPlan && isPrimaryShop && (
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <button
            type="button"
            onClick={() => setShowCancelConfirm(true)}
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
            Cancel subscription
          </button>
        </div>
      )}

      {showCancelConfirm && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px 0" }}>
              Cancel {PLAN_LABELS[currentPlan]}?
            </h2>
            <p style={{ fontSize: 13.5, color: "#303030", margin: "0 0 10px 0" }}>
              You'll lose access to paid features right away. This does not issue a refund for the current billing period.
            </p>
            {linkedStoreCount > 0 && (
              <p style={{ fontSize: 13, color: "#8a5a00", background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, padding: "8px 12px", margin: "0 0 10px 0" }}>
                {linkedStoreCount} other store{linkedStoreCount > 1 ? "s" : ""} linked to this account will also lose access.
              </p>
            )}
            {cancelError && (
              <p style={{ fontSize: 13, color: "#b3212f", margin: "0 0 10px 0" }}>{cancelError}</p>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button
                type="button"
                style={secondaryButtonStyle}
                disabled={cancelling}
                onClick={() => setShowCancelConfirm(false)}
              >
                Keep subscription
              </button>
              <button
                type="button"
                style={{ ...primaryButtonStyle, background: "#b3212f", borderColor: "#b3212f" }}
                disabled={cancelling}
                onClick={() => cancelFetcher.submit({ intent: "cancel_subscription" }, { method: "post" })}
              >
                {cancelling ? "Cancelling…" : "Cancel subscription"}
              </button>
            </div>
          </div>
        </div>
      )}

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
