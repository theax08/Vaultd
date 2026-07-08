import db from "../db.server";
import { verifyToken, getBearerToken, corsJson, corsPreflight } from "../auth.server";

export async function loader({ request }) {
  if (request.method === "OPTIONS") return corsPreflight();

  const token = getBearerToken(request);
  if (!token) {
    return corsJson({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload?.accountId) {
    return corsJson({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await db.vaultdAccount.findUnique({
    where: { id: payload.accountId },
    select: {
      id: true,
      email: true,
      plan: true,
      appearanceColor: true,
      createdAt: true,
      shops: {
        select: { shopDomain: true },
      },
    },
  });

  if (!account) {
    return corsJson({ error: "Account not found" }, { status: 404 });
  }

  return corsJson(account);
}
