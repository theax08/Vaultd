import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

// Use public URL saved from Railway vars (accessible from outside Railway network)
let dbUrl = process.env.DATABASE_URL;
try {
  const pub = readFileSync("C:/Users/Delmas/AppData/Local/Temp/railway_pub_url.txt", "utf8").trim();
  if (pub.startsWith("postgresql://")) dbUrl = pub;
} catch {}

const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function code(prefix) {
  return prefix + Math.random().toString(36).slice(2, 10).toUpperCase();
}

const NAMES = [
  "Jade","Milo","Sasha","Remy","Ines","Eli","Nora","Zane","Lila","Theo",
  "Ava","Leo","Maya","Axel","Cleo","Rex","Ivy","Kai","Nina","Omar",
  "Piper","Seth","Tara","Vince","Wren","Yael","Zoe","Ace","Blair","Cruz",
];
const DOMAINS = ["gmail.com","icloud.com","outlook.com","yahoo.com","proton.me","hey.com"];

function makeEntries(dropId, count, di) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const n = NAMES[(di * 31 + i) % NAMES.length];
    rows.push({
      dropId,
      email: `${n.toLowerCase()}${di}${i}@${DOMAINS[(di + i) % DOMAINS.length]}`,
      customerName: `${n} ${String.fromCharCode(65 + ((di + i) % 26))}.`,
      referralCode: code(`D${di}E${i}`),
      score: Math.floor(Math.random() * 80),
      createdAt: new Date(Date.now() - Math.random() * 10 * 86400000),
      unsubscribedAt: null,
    });
  }
  return rows;
}

const DROPS = [
  {
    name: "Black Box I",
    status: "ENDED",
    startTime: daysAgo(90), endTime: daysAgo(87), maxUnits: 200,
    description: "Our first limited release. 200 units, zero restocks.",
    finalRevenue: 15480, finalOrderCount: 184, finalConversionRate: 82.1,
    finalAvgCartSize: 84.1, finalWaitlistTotal: 340, finalBuyersCount: 184,
    finalInterestRate: 100, finalDealRate: 91.2,
    selloutTimeSeconds: 4 * 3600 + 22 * 60, soldOut: true, waitlist: 340,
  },
  {
    name: "Studio One",
    status: "ENDED",
    startTime: daysAgo(78), endTime: daysAgo(76), maxUnits: 150,
    description: "Limited art print series. Signed and numbered.",
    finalRevenue: 8250, finalOrderCount: 110, finalConversionRate: 71.4,
    finalAvgCartSize: 75.0, finalWaitlistTotal: 280, finalBuyersCount: 110,
    finalInterestRate: 98, finalDealRate: 78.6,
    selloutTimeSeconds: 11 * 3600, soldOut: true, waitlist: 280,
  },
  {
    name: "Cipher Drop",
    status: "ENDED",
    startTime: daysAgo(65), endTime: daysAgo(63), maxUnits: 500,
    description: "Tech accessories collab — encrypted aesthetics.",
    finalRevenue: 22950, finalOrderCount: 459, finalConversionRate: 90.3,
    finalAvgCartSize: 50.0, finalWaitlistTotal: 508, finalBuyersCount: 459,
    finalInterestRate: 100, finalDealRate: 92.5,
    selloutTimeSeconds: 2 * 3600 + 18 * 60, soldOut: true, waitlist: 508,
  },
  {
    name: "Archive Vol.1",
    status: "ENDED",
    startTime: daysAgo(52), endTime: daysAgo(49), maxUnits: 300,
    description: "Vintage-cut silhouettes, premium fabrics. Never repeated.",
    finalRevenue: 12150, finalOrderCount: 202, finalConversionRate: 67.3,
    finalAvgCartSize: 60.1, finalWaitlistTotal: 420, finalBuyersCount: 202,
    finalInterestRate: 95, finalDealRate: 71.0,
    selloutTimeSeconds: 8 * 3600 + 45 * 60, soldOut: false, waitlist: 420,
  },
  {
    name: "Drop Zero",
    status: "ENDED",
    startTime: daysAgo(40), endTime: daysAgo(39), maxUnits: 100,
    description: "The origin drop. Everything started here.",
    finalRevenue: 5600, finalOrderCount: 56, finalConversionRate: 55.4,
    finalAvgCartSize: 100.0, finalWaitlistTotal: 180, finalBuyersCount: 56,
    finalInterestRate: 90, finalDealRate: 56.0,
    selloutTimeSeconds: 22 * 3600, soldOut: false, waitlist: 180,
  },
  {
    name: "Carbon Series",
    status: "ENDED",
    startTime: daysAgo(30), endTime: daysAgo(27), maxUnits: 600,
    description: "Performance-grade outerwear. Every unit pre-assigned.",
    finalRevenue: 31800, finalOrderCount: 564, finalConversionRate: 94.0,
    finalAvgCartSize: 56.4, finalWaitlistTotal: 600, finalBuyersCount: 564,
    finalInterestRate: 100, finalDealRate: 94.0,
    selloutTimeSeconds: 55 * 60, soldOut: true, waitlist: 600,
  },
  {
    name: "Lunar Edition",
    status: "ENDED",
    startTime: daysAgo(18), endTime: daysAgo(16), maxUnits: 250,
    description: "Collab drop with Studio Aura. Reflective hardware collection.",
    finalRevenue: 18975, finalOrderCount: 195, finalConversionRate: 78.0,
    finalAvgCartSize: 97.3, finalWaitlistTotal: 390, finalBuyersCount: 195,
    finalInterestRate: 97, finalDealRate: 79.6,
    selloutTimeSeconds: 6 * 3600 + 5 * 60, soldOut: true, waitlist: 390,
  },
  {
    name: "Meridian",
    status: "LIVE",
    startTime: daysAgo(1), endTime: null, maxUnits: 400,
    description: "Currently live. Meridian utility capsule — limited 72h window.",
    waitlist: 215,
  },
  {
    name: "Nocturne",
    status: "DRAFT",
    startTime: null, endTime: null, maxUnits: 180,
    description: "Upcoming night-run capsule. Drop TBD.",
    waitlist: 0,
  },
  {
    name: "The Waitlist",
    status: "DRAFT",
    startTime: null, endTime: null, maxUnits: 99,
    description: "Experimental drop. Pre-waitlist only — no public announcement yet.",
    waitlist: 42,
  },
];

async function main() {
  const session = await db.session.findFirst({ select: { shop: true } });
  if (!session) {
    console.error("No session found — install the app on Shopify first.");
    process.exit(1);
  }
  const shopDomain = session.shop;
  console.log(`Shop: ${shopDomain}\n`);

  const existing = await db.drop.findMany({
    where: { shopDomain, name: { in: DROPS.map((d) => d.name) } },
    select: { id: true, name: true },
  });
  const existingMap = Object.fromEntries(existing.map((d) => [d.name, d.id]));

  for (let di = 0; di < DROPS.length; di++) {
    const t = DROPS[di];
    let dropId = existingMap[t.name];

    if (dropId) {
      await db.drop.update({
        where: { id: dropId },
        data: {
          status: t.status,
          startTime: t.startTime ?? null,
          endTime: t.endTime ?? null,
          finalRevenue: t.finalRevenue ?? null,
          finalOrderCount: t.finalOrderCount ?? null,
          finalConversionRate: t.finalConversionRate ?? null,
          finalAvgCartSize: t.finalAvgCartSize ?? null,
          finalWaitlistTotal: t.finalWaitlistTotal ?? null,
          finalBuyersCount: t.finalBuyersCount ?? null,
          finalInterestRate: t.finalInterestRate ?? null,
          finalDealRate: t.finalDealRate ?? null,
          selloutTimeSeconds: t.selloutTimeSeconds ?? null,
          soldOut: t.soldOut ?? false,
        },
      });
      console.log(`Updated  ${t.name} → ${t.status}`);
    } else {
      const created = await db.drop.create({
        data: {
          shopDomain,
          name: t.name,
          status: t.status,
          maxUnits: t.maxUnits,
          description: t.description ?? null,
          startTime: t.startTime ?? null,
          endTime: t.endTime ?? null,
          referralEnabled: true,
          finalRevenue: t.finalRevenue ?? null,
          finalOrderCount: t.finalOrderCount ?? null,
          finalConversionRate: t.finalConversionRate ?? null,
          finalAvgCartSize: t.finalAvgCartSize ?? null,
          finalWaitlistTotal: t.finalWaitlistTotal ?? null,
          finalBuyersCount: t.finalBuyersCount ?? null,
          finalInterestRate: t.finalInterestRate ?? null,
          finalDealRate: t.finalDealRate ?? null,
          selloutTimeSeconds: t.selloutTimeSeconds ?? null,
          soldOut: t.soldOut ?? false,
        },
      });
      dropId = created.id;
      console.log(`Created  ${t.name} → ${t.status}`);
    }

    const wCount = t.waitlist ?? 0;
    if (wCount > 0) {
      const alreadyIn = await db.waitlistEntry.count({ where: { dropId } });
      const toAdd = wCount - alreadyIn;
      if (toAdd > 0) {
        await db.waitlistEntry.createMany({
          data: makeEntries(dropId, toAdd, di),
          skipDuplicates: true,
        });
        console.log(`         + ${toAdd} waitlist entries`);
      }
    }
  }

  console.log("\nAll done.");
}

main().catch(console.error).finally(() => db.$disconnect());
