import { authenticate } from "../shopify.server";

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function randomCode(suffix) {
  return Math.random().toString(36).slice(2, 10).toUpperCase() + String(suffix);
}

const FIRST_NAMES = [
  "Jade", "Milo", "Sasha", "Remy", "Ines", "Eli", "Nora", "Zane", "Lila", "Theo",
  "Ava", "Leo", "Maya", "Axel", "Cleo", "Rex", "Ivy", "Kai", "Nina", "Omar",
  "Piper", "Seth", "Tara", "Vince", "Wren", "Yael", "Zoe", "Ace", "Blair", "Cruz",
];
const DOMAINS = ["gmail.com", "icloud.com", "outlook.com", "yahoo.com", "proton.me", "hey.com"];

function fakeEmail(name, dropIndex, i) {
  return `${name.toLowerCase()}${dropIndex}${i}@${DOMAINS[(dropIndex + i) % DOMAINS.length]}`;
}

// Template keyed by drop name — matches exactly the names the user created in the app
const INJECT_MAP = {
  "Black Box I": {
    status: "ENDED",
    startTime: daysAgo(90),
    endTime: daysAgo(87),
    finalRevenue: 15480,
    finalOrderCount: 184,
    finalConversionRate: 82.1,
    finalAvgCartSize: 84.1,
    finalWaitlistTotal: 340,
    finalBuyersCount: 184,
    finalInterestRate: 100,
    finalDealRate: 91.2,
    selloutTimeSeconds: 4 * 3600 + 22 * 60,
    soldOut: true,
    waitlistCount: 340,
  },
  "Studio One": {
    status: "ENDED",
    startTime: daysAgo(78),
    endTime: daysAgo(76),
    finalRevenue: 8250,
    finalOrderCount: 110,
    finalConversionRate: 71.4,
    finalAvgCartSize: 75.0,
    finalWaitlistTotal: 280,
    finalBuyersCount: 110,
    finalInterestRate: 98,
    finalDealRate: 78.6,
    selloutTimeSeconds: 11 * 3600,
    soldOut: true,
    waitlistCount: 280,
  },
  "Cipher Drop": {
    status: "ENDED",
    startTime: daysAgo(65),
    endTime: daysAgo(63),
    finalRevenue: 22950,
    finalOrderCount: 459,
    finalConversionRate: 90.3,
    finalAvgCartSize: 50.0,
    finalWaitlistTotal: 508,
    finalBuyersCount: 459,
    finalInterestRate: 100,
    finalDealRate: 92.5,
    selloutTimeSeconds: 2 * 3600 + 18 * 60,
    soldOut: true,
    waitlistCount: 508,
  },
  "Archive Vol.1": {
    status: "ENDED",
    startTime: daysAgo(52),
    endTime: daysAgo(49),
    finalRevenue: 12150,
    finalOrderCount: 202,
    finalConversionRate: 67.3,
    finalAvgCartSize: 60.1,
    finalWaitlistTotal: 420,
    finalBuyersCount: 202,
    finalInterestRate: 95,
    finalDealRate: 71.0,
    selloutTimeSeconds: 8 * 3600 + 45 * 60,
    soldOut: false,
    waitlistCount: 420,
  },
  "Drop Zero": {
    status: "ENDED",
    startTime: daysAgo(40),
    endTime: daysAgo(39),
    finalRevenue: 5600,
    finalOrderCount: 56,
    finalConversionRate: 55.4,
    finalAvgCartSize: 100.0,
    finalWaitlistTotal: 180,
    finalBuyersCount: 56,
    finalInterestRate: 90,
    finalDealRate: 56.0,
    selloutTimeSeconds: 22 * 3600,
    soldOut: false,
    waitlistCount: 180,
  },
  "Carbon Series": {
    status: "ENDED",
    startTime: daysAgo(30),
    endTime: daysAgo(27),
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
  "Lunar Edition": {
    status: "ENDED",
    startTime: daysAgo(18),
    endTime: daysAgo(16),
    finalRevenue: 18975,
    finalOrderCount: 195,
    finalConversionRate: 78.0,
    finalAvgCartSize: 97.3,
    finalWaitlistTotal: 390,
    finalBuyersCount: 195,
    finalInterestRate: 97,
    finalDealRate: 79.6,
    selloutTimeSeconds: 6 * 3600 + 5 * 60,
    soldOut: true,
    waitlistCount: 390,
  },
  "Meridian": {
    status: "LIVE",
    startTime: daysAgo(1),
    endTime: null,
    waitlistCount: 215,
  },
  "Nocturne": {
    status: "DRAFT",
    waitlistCount: 0,
  },
  "The Waitlist": {
    status: "DRAFT",
    waitlistCount: 42,
  },
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const dbModule = await import("../db.server");
  const db = dbModule.default ?? dbModule.prisma ?? dbModule.db ?? dbModule.client ?? dbModule;

  // Fetch all drops for this shop that match a known template name
  const knownNames = Object.keys(INJECT_MAP);
  const drops = await db.drop.findMany({
    where: { shopDomain, name: { in: knownNames } },
    select: { id: true, name: true, status: true },
  });

  if (drops.length === 0) {
    return new Response(
      JSON.stringify({
        ok: false,
        message: `No matching drops found for ${shopDomain}. Create drops named: ${knownNames.join(", ")}`,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const results = [];

  for (let di = 0; di < drops.length; di++) {
    const drop = drops[di];
    const tpl = INJECT_MAP[drop.name];
    if (!tpl) continue;

    // Update drop status and stats
    const updateData = {
      status: tpl.status,
    };
    if (tpl.startTime !== undefined) updateData.startTime = tpl.startTime;
    if (tpl.endTime !== undefined) updateData.endTime = tpl.endTime;
    if (tpl.finalRevenue !== undefined) updateData.finalRevenue = tpl.finalRevenue;
    if (tpl.finalOrderCount !== undefined) updateData.finalOrderCount = tpl.finalOrderCount;
    if (tpl.finalConversionRate !== undefined) updateData.finalConversionRate = tpl.finalConversionRate;
    if (tpl.finalAvgCartSize !== undefined) updateData.finalAvgCartSize = tpl.finalAvgCartSize;
    if (tpl.finalWaitlistTotal !== undefined) updateData.finalWaitlistTotal = tpl.finalWaitlistTotal;
    if (tpl.finalBuyersCount !== undefined) updateData.finalBuyersCount = tpl.finalBuyersCount;
    if (tpl.finalInterestRate !== undefined) updateData.finalInterestRate = tpl.finalInterestRate;
    if (tpl.finalDealRate !== undefined) updateData.finalDealRate = tpl.finalDealRate;
    if (tpl.selloutTimeSeconds !== undefined) updateData.selloutTimeSeconds = tpl.selloutTimeSeconds;
    if (tpl.soldOut !== undefined) updateData.soldOut = tpl.soldOut;

    await db.drop.update({ where: { id: drop.id }, data: updateData });

    // Inject waitlist entries (skip if entries already exist)
    const existing = await db.waitlistEntry.count({ where: { dropId: drop.id } });
    const toCreate = (tpl.waitlistCount ?? 0) - existing;

    if (toCreate > 0) {
      const entries = [];
      for (let i = 0; i < toCreate; i++) {
        const firstName = FIRST_NAMES[(di * 31 + i) % FIRST_NAMES.length];
        entries.push({
          dropId: drop.id,
          email: fakeEmail(firstName, di, existing + i),
          customerName: `${firstName} ${String.fromCharCode(65 + ((di + i) % 26))}.`,
          referralCode: randomCode(di * 1000 + existing + i),
          score: Math.floor(Math.random() * 80),
          createdAt: new Date(Date.now() - Math.random() * 10 * 24 * 3600 * 1000),
          unsubscribedAt: null,
        });
      }
      await db.waitlistEntry.createMany({ data: entries, skipDuplicates: true });
    }

    results.push({
      name: drop.name,
      previousStatus: drop.status,
      newStatus: tpl.status,
      waitlistAdded: Math.max(0, toCreate),
      waitlistTotal: tpl.waitlistCount ?? 0,
    });
  }

  const notFound = knownNames.filter((n) => !drops.find((d) => d.name === n));

  return new Response(
    JSON.stringify({ ok: true, shop: shopDomain, updated: results, notFound }),
    { headers: { "Content-Type": "application/json" } }
  );
};
