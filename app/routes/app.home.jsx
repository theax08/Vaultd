import { useEffect, useState } from "react";
import { Link, redirect, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAccountForShop } from "../vaultd-account.server";
import { PLAN_ORDER, PLAN_SUMMARIES, PLAN_FEATURES, getPlanFeatureList } from "../vaultd-plans";
import {
  pagePopStyle,
  cardPadded,
  cardLabel,
  primaryButtonStyle,
  getDropDisplayStatus,
  StatusPill,
  monoNumberStyle,
} from "../styles/pop-ui";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const url = new URL(request.url);

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

  if (!account) {
    // Forward every original param (shop, host, embedded...) — App Bridge
    // throws "missing required configuration fields: shop" if `shop` isn't
    // in the URL, which a hand-picked param list here previously dropped.
    const params = new URLSearchParams(url.searchParams);
    params.set("onboarding", "1");
    return redirect(`/app/settings?${params.toString()}`);
  }

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
  let activeEmailCount = 0;

  try {
    [
      endedDrops,
      completedThisMonthCount,
      totalDropsCount,
      totalSignupsEver,
      activeWaitlistMembers,
      launchedDropCount,
      recentDrops,
      activeEmailCount,
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
        select: { id: true, name: true, status: true, createdAt: true, autoLaunch: true, startTime: true },
      }),
      db.emailAutomation.count({ where: { shopDomain, active: true } }),
    ]);
  } catch {}

  // Un drop programme (auto-launch, date future) dont aucun email n'est
  // actif partirait en silence — le marchand croit son tunnel branche.
  const hasScheduledDropWithNoActiveEmails =
    activeEmailCount === 0 &&
    recentDrops.some(
      (d) => d.status === "DRAFT" && d.autoLaunch && d.startTime && new Date(d.startTime) > new Date()
    );

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

  const rawPlan = account?.plan ?? null;
  const plan = PLAN_ORDER.includes(rawPlan) ? rawPlan : null;

  return {
    stats: {
      totalRevenue,
      completedThisMonthCount,
      avgConvRate,
      activeWaitlistMembers,
      hasCompletedDrops: endedDrops.length > 0,
    },
    steps,
    recentDrops,
    plan,
    features: PLAN_FEATURES[plan] ?? [],
    hasNewFeatures: account ? account.lastSeenPlan !== account.plan : false,
    hasScheduledDropWithNoActiveEmails,
  };
};

const NAV_LINKS = [
  { to: "/app/drops", label: "Drops" },
  { to: "/app/waitlists", label: "Waitlists" },
  { to: "/app/drops-history", label: "Drop History", feature: "drop_history" },
  { to: "/app/emails", label: "Emails", feature: "automated_emails" },
  { to: "/app/settings", label: "Settings" },
];

// Tour d'intro — ce que fait chaque partie centrale de l'app, sans mention
// de palier de plan (juste les fonctionnalites). Concis a dessein : une
// carte pleine d'un paragraphe par etape se lit comme une corvee.
const TOUR_STEPS = [
  {
    title: "Create a drop",
    body: "Pick products, a start time, and a unit limit. Turn on auto-launch and Vaultd opens and closes it for you.",
  },
  {
    title: "Build a waitlist",
    body: "Customers join before it opens. Positions update live, and referrals let them move up the line.",
  },
  {
    title: "Go live",
    body: "Watch sales, traffic, and remaining stock in real time from the Live dashboard while a drop runs.",
  },
  {
    title: "Automated emails",
    body: "Confirmation, position updates, and access links go out on their own — nothing to send by hand.",
  },
  {
    title: "Hype widgets",
    body: "Embed a countdown or waitlist block on your storefront so customers see it right where they shop.",
  },
  {
    title: "Drop history",
    body: "Once a drop ends, revenue, conversion, and sell-out time are logged so you can compare drops over time.",
  },
];

function HomeTour({ onDismiss }) {
  const [step, setStep] = useState(0);
  const isLast = step === TOUR_STEPS.length - 1;
  const current = TOUR_STEPS[step];

  return (
    <div style={{ ...cardPadded, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--vd-ink-3, #8B93A0)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
            Getting started · {step + 1} / {TOUR_STEPS.length}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#ffffff",
                background: "var(--vd-ink, #14181F)",
                borderRadius: "50%",
                width: 18,
                height: 18,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {step + 1}
            </span>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: "#1a1a1a" }}>{current.title}</span>
          </div>
          <p style={{ fontSize: 13, color: "#6d7175", margin: 0, lineHeight: 1.5, maxWidth: 560 }}>
            {current.body}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            aria-label="Previous"
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              border: "1px solid var(--vd-hairline, #e3e3e3)",
              background: "#fff",
              color: step === 0 ? "#c9cccf" : "#1a1a1a",
              cursor: step === 0 ? "default" : "pointer",
            }}
          >
            ←
          </button>
          {!isLast ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(TOUR_STEPS.length - 1, s + 1))}
              aria-label="Next"
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                border: "1px solid var(--vd-hairline, #e3e3e3)",
                background: "#fff",
                color: "#1a1a1a",
                cursor: "pointer",
              }}
            >
              →
            </button>
          ) : (
            <button type="button" onClick={onDismiss} style={primaryButtonStyle}>
              Got it
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 5, marginTop: 14 }}>
        {TOUR_STEPS.map((s, i) => (
          <span
            key={s.title}
            style={{
              height: 3,
              flex: 1,
              borderRadius: 2,
              background: i <= step ? "var(--vd-ink, #14181F)" : "var(--vd-hairline, #e3e3e3)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { stats, steps, recentDrops, plan, features, hasNewFeatures, hasScheduledDropWithNoActiveEmails } = useLoaderData();

  const completedSteps = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done);
  const setupComplete = completedSteps === steps.length;
  const planSummary = PLAN_SUMMARIES[plan];
  const visibleNavLinks = NAV_LINKS.filter((link) => !link.feature || features.includes(link.feature));

  // null tant qu'on n'a pas lu le localStorage (evite un flash au premier
  // rendu serveur, qui ne peut pas savoir si le marchand l'a deja fermee).
  const [tourVisible, setTourVisible] = useState(null);
  useEffect(() => {
    try {
      setTourVisible(localStorage.getItem("vaultd:home-tour-dismissed") !== "true");
    } catch {
      setTourVisible(true);
    }
  }, []);
  const dismissTour = () => {
    try {
      localStorage.setItem("vaultd:home-tour-dismissed", "true");
    } catch {}
    setTourVisible(false);
  };

  return (
    <div style={pagePopStyle}>

      {features.includes("automated_emails") && hasScheduledDropWithNoActiveEmails && (
        <div
          style={{
            ...cardPadded,
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            background: "var(--vd-sched-bg, #FFF4DC)",
            border: "none",
          }}
        >
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--vd-sched-fg, #7A5600)" }}>
              A drop is scheduled, but no emails are active
            </div>
            <p style={{ fontSize: 12.5, color: "var(--vd-sched-fg, #7A5600)", margin: "2px 0 0 0" }}>
              Customers who join the waitlist won't hear from you unless you turn at least one automation on.
            </p>
          </div>
          <Link to="/app/emails" style={{ ...primaryButtonStyle, textDecoration: "none", flexShrink: 0 }}>
            Review emails →
          </Link>
        </div>
      )}

      {/* KPI cards — hidden until a drop has actually completed: an
          all-zero row at install reads as "broken", not "new" (VAULTD-DESIGN.md §5) */}
      {stats.hasCompletedDrops ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 14, marginBottom: 16 }}>
          <div style={{ ...cardPadded, borderTop: "3px solid var(--vaultd-accent, #1a1a1a)" }}>
            <div style={cardLabel}>TOTAL REVENUE</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", ...monoNumberStyle }}>
              ${stats.totalRevenue.toLocaleString("en-US")}
            </div>
            <div style={{ fontSize: 11.5, color: "#919191" }}>All drops combined</div>
          </div>
          <div style={{ ...cardPadded, borderTop: "3px solid var(--vaultd-accent, #1a1a1a)" }}>
            <div style={cardLabel}>DROPS COMPLETED</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", ...monoNumberStyle }}>
              {stats.completedThisMonthCount}
            </div>
            <div style={{ fontSize: 11.5, color: "#919191" }}>This month</div>
          </div>
          <div style={{ ...cardPadded, borderTop: "3px solid var(--vaultd-accent, #1a1a1a)" }}>
            <div style={cardLabel}>AVG CONV RATE</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", ...monoNumberStyle }}>
              {stats.avgConvRate != null ? `${stats.avgConvRate.toFixed(1)}%` : "—"}
            </div>
            <div style={{ fontSize: 11.5, color: "#919191" }}>Across all drops</div>
          </div>
          <div style={{ ...cardPadded, borderTop: "3px solid var(--vaultd-accent, #1a1a1a)" }}>
            <div style={cardLabel}>ACTIVE WAITLIST MEMBERS</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", ...monoNumberStyle }}>
              {stats.activeWaitlistMembers}
            </div>
            <div style={{ fontSize: 11.5, color: "#919191" }}>Across open drops</div>
          </div>
        </div>
      ) : (
        <div style={{ ...cardPadded, textAlign: "center", padding: "32px 24px", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)", marginBottom: 6 }}>
            Launch your first drop
          </div>
          <p style={{ fontSize: 13, color: "#6d7175", margin: "0 auto 16px", maxWidth: 420 }}>
            Schedule a date, connect your products, and Vaultd handles the queue and the emails. Revenue and conversion metrics will show up here once it sells.
          </p>
          <Link to="/app/drops?new=1">
            <button type="button" style={primaryButtonStyle}>Create drop</button>
          </Link>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 14, alignItems: "stretch" }}>
        {/* Left column: Recent drops, then the tour right below it — spans 3 of 4 columns */}
        <div style={{ gridColumn: "span 3", display: "flex", flexDirection: "column", gap: 14, overflow: "hidden" }}>
        <div style={{ ...cardPadded, display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 460, overflowY: "auto", paddingRight: 12 }}>
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
                    <StatusPill status={getDropDisplayStatus(drop)} />
                  </div>
                  <span style={{ fontSize: 12, color: "#919191", ...monoNumberStyle }}>
                    {new Date(drop.createdAt).toLocaleDateString("en-US")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        {tourVisible && <HomeTour onDismiss={dismissTour} />}
        </div>

        {/* Right column */}
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
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)", marginBottom: 4 }}>
              Your plan
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", margin: "0 0 8px 0" }}>
              {planSummary?.label ?? "No active plan"}
            </p>
            {plan && (() => {
              const features = getPlanFeatureList(plan);
              const preview = features.slice(0, 4);
              const rest = features.length - preview.length;
              return (
                <ul style={{ margin: "0 0 10px 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
                  {preview.map((f) => (
                    <li key={f} style={{ fontSize: 12, color: "#6d7175" }}>· {f}</li>
                  ))}
                  {rest > 0 && (
                    <li style={{ fontSize: 12, color: "#adadad" }}>+{rest} more</li>
                  )}
                </ul>
              );
            })()}
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
