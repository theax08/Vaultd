import React from "react";
import { useLoaderData, Link } from "react-router";
import { GridIcon, pageHeaderTitleStyle, HighlightText } from "../styles/pop-ui";

export const loader = async ({ request }) => {
  const [{ authenticate }, dbModule] = await Promise.all([
    import("../shopify.server"),
    import("../db.server"),
  ]);

  const db =
    dbModule.default ??
    dbModule.prisma ??
    dbModule.db ??
    dbModule.client ??
    dbModule;

  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const { runAutoDropLifecycle } = await import("../drop-lifecycle.server");
  await runAutoDropLifecycle(shopDomain);

  // On inclut waitlistEntries et orders pour pouvoir faire des fallbacks corrects
  const drops = await db.drop.findMany({
    where: { shopDomain },
    orderBy: {
      startTime: "desc",
    },
    include: {
      waitlistEntries: true,
      orders: true,
    },
  });

  // --- Calculs de base sur tous les drops ---

  let totalRevenueAllDrops = 0;
  let dropsWithFinalStats = 0;
  let totalConvRate = 0;

  let totalSelloutSeconds = 0;
  let selloutSamples = 0;
  let fastestSelloutSeconds = null;

  for (const d of drops) {
    const revenue = d.finalRevenue != null ? Number(d.finalRevenue) : 0;
    totalRevenueAllDrops += revenue;

    if (typeof d.finalConversionRate === "number") {
      totalConvRate += d.finalConversionRate;
      dropsWithFinalStats += 1;
    }

    const selloutSeconds =
      d.selloutTimeSeconds ??
      (d.startTime && d.endTime
        ? Math.max(
            0,
            Math.round((d.endTime.getTime() - d.startTime.getTime()) / 1000)
          )
        : null);

    if (selloutSeconds != null && selloutSeconds > 0) {
      totalSelloutSeconds += selloutSeconds;
      selloutSamples += 1;

      if (fastestSelloutSeconds == null || selloutSeconds < fastestSelloutSeconds) {
        fastestSelloutSeconds = selloutSeconds;
      }
    }
  }

  const dropsCompleted = drops.filter(
    (d) => d.status === "ENDED" || d.soldOut === true
  ).length;

  const avgConvRate =
    dropsWithFinalStats > 0 ? totalConvRate / dropsWithFinalStats : null;

  const avgSelloutSeconds =
    selloutSamples > 0 ? totalSelloutSeconds / selloutSamples : null;

  function formatDurationFromSeconds(seconds) {
    if (seconds == null) return null;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h${String(m).padStart(2, "0")}m`;
  }

  const summary = {
    totalRevenueAllDrops,
    dropsCompleted,
    avgConvRate,
    avgSelloutTime: formatDurationFromSeconds(
      avgSelloutSeconds != null ? Math.round(avgSelloutSeconds) : null
    ),
    fastestSelloutTime: formatDurationFromSeconds(fastestSelloutSeconds),
  };

  // --- Préparation liste de drops + comparaison avec le précédent ---

  const mappedDrops = drops.map((drop) => {
    const start = drop.startTime ?? drop.createdAt;
    const end =
      drop.status === "LIVE" ? new Date() : drop.endTime ?? drop.updatedAt;

    const diffMs = end.getTime() - start.getTime();
    const totalMinutes = Math.max(0, Math.round(diffMs / 60000));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    const durationLabel = `${h}h${String(m).padStart(2, "0")}m`;

    const dateLabel = start.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const startTimeLabel = start.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const endTimeLabel = end.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const revenueNumber = drop.finalRevenue ? Number(drop.finalRevenue) : 0;
    const revenueLabel = `$${revenueNumber.toLocaleString("en-US")}`;

    const convRateNumber =
      typeof drop.finalConversionRate === "number"
        ? drop.finalConversionRate
        : null;
    const convRateLabel =
      convRateNumber != null ? `${convRateNumber.toFixed(1)}%` : "N/A";

    // ICI : on utilise les relations si les champs "final*" ne sont pas remplis
    const waitlistCount =
      drop.finalWaitlistTotal != null
        ? drop.finalWaitlistTotal
        : drop.waitlistEntries?.length ?? 0;

    const buyersCount =
      drop.finalBuyersCount != null
        ? drop.finalBuyersCount
        : drop.finalOrderCount != null
        ? drop.finalOrderCount
        : drop.orders?.length ?? 0;

    const statusNormalized =
      drop.soldOut === true
        ? "SOLD_OUT"
        : drop.status === "LIVE"
        ? "LIVE"
        : drop.status === "DRAFT"
        ? "DRAFT"
        : "PARTIAL";

    return {
      raw: drop,
      id: drop.id,
      displayId: drop.externalId ?? drop.id,
      name: drop.name,
      status: statusNormalized,
      date: dateLabel,
      startTime: startTimeLabel,
      endTime: endTimeLabel,
      duration: durationLabel,
      totalItems: drop.maxUnits,
      revenueNumber,
      revenue: revenueLabel,
      convRateNumber,
      conversionRate: convRateLabel,
      waitlistCount,
      buyersCount,
      opacity075: drop.name.toLowerCase().includes("beta"),
      revenueDelta: null,
      revenueDeltaPrefix: null,
      conversionDelta: null,
      conversionDeltaPrefix: null,
    };
  });

  // Comparaison avec le drop précédent (dans la liste triée desc)
  for (let i = 0; i < mappedDrops.length; i++) {
    const current = mappedDrops[i];
    const previous = mappedDrops[i + 1]; // i+1 = précédent dans le temps

    // Revenue delta
    if (
      previous &&
      previous.revenueNumber != null &&
      previous.revenueNumber > 0
    ) {
      const prevRevenue = previous.revenueNumber;
      const curRevenue = current.revenueNumber;
      const deltaPct =
        prevRevenue > 0 ? ((curRevenue - prevRevenue) / prevRevenue) * 100 : 0;

      const prefix = deltaPct >= 0 ? "+" : "−";
      const absPct = Math.abs(deltaPct).toFixed(0);

      current.revenueDelta = `${prefix}${absPct}% vs prev`;
      current.revenueDeltaPrefix = prefix === "+" ? "+" : "-";
    } else if (!previous) {
      current.revenueDelta = "N/A (1st drop)";
      current.revenueDeltaPrefix = null;
    } else {
      current.revenueDelta = "—";
      current.revenueDeltaPrefix = null;
    }

    // Conversion delta
    if (
      previous &&
      current.convRateNumber != null &&
      previous.convRateNumber != null &&
      previous.convRateNumber > 0
    ) {
      const prevConv = previous.convRateNumber;
      const curConv = current.convRateNumber;
      const deltaPct =
        prevConv > 0 ? ((curConv - prevConv) / prevConv) * 100 : 0;

      const prefix = deltaPct >= 0 ? "+" : "−";
      const absPct = Math.abs(deltaPct).toFixed(1);
      current.conversionDelta = `${prefix}${absPct}%`;
      current.conversionDeltaPrefix = prefix === "+" ? "+" : "-";
    } else if (!previous) {
      current.conversionDelta = "N/A";
      current.conversionDeltaPrefix = null;
    } else {
      current.conversionDelta = "—";
      current.conversionDeltaPrefix = null;
    }
  }

  return {
    drops: mappedDrops,
    summary,
  };
};

const STATUS_OPTIONS = [
  { key: "SOLD_OUT", label: "Sold out" },
  { key: "PARTIAL", label: "Partial" },
  { key: "LIVE", label: "Live" },
  { key: "DRAFT", label: "Draft" },
];

const SORT_OPTIONS = [
  { key: "date", label: "Date" },
  { key: "revenue", label: "Revenue" },
  { key: "conversionRate", label: "Conv. rate" },
  { key: "waitlist", label: "Waitlist" },
];

function sortValue(drop, key) {
  switch (key) {
    case "revenue":
      return drop.revenueNumber ?? 0;
    case "conversionRate":
      return drop.convRateNumber ?? 0;
    case "waitlist":
      return drop.waitlistCount ?? 0;
    case "date":
    default:
      return new Date(drop.raw.startTime ?? drop.raw.createdAt).getTime();
  }
}

export default function DropsHistoryPage() {
  const { drops, summary } = useLoaderData();

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState([]);
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [sortOpen, setSortOpen] = React.useState(false);
  const [sortKey, setSortKey] = React.useState("date");
  const [sortDir, setSortDir] = React.useState("desc");

  const toggleStatusFilter = (key) => {
    setStatusFilter((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const visibleDrops = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    let filtered = drops.filter((drop) => {
      const matchesQuery =
        !query ||
        drop.name.toLowerCase().includes(query) ||
        drop.displayId.toLowerCase().includes(query) ||
        drop.date.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter.length === 0 || statusFilter.includes(drop.status);

      return matchesQuery && matchesStatus;
    });

    filtered = [...filtered].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      return sortDir === "asc" ? va - vb : vb - va;
    });

    return filtered;
  }, [drops, search, statusFilter, sortKey, sortDir]);

  // Formattage des KPI de header
  const totalRevenueLabel = `$${summary.totalRevenueAllDrops.toLocaleString(
    "en-US"
  )}`;
  const avgConvLabel =
    summary.avgConvRate != null
      ? `${summary.avgConvRate.toFixed(1)}%`
      : "N/A";
  const avgSelloutLabel = summary.avgSelloutTime ?? "N/A";
  const fastestSelloutLabel = summary.fastestSelloutTime ?? "N/A";

  // Pour la flèche / couleur du header, on compare le dernier drop au précédent
  const lastDrop = drops[0];
  const prevDrop = drops[1];

  let headerRevenueTrend = null;
  let headerConvTrend = null;

  if (
    lastDrop &&
    prevDrop &&
    lastDrop.revenueNumber != null &&
    prevDrop.revenueNumber != null &&
    prevDrop.revenueNumber > 0
  ) {
    const delta =
      ((lastDrop.revenueNumber - prevDrop.revenueNumber) /
        prevDrop.revenueNumber) *
      100;
    headerRevenueTrend = delta;
  }

  if (
    lastDrop &&
    prevDrop &&
    lastDrop.convRateNumber != null &&
    prevDrop.convRateNumber != null &&
    prevDrop.convRateNumber > 0
  ) {
    const delta =
      ((lastDrop.convRateNumber - prevDrop.convRateNumber) /
        prevDrop.convRateNumber) *
      100;
    headerConvTrend = delta;
  }

  const revenueTrendLabel =
    headerRevenueTrend != null
      ? `${headerRevenueTrend >= 0 ? "↑" : "↓"} ${Math.abs(
          headerRevenueTrend
        ).toFixed(0)}%`
      : "N/A";

  const convTrendLabel =
    headerConvTrend != null
      ? `${headerConvTrend >= 0 ? "↑" : "↓"} ${Math.abs(
          headerConvTrend
        ).toFixed(1)}%`
      : "N/A";

  const revenueTrendColor =
    headerRevenueTrend == null
      ? "#919191"
      : headerRevenueTrend >= 0
      ? "#007a5a"
      : "#c2410c";

  const convTrendColor =
    headerConvTrend == null
      ? "#919191"
      : headerConvTrend >= 0
      ? "#007a5a"
      : "#c2410c";

  return (
    <div
      style={{
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif',
      }}
    >

      {/* KPI cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 14,
          marginBottom: 20,
        }}
      >
        {/* Card 1 — TOTAL REVENUE (ALL DROPS) */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e3e3e3",
            borderTop: "3px solid var(--vaultd-accent, #1a1a1a)",
            borderRadius: 10,
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: "#919191",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 7,
            }}
          >
            TOTAL REVENUE (ALL DROPS)
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#1a1a1a",
              letterSpacing: -0.8,
            }}
          >
            {totalRevenueLabel}
          </div>
          <div
            style={{
              fontSize: 12,
              marginTop: 3,
            }}
          >
            <span
              style={{
                color: revenueTrendColor,
                fontWeight: 600,
              }}
            >
              {revenueTrendLabel}
            </span>
            <span
              style={{
                color: "#919191",
              }}
            >
              {" "}
              vs last period
            </span>
          </div>
        </div>

        {/* Card 2 — DROPS COMPLETED */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e3e3e3",
            borderTop: "3px solid var(--vaultd-accent, #1a1a1a)",
            borderRadius: 10,
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: "#919191",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 7,
            }}
          >
            DROPS COMPLETED
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#1a1a1a",
              letterSpacing: -0.8,
            }}
          >
            {summary.dropsCompleted}
          </div>
          <div
            style={{
              fontSize: 12,
              marginTop: 3,
              color: "#919191",
            }}
          >
            {/* On pourrait comptabiliser sold out / partial en détail,
                pour l'instant on laisse une phrase simple */}
            {/* 3 sold out · 1 partial */}
            {/* Si tu veux la vraie répartition, on peut la calculer aussi */}
            {summary.dropsCompleted} completed drops
          </div>
        </div>

        {/* Card 3 — AVG CONVERSION RATE */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e3e3e3",
            borderTop: "3px solid var(--vaultd-accent, #1a1a1a)",
            borderRadius: 10,
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: "#919191",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 7,
            }}
          >
            AVG CONVERSION RATE
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#1a1a1a",
              letterSpacing: -0.8,
            }}
          >
            {avgConvLabel}
          </div>
          <div
            style={{
              fontSize: 12,
              marginTop: 3,
            }}
          >
            <span
              style={{
                color: convTrendColor,
                fontWeight: 600,
              }}
            >
              {convTrendLabel}
            </span>
            <span
              style={{
                color: "#919191",
              }}
            >
              {" "}
              trend
            </span>
          </div>
        </div>

        {/* Card 4 — AVG SELL-OUT TIME */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e3e3e3",
            borderTop: "3px solid var(--vaultd-accent, #1a1a1a)",
            borderRadius: 10,
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: "#919191",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 7,
            }}
          >
            AVG SELL-OUT TIME
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#1a1a1a",
              letterSpacing: -0.8,
            }}
          >
            {avgSelloutLabel}
          </div>
          <div
            style={{
              fontSize: 12,
              marginTop: 3,
              color: "#919191",
            }}
          >
            Fastest: {fastestSelloutLabel}
          </div>
        </div>
      </div>

      {/* Barre de recherche + filtres */}
      <div
        className="vh-toolbar"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          flexWrap: "nowrap",
          position: "relative",
          zIndex: 20,
        }}
      >
        {/* Search input */}
        <div
          style={{
            position: "relative",
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            minWidth: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 11,
              top: "50%",
              transform: "translateY(-50%)",
              display: "inline-flex",
              color: "#919191",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="6"
                cy="6"
                r="3.5"
                stroke="#919191"
                strokeWidth="1.4"
              />
              <line
                x1="8.5"
                y1="8.5"
                x2="11.5"
                y2="11.5"
                stroke="#919191"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search by drop name, ID, date…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "7px 10px 7px 34px",
              border: "1px solid #c9cccf",
              borderRadius: 8,
              fontSize: 13.5,
              fontFamily: "inherit",
              color: "#1a1a1a",
              background: "#ffffff",
            }}
          />
        </div>

        {/* Bouton Filter */}
        <div style={{ position: "relative", flexGrow: 0, flexShrink: 0, margin: 0 }}>
          <button
            type="button"
            onClick={() => {
              setFilterOpen((v) => !v);
              setSortOpen(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              border: "1px solid #c9cccf",
              borderRadius: 8,
              background: "#ffffff",
              fontSize: 13,
              fontWeight: 500,
              color: "#303030",
              whiteSpace: "nowrap",
              cursor: "pointer",
            }}
          >
            <span style={{ display: "inline-flex", color: "#505050" }}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2 3H12L9 6.5V10L5 11V6.5L2 3Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span>Filter</span>
            <span
              style={{
                fontSize: 11,
                background: "var(--vaultd-accent, #1a1a1a)",
                color: "#ffffff",
                borderRadius: 10,
                padding: "1px 6px",
                fontWeight: 700,
              }}
            >
              {statusFilter.length}
            </span>
          </button>

          {filterOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                background: "#ffffff",
                border: "1px solid #e0e0e0",
                borderRadius: 8,
                boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
                padding: 8,
                zIndex: 10,
                minWidth: 160,
              }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <div key={opt.key} style={{ padding: "2px 8px" }}>
                  <s-checkbox
                    label={opt.label}
                    checked={statusFilter.includes(opt.key)}
                    onChange={() => toggleStatusFilter(opt.key)}
                  />
                </div>
              ))}
              {statusFilter.length > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter([])}
                  style={{
                    marginTop: 4,
                    width: "100%",
                    padding: "5px 0",
                    border: "none",
                    background: "transparent",
                    color: "#6d7175",
                    fontSize: 12,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bouton Sort */}
        <div style={{ position: "relative", flexGrow: 0, flexShrink: 0, margin: 0 }}>
          <button
            type="button"
            onClick={() => {
              setSortOpen((v) => !v);
              setFilterOpen(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              border: "1px solid #c9cccf",
              borderRadius: 8,
              background: "#ffffff",
              fontSize: 13,
              fontWeight: 500,
              color: "#303030",
              whiteSpace: "nowrap",
              cursor: "pointer",
            }}
          >
            <span style={{ display: "inline-flex" }}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <line
                  x1="3"
                  y1="3"
                  x2="11"
                  y2="3"
                  stroke="#505050"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <line
                  x1="3"
                  y1="7"
                  x2="11"
                  y2="7"
                  stroke="#505050"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <line
                  x1="3"
                  y1="11"
                  x2="8"
                  y2="11"
                  stroke="#505050"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span>
              Sort:{" "}
              {SORT_OPTIONS.find((o) => o.key === sortKey)?.label}{" "}
              {sortDir === "desc" ? "↓" : "↑"}
            </span>
          </button>

          {sortOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                background: "#ffffff",
                border: "1px solid #e0e0e0",
                borderRadius: 8,
                boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
                padding: 6,
                zIndex: 10,
                minWidth: 160,
              }}
            >
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    if (sortKey === opt.key) {
                      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                    } else {
                      setSortKey(opt.key);
                      setSortDir("desc");
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "6px 8px",
                    fontSize: 13,
                    color: sortKey === opt.key ? "#1a1a1a" : "#505050",
                    fontWeight: sortKey === opt.key ? 600 : 400,
                    background:
                      sortKey === opt.key ? "#f2f2f2" : "transparent",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span>{opt.label}</span>
                  {sortKey === opt.key && (
                    <span>{sortDir === "desc" ? "↓" : "↑"}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cartes de drops */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {visibleDrops.length === 0 && (
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e3e3e3",
              borderRadius: 10,
              padding: "24px 18px",
              textAlign: "center",
              color: "#6d7175",
              fontSize: 13.5,
            }}
          >
            No drops match your search/filters.
          </div>
        )}
        {visibleDrops.map((drop) => {
          const isSoldOut = drop.status === "SOLD_OUT";
          const isPartial = drop.status === "PARTIAL";
          const isLive = drop.status === "LIVE";
          const isDraft = drop.status === "DRAFT";

          const revenueDeltaPositive =
            drop.revenueDelta &&
            drop.revenueDeltaPrefix === "+";
          const convDeltaPositive =
            drop.conversionDelta &&
            drop.conversionDeltaPrefix === "+";

          const statusDotStyle = {
            width: 9,
            height: 9,
            borderRadius: "50%",
            flexShrink: 0,
            background: isLive ? "#4ade80" : isDraft ? "#d1d5db" : "#9ca3af",
            boxShadow: isLive ? "0 0 6px rgba(74,222,128,0.6)" : "none",
          };

          const cardStyle = {
            background: "#ffffff",
            border: "1px solid #e3e3e3",
            borderRadius: 10,
            padding: "16px 18px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            transition: "border-color 0.15s ease",
            opacity: drop.opacity075 ? 0.75 : 1,
          };

          return (
            <div
              key={drop.id}
              style={cardStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#b5b5b5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#e3e3e3";
              }}
            >
              {/* Point de statut */}
              <div style={statusDotStyle} />

              {/* Bloc info drop */}
              <div style={{ flex: 1 }}>
                {/* Ligne 1 */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--vaultd-accent, #1a1a1a)",
                    }}
                  >
                    <HighlightText text={drop.name} query={search} />
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontFamily:
                        '"SF Mono","Fira Code",ui-monospace,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
                      color: "#919191",
                      background: "#f2f2f2",
                      borderRadius: 4,
                      padding: "2px 7px",
                    }}
                  >
                    {drop.displayId}
                  </div>

                  {isSoldOut && (
                    <div
                      style={{
                        background: "#f0fdf4",
                        color: "#007a5a",
                        border: "1px solid #d1fae5",
                        borderRadius: 20,
                        padding: "2px 9px",
                        fontSize: 11.5,
                        fontWeight: 600,
                      }}
                    >
                      Sold out
                    </div>
                  )}
                  {isPartial && (
                    <div
                      style={{
                        background: "#fff7ed",
                        color: "#c2410c",
                        border: "1px solid #fed7aa",
                        borderRadius: 20,
                        padding: "2px 9px",
                        fontSize: 11.5,
                        fontWeight: 600,
                      }}
                    >
                      Partial
                    </div>
                  )}
                  {isDraft && (
                    <div
                      style={{
                        background: "#f3f4f6",
                        color: "#6b7280",
                        border: "1px solid #e5e7eb",
                        borderRadius: 20,
                        padding: "2px 9px",
                        fontSize: 11.5,
                        fontWeight: 600,
                      }}
                    >
                      Draft
                    </div>
                  )}
                </div>

                {/* Ligne 2 */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  {/* Date */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <rect
                          x="1.2"
                          y="2.4"
                          width="9.6"
                          height="8"
                          rx="1.2"
                          stroke="#6d7175"
                          strokeWidth="1"
                        />
                        <line
                          x1="1.2"
                          y1="4"
                          x2="10.8"
                          y2="4"
                          stroke="#6d7175"
                          strokeWidth="1"
                        />
                        <line
                          x1="4"
                          y1="1"
                          x2="4"
                          y2="3"
                          stroke="#6d7175"
                          strokeWidth="1"
                          strokeLinecap="round"
                        />
                        <line
                          x1="8"
                          y1="1"
                          x2="8"
                          y2="3"
                          stroke="#6d7175"
                          strokeWidth="1"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <span
                      style={{
                        fontSize: 12.5,
                        color: "#6d7175",
                      }}
                    >
                      {drop.date} · {drop.startTime} – {drop.endTime}
                    </span>
                  </div>

                  {/* Durée */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <circle
                          cx="6"
                          cy="6"
                          r="4.4"
                          stroke="#6d7175"
                          strokeWidth="1"
                        />
                        <line
                          x1="6"
                          y1="3.2"
                          x2="6"
                          y2="6"
                          stroke="#6d7175"
                          strokeWidth="1"
                          strokeLinecap="round"
                        />
                        <line
                          x1="6"
                          y1="6"
                          x2="8"
                          y2="7.2"
                          stroke="#6d7175"
                          strokeWidth="1"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <span
                      style={{
                        fontSize: 12.5,
                        color: "#6d7175",
                      }}
                    >
                      {drop.duration} live
                    </span>
                  </div>

                  {/* Stock */}
                  <div>
                    <span
                      style={{
                        fontSize: 12.5,
                        color: "#6d7175",
                      }}
                    >
                      {drop.totalItems} items
                    </span>
                  </div>
                </div>
              </div>

              {/* Bloc métriques */}
              <div
                style={{
                  display: "flex",
                  gap: 20,
                  alignItems: "center",
                }}
              >
                {/* REVENUE */}
                <div
                  style={{
                    textAlign: "right",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: "#a0a0a0",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      marginBottom: 2,
                    }}
                  >
                    REVENUE
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: "#1a1a1a",
                      letterSpacing: -0.4,
                    }}
                  >
                    {drop.revenue}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color:
                        drop.revenueDelta === "N/A (1st drop)"
                          ? "#b0b0b0"
                          : drop.revenueDelta === "—"
                          ? "#6d7175"
                          : revenueDeltaPositive
                          ? "#007a5a"
                          : "#c2410c",
                    }}
                  >
                    {drop.revenueDelta}
                  </div>
                </div>

                {/* Divider */}
                <div
                  style={{
                    width: 1,
                    height: 40,
                    background: "#f0f0f0",
                    flexShrink: 0,
                  }}
                />

                {/* CONV. RATE */}
                <div
                  style={{
                    textAlign: "right",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: "#a0a0a0",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      marginBottom: 2,
                    }}
                  >
                    CONV. RATE
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: "#1a1a1a",
                      letterSpacing: -0.4,
                    }}
                  >
                    {drop.conversionRate}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color:
                        drop.conversionDelta === "N/A"
                          ? "#b0b0b0"
                          : drop.conversionDelta === "—"
                          ? "#6d7175"
                          : convDeltaPositive
                          ? "#007a5a"
                          : "#c2410c",
                    }}
                  >
                    {drop.conversionDelta}
                  </div>
                </div>

                {/* Divider */}
                <div
                  style={{
                    width: 1,
                    height: 40,
                    background: "#f0f0f0",
                    flexShrink: 0,
                  }}
                />

                {/* WAITLIST */}
                <div
                  style={{
                    textAlign: "right",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: "#a0a0a0",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      marginBottom: 2,
                    }}
                  >
                    WAITLIST
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: "#1a1a1a",
                      letterSpacing: -0.4,
                    }}
                  >
                    {drop.waitlistCount}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#919191",
                    }}
                  >
                    {drop.buyersCount} buyers
                  </div>
                </div>
              </div>

              {/* Bouton Details → */}
              <Link
                to={`/app/drops-history/detail/${drop.id}`}
                style={{
                  background: "var(--vaultd-accent, #1a1a1a)",
                  color: "#ffffff",
                  border: "none",
                  padding: "7px 16px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Details →
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
