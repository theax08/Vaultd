import { useState } from "react";
import { useLoaderData, Link } from "react-router";

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return { h, m, s };
}

function formatHm(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

function buildTimeBuckets(orders, startTime, endTime, bucketSeconds) {
  if (!startTime || !endTime || !(startTime instanceof Date) || !(endTime instanceof Date)) {
    return [];
  }

  const buckets = [];
  const start = startTime.getTime();
  const end = endTime.getTime();

  if (end <= start) return [];

  const bucketMs = bucketSeconds * 1000;
  const bucketCount = Math.ceil((end - start) / bucketMs);

  for (let i = 0; i < bucketCount; i++) {
    const bucketStart = start + i * bucketMs;
    const bucketEnd = bucketStart + bucketMs;

    const bucketOrders = orders.filter((order) => {
      const t = order.createdAt instanceof Date
        ? order.createdAt.getTime()
        : new Date(order.createdAt).getTime();
      return t >= bucketStart && t < bucketEnd;
    });

    const totalItems = bucketOrders.reduce(
      (sum, o) => sum + (o.itemCount ?? 0),
      0
    );

    buckets.push({
      start: new Date(bucketStart),
      end: new Date(bucketEnd),
      ordersCount: bucketOrders.length,
      itemsCount: totalItems,
    });
  }

  return buckets;
}

export const loader = async ({ params, request }) => {
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
  const dropId = params.dropId;

  // Charger le drop + relations de base
  const drop = await db.drop.findFirst({
    where: { id: dropId, shopDomain },
    include: {
      waitlistEntries: true,
    },
  });

  if (!drop) {
    throw new Response("Not found", { status: 404 });
  }

  // Drop précédent pour les comparaisons (%) — uniquement pertinent si le
  // drop courant a déjà une endTime (donc au moins LIVE/ENDED, jamais DRAFT).
  const previousDrop = drop.endTime
    ? await db.drop.findFirst({
        where: {
          shopDomain,
          status: "ENDED",
          endTime: { lt: drop.endTime },
        },
        orderBy: {
          endTime: "desc",
        },
      })
    : null;

  // Toutes les commandes de ce drop
  const orders = await db.dropOrder.findMany({
    where: { shopDomain, dropId },
    orderBy: { createdAt: "asc" },
  });

  // Sources de trafic pour ce drop
  const trafficSources = await db.dropTrafficSource.findMany({
    where: { shopDomain, dropId },
  });

  // Stats par produit (pour le classement "Most Demanded")
  const productStats = await db.dropProductStats.findMany({
    where: { shopDomain, dropId },
    orderBy: [{ lastSoldAt: "asc" }, { unitsSold: "desc" }],
  });

  const previousProductStats = previousDrop
    ? await db.dropProductStats.findMany({
        where: { shopDomain, dropId: previousDrop.id },
      })
    : [];
  const previousStatsByProductId = new Map(
    previousProductStats.map((p) => [p.productId, p])
  );

  // ==============
  // METRICS DE BASE
  // ==============

  const revenue = Number(drop.finalRevenue ?? 0);
  const previousRevenue = previousDrop
    ? Number(previousDrop.finalRevenue ?? 0)
    : null;
  const revenueDeltaPct =
    previousRevenue && previousRevenue > 0
      ? ((revenue - previousRevenue) / previousRevenue) * 100
      : null;

  const conversionRate =
    typeof drop.finalConversionRate === "number"
      ? drop.finalConversionRate
      : null;
  const previousConversionRate =
    previousDrop && typeof previousDrop.finalConversionRate === "number"
      ? previousDrop.finalConversionRate
      : null;
  const conversionDeltaPct =
    conversionRate !== null &&
    previousConversionRate !== null &&
    previousConversionRate > 0
      ? ((conversionRate - previousConversionRate) / previousConversionRate) * 100
      : null;

  const waitlistCount = drop.waitlistEntries?.length ?? 0;
  const unsubscribedCount =
    drop.waitlistEntries?.filter((e) => e.unsubscribedAt).length ?? 0;
  const netWaitlistCount = waitlistCount - unsubscribedCount;
  const buyersCount = drop.finalBuyersCount ?? drop.finalOrderCount ?? orders.length ?? 0;
  const totalItems = drop.maxUnits ?? 0;
  const visitorsTotal = trafficSources.reduce((sum, src) => sum + (src.visitors ?? 0), 0);

  // Interest rate = combien de vrais visiteurs se sont inscrits sur la
  // waitlist. Deal rate = combien d'inscrits sur la waitlist ont fini par
  // acheter. N/A seulement quand le denominateur est reellement 0 (pas
  // encore de visiteurs / pas encore d'inscrits) -- sinon 0% est une vraie
  // donnee (ex: personne n'a achete), pas une absence de donnee.
  const interestRate =
    visitorsTotal > 0 ? (waitlistCount / visitorsTotal) * 100 : null;
  const dealRate =
    waitlistCount > 0 ? (buyersCount / waitlistCount) * 100 : null;

  // Durée totale du drop en secondes
  const durationSeconds = (() => {
    const start = drop.startTime;
    const end = drop.endTime;
    if (start && end) {
      return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
    }
    return drop.selloutTimeSeconds ?? 0;
  })();

  const duration = formatDuration(durationSeconds);

  const dateLabel = drop.startTime
    ? drop.startTime.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "";

  const timeRangeLabel =
    drop.startTime && drop.endTime
      ? `${drop.startTime.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        })} – ${drop.endTime.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        })}`
      : "";

  const openedLabel = drop.startTime
    ? drop.startTime.toLocaleTimeString("fr-FR", { hour12: false })
    : "--:--:--";
  const closedLabel = drop.endTime
    ? drop.endTime.toLocaleTimeString("fr-FR", { hour12: false })
    : "--:--:--";

  // ==============
  // FUNNEL (visitors → purchased)
  // ==============
  // "Page access" et "Add to cart" retires : aucun evenement reel n'est
  // jamais enregistre pour ca aujourd'hui (pas de Web Pixel), donc ces deux
  // etapes etaient toujours figees a 0 -- trompeur. On ne garde que les deux
  // etapes pour lesquelles on a une vraie donnee : Visitors (DropTrafficSource,
  // alimente par le widget storefront) et Purchased (vraies commandes Shopify).

  const visitors = visitorsTotal;
  const purchased = orders.length;
  const funnelMax = Math.max(visitors, purchased, 1);

  const funnel = {
    visitors: {
      label: "Visitors",
      count: visitors,
      pctOfMax: (visitors / funnelMax) * 100,
    },
    purchased: {
      label: "Purchased",
      count: purchased,
      pctOfMax: (purchased / funnelMax) * 100,
      pctOfTotal: visitors > 0 ? (purchased / visitors) * 100 : null,
    },
  };

  // ==============
  // HEATMAP — granularite adaptative
  // ==============
  // Un pas fixe (5s ou 5min) ne convient pas a tous les drops : un drop
  // sold-out en 10 minutes noye les 5min-buckets (2 barres), un drop qui dure
  // 6h noie les 5s-buckets (4300+ barres). On calcule plutot une taille de
  // bucket qui vise ~40 barres, quelle que soit la duree reelle du drop.

  const startTime = drop.startTime ?? (orders[0]?.createdAt ?? null);
  const endTime = drop.endTime ?? (orders[orders.length - 1]?.createdAt ?? null);

  const TARGET_BARS = 40;
  const MIN_BUCKET_SECONDS = 10;
  const MAX_BUCKET_SECONDS = 3600; // 1h, pour les drops multi-jours
  const heatmapDurationSeconds =
    startTime && endTime ? Math.max(1, (endTime.getTime() - startTime.getTime()) / 1000) : 0;
  const adaptiveBucketSeconds = Math.min(
    MAX_BUCKET_SECONDS,
    Math.max(MIN_BUCKET_SECONDS, Math.ceil(heatmapDurationSeconds / TARGET_BARS))
  );

  const heatmap = buildTimeBuckets(orders, startTime, endTime, adaptiveBucketSeconds);

  // ==============
  // MOST DEMANDED — classement réel par vitesse d'écoulement
  // ==============

  const productRanking = productStats.map((p) => {
    const revenueNumber = Number(p.revenue ?? 0);
    const previous = previousStatsByProductId.get(p.productId);
    const previousRevenueNumber = previous ? Number(previous.revenue ?? 0) : null;
    const productRevenueDeltaPct =
      previousRevenueNumber && previousRevenueNumber > 0
        ? ((revenueNumber - previousRevenueNumber) / previousRevenueNumber) * 100
        : null;

    const selloutSeconds =
      p.lastSoldAt && drop.startTime
        ? Math.max(0, Math.round((p.lastSoldAt.getTime() - drop.startTime.getTime()) / 1000))
        : null;

    return {
      id: p.id,
      productName: p.productName,
      unitsSold: p.unitsSold,
      revenue: revenueNumber,
      revenueDeltaPct: productRevenueDeltaPct,
      selloutLabel: selloutSeconds != null ? `Sold out in ${formatHm(selloutSeconds)}` : "Still selling",
    };
  });

  return {
    drop,
    previousDrop,
    metrics: {
      revenue,
      previousRevenue,
      revenueDeltaPct,
      conversionRate,
      previousConversionRate,
      conversionDeltaPct,
      waitlistCount,
      unsubscribedCount,
      netWaitlistCount,
      buyersCount,
      totalItems,
      visitorsTotal,
      interestRate,
      dealRate,
      durationSeconds,
      duration,
      dateLabel,
      timeRangeLabel,
      openedLabel,
      closedLabel,
    },
    funnel,
    heatmap: {
      buckets: heatmap,
      bucketSeconds: adaptiveBucketSeconds,
    },
    productRanking,
  };
};

const PRODUCT_RANK_COLORS = ["#f59e0b", "#6d7175", "#8b5cf6", "#6d7175", "#6d7175"];

export default function DropDetailPage() {
  const { drop, previousDrop, metrics, funnel, heatmap, productRanking } =
    useLoaderData();
  const {
    revenue,
    previousRevenue,
    revenueDeltaPct,
    conversionRate,
    previousConversionRate,
    conversionDeltaPct,
    waitlistCount,
    unsubscribedCount,
    netWaitlistCount,
    buyersCount,
    totalItems,
    visitorsTotal,
    interestRate,
    dealRate,
    duration,
    dateLabel,
    timeRangeLabel,
    openedLabel,
    closedLabel,
  } = metrics;

  const { h, m, s } = duration;

  const bars = heatmap.buckets;
  const maxItems = Math.max(1, ...bars.map((b) => b.itemsCount));
  const bucketLabel =
    heatmap.bucketSeconds < 60
      ? `${heatmap.bucketSeconds}s`
      : heatmap.bucketSeconds < 3600
      ? `${Math.round(heatmap.bucketSeconds / 60)}min`
      : `${Math.round(heatmap.bucketSeconds / 3600)}h`;

  const tierColor = (itemsCount) => {
    if (itemsCount === 0) return "#ececec";
    const ratio = itemsCount / maxItems;
    if (ratio >= 0.66) return "#1a1a1a";
    if (ratio >= 0.33) return "#9aa0a6";
    return "#dcdce0";
  };

  // n'affiche qu'une poignée de labels sous l'axe pour eviter le clutter
  const labelEvery = Math.max(1, Math.ceil(bars.length / 8));

  const [exportOpen, setExportOpen] = useState(false);

  const exportFileBase = `${drop.name}-${drop.externalId ?? drop.id}`
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");

  const handleExportCsv = () => {
    const rows = [
      ["Drop", drop.name],
      ["ID", drop.externalId ?? drop.id],
      ["Date", dateLabel],
      ["Time range", timeRangeLabel],
      [],
      ["Metric", "Value"],
      ["Total revenue", revenue],
      ["Conversion rate (%)", conversionRate ?? ""],
      ["Interest rate (%)", interestRate ?? ""],
      ["Deal rate (%)", dealRate ?? ""],
      ["Avg cart size", typeof drop.finalAvgCartSize === "number" ? drop.finalAvgCartSize : ""],
      ["Waitlist count", waitlistCount],
      ["Buyers count", buyersCount],
      ["Total items", totalItems],
      [],
      ["Funnel step", "Count", "% of visitors"],
      ...Object.values(funnel).map((f) => [f.label, f.count, Math.round(f.pctOfTotal)]),
      [],
      ["Rank", "Product", "Units sold", "Revenue", "Sell-out"],
      ...productRanking.map((p, i) => [i + 1, p.productName, p.unitsSold, p.revenue, p.selloutLabel]),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((cell) => {
            const text = String(cell ?? "");
            return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exportFileBase}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    let y = 18;

    const addLine = (text, size = 11, bold = false) => {
      doc.setFontSize(size);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.text(text, 14, y);
      y += size <= 11 ? 7 : 9;
    };

    addLine(drop.name, 16, true);
    addLine(`${drop.externalId ?? drop.id} · ${dateLabel} · ${timeRangeLabel}`, 10);
    y += 4;

    addLine("Key metrics", 13, true);
    addLine(`Total revenue: ${revenue.toLocaleString("en-US", { style: "currency", currency: "USD" })}`);
    addLine(`Conversion rate: ${conversionRate !== null ? conversionRate.toFixed(1) + "%" : "N/A"}`);
    addLine(`Interest rate: ${interestRate !== null ? interestRate.toFixed(1) + "%" : "N/A"}`);
    addLine(`Deal rate: ${dealRate !== null ? dealRate.toFixed(1) + "%" : "N/A"}`);
    addLine(
      `Avg cart size: ${typeof drop.finalAvgCartSize === "number" ? drop.finalAvgCartSize.toFixed(2) : "N/A"}`
    );
    y += 4;

    addLine("Conversion funnel", 13, true);
    Object.values(funnel).forEach((f) => {
      addLine(`${f.label}: ${f.count} (${Math.round(f.pctOfTotal)}%)`);
    });
    y += 4;

    addLine("Most demanded — ranked by sell-out speed", 13, true);
    if (productRanking.length === 0) {
      addLine("No product sales recorded yet for this drop.");
    } else {
      productRanking.forEach((p, i) => {
        if (y > 270) {
          doc.addPage();
          y = 18;
        }
        addLine(
          `${i + 1}. ${p.productName} — ${p.unitsSold} sold — ${p.revenue.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
          })} — ${p.selloutLabel}`
        );
      });
    }

    doc.save(`${exportFileBase}.pdf`);
  };

  const card = {
    background: "#ffffff",
    border: "1px solid #e3e3e3",
    borderRadius: 10,
  };

  const cardLabel = {
    fontSize: 10.5,
    fontWeight: 700,
    color: "#919191",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: 7,
  };

  return (
    <div
      style={{
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif',
      }}
    >
      {/* BREADCRUMB */}
      <div style={{ marginBottom: 14, fontSize: 13 }}>
        <Link
          to="/app/drops-history"
          style={{ color: "#6d7175", textDecoration: "none" }}
        >
          Drop History
        </Link>
        <span style={{ color: "#c4c4c4", margin: "0 6px" }}>/</span>
        <span style={{ color: "#1a1a1a", fontWeight: 600 }}>{drop.name}</span>
      </div>

      {/* EN-TÊTE */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: "var(--vaultd-accent, #1a1a1a)",
                margin: 0,
                letterSpacing: -0.4,
              }}
            >
              {drop.name}
            </h1>
            <span
              style={{
                background: drop.soldOut ? "#f0fdf4" : "#fff7ed",
                color: drop.soldOut ? "#007a5a" : "#c2410c",
                border: drop.soldOut ? "1px solid #d1fae5" : "1px solid #fed7aa",
                borderRadius: 20,
                padding: "2px 10px",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {drop.soldOut ? "Sold out" : "Partial"}
            </span>
            <span
              style={{
                fontSize: 11,
                fontFamily:
                  '"SF Mono","Fira Code",ui-monospace,Menlo,Monaco,Consolas,monospace',
                color: "#919191",
                background: "#f2f2f2",
                borderRadius: 4,
                padding: "2px 7px",
              }}
            >
              {drop.externalId ?? drop.id}
            </span>
          </div>

          <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12.5, color: "#6d7175" }}>
            <span>📅 {dateLabel} · {timeRangeLabel}</span>
            <span>🕐 {h}h{String(m).padStart(2, "0")}m live</span>
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setExportOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              border: "1px solid #c9cccf",
              borderRadius: 8,
              background: "#ffffff",
              fontSize: 13,
              fontWeight: 500,
              color: "#1a1a1a",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            ⬇ Export PDF / CSV
          </button>

          {exportOpen && (
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
                minWidth: 170,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setExportOpen(false);
                  handleExportPdf();
                }}
                style={exportMenuItemStyle}
              >
                Export as PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  setExportOpen(false);
                  handleExportCsv();
                }}
                style={exportMenuItemStyle}
              >
                Export as CSV
              </button>
            </div>
          )}
        </div>
      </div>

      {/* BANNIÈRE D'INFO */}
      <div
        style={{
          ...card,
          padding: "10px 14px",
          marginBottom: 16,
          fontSize: 12.5,
          color: "#6d7175",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>ⓘ</span>
        <span>
          Percentages (%) refer to the previous drop —{" "}
          <strong style={{ color: "#1a1a1a" }}>
            {previousDrop ? previousDrop.name : "N/A"}
          </strong>
          . N/A would appear for a first drop with no reference data.
        </span>
      </div>

      {/* WAITLIST UNSUBSCRIBE STATS */}
      <div
        style={{
          ...card,
          padding: "10px 14px",
          marginBottom: 16,
          fontSize: 12.5,
          color: "#6d7175",
          display: "flex",
          gap: 18,
        }}
      >
        <span>
          <strong style={{ color: "#1a1a1a" }}>{waitlistCount}</strong> total waitlist
        </span>
        <span>
          <strong style={{ color: "#1a1a1a" }}>{unsubscribedCount}</strong> unsubscribed
        </span>
        <span>
          <strong style={{ color: "#1a1a1a" }}>{netWaitlistCount}</strong> waitlist (net)
        </span>
      </div>

      {/* 5 KPI CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: 14,
          marginBottom: 16,
        }}
      >
        {[
          {
            label: "Total revenue",
            accent: "#6366f1",
            value: revenue.toLocaleString("en-US", { style: "currency", currency: "USD" }),
            deltaPct: revenueDeltaPct,
            sub:
              previousDrop && previousRevenue !== null
                ? `vs ${previousRevenue.toLocaleString("en-US", { style: "currency", currency: "USD" })} (${previousDrop.name})`
                : "N/A (1st drop)",
          },
          {
            label: "Conversion rate",
            accent: "#8b5cf6",
            value: conversionRate !== null ? `${conversionRate.toFixed(1)}%` : "N/A",
            deltaPct: conversionDeltaPct,
            sub: previousConversionRate !== null ? `vs ${previousConversionRate.toFixed(1)}% (${previousDrop?.name})` : "N/A",
          },
          {
            label: "Interest rate",
            accent: "#f59e0b",
            value: interestRate !== null ? `${interestRate.toFixed(1)}%` : "N/A",
            deltaPct: null,
            sub: `${waitlistCount} waitlist / ${visitorsTotal} visitors`,
          },
          {
            label: "Deal rate",
            accent: "#14b8a6",
            value: dealRate !== null ? `${dealRate.toFixed(1)}%` : "N/A",
            deltaPct: null,
            sub: `${buyersCount} buyers / ${waitlistCount} waitlist`,
          },
          {
            label: "Avg cart size",
            accent: "#ec4899",
            value: typeof drop.finalAvgCartSize === "number" ? drop.finalAvgCartSize.toFixed(1) : "N/A",
            deltaPct: null,
            sub: "items/order avg",
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            style={{
              ...card,
              borderTop: `3px solid ${kpi.accent}`,
              padding: "14px 16px",
            }}
          >
            <div style={cardLabel}>{kpi.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1a1a", letterSpacing: -0.6 }}>
              {kpi.value}
            </div>
            {kpi.deltaPct !== null && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  marginTop: 3,
                  color: kpi.deltaPct >= 0 ? "#007a5a" : "#c2410c",
                }}
              >
                {kpi.deltaPct >= 0 ? "↑ " : "↓ "}
                {Math.abs(kpi.deltaPct).toFixed(1)}%
              </div>
            )}
            <div style={{ fontSize: 11.5, color: "#919191", marginTop: kpi.deltaPct !== null ? 2 : 6 }}>
              {kpi.sub}
            </div>
          </div>
        ))}
      </div>

      {/* HEATMAP + DURATION/FUNNEL */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 300px",
          gap: 14,
          marginBottom: 16,
        }}
      >
        {/* HEATMAP */}
        <div style={{ ...card, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <div style={cardLabel}>Hourly heatmap — sales volume</div>
            <div style={{ fontSize: 11.5, color: "#919191" }}>
              ~{bucketLabel} per bar
            </div>
          </div>

          {bars.length === 0 ? (
            <div style={{ fontSize: 13, color: "#919191", padding: "24px 0", textAlign: "center" }}>
              No sales data recorded yet for this drop.
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <div style={{ display: "flex", minWidth: Math.max(400, bars.length * 8) }}>
                  {/* AXE Y */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      height: 150,
                      paddingRight: 8,
                      fontSize: 10,
                      color: "#a0a0a0",
                      textAlign: "right",
                      flexShrink: 0,
                    }}
                  >
                    <span>{maxItems} items</span>
                    <span>{Math.round(maxItems / 2)}</span>
                    <span>0</span>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-end",
                        gap: 3,
                        height: 150,
                        borderLeft: "1px solid #ececec",
                        borderBottom: "1px solid #d1d1d1",
                      }}
                    >
                      {bars.map((b, i) => (
                        <div
                          key={i}
                          title={`${b.start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · ${b.itemsCount} item${b.itemsCount === 1 ? "" : "s"}`}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            height: `${Math.max(2, (b.itemsCount / maxItems) * 100)}%`,
                            background: tierColor(b.itemsCount),
                            border: b.itemsCount === 0 ? "1px solid #e3e3e3" : "none",
                            borderRadius: 2,
                          }}
                        />
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
                      {bars.map((b, i) => (
                        <div key={i} style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 10, color: "#a0a0a0" }}>
                          {i % labelEvery === 0
                            ? b.start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                            : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 14, fontSize: 12, color: "#6d7175" }}>
                <span><span style={{ display: "inline-block", width: 9, height: 9, background: "#1a1a1a", borderRadius: 2, marginRight: 5 }} />High</span>
                <span><span style={{ display: "inline-block", width: 9, height: 9, background: "#9aa0a6", borderRadius: 2, marginRight: 5 }} />Medium</span>
                <span><span style={{ display: "inline-block", width: 9, height: 9, background: "#dcdce0", borderRadius: 2, marginRight: 5 }} />Low</span>
              </div>
            </>
          )}
        </div>

        {/* DURATION + FUNNEL */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* DURATION */}
          <div style={{ ...card, padding: 16 }}>
            <div style={cardLabel}>Drop duration</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", margin: "10px 0" }}>
              {[
                { v: h, label: "Hours" },
                { v: m, label: "Min" },
                { v: s, label: "Sec" },
              ].map((unit, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ background: "#f4f4f5", borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#1a1a1a" }}>
                      {String(unit.v).padStart(2, "0")}
                    </div>
                    <div style={{ fontSize: 10, color: "#919191", letterSpacing: "0.06em" }}>
                      {unit.label.toUpperCase()}
                    </div>
                  </div>
                  {i < 2 && <span style={{ color: "#c4c4c4", fontWeight: 700 }}>:</span>}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, background: "#f4f4f5", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#919191", letterSpacing: "0.06em" }}>OPENED</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{openedLabel}</div>
              </div>
              <div style={{ flex: 1, background: "#f4f4f5", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#919191", letterSpacing: "0.06em" }}>CLOSED</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{closedLabel}</div>
              </div>
            </div>
          </div>

          {/* FUNNEL */}
          <div style={{ ...card, padding: 16, flex: 1 }}>
            <div style={{ ...cardLabel, marginBottom: 12 }}>Conversion funnel</div>
            {[
              { key: "visitors", color: "#d8d8db" },
              { key: "purchased", color: "#007a5a" },
            ].map(({ key, color }) => {
              const f = funnel[key];
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div
                    style={{
                      width: 84,
                      fontSize: 12.5,
                      fontWeight: key === "purchased" ? 700 : 500,
                      color: key === "purchased" ? "#007a5a" : "#303030",
                    }}
                  >
                    {f.label}
                  </div>
                  <div style={{ flex: 1, height: 8, background: "#f0f0f0", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${f.pctOfMax}%`, height: "100%", background: color }} />
                  </div>
                  <div style={{ width: 80, textAlign: "right", fontSize: 12, color: "#6d7175" }}>
                    {f.count}
                    {f.pctOfTotal != null ? ` (${Math.round(f.pctOfTotal)}% of visitors)` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* MOST DEMANDED */}
      <div style={{ ...card, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={cardLabel}>Most demanded — ranked by sell-out speed</div>
          <div style={{ fontSize: 12, color: "#919191" }}>{totalItems} items total</div>
        </div>

        {productRanking.length === 0 ? (
          <div style={{ fontSize: 13, color: "#919191", padding: "12px 0" }}>
            No product sales recorded yet for this drop.
          </div>
        ) : (
          productRanking.map((p, i) => {
            const maxRevenue = Math.max(...productRanking.map((r) => r.revenue), 1);
            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "10px 0",
                  borderTop: i > 0 ? "1px solid #f0f0f0" : "none",
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: PRODUCT_RANK_COLORS[i] ?? "#6d7175",
                    color: "#ffffff",
                    fontSize: 12,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1a1a1a" }}>{p.productName}</div>
                  <div style={{ fontSize: 12, color: "#919191" }}>
                    {p.selloutLabel} · {p.unitsSold} items
                  </div>
                </div>
                <div style={{ width: 140, height: 6, background: "#f0f0f0", borderRadius: 999, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${(p.revenue / maxRevenue) * 100}%`,
                      height: "100%",
                      background: PRODUCT_RANK_COLORS[i] ?? "#6d7175",
                    }}
                  />
                </div>
                <div style={{ width: 90, textAlign: "right" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: "#1a1a1a" }}>
                    {p.revenue.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                  </div>
                  {p.revenueDeltaPct !== null && (
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: p.revenueDeltaPct >= 0 ? "#007a5a" : "#c2410c",
                      }}
                    >
                      {p.revenueDeltaPct >= 0 ? "↑ " : "↓ "}
                      {Math.abs(p.revenueDeltaPct).toFixed(0)}%
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const exportMenuItemStyle = {
  display: "block",
  width: "100%",
  padding: "7px 10px",
  fontSize: 13,
  color: "#1a1a1a",
  background: "transparent",
  border: "none",
  borderRadius: 6,
  textAlign: "left",
  cursor: "pointer",
};
