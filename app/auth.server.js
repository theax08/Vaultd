import { SignJWT, jwtVerify } from "jose";

// Pas de fallback : un secret par defaut connu de quiconque a le code source
// permettrait de forger un token pour n'importe quel accountId (email, plan,
// boutiques liees exposes par api.account.jsx) si JWT_SECRET manquait un
// jour en prod — mieux vaut echouer que d'accepter des tokens forges en
// silence. Verifie a l'appel (pas au chargement du module) pour qu'un
// JWT_SECRET manquant ne fasse planter que ces routes-la, pas tout le
// serveur au demarrage.
function getSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(process.env.JWT_SECRET);
}

export async function signToken(accountId) {
  return new SignJWT({ accountId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload;
  } catch {
    return null;
  }
}

export function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  const [scheme, token] = auth.split(" ");
  return scheme === "Bearer" && token ? token : null;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function withCors(response) {
  Object.entries(CORS).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}

export function corsJson(data, init = {}) {
  return withCors(Response.json(data, init));
}

export function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS });
}
