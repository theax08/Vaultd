import { authenticate } from "../shopify.server";

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function randomCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

const FIRST_NAMES = [
  "Jade", "Milo", "Sasha", "Remy", "Ines", "Eli", "Nora", "Zane", "Lila", "Theo",
  "Ava", "Leo", "Maya", "Axel", "Cleo", "Rex", "Ivy", "Kai", "Nina", "Omar",
  "Piper", "Seth", "Tara", "Vince", "Wren", "Yael", "Zoe", "Ace", "Blair", "Cruz",
];
const DOMAINS = [
  "gmail.com", "icloud.com", "outlook.com", "yahoo.com",
  "proton.me", "hey.com", "hotmail.com",
];

function fakeEmail(name, i) {
  const domain = DOMAINS[i % DOMAINS.length];
  return `${name.toLowerCase()}${i}@${domain}`;
}

const DROPS_TEMPLATE = [
  {
    name: "Black Box I",
    status: "ENDED",
    daysAgoStart: 90,
    daysAgoEnd: 87,
    maxUnits: 200,
    description: "Our first limited release. 200 units, zero restocks, no reorders.",
    finalRevenue: 15480,
    finalOrderCount: 184,
    finalConversionRate: 82.1,
    finalAvgCartSize: 84.1,
    finalWaitlistTotal: 340,
    finalBuyersCount: 184,
    finalInterestRate: 100,
    finalDealRate: 91.2,
    selloutTimeSeconds: 4 * 60 * 60 + 22 * 60,
    soldOut: true,
    waitlistCount: 340,
  },
  {
    name: "Studio One",
    status: "ENDED",
    daysAgoStart: 78,
    daysAgoEnd: 76,
    maxUnits: 150,
    description: "Limited art print series. Signed and numbered.",
    finalRevenue: 8250,
    finalOrderCount: 110,
    finalConversionRate: 71.4,
    finalAvgCartSize: 75.0,
    finalWaitlistTotal: 280,
    finalBuyersCount: 110,
    finalInterestRate: 98,
    finalDealRate: 78.6,
    selloutTimeSeconds: 11 * 60 * 60,
    soldOut: true,
    waitlistCount: 280,
  },
  {
    name: "Cipher Drop",
    status: "ENDED",
    daysAgoStart: 65,
    daysAgoEnd: 63,
    maxUnits: 500,
    description: "Tech accessories collab — encrypted aesthetics.",
    finalRevenue: 22950,
    finalOrderCount: 459,
    finalConversionRate: 90.3,
    finalAvgCartSize: 50.0,
    finalWaitlistTotal: 508,
    finalBuyersCount: 459,
    finalInterestRate: 100,
    finalDealRate: 92.5,
    selloutTimeSeconds: 2 * 60 * 60 + 18 * 60,
    soldOut: true,
    waitlistCount: 508,
  },
  {
    name: "Archive Vol.1",
    status: "ENDED",
    daysAgoStart: 52,
    daysAgoEnd: 49,
    maxUnits: 300,
    description: "Vintage-cut silhouettes, premium fabrics. Never repeated.",
    finalRevenue: 12150,
    finalOrderCount: 202,
    finalConversionRate: 67.3,
    finalAvgCartSize: 60.1,
    finalWaitlistTotal: 420,
    finalBuyersCount: 202,
    finalInterestRate: 95,
    finalDealRate: 71.0,
    selloutTimeSeconds: 8 * 60 * 60 + 45 * 60,
    soldOut: false,
    waitlistCount: 420,
  },
  {
    name: "Drop Zero",
    status: "ENDED",
    daysAgoStart: 40,
    daysAgoEnd: 39,
    maxUnits: 100,
    description: "The origin drop. Everything started here.",
    finalRevenue: 5600,
    finalOrderCount: 56,
    finalConversionRate: 55.4,
    finalAvgCartSize: 100.0,
    finalWaitlistTotal: 180,
    finalBuyersCount: 56,
    finalInterestRate: 90,
    finalDealRate: 56.0,
    selloutTimeSeconds: 22 * 60 * 60,
    soldOut: false,
    waitlistCount: 180,
  },
  {
    name: "Carbon Series",
    status: "ENDED",
    daysAgoStart: 30,
    daysAgoEnd: 27,
    maxUnits: 600,
    description: "Performance-grade outerwear. Every unit pre-assigned.",
    finalRevenue: 31800,
    finalOrderCount: 564,
    finalConversionRate: 94.0,
    finalAvgCartSize: 56.4,
    finalWaitlistTotal: 600,
    finalBuyersCount: 564,
    finalInterestRate: 100,
    finalDealRate: 94.0,
    selloutTimeSeconds: 55 * 60,
    soldOut: true,
    waitlistCount: 600,
  },
  {
    name: "Lunar Edition",
    status: "ENDED",
    daysAgoStart: 18,
    daysAgoEnd: 16,
    maxUnits: 250,
    description: "Collab drop with Studio Aura. Reflective hardware collection.",
    finalRevenue: 18975,
    finalOrderCount: 195,
    finalConversionRate: 78.0,
    finalAvgCartSize: 97.3,
    finalWaitlistTotal: 390,
    finalBuyersCount: 195,
    finalInterestRate: 97,
    finalDealRate: 79.6,
    selloutTimeSeconds: 6 * 60 * 60 + 5 * 60,
    soldOut: true,
    waitlistCount: 390,
  },
  {
    name: "Meridian",
    status: "LIVE",
    daysAgoStart: 1,
    daysAgoEnd: null,
    maxUnits: 400,
    description: "Currently live. Meridian utility capsule — limited 72h window.",
    waitlistCount: 215,
  },
  {
    name: "Nocturne",
    status: "DRAFT",
    daysAgoStart: null,
    daysAgoEnd: null,
    maxUnits: 180,
    description: "Upcoming night-run capsule. Drop TBD.",
    waitlistCount: 0,
  },
  {
    name: "The Waitlist",
    status: "DRAFT",
    daysAgoStart: null,
    daysAgoEnd: null,
    maxUnits: 99,
    description: "Experimental drop. Pre-waitlist only — no public announcement yet.",
    waitlistCount: 42,
  },
];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const dbModule = await import("../db.server");
  const db = dbModule.default ?? dbModule.prisma ?? dbModule.db ?? dbModule.client ?? dbModule;

  const existing = await db.drop.count({ where: { shopDomain, name: { in: DROPS_TEMPLATE.map((d) => d.name) } } });
  if (existing > 0) {
    return new Response(
      JSON.stringify({ ok: false, message: `${existing} test drop(s) already exist for ${shopDomain}. Delete them first or call with ?force=1.` }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const results = [];

  for (const t of DROPS_TEMPLATE) {
    const drop = await db.drop.create({
      data: {
        shopDomain,
        name: t.name,
        status: t.status,
        maxUnits: t.maxUnits,
        description: t.description ?? null,
        startTime: t.daysAgoStart != null ? daysAgo(t.daysAgoStart) : null,
        endTime: t.daysAgoEnd != null ? daysAgo(t.daysAgoEnd) : null,
        finalRevenue: t.finalRevenue != null ? t.finalRevenue : null,
        finalOrderCount: t.finalOrderCount ?? null,
        finalConversionRate: t.finalConversionRate ?? null,
        finalAvgCartSize: t.finalAvgCartSize ?? null,
        finalWaitlistTotal: t.finalWaitlistTotal ?? null,
        finalBuyersCount: t.finalBuyersCount ?? null,
        finalInterestRate: t.finalInterestRate ?? null,
        finalDealRate: t.finalDealRate ?? null,
        selloutTimeSeconds: t.selloutTimeSeconds ?? null,
        soldOut: t.soldOut ?? false,
        referralEnabled: true,
      },
    });

    const count = t.waitlistCount ?? 0;
    if (count > 0) {
      const entries = [];
      for (let i = 0; i < count; i++) {
        const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
        entries.push({
          dropId: drop.id,
          email: fakeEmail(firstName, i),
          customerName: `${firstName} ${String.fromCharCode(65 + (i % 26))}.`,
          referralCode: `${randomCode()}${i}`,
          score: Math.floor(Math.random() * 80),
          createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
          unsubscribedAt: null,
        });
      }
      await db.waitlistEntry.createMany({ data: entries, skipDuplicates: true });
    }

    results.push({ name: t.name, status: t.status, waitlist: count });
  }

  return new Response(
    JSON.stringify({ ok: true, shop: shopDomain, drops: results }),
    { headers: { "Content-Type": "application/json" } }
  );
};
