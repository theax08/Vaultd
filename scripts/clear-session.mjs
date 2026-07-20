// One-shot script: delete the permanent offline session so the next
// authenticate.admin() triggers Token Exchange with expiringOfflineAccessTokens: true.
// Run once after deploying the expiringOfflineAccessTokens flag, then discard.
//
// Usage (local):   node scripts/clear-session.mjs
// Usage (Railway): railway run node scripts/clear-session.mjs

import db from "../app/db.server.js";

const SHOP = "trities-jrn52svo.myshopify.com";

const result = await db.session.deleteMany({ where: { shop: SHOP } });
console.log(`Deleted ${result.count} session(s) for ${SHOP}`);
await db.$disconnect();
