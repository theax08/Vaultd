import bcrypt from "bcryptjs";
import db from "../db.server";
import { signToken, corsJson, corsPreflight } from "../auth.server";

export async function loader({ request }) {
  if (request.method === "OPTIONS") return corsPreflight();
  return corsJson({ error: "Method not allowed" }, { status: 405 });
}

export async function action({ request }) {
  if (request.method === "OPTIONS") return corsPreflight();

  let body;
  try {
    body = await request.json();
  } catch {
    return corsJson({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, password } = body;

  if (!email || !password) {
    return corsJson({ error: "Email and password are required" }, { status: 400 });
  }

  const account = await db.vaultdAccount.findFirst({ where: { email } });
  if (!account || !account.passwordHash) {
    return corsJson({ error: "Invalid email or password" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) {
    return corsJson({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await signToken(account.id);
  return corsJson({ token, accountId: account.id });
}
