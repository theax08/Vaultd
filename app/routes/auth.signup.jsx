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

  if (password.length < 8) {
    return corsJson({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const existing = await db.vaultdAccount.findFirst({ where: { email } });
  if (existing) {
    return corsJson({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const account = await db.vaultdAccount.create({
    data: { email, passwordHash },
  });

  const token = await signToken(account.id);
  return corsJson({ token, accountId: account.id });
}
