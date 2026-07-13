import { Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAccountForShop } from "../vaultd-account.server";
import { PLAN_SUMMARIES, PLAN_FEATURES } from "../vaultd-plans";
import {
  pagePopStyle,
  pageHeaderRowStyle,
  pageHeaderTitleRowStyle,
  pageHeaderTitleStyle,
  GridIcon,
  cardPadded,
  cardLabel,
  pillBadge,
  primaryButtonStyle,
} from "../styles/pop-ui";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  try {
    const { runAutoDropLifecycle } = await import("../drop-lifecycle.server");
    await runAutoDropLifecycle(shopDomain);
  } catch {}

  const dbModule = await import("../db.server");
  const db =
    dbModule.default ??
    dbModule.prisma ??
    dbModule.db ??
    dbModule.client ??
    dbModule;

  let account = null;
  try {
    account = await getAccountForShop(shopDomain);
  } catch {}

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  let endedDrops = [];
  let completedThisMonthCount = 0;
  let totalDropsCount = 0;
  let totalSignupsEver = 0;
  let activeWaitlistMembers = 0;
  let launchedDropCount = 0;
  let recentDrops = [];

  try {
    [
      endedDrops,
      completedThisMonthCount,
      totalDropsCount,
      totalSignupsEver,
      activeWaitlistMembers,
      launchedDropCount,
      recentDrops,
    ] = await Promise.all([
      db.drop.findMany({
        where: { shopDomain, status: "ENDED" },
        select: { finalRevenue: true, finalConversionRate: true },
      }),
      db.drop.count({
        where: { shopDomain, status: "ENDED", endTime: { gte: startOfMonth } },
      }),
      db.drop.count({ where: { shopDomain } }),
      db.waitlistEntry.count({ where: { drop: { shopDomain } } }),
      db.waitlistEntry.count({
        where: {
          unsubscribedAt: null,
          drop: { shopDomain, status: { in: ["DRAFT", "LIVE"] } },
        },
      }),
      db.drop.count({ where: { shopDomain, status: { in: ["LIVE", "ENDED"] } } }),
      db.drop.findMany({
        where: { shopDomain },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, name: true, status: true, createdAt: true },
      }),
    ]);
  } catch {}

  const totalRevenue = endedDrops.reduce((sum, d) => sum + Number(d.finalRevenue ?? 0), 0);
  const convRates = endedDrops
    .map((d) => d.finalConversionRate)
    .filter((v) => typeof v === "number");
  const avgConvRate =
    convRates.length > 0 ? convRates.reduce((s, v) => s + v, 0) / convRates.length : null;

  const steps = [
    { done: Boolean(account), label: "Create your Vaultd account", to: "/app/settings" },
    { done: totalDropsCount > 0, label: "Create your first drop", to: "/app/drops?new=1" },
    { done: totalSignupsEver > 0, label: "Get your first waitlist signup", to: "/app/waitlists" },
    { done: launchedDropCount > 0, label: "Launch your first drop live", to: "/app/drops" },
    { done: endedDrops.length > 0, label: "Complete your first drop", to: "/app/drops-history" },
  ];

  const plan = account?.plan ?? null;

  return {
    stats: {
      totalRevenue,
      completedThisMonthCount,
      avgConvRate,
      activeWaitlistMembers,
    },
    steps,
    recentDrops,
    plan,
    features: PLAN_FEATURES[plan] ?? [],
    hasNewFeatures: account ? account.lastSeenPlan !== account.plan : false,
  };
};

function StatusBadge({ status }) {
  const tone = status === "LIVE" ? "success" : status === "ENDED" ? "neutral" : "warning";
  return <span style={pillBadge(tone)}>{status}</span>;
}

const NAV_LINKS = [
  { to: "/app/drops", label: "Drops" },
  { to: "/app/waitlists", label: "Waitlists" },
  { to: "/app/drops-history", label: "Drop History", feature: "drop_history" },
  { to: "/app/emails", label: "Emails", feature: "automated_emails" },
  { to: "/app/settings", label: "Settings" },
];

export default function Dashboard() {
  const { stats, steps, recentDrops, plan, features, hasNewFeatures } = useLoaderData();

  const completedSteps = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done);
  const setupComplete = completedSteps === steps.length;
  const planSummary = PLAN_SUMMARIES[plan];
  const visibleNavLinks = NAV_LINKS.filter((link) => !link.feature || features.includes(link.feature));

  return (
    <div style={pagePopStyle}>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 14, marginBottom: 16 }}>
        <div style={{ ...cardPadded, borderTop: "3px solid var(--vaultd-accent, #1a1a1a)" }}>
          <div style={cardLabel}>TOTAL REVENUE</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>
            ${stats.totalRevenue.toLocaleString("en-US")}
          </div>
          <div style={{ fontSize: 11.5, color: "#919191" }}>All drops combined</div>
        </div>
        <div style={{ ...cardPadded, borderTop: "3px solid var(--vaultd-accent, #1a1a1a)" }}>
          <div style={cardLabel}>DROPS COMPLETED</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>
            {stats.completedThisMonthCount}
          </div>
          <div style={{ fontSize: 11.5, color: "#919191" }}>This month</div>
        </div>
        <div style={{ ...cardPadded, borderTop: "3px solid var(--vaultd-accent, #1a1a1a)" }}>
          <div style={cardLabel}>AVG CONV RATE</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>
            {stats.avgConvRate != null ? `${stats.avgConvRate.toFixed(1)}%` : "—"}
          </div>
          <div style={{ fontSize: 11.5, color: "#919191" }}>Across all drops</div>
        </div>
        <div style={{ ...cardPadded, borderTop: "3px solid var(--vaultd-accent, #1a1a1a)" }}>
          <div style={cardLabel}>ACTIVE WAITLIST MEMBERS</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>
            {stats.activeWaitlistMembers}
          </div>
          <div style={{ fontSize: 11.5, color: "#919191" }}>Across open drops</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 14 }}>
        {/* Recent drops — spans 3 of 4 columns to align with KPI grid */}
        <div style={{ ...cardPadded, gridColumn: "span 3", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)" }}>Recent drops</span>
            <Link to="/app/drops" style={{ fontSize: 13, fontWeight: 600, color: "var(--vaultd-accent, #1a1a1a)" }}>
              View all →
            </Link>
          </div>

          {recentDrops.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ margin: "0 auto 12px" }}>
                <rect x="3" y="8" width="18" height="12" rx="2" stroke="#c9cccf" strokeWidth="1.5" />
                <path d="M3 8l9-5 9 5" stroke="#c9cccf" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p style={{ fontSize: 13.5, color: "#6d7175", margin: "0 0 14px 0" }}>
                No drops yet. Create your first drop to get started.
              </p>
              <Link to="/app/drops?new=1">
                <button type="button" style={primaryButtonStyle}>Create drop</button>
              </Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0, overflowY: "auto" }}>
              {recentDrops.map((drop) => (
                <div
                  key={drop.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 0",
                    borderBottom: "1px solid #f0f0f0",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1a1a1a" }}>{drop.name}</span>
                    <StatusBadge status={drop.status} />
                  </div>
                  <span style={{ fontSize: 12, color: "#919191" }}>
                    {new Date(drop.createdAt).toLocaleDateString("en-US")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column — 1 column, same width as one KPI card */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, overflow: "hidden" }}>
          {!setupComplete && (
            <div style={cardPadded}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)", marginBottom: 10 }}>
                Setup progress
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "#f0f0f0", overflow: "hidden", marginBottom: 8 }}>
                <div
                  style={{
                    height: "100%",
                    width: `${(completedSteps / steps.length) * 100}%`,
                    background: "var(--vaultd-accent, #1a1a1a)",
                    borderRadius: 999,
                  }}
                />
              </div>
              <p style={{ fontSize: 12, color: "#919191", margin: "0 0 8px 0" }}>
                {completedSteps} of {steps.length} steps complete
              </p>
              {nextStep && (
                <p style={{ fontSize: 12.5, color: "#303030", margin: 0 }}>
                  <strong style={{ color: "#1a1a1a" }}>Next:</strong>{" "}
                  <Link to={nextStep.to} style={{ color: "var(--vaultd-accent, #1a1a1a)", fontWeight: 600 }}>
                    {nextStep.label}
                  </Link>
                </p>
              )}
            </div>
          )}

          <div style={cardPadded}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)", marginBottom: 10 }}>
              Navigation
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {visibleNavLinks.map((link) => (
                <Link key={link.to} to={link.to} style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div style={cardPadded}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)", marginBottom: 6 }}>
              Your plan
            </div>
            <p style={{ fontSize: 13, color: "#303030", margin: "0 0 10px 0" }}>{planSummary?.label}</p>
            <Link to="/app/plans?from=home" style={{ fontSize: 13, fontWeight: 600, color: "var(--vaultd-accent, #1a1a1a)" }}>
              View all plans →
            </Link>
          </div>

          <div style={{ ...cardPadded, flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)", marginBottom: 10 }}>
              Resources
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Link to="/app/help?from=home" style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "flex", alignItems: "center", gap: 6 }}>
                Help
                {hasNewFeatures && (
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#c2410c" }} />
                )}
              </Link>
              <Link to="/app/support?from=home" style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>
                Contact support
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
