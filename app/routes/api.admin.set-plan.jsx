import db from "../db.server";

const VALID_PLANS = ["FREE", "GROWTH", "PRO", "SCALE", "ELITE"];

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
  const plan = (body.plan || "").trim().toUpperCase();

  if (!shopDomain) return Response.json({ error: "shopDomain is required" }, { status: 400 });
  if (!VALID_PLANS.includes(plan)) {
    return Response.json({ error: `plan must be one of: ${VALID_PLANS.join(", ")}` }, { status: 400 });
  }

  const settings = await db.shopSettings.findUnique({ where: { shopDomain } });
  if (!settings) return Response.json({ error: "Shop not found" }, { status: 404 });

  if (settings.vaultdAccountId) {
    await db.vaultdAccount.update({
      where: { id: settings.vaultdAccountId },
      data: { plan, lastSeenPlan: plan },
    });
    return Response.json({ ok: true, shopDomain, plan, accountId: settings.vaultdAccountId });
  }

  // Pas encore de compte — on en crée un et on le lie
  const account = await db.vaultdAccount.create({
    data: { plan, lastSeenPlan: plan },
  });
  await db.shopSettings.update({
    where: { shopDomain },
    data: { vaultdAccountId: account.id },
  });
  return Response.json({ ok: true, shopDomain, plan, accountId: account.id, accountCreated: true });
};
