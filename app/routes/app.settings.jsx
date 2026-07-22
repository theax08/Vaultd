import { useLoaderData, useActionData, useSubmit, Link } from "react-router";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import {
  getAccountForShop,
  createAccountForShop,
  loginToAccount,
  requestPasswordReset,
  resetPasswordWithCode,
} from "../vaultd-account.server";
import { canUseColor, PLAN_SUMMARIES, COLOR_OPTIONS, PLAN_ORDER } from "../vaultd-plans";
import {
  pagePopStyle,
  pageHeaderRowStyle,
  pageHeaderTitleRowStyle,
  pageHeaderTitleStyle,
  GridIcon,
  card,
  cardPadded,
  cardLabel,
  pillBadge,
  inputStyle,
  primaryButtonStyle,
  primaryButtonDisabledStyle,
  secondaryButtonStyle,
  modalOverlayStyle,
  modalCardStyle,
  toggleSwitchStyle,
  toggleSwitchKnobStyle,
  successBannerStyle,
  AutoDismissBanner,
} from "../styles/pop-ui";

const SECTIONS = [
  { key: "account", label: "Account" },
  { key: "appearance", label: "Appearance" },
  { key: "bot_protection", label: "Bot protection" },
];

const COLOR_DISPLAY_LABELS = {
  black: "Black",
  blue: "Blue",
  red: "Red",
  violet: "Violet",
  gold: "Gold",
};

const SHORT_PLAN_LABEL = {
  GROWTH: "Growth",
  PRO: "Pro",
  SCALE: "Scale",
  ELITE: "Elite",
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const account = await getAccountForShop(shopDomain);

  const url = new URL(request.url);
  const isOnboarding = url.searchParams.get("onboarding") === "1";

  const { getShopSettings } = await import("../bot-protection.server");
  const shopSettings = await getShopSettings(shopDomain);

  return {
    shopDomain,
    account,
    isOnboarding,
    botProtection: {
      enabled: shopSettings.botProtectionEnabled,
      siteKey: shopSettings.turnstileSiteKey || "",
      secretKey: shopSettings.turnstileSecretKey || "",
    },
  };
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const dbModule = await import("../db.server");
  const db = dbModule.default;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create_account") {
    const email = (formData.get("email") || "").toString().trim();
    const password = (formData.get("password") || "").toString();
    const result = await createAccountForShop(shopDomain, { email, password });
    if (result.error) return { intent, error: result.error };
    return { intent, success: true };
  }

  if (intent === "login_account") {
    // Note: no "already has an account" guard here — a shop that already paid
    // for its own plan can still switch to joining someone else's Elite
    // account. loginToAccount() already refuses a no-op relink to the same
    // account it's already on.

    // Linking rides on the Elite account's plan, but this store still needs
    // its own active Shopify subscription first — otherwise it gets full
    // Elite access for free, without ever paying for its own installation.
    let hasOwnActiveSubscription = false;
    try {
      const res = await admin.graphql(
        `{ currentAppInstallation { activeSubscriptions { status } } }`
      );
      const { data } = await res.json();
      hasOwnActiveSubscription = (data?.currentAppInstallation?.activeSubscriptions ?? []).some(
        (s) => s.status === "ACTIVE"
      );
    } catch {}

    if (!hasOwnActiveSubscription) {
      return {
        intent,
        error: "This store needs its own active Vaultd subscription before it can link to another account. Choose a plan first.",
      };
    }

    const accountId = (formData.get("accountId") || "").toString().trim();
    const password = (formData.get("password") || "").toString();
    const result = await loginToAccount({ accountId, password, shopDomain });
    if (result.error) return { intent, error: result.error };
    return { intent, success: true };
  }

  if (intent === "request_password_reset") {
    const email = (formData.get("email") || "").toString().trim();
    await requestPasswordReset(email);
    return { intent, success: true };
  }

  if (intent === "reset_password") {
    const email = (formData.get("email") || "").toString().trim();
    const code = (formData.get("code") || "").toString().trim();
    const newPassword = (formData.get("newPassword") || "").toString();
    const result = await resetPasswordWithCode({ email, code, newPassword });
    if (result.error) return { intent, error: result.error };
    return { intent, success: true };
  }

  if (intent === "update_bot_protection") {
    const db = (await import("../db.server")).default;
    const botProtectionEnabled = formData.get("botProtectionEnabled") === "on";
    const turnstileSiteKey = (formData.get("turnstileSiteKey") || "").toString().trim();
    const turnstileSecretKey = (formData.get("turnstileSecretKey") || "").toString().trim();
    await db.shopSettings.upsert({
      where: { shopDomain },
      create: { shopDomain, botProtectionEnabled, turnstileSiteKey: turnstileSiteKey || null, turnstileSecretKey: turnstileSecretKey || null },
      update: { botProtectionEnabled, turnstileSiteKey: turnstileSiteKey || null, turnstileSecretKey: turnstileSecretKey || null },
    });
    return { intent, success: true };
  }

  if (intent === "disconnect_account") {
    await db.shopSettings.update({
      where: { shopDomain },
      data: { vaultdAccountId: null },
    });
    return { intent, success: true };
  }

  if (intent === "set_appearance") {
    const account = await getAccountForShop(shopDomain);
    if (!account) return { intent, error: "Create your Vaultd account first." };
    const color = (formData.get("color") || "black").toString();
    if (!canUseColor(account.plan, color)) {
      return { intent, error: "This color is not available on your current plan." };
    }
    await db.vaultdAccount.update({
      where: { id: account.id },
      data: { appearanceColor: color },
    });
    return { intent, success: true };
  }

  return { intent, success: false };
};

export default function SettingsPage() {
  const { shopDomain, account, isOnboarding, botProtection } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loginAccountId, setLoginAccountId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [activeSection, setActiveSection] = useState("account");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const [bpEnabled, setBpEnabled] = useState(botProtection.enabled);
  const [bpSiteKey, setBpSiteKey] = useState(botProtection.siteKey);
  const [bpSecretKey, setBpSecretKey] = useState(botProtection.secretKey);
  const [isSavingBotProt, setIsSavingBotProt] = useState(false);

  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetCodeSent, setResetCodeSent] = useState(false);
  useEffect(() => {
    if (actionData?.intent === "update_bot_protection" && actionData?.success) {
      setIsSavingBotProt(false);
    }
  }, [actionData]);

  useEffect(() => {
    if (actionData?.success) setIsCreating(false);
    if (actionData?.intent === "request_password_reset" && actionData.success) {
      setResetCodeSent(true);
    }
    if (actionData?.intent === "reset_password" && actionData.success) {
      setShowForgotPassword(false);
      setResetCodeSent(false);
      setResetEmail("");
      setResetCode("");
      setResetNewPassword("");
    }
  }, [actionData]);

  const handleCreateAccount = (e) => {
    e.preventDefault();
    setIsCreating(true);
    submit({ intent: "create_account", email: newEmail, password: newPassword }, { method: "post" });
  };

  const handleLogin = (e) => {
    e.preventDefault();
    submit({ intent: "login_account", accountId: loginAccountId, password: loginPassword }, { method: "post" });
  };

  const handleRequestReset = (e) => {
    e.preventDefault();
    submit({ intent: "request_password_reset", email: resetEmail }, { method: "post" });
  };

  const handleResetPassword = (e) => {
    e.preventDefault();
    submit(
      { intent: "reset_password", email: resetEmail, code: resetCode, newPassword: resetNewPassword },
      { method: "post" }
    );
  };

  const handleSetColor = (color) => {
    submit({ intent: "set_appearance", color }, { method: "post" });
  };

  const handleSaveBotProtection = () => {
    setIsSavingBotProt(true);
    const fd = new FormData();
    fd.set("intent", "update_bot_protection");
    if (bpEnabled) fd.set("botProtectionEnabled", "on");
    fd.set("turnstileSiteKey", bpSiteKey);
    fd.set("turnstileSecretKey", bpSecretKey);
    submit(fd, { method: "post" });
  };

  const plan = PLAN_ORDER.includes(account?.plan) ? account.plan : null;
  const isElite = plan === "ELITE";

  return (
    <div style={pagePopStyle}>

      {isOnboarding && (
        <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "14px 18px", marginBottom: 16 }}>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: "#0369a1", margin: "0 0 4px 0" }}>
            Welcome to Vaultd!
          </p>
          <p style={{ fontSize: 13, color: "#0c4a6e", margin: 0 }}>
            Create your Vaultd account below to get started. If you already use Vaultd on another store, log in with your existing account ID and password to link this store.
          </p>
        </div>
      )}

      {actionData?.error && (
        <div style={{ marginBottom: 16 }}>
          <AutoDismissBanner tone="error" message={actionData.error} dismissKey={actionData} />
        </div>
      )}
      {actionData?.success && actionData.intent !== "request_password_reset" && (
        <div style={{ marginBottom: 16 }}>
          <AutoDismissBanner
            message={actionData.intent === "reset_password" ? "Password reset. You can log in with your new password." : "Saved."}
            dismissKey={actionData}
          />
        </div>
      )}

      <div style={{ ...card, display: "flex", alignItems: "stretch", padding: 0, overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{ width: 200, display: "flex", flexDirection: "column", padding: 14, gap: 4, borderRight: "1px solid #e3e3e3" }}>
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setActiveSection(s.key)}
              style={{
                textAlign: "left",
                border: "none",
                background: activeSection === s.key ? "#f2f2f2" : "transparent",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 13.5,
                fontWeight: 600,
                color: activeSection === s.key ? "var(--vaultd-accent, #1a1a1a)" : "#303030",
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: 20, maxWidth: 640 }}>
      {activeSection === "account" && (
        <>
        <div style={cardLabel}>ACCOUNT</div>

        {!account ? (
          <>
            <p style={{ fontSize: 13.5, color: "#303030", margin: "0 0 14px 0" }}>
              Create your Vaultd account to keep your plan and settings tied to
              you, not just this store — useful if you ever manage more than
              one store.
            </p>
            <form onSubmit={handleCreateAccount} style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Your email"
                style={inputStyle}
              />
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Choose a password"
                style={inputStyle}
              />
              <p style={{ fontSize: 11.5, color: "#919191", margin: 0 }}>
                Min. 8 characters, with an uppercase letter, a lowercase letter, a digit and a special character.
              </p>
              <button type="submit" disabled={isCreating} style={primaryButtonStyle}>
                {isCreating ? "Creating…" : "Create your Vaultd account"}
              </button>
            </form>

            <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #e3e3e3" }}>
              <p style={{ fontSize: 13, color: "#6d7175", margin: "0 0 8px 0" }}>
                Already have a Vaultd account from another store?
              </p>
              <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
                <input
                  type="text"
                  required
                  value={loginAccountId}
                  onChange={(e) => setLoginAccountId(e.target.value)}
                  placeholder="Account ID"
                  style={inputStyle}
                />
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Password"
                  style={inputStyle}
                />
                <button type="submit" style={secondaryButtonStyle}>Log in</button>
              </form>

              {!showForgotPassword ? (
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  style={{ marginTop: 10, background: "none", border: "none", padding: 0, fontSize: 12.5, color: "#6d7175", textDecoration: "underline", cursor: "pointer" }}
                >
                  Forgot password?
                </button>
              ) : (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #e3e3e3" }}>
                  {!resetCodeSent ? (
                    <form onSubmit={handleRequestReset} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <p style={{ fontSize: 12.5, color: "#6d7175", margin: "0 0 4px 0" }}>
                        Enter the email tied to your Vaultd account — we&apos;ll send you a reset code.
                      </p>
                      <input
                        type="email"
                        required
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="Your account email"
                        style={inputStyle}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="submit" style={secondaryButtonStyle}>Send reset code</button>
                        <button type="button" onClick={() => setShowForgotPassword(false)} style={{ background: "none", border: "none", fontSize: 12.5, color: "#6d7175", cursor: "pointer" }}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <p style={{ fontSize: 12.5, color: "#6d7175", margin: "0 0 4px 0" }}>
                        If that email is linked to a Vaultd account, a reset code was just sent to it. Don't see it? Check your spam folder.
                      </p>
                      <input
                        type="text"
                        required
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value)}
                        placeholder="6-digit code"
                        style={inputStyle}
                      />
                      <input
                        type="password"
                        required
                        value={resetNewPassword}
                        onChange={(e) => setResetNewPassword(e.target.value)}
                        placeholder="New password"
                        style={inputStyle}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="submit" style={primaryButtonStyle}>Reset password</button>
                        <button
                          type="button"
                          onClick={handleRequestReset}
                          style={{ background: "none", border: "none", fontSize: 12.5, color: "#6d7175", textDecoration: "underline", cursor: "pointer" }}
                        >
                          Resend code
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowForgotPassword(false);
                            setResetCodeSent(false);
                          }}
                          style={{ background: "none", border: "none", fontSize: 12.5, color: "#6d7175", cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: "#6d7175" }}>Account ID:</span>
              <span style={{ fontSize: 13, fontFamily: "ui-monospace, monospace", color: "#1a1a1a" }}>
                {account.id}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 13, color: "#6d7175" }}>Plan:</span>
              {plan ? (
                <span style={pillBadge("neutral")}>{PLAN_SUMMARIES[plan].label}</span>
              ) : (
                <>
                  <span style={pillBadge("warning")}>No active plan</span>
                  <Link to="/app/plans?from=settings" style={{ fontSize: 12.5, color: "#1a1a1a", fontWeight: 600 }}>
                    Choose a plan →
                  </Link>
                </>
              )}
            </div>

            <div style={cardLabel}>LINKED STORES ({account.shops.length})</div>
            <ul style={{ margin: "0 0 16px 0", paddingLeft: 18, fontSize: 13, color: "#303030" }}>
              {account.shops.map((s) => (
                <li key={s.id}>
                  {s.shopDomain} {s.shopDomain === shopDomain ? "(this store)" : ""}
                </li>
              ))}
            </ul>

            <div style={{ marginBottom: 16 }}>
              {!confirmDisconnect ? (
                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(true)}
                  style={{ background: "none", border: "1px solid #e3e3e3", borderRadius: 7, padding: "7px 12px", fontSize: 12.5, color: "#6d7175", cursor: "pointer" }}
                >
                  Disconnect this store from account
                </button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12.5, color: "#303030" }}>Disconnect this store? It will lose access until re-linked.</span>
                  <button
                    type="button"
                    onClick={() => { submit({ intent: "disconnect_account" }, { method: "post" }); setConfirmDisconnect(false); }}
                    style={{ background: "#d82c2c", color: "#fff", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
                  >
                    Yes, disconnect
                  </button>
                  <button type="button" onClick={() => setConfirmDisconnect(false)} style={{ background: "none", border: "none", fontSize: 12.5, color: "#6d7175", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div style={cardLabel}>LINK ANOTHER STORE</div>
            {!isElite ? (
              <p style={{ fontSize: 13, color: "#6d7175" }}>
                Linking another store to this account is only available on the Elite plan.{" "}
                <Link to="/app/plans?from=settings" style={{ color: "#1a1a1a", fontWeight: 600 }}>
                  View plans →
                </Link>
              </p>
            ) : (
              <p style={{ fontSize: 13, color: "#6d7175" }}>
                On your other store, open Settings and use "Log in" with this
                Account ID (<strong style={{ color: "#1a1a1a" }}>{account.id}</strong>) and
                your password.
              </p>
            )}

            <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #e3e3e3" }}>
              <div style={cardLabel}>JOIN A DIFFERENT ACCOUNT</div>
              <p style={{ fontSize: 13, color: "#6d7175", margin: "0 0 8px 0" }}>
                Already run Vaultd on another store with an Elite account? Log in with
                that account's ID and password to switch this store over to it.
              </p>
              <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
                <input
                  type="text"
                  required
                  value={loginAccountId}
                  onChange={(e) => setLoginAccountId(e.target.value)}
                  placeholder="Account ID"
                  style={inputStyle}
                />
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Password"
                  style={inputStyle}
                />
                <button type="submit" style={secondaryButtonStyle}>Log in</button>
              </form>
            </div>

          </>
        )}
        </>
      )}

      {activeSection === "appearance" && (
        <>
        <div style={cardLabel}>APPEARANCE</div>
        <p style={{ fontSize: 13.5, color: "#303030", margin: "0 0 14px 0" }}>
          Choose the accent color used across the app's buttons and links.
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          {COLOR_OPTIONS.map((opt) => {
            const unlocked = account ? canUseColor(plan, opt.key) : opt.key === "black";
            const active = account?.appearanceColor === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                disabled={!unlocked}
                onClick={() => handleSetColor(opt.key)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: active ? "2px solid #1a1a1a" : "1px solid #e3e3e3",
                  background: "#ffffff",
                  cursor: unlocked ? "pointer" : "default",
                  opacity: unlocked ? 1 : 0.5,
                }}
              >
                <span style={{ width: 24, height: 24, borderRadius: "50%", background: opt.hex }} />
                <span style={{ fontSize: 12, color: "#1a1a1a" }}>{COLOR_DISPLAY_LABELS[opt.key]}</span>
                {!unlocked && (
                  <span style={{ fontSize: 10.5, color: "#919191" }}>
                    {SHORT_PLAN_LABEL[opt.minPlan]}+
                  </span>
                )}
              </button>
            );
          })}
        </div>
        </>
      )}

      {activeSection === "bot_protection" && (
        <>
        <div style={cardLabel}>BOT PROTECTION</div>
        {!isElite ? (
          <>
          <p style={{ fontSize: 13.5, color: "#303030", margin: "0 0 10px 0" }}>
            Honeypot field, submission-timing checks and IP rate-limiting are
            always active on every waitlist signup, free of charge.
          </p>
          <p style={{ fontSize: 13, color: "#6d7175", margin: 0 }}>
            Cloudflare Turnstile bot protection (stops scripted signups) is available on the Elite plan.{" "}
            <Link to="/app/plans?from=settings" style={{ color: "#1a1a1a", fontWeight: 600 }}>View plans →</Link>
          </p>
          </>
        ) : (
          <>
          <p style={{ fontSize: 13.5, color: "#303030", margin: "0 0 14px 0" }}>
            Honeypot field, submission-timing checks and IP rate-limiting are
            always active. Turning this on adds an invisible{" "}
            <a href="https://www.cloudflare.com/products/turnstile/" target="_blank" rel="noreferrer" style={{ color: "#1a1a1a", fontWeight: 600 }}>
              Cloudflare Turnstile
            </a>{" "}
            challenge on top to stop scripted signups.
          </p>
          {actionData?.intent === "update_bot_protection" && actionData?.success && (
            <div style={{ ...successBannerStyle, marginBottom: 14 }}>Settings saved</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <button type="button" onClick={() => setBpEnabled((v) => !v)} style={toggleSwitchStyle(bpEnabled)} aria-pressed={bpEnabled}>
              <span style={toggleSwitchKnobStyle(bpEnabled)} />
            </button>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1a1a1a" }}>Enable Turnstile bot protection</span>
          </div>
          <div style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 6 }}>Turnstile site key</span>
            <input type="text" value={bpSiteKey} onChange={(e) => setBpSiteKey(e.target.value)} placeholder="0x4AAAAAAA..." style={{ ...inputStyle, maxWidth: 420 }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 6 }}>Turnstile secret key</span>
            <input type="password" value={bpSecretKey} onChange={(e) => setBpSecretKey(e.target.value)} placeholder="0x4AAAAAAA..." style={{ ...inputStyle, maxWidth: 420 }} />
            <p style={{ marginTop: 6, fontSize: 12, color: "#6d7175" }}>
              Get both keys at{" "}
              <a href="https://dash.cloudflare.com/?to=/:account/turnstile" target="_blank" rel="noreferrer" style={{ color: "#1a1a1a", fontWeight: 600 }}>dash.cloudflare.com</a>
              {" "}— create a widget in Managed mode and add your storefront domain.
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <button type="button" disabled={isSavingBotProt} onClick={handleSaveBotProtection} style={isSavingBotProt ? primaryButtonDisabledStyle : primaryButtonStyle}>
              {isSavingBotProt ? "Saving..." : "Save"}
            </button>
          </div>
          </>
        )}
        </>
      )}
        </div>
      </div>

    </div>
  );
}
