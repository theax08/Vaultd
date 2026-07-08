import { randomBytes } from "node:crypto";
import db from "../db.server";

const SEED_DOMAIN = "seed.vaultd.dev";

const FIRST_NAMES = ["Alex","Marie","Lucas","Emma","Noah","Lea","Liam","Jade","Hugo","Camille","Theo","Ines","Tom","Chloe","Maxime","Manon","Ethan","Zoe","Nathan","Clara","Louis","Sarah","Jules","Alice","Paul","Lucie","Axel","Eva","Romain","Oceane"];
const LAST_NAMES = ["Martin","Bernard","Thomas","Petit","Robert","Richard","Durand","Moreau","Simon","Laurent","Michel","Garcia","David","Bertrand","Roux","Vincent","Fournier","Morel","Girard","Andre","Lefevre","Mercier","Dupont","Lambert","Bonnet","Francois","Martinez","Legrand","Garnier","Faure"];

const PRODUCT_NAMES = [
  "Limited Edition Hoodie",
  "Collector Sneakers Vol.3",
  "Merch Box — Gold Tier",
  "Capsule Jacket",
  "Drop Exclusive Tee",
  "Anniversary Polo",
  "Signature Beanie",
  "Vault Box S25",
];

const TRAFFIC_SOURCES = [
  { source: "instagram", visitors: 420 },
  { source: "vaultd_email", visitors: 310 },
  { source: "tiktok", visitors: 180 },
  { source: "twitter", visitors: 90 },
  { source: "other", visitors: 60 },
];

export const action = async ({ request }) => {
  const secret = request.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_SUPPORT_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const shopDomain = (body.shopDomain || "").trim();
  const dropId = (body.dropId || "").trim();
  const dropName = (body.dropName || "").trim();
  const count = Math.min(Math.max(0, Number(body.count) || 50), 500);
  const createIfMissing = body.createDrop !== false; // true par défaut
  const simulateLive = body.simulateLive === true; // false par défaut
  const simulateSoldOut = body.simulateSoldOut === true;
  const finalizeAsEnded = body.finalizeAsEnded === true;

  if (!shopDomain) {
    return Response.json({ error: "shopDomain is required" }, { status: 400 });
  }

  try {
    const select = { id: true, name: true, status: true, externalId: true, maxUnits: true, startTime: true };
    let drop = dropId
      ? await db.drop.findFirst({ where: { shopDomain, externalId: dropId }, select })
      : dropName
        ? await db.drop.findFirst({ where: { shopDomain, name: dropName }, select })
        : await db.drop.findFirst({
            where: { shopDomain, status: { in: ["LIVE", "DRAFT"] } },
            orderBy: { createdAt: "desc" },
            select,
          });

    // Crée un drop de démo si aucun n'existe et que createIfMissing est actif
    let dropCreated = false;
    if (!drop && createIfMissing) {
      drop = await db.drop.create({
        data: {
          shopDomain,
          name: "Demo Drop (seed)",
          status: "DRAFT",
          maxUnits: 500,
          maxWaitlistSize: 10000,
          referralEnabled: true,
          referralPointsPerShare: 1,
          peakVelocity: 0,
        },
        select,
      });
      dropCreated = true;
    }

    if (!drop) {
      return Response.json({ error: "No matching drop found for this shopDomain" }, { status: 404 });
    }

    // ──────────────────────────────────────────────
    // MODE LIVE : injecte des orders + traffic réalistes
    // ──────────────────────────────────────────────
    let ordersInserted = 0;
    if (simulateLive) {
      const now = new Date();
      const startTime = new Date(now.getTime() - 28 * 60 * 1000); // démarré il y a 28 min

      // Passe le drop en LIVE
      await db.drop.update({
        where: { id: drop.id },
        data: { status: "LIVE", startTime, peakVelocity: 0 },
      });
      drop = { ...drop, status: "LIVE" };

      // Nettoie les anciens orders seed
      await db.dropOrder.deleteMany({
        where: { dropId: drop.id, shopifyOrderId: { startsWith: "seed_" } },
      });

      // Génère 22 orders étalés sur les 28 dernières minutes
      const orderCount = 22;
      const orders = Array.from({ length: orderCount }, (_, i) => {
        const first = FIRST_NAMES[i % FIRST_NAMES.length];
        const last = LAST_NAMES[(i * 3) % LAST_NAMES.length];
        const email = `${first.toLowerCase()}.${last.toLowerCase()}.${i}@${SEED_DOMAIN}`;
        const product = PRODUCT_NAMES[i % PRODUCT_NAMES.length];
        const itemCount = (i % 3) + 1;
        const unitPrice = [49, 89, 129, 159, 199][i % 5];
        const totalAmount = unitPrice * itemCount;
        // Répartis dans le temps : les plus récents en dernier
        const secondsAgo = Math.round(((orderCount - i) / orderCount) * 27 * 60);
        const createdAt = new Date(now.getTime() - secondsAgo * 1000);
        return {
          shopDomain,
          dropId: drop.id,
          shopifyOrderId: `seed_${randomBytes(8).toString("hex")}`,
          shopifyOrderName: `#${1000 + i}`,
          customerEmail: email,
          totalAmount,
          currencyCode: "EUR",
          itemCount,
          firstProductName: product,
          fromWaitlist: i % 3 !== 0,
          createdAt,
        };
      });

      await db.dropOrder.createMany({ data: orders, skipDuplicates: true });
      ordersInserted = orders.length;

      // Injecte les sources de trafic (upsert)
      for (const ts of TRAFFIC_SOURCES) {
        await db.dropTrafficSource.upsert({
          where: { dropId_source: { dropId: drop.id, source: ts.source } },
          update: { visitors: ts.visitors },
          create: { shopDomain, dropId: drop.id, source: ts.source, visitors: ts.visitors },
        });
      }
    }

    // ──────────────────────────────────────────────
    // MODE FINALIZE : clôture un drop LIVE proprement avec les orders existants
    // ──────────────────────────────────────────────
    if (finalizeAsEnded && !simulateSoldOut) {
      const existingOrders = await db.dropOrder.findMany({ where: { dropId: drop.id } });
      const totalRevenue = existingOrders.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
      const totalItems = existingOrders.reduce((s, o) => s + (o.itemCount || 0), 0);
      const orderCount = existingOrders.length;
      const now = new Date();
      const startTime = drop.startTime || new Date(now.getTime() - 30 * 60 * 1000);
      const endTime = now;
      const selloutTimeSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
      const totalVisitors = TRAFFIC_SOURCES.reduce((s, ts) => s + ts.visitors, 0);
      await db.drop.update({
        where: { id: drop.id },
        data: {
          status: "ENDED",
          startTime,
          endTime,
          finalRevenue: totalRevenue,
          finalOrderCount: orderCount,
          finalConversionRate: totalVisitors > 0 ? (orderCount / totalVisitors) * 100 : 0,
          finalAvgCartSize: orderCount > 0 ? totalItems / orderCount : 0,
          finalWaitlistTotal: 80,
          finalBuyersCount: orderCount,
          soldOut: false,
          selloutTimeSeconds,
          baseCurrency: "EUR",
        },
      });
      drop = { ...drop, status: "ENDED" };
    }

    // ──────────────────────────────────────────────
    // MODE SOLD-OUT : simule un drop qui s'est épuisé
    // ──────────────────────────────────────────────
    if (simulateSoldOut) {
      const now = new Date();
      const startTime = new Date(now.getTime() - 95 * 60 * 1000); // démarré il y a 1h35
      const endTime = new Date(now.getTime() - 20 * 60 * 1000);   // sold-out il y a 20 min
      const selloutTimeSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

      await db.drop.update({
        where: { id: drop.id },
        data: { status: "LIVE", startTime, peakVelocity: 0 },
      });

      // Nettoie les orders seed existants
      await db.dropOrder.deleteMany({
        where: { dropId: drop.id, shopifyOrderId: { startsWith: "seed_" } },
      });

      const maxUnits = drop.maxUnits || 200;
      const soldOutOrderCount = 28;
      const soldOutProducts = PRODUCT_NAMES.slice(0, 4);
      const soldOutOrders = Array.from({ length: soldOutOrderCount }, (_, i) => {
        const first = FIRST_NAMES[(i * 7) % FIRST_NAMES.length];
        const last = LAST_NAMES[(i * 5) % LAST_NAMES.length];
        const product = soldOutProducts[i % soldOutProducts.length];
        const itemCount = (i % 2) + 1;
        const unitPrice = [79, 129, 189, 229][i % 4];
        // Commandes concentrées sur les 40 premières minutes (rush de sold-out)
        const progressFraction = i / soldOutOrderCount;
        const secondsIntoRush = Math.round(progressFraction * 40 * 60);
        const createdAt = new Date(startTime.getTime() + secondsIntoRush * 1000);
        return {
          shopDomain,
          dropId: drop.id,
          shopifyOrderId: `seed_${randomBytes(8).toString("hex")}`,
          shopifyOrderName: `#${2000 + i}`,
          customerEmail: `${first.toLowerCase()}.${last.toLowerCase()}.${i}@${SEED_DOMAIN}`,
          totalAmount: unitPrice * itemCount,
          currencyCode: "EUR",
          itemCount,
          firstProductName: product,
          fromWaitlist: i % 4 !== 0,
          createdAt,
        };
      });

      await db.dropOrder.createMany({ data: soldOutOrders, skipDuplicates: true });

      const totalRevenue = soldOutOrders.reduce((s, o) => s + o.totalAmount, 0);
      const totalItems = soldOutOrders.reduce((s, o) => s + o.itemCount, 0);
      const soldOutTraffic = [
        { source: "vaultd_email", visitors: 520 },
        { source: "instagram", visitors: 280 },
        { source: "tiktok", visitors: 140 },
        { source: "other", visitors: 45 },
      ];
      const totalVisitors = soldOutTraffic.reduce((s, ts) => s + ts.visitors, 0);

      for (const ts of soldOutTraffic) {
        await db.dropTrafficSource.upsert({
          where: { dropId_source: { dropId: drop.id, source: ts.source } },
          update: { visitors: ts.visitors },
          create: { shopDomain, dropId: drop.id, source: ts.source, visitors: ts.visitors },
        });
      }

      // DropProductStats pour "Most Demanded"
      await db.dropProductStats.deleteMany({ where: { dropId: drop.id, shopDomain } });
      const productMap = {};
      for (const o of soldOutOrders) {
        if (!productMap[o.firstProductName]) {
          productMap[o.firstProductName] = { units: 0, revenue: 0, lastSoldAt: o.createdAt };
        }
        productMap[o.firstProductName].units += o.itemCount;
        productMap[o.firstProductName].revenue += o.totalAmount;
        if (o.createdAt > productMap[o.firstProductName].lastSoldAt) {
          productMap[o.firstProductName].lastSoldAt = o.createdAt;
        }
      }
      await db.dropProductStats.createMany({
        data: Object.entries(productMap).map(([name, stats], idx) => ({
          shopDomain,
          dropId: drop.id,
          productId: `seed_prod_${idx}`,
          productName: name,
          unitsSold: stats.units,
          revenue: stats.revenue,
          lastSoldAt: stats.lastSoldAt,
          selloutTimeSeconds: idx === 0 ? selloutTimeSeconds : null,
        })),
      });

      const conversionRate = (soldOutOrderCount / totalVisitors) * 100;
      await db.drop.update({
        where: { id: drop.id },
        data: {
          status: "ENDED",
          startTime,
          endTime,
          peakVelocity: 0.18,
          finalRevenue: totalRevenue,
          finalOrderCount: soldOutOrderCount,
          finalConversionRate: conversionRate,
          finalAvgCartSize: totalItems / soldOutOrderCount,
          finalWaitlistTotal: count || 80,
          finalBuyersCount: soldOutOrderCount,
          soldOut: true,
          selloutTimeSeconds,
          baseCurrency: "EUR",
        },
      });

      drop = { ...drop, status: "ENDED" };
      ordersInserted = soldOutOrders.length;
    }

    // ──────────────────────────────────────────────
    // WAITLIST : injecte des inscrits
    // ──────────────────────────────────────────────
    await db.waitlistEntry.deleteMany({
      where: { dropId: drop.id, email: { endsWith: `@${SEED_DOMAIN}` } },
    });

    let waitlistInserted = 0;
    if (count > 0) {
      const unsubRatio = body.unsubscribeRatio ?? 0.12; // 12% désinscrits par défaut
      const referralBoost = body.referralPointsPerShare ?? 1;
      const entries = Array.from({ length: count }, (_, i) => {
        const first = FIRST_NAMES[i % FIRST_NAMES.length];
        const last = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
        const hasReferral = i % 7 === 0; // ~14% ont parrainé quelqu'un
        const isUnsub = i % Math.round(1 / unsubRatio) === 3;
        return {
          dropId: drop.id,
          email: `${first.toLowerCase()}.${last.toLowerCase()}.${i}@${SEED_DOMAIN}`,
          customerName: `${first} ${last}`,
          referralCode: randomBytes(12).toString("hex"),
          score: hasReferral ? referralBoost * (1 + (i % 3)) : 0,
          unsubscribedAt: isUnsub ? new Date(Date.now() - Math.random() * 72 * 3600 * 1000) : null,
        };
      });

      const BATCH = 50;
      for (let i = 0; i < entries.length; i += BATCH) {
        await db.waitlistEntry.createMany({
          data: entries.slice(i, i + BATCH),
          skipDuplicates: true,
        });
        waitlistInserted += Math.min(BATCH, entries.length - i);
      }
    }

    return Response.json({
      ok: true,
      dropId: drop.id,
      drop: drop.name,
      status: drop.status,
      waitlistInserted: waitlistInserted || undefined,
      ordersInserted: ordersInserted || undefined,
      dropCreated,
    });
  } catch (err) {
    return Response.json({ error: err.message || "Internal error" }, { status: 500 });
  }
};
