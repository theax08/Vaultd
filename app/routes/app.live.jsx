import { useLoaderData, useRevalidator, Form } from "react-router";
import { useState, useEffect } from "react";

// ===============================
// SERVER: loader – KPIs branchés DB
// ===============================
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

  // Auto-launch / auto-end : la live page est la plus probable a etre ouverte
  // pendant un drop, donc on y verifie aussi le cycle de vie automatique.
  const { runAutoDropLifecycle } = await import("../drop-lifecycle.server");
  await runAutoDropLifecycle(shopDomain);

  const url = new URL(request.url);
  const dropId = url.searchParams.get("dropId");
  if (!dropId) {
    throw new Response("Missing dropId", { status: 400 });
  }

  // 1) Drop + waitlist
  const drop = await db.drop.findFirst({
    where: {
      id: dropId,
      shopDomain,
    },
    include: {
      waitlistEntries: true,
    },
  });

  if (!drop) {
    throw new Response("Drop not found", { status: 404 });
  }

  // 2) Orders liés au drop
  const orders = await db.dropOrder.findMany({
    where: {
      dropId: drop.id,
      shopDomain,
    },
  });

  // 3) Sources de trafic
  const trafficSources = await db.dropTrafficSource.findMany({
    where: { dropId: drop.id, shopDomain },
  });

  // 4) Events (pour timeline plus tard)
  const events = await db.dropEvent.findMany({
    where: { dropId: drop.id, shopDomain },
    orderBy: { timestamp: "asc" },
  });

  // 5) Stats par produit (pour le board "Top sellers")
  const productStats = await db.dropProductStats.findMany({
    where: { dropId: drop.id, shopDomain },
    orderBy: [{ unitsSold: "desc" }],
  });

  // =========================
  // CALCUL DES KPIs
  // =========================

  const waitlistTotal = drop.waitlistEntries.length;
  const visitorsTotal = trafficSources.reduce(
    (sum, ts) => sum + ts.visitors,
    0
  );

  const orderCount = orders.length;
  const totalRevenue = orders.reduce(
    (sum, o) => sum + Number(o.totalAmount || 0),
    0
  );
  const totalItemsSold = orders.reduce(
    (sum, o) => sum + (o.itemCount || 0),
    0
  );

  const stockRemaining = Math.max(drop.maxUnits - totalItemsSold, 0);
  const soldPct =
    drop.maxUnits > 0
      ? Math.round((totalItemsSold / drop.maxUnits) * 100)
      : 0;

  const avgCartSize =
    orderCount > 0 ? totalItemsSold / orderCount : 0;

  const conversionRate =
    visitorsTotal > 0 ? (orderCount / visitorsTotal) * 100 : 0;

  // Velocity simplifiée : items/sec sur les 60 dernières secondes
  const now = new Date();
  const windowMs = 60 * 1000;
  const cutoff = new Date(now.getTime() - windowMs);

  const recentOrders = orders.filter(
    (o) => o.createdAt >= cutoff
  );
  const recentItems = recentOrders.reduce(
    (sum, o) => sum + (o.itemCount || 0),
    0
  );
  const velocity =
    recentItems > 0 ? recentItems / (windowMs / 1000) : 0;

  const estimatedSelloutMinutes =
    velocity > 0 && stockRemaining > 0
      ? Math.round((stockRemaining / velocity) / 60)
      : null;

  // Historique complet trie chronologiquement, reutilise pour : timestamp du
  // pic de vitesse, alerte stock bas, vitesse moyenne et tendance recente.
  const ordersChrono = [...orders].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  // Pic de vitesse AVEC horodatage : fenetre glissante de 60s sur tout
  // l'historique des commandes (pas juste les 60 dernieres secondes).
  let peakVelocityValue = 0;
  let peakTime = null;
  for (const o of ordersChrono) {
    const windowStart = new Date(o.createdAt.getTime() - windowMs);
    const windowItems = ordersChrono
      .filter((x) => x.createdAt > windowStart && x.createdAt <= o.createdAt)
      .reduce((sum, x) => sum + (x.itemCount || 0), 0);
    const rate = windowItems / (windowMs / 1000);
    if (rate > peakVelocityValue) {
      peakVelocityValue = rate;
      peakTime = o.createdAt;
    }
  }
  const peakVelocity = Math.max(drop.peakVelocity || 0, peakVelocityValue, velocity);
  if (drop.status === "LIVE" && peakVelocity > (drop.peakVelocity || 0)) {
    await db.drop.update({ where: { id: drop.id }, data: { peakVelocity } });
  }

  // Vitesse moyenne sur toute la duree ecoulee du drop.
  const elapsedSecondsTotal = drop.startTime
    ? Math.max(1, ((drop.status === "LIVE" ? now : drop.endTime || now).getTime() - drop.startTime.getTime()) / 1000)
    : null;
  const avgVelocity = elapsedSecondsTotal ? totalItemsSold / elapsedSecondsTotal : 0;

  const ordersLast5Min = orders.filter(
    (o) => o.createdAt >= new Date(now.getTime() - 5 * 60 * 1000)
  ).length;

  // Tendance recente pour le mini graphique : 6 tranches de 1 minute.
  const velocityTrend = Array.from({ length: 6 }, (_, i) => {
    const bucketEnd = new Date(now.getTime() - (5 - i) * 60 * 1000);
    const bucketStart = new Date(bucketEnd.getTime() - 60 * 1000);
    const items = orders
      .filter((o) => o.createdAt > bucketStart && o.createdAt <= bucketEnd)
      .reduce((sum, o) => sum + (o.itemCount || 0), 0);
    return items;
  });

  // Alerte stock bas : premiere commande apres laquelle le stock restant
  // passe sous 10% (ou 5 unites, selon le plus petit des deux).
  const lowStockThreshold = drop.maxUnits > 0 ? Math.min(5, Math.ceil(drop.maxUnits * 0.1)) : 0;
  let lowStockAlertAt = null;
  let lowStockRemainingAt = null;
  if (lowStockThreshold > 0) {
    let runningSold = 0;
    for (const o of ordersChrono) {
      runningSold += o.itemCount || 0;
      const remaining = drop.maxUnits - runningSold;
      if (remaining <= lowStockThreshold) {
        lowStockAlertAt = o.createdAt;
        lowStockRemainingAt = Math.max(0, remaining);
        break;
      }
    }
  }

  // Comparaison au drop precedent (le plus recent ENDED de cette boutique) :
  // null si c'est le premier drop, sinon un vrai delta calcule.
  const previousDrop = await db.drop.findFirst({
    where: { shopDomain, status: "ENDED", id: { not: drop.id } },
    orderBy: { endTime: "desc" },
  });
  const conversionDelta = previousDrop
    ? Number(
        (conversionRate - (previousDrop.finalConversionRate || 0)).toFixed(2)
      )
    : null;

  // Classement "Top sellers" — jusqu'a 3 produits, tries par unites vendues.
  const topSellers = productStats.slice(0, 3).map((p) => {
    const selloutSeconds =
      p.lastSoldAt && drop.startTime
        ? Math.max(0, Math.round((p.lastSoldAt.getTime() - drop.startTime.getTime()) / 1000))
        : null;
    return {
      id: p.id,
      productName: p.productName,
      unitsSold: p.unitsSold,
      revenue: Number(p.revenue ?? 0),
      selloutLabel: selloutSeconds != null ? `sold out in ${formatDuration(selloutSeconds)}` : "still selling",
    };
  });

  // Timeline du drop — reconstruite a partir des donnees reelles (aucun
  // stockage d'evenements de cycle de vie dedie n'existe encore) : ouverture,
  // pic de vitesse, alerte stock bas, cloture. S'affiche meme a 0 vente.
  const timeline = [];
  if (drop.startTime) {
    timeline.push({
      type: "started",
      timestamp: drop.startTime,
      title: "Drop went live",
      description:
        visitorsTotal > 0 ? `${visitorsTotal} visitor${visitorsTotal > 1 ? "s" : ""} so far` : "Waiting for traffic",
    });
  }
  if (peakTime && peakVelocityValue > 0) {
    timeline.push({
      type: "peak",
      timestamp: peakTime,
      title: `Peak velocity — ${peakVelocityValue.toFixed(1)} items/sec`,
      description: "Highest sales rate observed for this drop",
    });
  }
  if (lowStockAlertAt) {
    timeline.push({
      type: "low_stock",
      timestamp: lowStockAlertAt,
      title: `Low stock alert — ${lowStockRemainingAt} item${lowStockRemainingAt === 1 ? "" : "s"} left`,
      description: "Stock dropped below 10% remaining",
    });
  }
  if (drop.status === "ENDED" && drop.endTime) {
    timeline.push({
      type: "ended",
      timestamp: drop.endTime,
      title: stockRemaining === 0 && drop.maxUnits > 0 ? "Drop ended — fully sold out" : "Drop ended",
      description: `$${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total revenue · ${orderCount} order${orderCount === 1 ? "" : "s"} confirmed`,
    });
  }
  timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const liveStats = {
    conversionRate,
    conversionDelta,
    velocity,
    peakVelocity,
    peakTime: peakTime ? peakTime.toISOString() : null,
    avgVelocity,
    ordersLast5Min,
    velocityTrend,
    revenue: totalRevenue,
    stockRemaining,
    soldCount: totalItemsSold,
    soldPct,
    estimatedSelloutMinutes,
    visitors: visitorsTotal,
  };

  const selloutTimeSeconds =
    drop.endTime && drop.startTime
      ? Math.max(
          0,
          Math.round(
            (drop.endTime.getTime() - drop.startTime.getTime()) / 1000
          )
        )
      : 0;

  const finalStats = {
    revenue: totalRevenue,
    avgCartSize,
    conversionRate,
    conversionDeltaVsPrev: conversionDelta,
    orderCount,
    selloutTimeSeconds,
    startTimeLabel: drop.startTime
      ? drop.startTime.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null,
    endTimeLabel: drop.endTime
      ? drop.endTime.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null,
  };

  const trafficView = trafficSources.map((ts) => ({
    source: ts.source,
    visitors: ts.visitors,
    pct:
      visitorsTotal > 0
        ? Math.round((ts.visitors / visitorsTotal) * 100)
        : 0,
  }));

  const whoIsBuying = orders
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 20)
    .map((o, idx) => ({
      id: o.id,
      email: o.customerEmail || "unknown",
      productName: o.firstProductName || "Drop item",
      timestampSecondsAgo: Math.round(
        (now.getTime() - o.createdAt.getTime()) / 1000
      ),
      isNew: idx === 0,
    }));

  const dropView = {
    id: drop.id,
    name: drop.name,
    status: drop.status, // "DRAFT" | "SCHEDULED" | "LIVE" | "ENDED"
    shopName: drop.shopDomain.replace(".myshopify.com", ""),
    startTime: drop.startTime ? drop.startTime.toISOString() : null,
    endTime: drop.endTime ? drop.endTime.toISOString() : null,
    maxUnits: drop.maxUnits,
    totalItems: drop.maxUnits,
    description: drop.description,
    waitlistTotal,
    live: liveStats,
    final: finalStats,
    autoLaunch: drop.autoLaunch,
  };

  return {
    drop: dropView,
    whoIsBuying,
    traffic: trafficView,
    topSellers,
    timeline: timeline.map((t) => ({ ...t, timestamp: t.timestamp.toISOString() })),
  };
};

// ===============================
// CLIENT: Live Overlay UI
// ===============================
export default function LiveDashboardPage() {
  const { drop, whoIsBuying, traffic, topSellers, timeline } = useLoaderData();
  const revalidator = useRevalidator();

  // L'app affiche tout en USD, sans conversion.
  const formatMoney = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(Number(amount) || 0);
  };

  const [mode, setMode] = useState(
    drop.status === "ENDED" ? "analysis" : "speed"
  ); // "speed" | "analysis"

  const isLive = drop.status === "LIVE";
  const isEnded = drop.status === "ENDED";

  // Si l'auto-end (sold-out + 5 min sans activite) cloture le drop pendant
  // que cette page reste ouverte, on bascule automatiquement en mode Analysis.
  useEffect(() => {
    if (drop.status === "ENDED") {
      setMode("analysis");
      setIsTimerRunning(false);
    }
  }, [drop.status]);

  // Pendant que le drop est live et gere en automatique, on revalide
  // periodiquement pour detecter l'auto-end sans avoir a rafraichir.
  useEffect(() => {
    if (!isLive || !drop.autoLaunch) return;

    const intervalId = setInterval(() => {
      if (revalidator.state === "idle") {
        revalidator.revalidate();
      }
    }, 30000);

    return () => clearInterval(intervalId);
  }, [isLive, drop.autoLaunch, revalidator]);

  // =========================
  // REAL-TIME CHRONO
  // =========================

  // Point de départ du chrono : startTime si défini, sinon 0
  const initialElapsedSeconds = (() => {
    if (!drop.startTime) return 0;
    const start = new Date(drop.startTime);
    const now = new Date();
    const diff = Math.floor((now.getTime() - start.getTime()) / 1000);
    return diff > 0 ? diff : 0;
  })();

  const [elapsedSeconds, setElapsedSeconds] = useState(initialElapsedSeconds);

  // Le chrono tourne tant que le drop n'est pas "ENDED"
  // et qu'on n'a pas "manuellement" arrêté via le bouton End drop
  const [isTimerRunning, setIsTimerRunning] = useState(isLive && !isEnded);

  // Effet : incrémente le chrono chaque seconde pendant qu'il est "running"
  useEffect(() => {
    if (!isTimerRunning) return;

    const intervalId = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isTimerRunning]);

  // Utilitaire pour afficher HH:MM:SS
  function formatChrono(totalSeconds) {
    const s = totalSeconds % 60;
    const m = Math.floor((totalSeconds % 3600) / 60);
    const h = Math.floor(totalSeconds / 3600);

    const pad = (n) => String(n).padStart(2, "0");

    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  const timerLabel = formatChrono(elapsedSeconds);

  const selloutLabel =
    drop.final.selloutTimeSeconds > 0
      ? `Ended · ${formatDuration(drop.final.selloutTimeSeconds)} total`
      : "Ended";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "#ffffff",
        color: "#0f172a",
        display: "flex",
        flexDirection: "column",
        zIndex: 9999,
        fontFamily:
          "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
      }}
    >
      {/* HEADER OVERLAY */}
      <header
        style={{
          height: 58,
          padding: "0 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "#ffffff",
          borderBottom: "1px solid rgba(15,23,42,0.06)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        {/* Left side */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          {/* Badge LIVE / DROP ENDED */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "4px 12px",
              borderRadius: 20,
              ...(isLive
                ? {
                    backgroundColor: "rgba(74,222,128,0.10)",
                    border: "1px solid rgba(22,163,74,0.35)",
                  }
                : {
                    backgroundColor: "rgba(148,163,184,0.12)",
                    border: "1px solid rgba(148,163,184,0.45)",
                  }),
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                backgroundColor: isLive ? "#4ade80" : "#9ca3af",
                boxShadow: isLive
                  ? "0 0 8px rgba(74,222,128,0.7)"
                  : "0 0 0 rgba(0,0,0,0)",
              }}
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: isLive ? "#15803d" : "#64748b",
              }}
            >
              {isLive ? "Live" : "Drop ended"}
            </span>
          </div>

          {/* Drop name + shop */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
            }}
          >
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "-0.3px",
              }}
            >
              {drop.name}
            </span>
            <span
              style={{
                color: "rgba(148,163,184,0.9)",
                fontSize: 14,
              }}
            >
              ·
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  background:
                    "linear-gradient(135deg,#1f2937,#4b5563,#9ca3af)",
                }}
              />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#4b5563",
                }}
              >
                {drop.shopName}
              </span>
            </div>
          </div>
        </div>

        {/* Right side */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          {isLive && (
            <button
              type="button"
              onClick={() => {
                // On arrête le chrono et on bascule en mode Analysis
                setIsTimerRunning(false);
                setMode("analysis");
              }}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid rgba(248,113,113,0.8)",
                backgroundColor: "rgba(254,242,242,1)", // #fef2f2
                color: "#b91c1c",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              End drop
            </button>
          )}

          {/* Toggle Speed / Analysis */}
          <div
            style={{
              display: "flex",
              borderRadius: 8,
              overflow: "hidden",
              backgroundColor: "#f3f4f6",
              border: "1px solid rgba(148,163,184,0.5)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (!isEnded) setMode("speed");
              }}
              style={{
                padding: "6px 14px",
                border: "none",
                backgroundColor:
                  mode === "speed" ? "#e5e7eb" : "transparent",
                color:
                  mode === "speed" ? "#111827" : "#6b7280",
                fontSize: 12,
                fontWeight: 600,
                cursor: isEnded ? "not-allowed" : "pointer",
              }}
            >
              ⚡ Speed
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isLive) {
                  setMode("analysis");
                }
              }}
              style={{
                padding: "6px 14px",
                border: "none",
                backgroundColor:
                  mode === "analysis"
                    ? "rgba(129,140,248,0.16)"
                    : "transparent",
                color:
                  mode === "analysis" ? "#4f46e5" : "#6b7280",
                fontSize: 12,
                fontWeight: 600,
                cursor: isLive ? "not-allowed" : "pointer",
                opacity: isLive ? 0.4 : 1,
              }}
            >
              📊 Analysis
            </button>
          </div>

          {/* Countdown / Duration chip */}
          {mode === "speed" && (
            <div
              style={{
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,'Liberation Mono','Courier New',monospace",
                fontSize: 14,
                fontWeight: 600,
                color: "#f59e0b",
                backgroundColor: "rgba(245,158,11,0.08)",
                borderRadius: 8,
                border: "1px solid rgba(245,158,11,0.20)",
                padding: "5px 12px",
              }}
            >
              {timerLabel}
            </div>
          )}

          {mode === "analysis" && (
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "#4b5563",
                backgroundColor: "#f3f4f6",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                padding: "5px 12px",
              }}
            >
              {selloutLabel}
            </div>
          )}
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div
        style={{
          flex: 1,
          padding: "20px 28px 32px",
          display: "grid",
          gridTemplateColumns: "1fr 340px",
          gap: 18,
          overflow: "auto",
        }}
      >
        {/* LEFT COLUMN */}
        <div>
          {/* 4 KPI cards row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,minmax(0,1fr))",
              gap: 14,
            }}
          >
            <KpiCard
              label="Conversion rate"
              borderColor="#4ade80"
              value={drop.live.conversionRate.toFixed(1)}
              valueSuffix="%"
              delta={drop.live.conversionDelta} // nombre brut (ex: -1.2)
              deltaUnitLabel="% vs last drop"
              neutralSubLabel="No data vs last drop yet"
            />
            <KpiCard
              label="Sales velocity"
              borderColor="#f59e0b"
              value={drop.live.velocity.toFixed(2)}
              valueSuffix="/s"
              sublabel={`Peak ${drop.live.peakVelocity.toFixed(2)}/s`}
              subColor="#f59e0b"
            />
            <KpiCard
              label="Total revenue"
              borderColor="#818cf8"
              value={formatMoney(drop.live.revenue)}
              valueColor="#111827"
              sublabel={`${drop.totalItems} items`}
              subColor="#6b7280"
            />
            <KpiCard
              label="Stock status"
              borderColor="#fb7185"
              value={drop.live.stockRemaining}
              valueSuffix=" left"
              valueColor="#fb7185"
              sublabel={`${drop.live.soldCount} sold · ${drop.live.soldPct}%`}
              subColor="#fb7185"
            />
          </div>

          {mode === "speed" && (
            <div
              style={{
                marginTop: 18,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
            >
              <StockProgressBoard drop={drop} />
              <SalesVelocityBoard drop={drop} />
            </div>
          )}

          {/* WHO IS BUYING (simplifié, branchement DB) */}
          {mode === "speed" && (
          <div
            style={{
              marginTop: 18,
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,0.45)",
              backgroundColor: "#f9fafb",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              maxHeight: 340,
            }}
          >
            <div
              style={{
                flexShrink: 0,
                padding: "14px 18px 10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid rgba(148,163,184,0.3)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#6b7280",
                }}
              >
                Who is buying
              </div>
              <div
                style={{
                  fontSize: 11,
                  padding: "2px 9px",
                  borderRadius: 20,
                  backgroundColor: "rgba(74,222,128,0.10)",
                  border: "1px solid rgba(22,163,74,0.35)",
                  color: "#15803d",
                  fontWeight: 600,
                }}
              >
                ● Live feed
              </div>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "8px 18px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 7,
              }}
            >
              {whoIsBuying.length === 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                  }}
                >
                  No orders yet for this drop.
                </div>
              ) : (
                whoIsBuying.map((event) => (
                  <div
                    key={event.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      backgroundColor: "#ffffff",
                      borderRadius: 8,
                      border: "1px solid rgba(226,232,240,1)", // slate-200
                    }}
                  >
                    {/* Avatar lettre */}
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background:
                          "radial-gradient(circle at 30% 30%,#4ade80,#22c55e,#15803d)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#ffffff",
                      }}
                    >
                      {event.email[0]?.toUpperCase() || "?"}
                    </div>

                    {/* Texte principal */}
                    <div style={{ flex: 1, fontSize: 12.5, minWidth: 0 }}>
                      <span style={{ color: "#111827" }}>
                        <strong style={{ color: "#111827" }}>
                          {event.email}
                        </strong>{" "}
                        bought{" "}
                        <strong style={{ color: "#111827" }}>
                          {event.productName}
                        </strong>
                      </span>
                    </div>

                    {/* NEW badge */}
                    {event.isNew && (
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 4,
                          backgroundColor: "rgba(74,222,128,0.15)",
                          color: "#16a34a",
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                        }}
                      >
                        New
                      </span>
                    )}

                    {/* Time ago */}
                    <span
                      style={{
                        fontSize: 10.5,
                        color: "#9ca3af",
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,'Liberation Mono','Courier New',monospace",
                        flexShrink: 0,
                      }}
                    >
                      {formatSecondsAgo(event.timestampSecondsAgo)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          )}

          {mode === "analysis" && (
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
              <TopSellersBoard topSellers={topSellers} />
              <DropTimelineBoard timeline={timeline} />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div>
          {/* TRAFFIC SOURCES */}
          <div
            style={{
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,0.45)",
              backgroundColor: "#f9fafb",
              padding: "14px 16px 14px",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#6b7280",
                }}
              >
                Traffic sources
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#6b7280",
                }}
              >
                {drop.live.visitors} visitors
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 9,
              }}
            >
              {traffic.length === 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                  }}
                >
                  No traffic recorded yet for this drop.
                </div>
              ) : (
                traffic.map((src) => (
                  <TrafficRow key={src.source} source={src} />
                ))
              )}
            </div>
          </div>

          {/* QUICK SUMMARY (mode analysis simplifié) */}
          {mode === "analysis" && (
            <div
              style={{
                borderRadius: 10,
                border: "1px solid rgba(129,140,248,0.35)",
                backgroundColor: "rgba(239,242,255,1)", // indigo-50
                padding: "13px 15px",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    backgroundColor: "rgba(129,140,248,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                  }}
                >
                  📊
                </div>
                <div style={{ fontSize: 12 }}>
                  <span
                    style={{
                      display: "block",
                      fontWeight: 700,
                      color: "#4f46e5",
                      marginBottom: 2,
                      fontSize: 12.5,
                    }}
                  >
                    Analysis mode summary
                  </span>
                  <span
                    style={{
                      color: "#4b5563",
                      lineHeight: 1.6,
                    }}
                  >
                    Total revenue{" "}
                    <strong>
                      {formatMoney(drop.final.revenue)}
                    </strong>
                    , {drop.final.orderCount} orders, avg cart size{" "}
                    <strong>{drop.final.avgCartSize.toFixed(2)}</strong> items,
                    conversion{" "}
                    <strong>{drop.final.conversionRate.toFixed(1)}%</strong>.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* DROP HISTORY */}
          <div
            style={{
              borderRadius: 10,
              border: "1px solid rgba(148,163,184,0.45)",
              backgroundColor: "#f9fafb",
              padding: "13px 15px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#6b7280",
                marginBottom: 8,
              }}
            >
              Drop history
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "#4b5563",
                lineHeight: 1.6,
                marginBottom: 14,
              }}
            >
              Save this drop&apos;s stats and data to your history. This will
              close the live dashboard and mark the drop as ended.
            </div>

            <Form method="post" action="/app/drops" style={{ margin: 0 }}>
              <input type="hidden" name="intent" value="end" />
              <input type="hidden" name="dropId" value={drop.id} />

              <button
                type="submit"
                style={{
                  width: "100%",
                  backgroundColor: "#111827",
                  color: "#ffffff",
                  border: "none",
                  padding: "12px 14px",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                💾 Save to history
              </button>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * KPI card réutilisable
 */
function KpiCard({
  label,
  borderColor,
  value,
  valuePrefix,
  valueSuffix,
  valueColor = "#111827",
  // Sublabel auto à partir d'un delta
  delta, // ex: +2.5, -1.8, 0
  deltaUnitLabel, // ex: "% vs last drop"
  neutralSubLabel, // fallback si pas de delta dispo
  // OU sublabel explicite (pour velocity, stock, etc.)
  sublabel,
  subColor = "#6b7280",
}) {
  let finalSubLabel = sublabel;
  let finalSubColor = subColor;

  if (typeof delta === "number") {
    if (delta > 0.01) {
      finalSubLabel = `↑ +${delta.toFixed(1)}${deltaUnitLabel ?? ""}`;
      finalSubColor = "#16a34a";
    } else if (delta < -0.01) {
      finalSubLabel = `↓ ${delta.toFixed(1)}${deltaUnitLabel ?? ""}`;
      finalSubColor = "#dc2626";
    } else {
      finalSubLabel = neutralSubLabel ?? "No change vs last drop";
      finalSubColor = "#6b7280";
    }
  } else if (delta === null && neutralSubLabel) {
    // Pas de drop precedent pour comparer (premier drop de la boutique).
    finalSubLabel = neutralSubLabel;
    finalSubColor = "#6b7280";
  }

  return (
    <div
      style={{
        backgroundColor: "#f9fafb",
        borderRadius: 12,
        border: "1px solid rgba(148,163,184,0.45)",
        padding: "16px 18px",
        borderTop: `3px solid ${borderColor}`,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 30,
          fontWeight: 800,
          letterSpacing: "-1.5px",
          lineHeight: 1,
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          color: valueColor,
        }}
      >
        {valuePrefix && (
          <span
            style={{
              fontSize: 18,
              color: "#6b7280",
            }}
          >
            {valuePrefix}
          </span>
        )}
        <span>{value}</span>
        {valueSuffix && (
          <span
            style={{
              fontSize: 16,
              color: "#6b7280",
              fontWeight: 500,
            }}
          >
            {valueSuffix}
          </span>
        )}
      </div>
      {finalSubLabel && (
        <div
          style={{
            marginTop: 5,
            fontSize: 12,
            color: finalSubColor,
            fontWeight: 500,
          }}
        >
          {finalSubLabel}
        </div>
      )}
    </div>
  );
}

/**
 * STOCK PROGRESS — barre de progression + repartition sold/left/ETA.
 * S'affiche meme a 0 vente (barre vide, ETA "—").
 */
function StockProgressBoard({ drop }) {
  const total = drop.totalItems || 0;
  const sold = drop.live.soldCount;
  const left = drop.live.stockRemaining;
  const pct = drop.live.soldPct;
  const eta =
    drop.live.estimatedSelloutMinutes != null
      ? `~${drop.live.estimatedSelloutMinutes}min`
      : "—";

  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid rgba(148,163,184,0.45)",
        backgroundColor: "#f9fafb",
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>
          Stock progress
        </div>
        <div style={{ fontSize: 11, color: "#6b7280" }}>
          {sold}/{total} sold
        </div>
      </div>

      <div style={{ height: 8, borderRadius: 999, backgroundColor: "#e5e7eb", overflow: "hidden" }}>
        <div
          style={{
            width: `${Math.min(100, pct)}%`,
            height: "100%",
            background: "linear-gradient(90deg,#fbbf24,#fb7185)",
            borderRadius: 999,
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, marginBottom: 12 }}>
        <span style={{ fontSize: 10.5, color: "#9ca3af" }}>0</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#fb7185" }}>{pct}% gone</span>
        <span style={{ fontSize: 10.5, color: "#9ca3af" }}>{total}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        <StatBox label="Left" value={left} color="#fb7185" bg="rgba(251,113,133,0.08)" />
        <StatBox label="Sold" value={sold} color="#16a34a" bg="rgba(22,163,74,0.08)" />
        <StatBox label="Est. sell-out" value={eta} color="#818cf8" bg="rgba(129,140,248,0.08)" />
      </div>
    </div>
  );
}

function StatBox({ label, value, color, bg }) {
  return (
    <div style={{ borderRadius: 8, backgroundColor: bg, padding: "8px 6px", textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6b7280", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

/**
 * SALES VELOCITY — vitesse actuelle + mini-tendance sur les 6 dernieres
 * minutes + pic/moyenne/commandes recentes. S'affiche meme a 0 vente.
 */
function SalesVelocityBoard({ drop }) {
  const { velocity, peakVelocity, avgVelocity, ordersLast5Min, velocityTrend } = drop.live;
  const maxTrend = Math.max(1, ...(velocityTrend || [0]));

  let trendLabel = "No data yet";
  if (avgVelocity > 0) {
    if (velocity > avgVelocity * 1.15) trendLabel = "trending ↑";
    else if (velocity < avgVelocity * 0.85) trendLabel = "trending ↓";
    else trendLabel = "steady →";
  }

  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid rgba(148,163,184,0.45)",
        backgroundColor: "#f9fafb",
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>
          Sales velocity
        </div>
        <div style={{ fontSize: 11, color: "#6b7280" }}>Last 60s</div>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 28, fontWeight: 800, color: "#f59e0b", letterSpacing: "-1px" }}>
            {velocity.toFixed(1)}
          </span>
          <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>/sec</span>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>items/second · {trendLabel}</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 32 }}>
          {(velocityTrend || []).map((v, i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: `${Math.max(8, (v / maxTrend) * 100)}%`,
                borderRadius: 2,
                backgroundColor: i === velocityTrend.length - 1 ? "#f59e0b" : "rgba(245,158,11,0.35)",
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid rgba(148,163,184,0.3)", paddingTop: 10 }}>
        <StatRow label="Peak velocity" value={`${peakVelocity.toFixed(1)}/s`} />
        <StatRow label="Avg velocity" value={`${avgVelocity.toFixed(1)}/s`} />
        <StatRow label="Orders last 5 min" value={ordersLast5Min} />
      </div>
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ fontWeight: 700, color: "#111827" }}>{value}</span>
    </div>
  );
}

/**
 * TOP SELLERS — classement des produits par unites vendues (mode Analysis).
 */
function TopSellersBoard({ topSellers }) {
  const maxUnits = Math.max(1, ...topSellers.map((p) => p.unitsSold));

  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid rgba(148,163,184,0.45)",
        backgroundColor: "#f9fafb",
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>
          Top sellers — which products sold out first
        </div>
      </div>

      {topSellers.length === 0 ? (
        <div style={{ fontSize: 12, color: "#6b7280" }}>No sales recorded yet for this drop.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {topSellers.map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 5,
                  backgroundColor: i === 0 ? "#fbbf24" : "rgba(148,163,184,0.2)",
                  color: i === 0 ? "#78350f" : "#6b7280",
                  fontSize: 11,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#111827" }}>{p.productName}</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  {p.unitsSold} sold · {p.selloutLabel}
                </div>
                <div style={{ height: 4, borderRadius: 999, backgroundColor: "#e5e7eb", marginTop: 4, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${(p.unitsSold / maxUnits) * 100}%`,
                      height: "100%",
                      backgroundColor: i === 0 ? "#f59e0b" : "#9ca3af",
                    }}
                  />
                </div>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#111827", flexShrink: 0 }}>
                ${p.revenue.toLocaleString("en-US")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * DROP TIMELINE — reconstruite a partir des donnees reelles (ouverture, pic
 * de vitesse, alerte stock bas, cloture). Mode Analysis.
 */
function DropTimelineBoard({ timeline }) {
  const dotColor = { started: "#16a34a", peak: "#f59e0b", low_stock: "#dc2626", ended: "#6b7280" };

  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid rgba(148,163,184,0.45)",
        backgroundColor: "#f9fafb",
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280", marginBottom: 12 }}>
        Drop timeline
      </div>

      {timeline.length === 0 ? (
        <div style={{ fontSize: 12, color: "#6b7280" }}>Timeline will fill in as this drop progresses.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {timeline.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    backgroundColor: dotColor[t.type] || "#9ca3af",
                    marginTop: 3,
                  }}
                />
                {i < timeline.length - 1 && (
                  <div style={{ width: 1, flex: 1, backgroundColor: "rgba(148,163,184,0.35)", marginTop: 3 }} />
                )}
              </div>
              <div style={{ paddingBottom: 4 }}>
                <div style={{ fontSize: 10.5, color: "#9ca3af", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                  {new Date(t.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#111827", marginTop: 2 }}>{t.title}</div>
                <div style={{ fontSize: 11.5, color: "#6b7280", marginTop: 1 }}>{t.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Ligne de traffic source (simplifiée)
 */
function TrafficRow({ source }) {
  const { source: key, pct } = source;

  const meta = getSourceMeta(key);

  const barWidth = Math.max(6, pct); // évite les barres invisibles pour les petits %

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
      }}
    >
      {/* Icône */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          backgroundColor: meta.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 15,
        }}
      >
        {meta.icon}
      </div>

      {/* Nom */}
      <div
        style={{
          flex: 1,
          color: "#111827",
          fontWeight: 500,
        }}
      >
        {meta.label}
      </div>

      {/* Barre */}
      <div
        style={{
          width: 80,
          height: 5,
          borderRadius: 99,
          backgroundColor: "#e5e7eb",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${barWidth}%`,
            maxWidth: "100%",
            height: "100%",
            backgroundColor: meta.color,
          }}
        />
      </div>

      {/* Pourcentage */}
      <div
        style={{
          minWidth: 40,
          textAlign: "right",
          fontSize: 12.5,
          fontWeight: 700,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,'Liberation Mono','Courier New',monospace",
        }}
      >
        {pct}%
      </div>
    </div>
  );
}

function getSourceMeta(key) {
  switch (key) {
    case "instagram":
      return {
        label: "Instagram",
        icon: "📸",
        color: "#e5384f",
        bg: "rgba(229,56,79,0.18)",
      };
    case "vaultd_email":
      return {
        label: "Vaultd Emails",
        icon: "✉️",
        color: "#818cf8",
        bg: "rgba(129,140,248,0.18)",
      };
    case "twitter":
    case "x":
      return {
        label: "Twitter / X",
        icon: "🐦",
        color: "#1da1f2",
        bg: "rgba(29,161,242,0.18)",
      };
    case "tiktok":
      return {
        label: "TikTok",
        icon: "📱",
        color: "#4ade80",
        bg: "rgba(74,222,128,0.18)",
      };
    case "facebook":
      return {
        label: "Facebook",
        icon: "👍",
        color: "#1877f2",
        bg: "rgba(24,119,242,0.18)",
      };
    case "other":
    default:
      return {
        label: "Other",
        icon: "🔗",
        color: "rgba(107,114,128,1)",
        bg: "rgba(229,231,235,1)",
      };
  }
}

/**
 * Utils
 */
function maskEmail(email) {
  if (!email || typeof email !== "string") return "unknown";
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const maskedUser =
    user.length <= 2
      ? user[0] + "*"
      : user[0] + "*".repeat(Math.max(1, user.length - 2)) +
        user.slice(-1);
  return `${maskedUser}@${domain}`;
}

function formatSecondsAgo(seconds) {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h${m.toString().padStart(2, "0")}m`;
}