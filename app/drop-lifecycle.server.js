import db from "./db.server";
import { sendDropLiveEmail, sendDropEndedEmail } from "./email-automations.server";
import { buildUnsubscribeUrl, buildLogoUrl } from "./unsubscribe.server";

// Delai sans nouvelle vente apres sold-out avant de cloturer automatiquement
// (couvre le cas ou le vendeur n'est pas present pendant son drop).
const AUTO_END_GRACE_MS = 5 * 60 * 1000;

function formatHm(seconds) {
  if (seconds == null) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

// Marque les liens envoyes par email pour que le widget storefront puisse
// les attribuer a la source "Vaultd Emails" dans les traffic sources de la
// live page, au lieu de les compter comme trafic non identifie.
function withEmailTrackingParam(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("vaultd_src", "vaultd_email");
    return u.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}vaultd_src=vaultd_email`;
  }
}

// Envoie l'email "drop live" ou "drop ended" a toute la waitlist active
// (non desinscrite) du drop, avec le sujet/texte personnalise par le marchand
// et les vraies stats du drop (position, ventes, etc.).
async function notifyWaitlist(drop, type) {
  const automation = await db.emailAutomation.findFirst({
    where: { shopDomain: drop.shopDomain, type },
  });
  if (!automation) return;

  const entries = await db.waitlistEntry.findMany({
    where: { dropId: drop.id, unsubscribedAt: null },
    orderBy: [{ score: "desc" }, { createdAt: "asc" }],
  });
  if (entries.length === 0) return;

  const boutiqueName = automation.brandName;
  const boutiqueLogo = buildLogoUrl(automation);
  const brandColor = automation.mainColor || "#1a1a1a";

  if (type === "DROP_LIVE") {
    const openedLabel = drop.startTime
      ? drop.startTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
      : null;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry.email) continue;
      try {
        await sendDropLiveEmail({
          to: entry.email,
          boutiqueName,
          boutiqueLogo,
          brandColor,
          subject: automation.subject,
          body: automation.body,
          dropName: drop.name,
          position: i + 1,
          openedLabel,
          accessLink: withEmailTrackingParam(automation.ctaUrl) || null,
          maxUnits: drop.maxUnits,
          unsubscribeUrl: buildUnsubscribeUrl(entry.id),
        });
      } catch (err) {
        console.error("notifyWaitlist: failed to send DROP_LIVE to", entry.email, err);
      }
    }
    return;
  }

  // DROP_ENDED
  const orders = await db.dropOrder.findMany({ where: { dropId: drop.id, shopDomain: drop.shopDomain } });
  const itemsSold = orders.reduce((sum, o) => sum + (o.itemCount || 0), 0);
  const closedAtLabel = drop.endTime
    ? drop.endTime.toLocaleString("en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  const nextDrop = await db.drop.findFirst({
    where: { shopDomain: drop.shopDomain, status: "DRAFT" },
    orderBy: { startTime: "asc" },
  });

  for (const entry of entries) {
    if (!entry.email) continue;
    try {
      await sendDropEndedEmail({
        to: entry.email,
        boutiqueName,
        boutiqueLogo,
        brandColor,
        subject: automation.subject,
        body: automation.body,
        dropName: drop.name,
        soldOut: drop.soldOut,
        closedAtLabel,
        itemsSold,
        selloutLabel: formatHm(drop.selloutTimeSeconds),
        waitlistCount: drop.finalWaitlistTotal ?? entries.length,
        nextDropName: nextDrop?.name || null,
        nextDropCtaUrl: withEmailTrackingParam(automation.ctaUrl) || null,
        unsubscribeUrl: buildUnsubscribeUrl(entry.id),
      });
    } catch (err) {
      console.error("notifyWaitlist: failed to send DROP_ENDED to", entry.email, err);
    }
  }
}

// Met le drop en LIVE (logique partagee entre le bouton manuel "Launch" et
// l'auto-launch) et notifie toute la waitlist.
export async function launchDrop(drop) {
  const now = new Date();
  await db.drop.update({
    where: { id: drop.id },
    data: { status: "LIVE", startTime: now, endTime: null },
  });

  await notifyWaitlist({ ...drop, startTime: now, endTime: null }, "DROP_LIVE");
}

// Calcule les stats finales et cloture le drop. Logique partagee entre le
// bouton manuel "Save to history" (app.drops.jsx, intent=end) et l'auto-end.
export async function endDrop(drop) {
  const dropId = drop.id;
  const shopDomain = drop.shopDomain;

  const waitlistEntries = await db.waitlistEntry.findMany({ where: { dropId } });
  const orders = await db.dropOrder.findMany({ where: { dropId, shopDomain } });
  const trafficSources = await db.dropTrafficSource.findMany({ where: { dropId, shopDomain } });

  const waitlistTotal = waitlistEntries.length;
  const visitorsTotal = trafficSources.reduce((sum, ts) => sum + ts.visitors, 0);
  const orderCount = orders.length;

  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
  const totalItemsSold = orders.reduce((sum, o) => sum + (o.itemCount || 0), 0);

  const avgCartSize = orderCount > 0 ? totalItemsSold / orderCount : 0;
  const conversionRate = visitorsTotal > 0 ? (orderCount / visitorsTotal) * 100 : 0;
  const buyersCount = orderCount; // simplification, 1 commande = 1 buyer
  const interestRate = visitorsTotal > 0 ? (waitlistTotal / visitorsTotal) * 100 : 0;
  const dealRate = waitlistTotal > 0 ? (buyersCount / waitlistTotal) * 100 : 0;

  const startTime = drop.startTime;
  const endTime = drop.endTime ?? new Date();
  const selloutTimeSeconds =
    startTime && endTime
      ? Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 1000))
      : null;

  const maxUnits = drop.maxUnits ?? 0;
  const soldOut = maxUnits > 0 ? totalItemsSold >= maxUnits : false;

  await db.drop.update({
    where: { id: dropId },
    data: {
      status: "ENDED",
      endTime,
      finalRevenue: totalRevenue,
      finalOrderCount: orderCount,
      finalConversionRate: conversionRate,
      finalAvgCartSize: avgCartSize,
      finalWaitlistTotal: waitlistTotal,
      finalBuyersCount: buyersCount,
      finalInterestRate: interestRate,
      finalDealRate: dealRate,
      selloutTimeSeconds,
      baseCurrency: "USD",
      soldOut,
    },
  });

  // notifyWaitlist a besoin des stats qu'on vient de calculer, pas de celles
  // (perimees) du `drop` recu en parametre.
  await notifyWaitlist(
    { ...drop, endTime, soldOut, finalWaitlistTotal: waitlistTotal, selloutTimeSeconds },
    "DROP_ENDED"
  );
}

// Verifie les drops DRAFT avec autoLaunch active dont l'heure prevue est
// passee, et les bascule en LIVE.
export async function autoLaunchDueDrops(shopDomain) {
  const now = new Date();

  const dueDrops = await db.drop.findMany({
    where: {
      shopDomain,
      status: "DRAFT",
      autoLaunch: true,
      startTime: { lte: now },
    },
  });

  for (const drop of dueDrops) {
    await launchDrop(drop);
  }

  return dueDrops;
}

// Verifie les drops LIVE avec autoLaunch active qui sont sold-out depuis au
// moins AUTO_END_GRACE_MS sans nouvelle vente, et les cloture automatiquement
// (equivalent du clic sur "Save to history").
export async function autoEndSoldOutDrops(shopDomain) {
  const now = new Date();

  const liveDrops = await db.drop.findMany({
    where: { shopDomain, status: "LIVE", autoLaunch: true },
  });

  const ended = [];

  for (const drop of liveDrops) {
    if (!drop.maxUnits || drop.maxUnits <= 0) continue;

    const orders = await db.dropOrder.findMany({
      where: { dropId: drop.id, shopDomain },
      orderBy: { createdAt: "asc" },
    });

    let cumulative = 0;
    let soldOutAt = null;
    for (const o of orders) {
      cumulative += o.itemCount || 0;
      if (cumulative >= drop.maxUnits) {
        soldOutAt = o.createdAt;
        break;
      }
    }

    if (!soldOutAt) continue;

    const elapsedMs = now.getTime() - soldOutAt.getTime();
    if (elapsedMs >= AUTO_END_GRACE_MS) {
      await endDrop(drop);
      ended.push(drop.id);
    }
  }

  return ended;
}

// Point d'entree unique pour le polling (loaders admin ou cron externe) :
// lance d'abord les drops programmes, puis cloture ceux qui sont sold-out.
export async function runAutoDropLifecycle(shopDomain) {
  const launched = await autoLaunchDueDrops(shopDomain);
  const ended = await autoEndSoldOutDrops(shopDomain);
  return { launched, ended };
}
