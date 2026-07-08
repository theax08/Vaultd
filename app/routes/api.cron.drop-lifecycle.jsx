import db from "../db.server";
import { runAutoDropLifecycle } from "../drop-lifecycle.server";

// Endpoint a appeler par un cron externe (ex: cron-job.org, GitHub Actions
// scheduled workflow, etc.) toutes les 1-5 minutes pour que l'auto-launch et
// l'auto-end fonctionnent meme si personne n'a Vaultd ouvert dans l'admin.
// Protege par un secret partage (jamais expose au client).
async function runForAllShops(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || request.headers.get("x-cron-secret");

  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const activeDrops = await db.drop.findMany({
    where: { status: { in: ["DRAFT", "LIVE"] } },
    select: { shopDomain: true },
    distinct: ["shopDomain"],
  });

  const results = {};
  for (const { shopDomain } of activeDrops) {
    results[shopDomain] = await runAutoDropLifecycle(shopDomain);
  }

  return Response.json({ ok: true, checkedShops: activeDrops.length, results });
}

export const loader = async ({ request }) => runForAllShops(request);
export const action = async ({ request }) => runForAllShops(request);
