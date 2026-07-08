import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || "vaultd-dev-secret-change-in-production"
);

export async function signToken(accountId) {
  return new SignJWT({ accountId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, secret);
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
