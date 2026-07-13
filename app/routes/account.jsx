import { useState } from "react";
import { Link, useLoaderData, Form, useActionData, redirect } from "react-router";
import { requireWebAccount, getWebSession, destroyWebSession } from "../auth.web.server";
import { deleteAccount } from "../vaultd-account.server";
import { PLAN_LABELS, PLAN_PRICES, PLAN_ORDER } from "../vaultd-plans";

export const loader = async ({ request }) => {
  const account = await requireWebAccount(request);
  return { account };
};

export const action = async ({ request }) => {
  const account = await requireWebAccount(request);
  const form = await request.formData();
  const intent = form.get("intent")?.toString();

  if (intent === "delete_account") {
    const confirm = form.get("confirm")?.toString() ?? "";
    if (confirm !== "DELETE") {
      return { error: "Type DELETE to confirm account deletion." };
    }
    const result = await deleteAccount(account.id);
    if (result.error) return { error: result.error };
    const session = await getWebSession(request);
    return redirect("/", {
      headers: { "Set-Cookie": await destroyWebSession(session) },
    });
  }

  return null;
};

const PLAN_COLORS = {
  GROWTH: "#3b82f6",
  PRO: "#7c3aed",
  SCALE: "#0ea5e9",
  ELITE: "#ca8a04",
};

const TABS = [
  { key: "account", label: "Account" },
  { key: "plan", label: "Plan" },
  { key: "stores", label: "Stores" },
  { key: "danger", label: "Danger zone" },
];

export default function AccountPage() {
  const { account } = useLoaderData();
  const actionData = useActionData();
  const [tab, setTab] = useState("account");
  const [copied, setCopied] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const plan = PLAN_ORDER.includes(account.plan) ? account.plan : null;
  const planLabel = plan ? (PLAN_LABELS[plan] ?? plan) : "No active plan";
  const planPrice = plan ? (PLAN_PRICES[plan] ?? "") : "";
  const planColor = plan ? (PLAN_COLORS[plan] ?? "#555") : "#555";
  const accountInitial = ((account.username || account.email || "?")[0] ?? "?").toUpperCase();

  function copyId() {
    navigator.clipboard.writeText(account.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={root}>
      <header style={header}>
        <Link to="/" style={logo}>Vaultd</Link>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link to="/logout" style={logoutLink}>Log out</Link>
          <div style={avatarCircle}>{accountInitial}</div>
        </div>
      </header>

      <div style={{ display: "flex", minHeight: "calc(100vh - 61px)" }}>
        {/* Sidebar */}
        <div style={sidebar}>
          <div style={{ padding: "4px 0 14px", borderBottom: "1px solid #1a1a1a", marginBottom: 10 }}>
            {account.username && (
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#d0d0d0", padding: "0 10px 2px" }}>
                @{account.username}
              </div>
            )}
            <div style={{ fontSize: 12, color: "#3a3a3a", padding: "0 10px", wordBreak: "break-all" }}>
              {account.email}
            </div>
          </div>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                ...sidebarTab,
                background: tab === t.key ? "#161616" : "transparent",
                color: tab === t.key ? "#d0d0d0" : "#484848",
                borderLeft: `2px solid ${tab === t.key ? "#d0d0d0" : "transparent"}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={content}>

          {/* ACCOUNT TAB */}
          {tab === "account" && (
            <div>
              <div style={sectionLabel}>ACCOUNT DETAILS</div>
              {account.username && (
                <div style={fieldRow}>
                  <span style={fieldLabel}>Username</span>
                  <span style={fieldValue}>@{account.username}</span>
                </div>
              )}
              <div style={fieldRow}>
                <span style={fieldLabel}>Email</span>
                <span style={fieldValue}>{account.email ?? "—"}</span>
              </div>
              <div style={{ ...fieldRow, alignItems: "flex-start" }}>
                <span style={fieldLabel}>Account ID</span>
                <div>
                  <code style={codeTag}>{account.id}</code>
                  <button type="button" onClick={copyId} style={copyBtn}>
                    {copied ? "Copied!" : "Copy"}
                  </button>
                  <p style={{ fontSize: 12, color: "#3a3a3a", margin: "6px 0 0" }}>
                    Use this ID in Shopify → Settings → Account to link additional stores (Elite plan).
                  </p>
                </div>
              </div>
              <div style={fieldRow}>
                <span style={fieldLabel}>Member since</span>
                <span style={fieldValue}>
                  {new Date(account.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
              <div style={fieldRow}>
                <span style={fieldLabel}>Password</span>
                <Link to="/forgot-password" style={{ fontSize: 13.5, color: "#505050", textDecoration: "none" }}>
                  Reset password →
                </Link>
              </div>
            </div>
          )}

          {/* PLAN TAB */}
          {tab === "plan" && (
            <div>
              <div style={sectionLabel}>YOUR PLAN</div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                <span
                  style={{
                    ...planBadge,
                    background: planColor + "20",
                    color: planColor,
                    border: `1px solid ${planColor}40`,
                  }}
                >
                  {planLabel}
                </span>
                {planPrice && (
                  <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.5px", color: "#d0d0d0" }}>
                    {planPrice}
                  </span>
                )}
              </div>
              {!plan && (
                <p style={{ fontSize: 13.5, color: "#484848", margin: "0 0 18px" }}>
                  Install and subscribe to Vaultd from the Shopify App Store to activate a plan.
                </p>
              )}
              <a href="/auth/login" style={secondaryBtn}>
                Manage in Shopify app →
              </a>
            </div>
          )}

          {/* STORES TAB */}
          {tab === "stores" && (
            <div>
              <div style={sectionLabel}>LINKED STORES</div>
              {account.shops.length === 0 ? (
                <div>
                  <p style={{ fontSize: 13.5, color: "#484848", margin: "0 0 16px" }}>
                    No stores linked yet. Install Vaultd on your Shopify store and subscribe to a plan — your store links automatically if your Shopify email matches this account.
                  </p>
                  <div style={installBox}>
                    <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                      <li style={{ fontSize: 13, color: "#484848" }}>
                        Search for Vaultd on the Shopify App Store and install it
                      </li>
                      <li style={{ fontSize: 13, color: "#484848" }}>Choose a plan to activate the app</li>
                      <li style={{ fontSize: 13, color: "#484848" }}>
                        Your store links automatically if your Shopify email matches this account email
                      </li>
                    </ol>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {account.shops.map((shop) => (
                    <div key={shop.id} style={shopRow}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                      <span style={{ fontSize: 14, color: "#b0b0b0" }}>{shop.shopDomain}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DANGER ZONE TAB */}
          {tab === "danger" && (
            <div>
              <div style={{ ...sectionLabel, color: "#7a2020" }}>DANGER ZONE</div>
              <p style={{ fontSize: 13.5, color: "#484848", margin: "0 0 18px" }}>
                Deleting your account permanently removes all Vaultd data. Your Shopify subscription is{" "}
                <strong style={{ color: "#808080" }}>not</strong> cancelled automatically — cancel it from your Shopify admin to stop being charged.
              </p>
              <button type="button" onClick={() => setShowDeleteModal(true)} style={dangerBtn}>
                Delete account
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div style={overlay}>
          <div style={modal}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#f0f0f0", margin: "0 0 10px" }}>
              Delete your account?
            </h2>
            <p style={{ fontSize: 13.5, color: "#606060", margin: "0 0 6px" }}>
              This permanently deletes your Vaultd account and all data. This cannot be undone.
            </p>
            <p style={{ fontSize: 13.5, color: "#606060", margin: "0 0 18px" }}>
              Remember to also cancel your Shopify subscription from your Shopify admin.
            </p>
            {actionData?.error && (
              <div style={{ ...errorBanner, marginBottom: 14 }}>{actionData.error}</div>
            )}
            <Form method="post">
              <input type="hidden" name="intent" value="delete_account" />
              <label style={{ fontSize: 12.5, color: "#606060", display: "block", marginBottom: 6 }}>
                Type <strong style={{ color: "#f0f0f0" }}>DELETE</strong> to confirm
              </label>
              <input
                type="text"
                name="confirm"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                style={modalInput}
              />
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button
                  type="submit"
                  disabled={deleteConfirm !== "DELETE"}
                  style={{ ...dangerBtn, opacity: deleteConfirm !== "DELETE" ? 0.45 : 1 }}
                >
                  Delete permanently
                </button>
                <button
                  type="button"
                  onClick={() => { setShowDeleteModal(false); setDeleteConfirm(""); }}
                  style={cancelBtn}
                >
                  Cancel
                </button>
              </div>
            </Form>
          </div>
        </div>
      )}
    </div>
  );
}

const root = {
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  background: "#0a0a0a",
  minHeight: "100vh",
  color: "#f0f0f0",
};
const header = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 32px",
  borderBottom: "1px solid #1a1a1a",
};
const logo = { fontSize: 18, fontWeight: 800, color: "#f0f0f0", textDecoration: "none", letterSpacing: "-0.5px" };
const logoutLink = { fontSize: 13, color: "#3a3a3a", textDecoration: "none" };
const avatarCircle = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  background: "#1e1e1e",
  border: "1px solid #2a2a2a",
  color: "#c0c0c0",
  fontSize: 14,
  fontWeight: 700,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};
const sidebar = {
  width: 220,
  flexShrink: 0,
  padding: "20px 12px",
  borderRight: "1px solid #1a1a1a",
  display: "flex",
  flexDirection: "column",
};
const sidebarTab = {
  textAlign: "left",
  border: "none",
  padding: "9px 10px 9px 12px",
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
  borderRadius: 7,
  width: "100%",
  marginBottom: 2,
  transition: "background 0.1s",
};
const content = { flex: 1, padding: "32px 40px", maxWidth: 640 };
const sectionLabel = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#3a3a3a",
  marginBottom: 12,
};
const fieldRow = {
  display: "flex",
  gap: 20,
  alignItems: "center",
  padding: "13px 0",
  borderTop: "1px solid #1a1a1a",
  marginTop: 10,
};
const fieldLabel = { fontSize: 13, color: "#404040", minWidth: 110, flexShrink: 0 };
const fieldValue = { fontSize: 14, color: "#b0b0b0" };
const codeTag = {
  fontFamily: "monospace",
  fontSize: 12,
  background: "#0d0d0d",
  border: "1px solid #1e1e1e",
  borderRadius: 6,
  padding: "4px 10px",
  color: "#707070",
  wordBreak: "break-all",
  display: "inline-block",
};
const copyBtn = {
  background: "transparent",
  border: "1px solid #1e1e1e",
  color: "#505050",
  borderRadius: 6,
  padding: "3px 10px",
  fontSize: 12,
  cursor: "pointer",
  marginLeft: 8,
};
const planBadge = {
  fontSize: 13,
  fontWeight: 700,
  padding: "4px 12px",
  borderRadius: 20,
  display: "inline-flex",
  alignItems: "center",
};
const secondaryBtn = {
  background: "transparent",
  border: "1px solid #2a2a2a",
  color: "#707070",
  borderRadius: 8,
  padding: "9px 16px",
  fontSize: 13,
  textDecoration: "none",
  display: "inline-block",
};
const installBox = {
  background: "#0d0d0d",
  border: "1px solid #1a1a1a",
  borderRadius: 10,
  padding: "14px 18px",
};
const shopRow = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "#0d0d0d",
  border: "1px solid #1a1a1a",
  borderRadius: 8,
  padding: "12px 16px",
};
const dangerBtn = {
  background: "transparent",
  border: "1px solid #7a2020",
  color: "#f87171",
  borderRadius: 8,
  padding: "9px 16px",
  fontSize: 13,
  cursor: "pointer",
};
const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.82)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: "24px",
};
const modal = {
  background: "#111",
  border: "1px solid #2a1010",
  borderRadius: 14,
  padding: "28px",
  maxWidth: 440,
  width: "100%",
};
const modalInput = {
  background: "#0a0a0a",
  border: "1px solid #2a2a2a",
  borderRadius: 8,
  padding: "11px 14px",
  color: "#f0f0f0",
  fontSize: 14,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};
const cancelBtn = {
  background: "transparent",
  border: "1px solid #2a2a2a",
  color: "#606060",
  borderRadius: 8,
  padding: "9px 16px",
  fontSize: 13,
  cursor: "pointer",
};
const errorBanner = {
  background: "#1a0808",
  border: "1px solid #3a1515",
  color: "#f87171",
  borderRadius: 8,
  padding: "11px 14px",
  fontSize: 13.5,
};
