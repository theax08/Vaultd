import { createCookieSessionStorage, redirect } from "react-router";

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__vaultd_web",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    secrets: [
      process.env.WEBSITE_SESSION_SECRET ||
        process.env.SHOPIFY_API_SECRET ||
        "vaultd-dev-secret",
    ],
  },
});

export async function getWebSession(request) {
  return sessionStorage.getSession(request.headers.get("Cookie"));
}

export async function commitWebSession(session) {
  return sessionStorage.commitSession(session);
}

export async function destroyWebSession(session) {
  return sessionStorage.destroySession(session);
}

export async function getWebAccountOptional(request) {
  const session = await getWebSession(request);
  const accountId = session.get("accountId");
  if (!accountId) return null;
  try {
    const { default: db } = await import("./db.server");
    const account = await db.vaultdAccount.findUnique({
      where: { id: accountId },
      include: { shops: { select: { id: true, shopDomain: true } } },
    });
    return account;
  } catch {
    return null;
  }
}

export async function requireWebAccount(request) {
  const account = await getWebAccountOptional(request);
  if (!account) throw redirect("/login");
  return account;
}
