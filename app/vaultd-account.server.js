import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import db from "./db.server";
import { sendEmail } from "./email-provider.server";

export {
  PLAN_ORDER,
  PLAN_SUMMARIES,
  PLAN_FEATURES,
  canUseColor,
  getNewlyUnlockedFeatures,
} from "./vaultd-plans";

export async function getAccountForShop(shopDomain) {
  const shopSettings = await db.shopSettings.findUnique({
    where: { shopDomain },
    include: { account: { include: { shops: true } } },
  });
  return shopSettings?.account ?? null;
}

const PASSWORD_RULE =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;

export function validatePassword(password) {
  if (!PASSWORD_RULE.test(password || "")) {
    return "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a digit, and a special character.";
  }
  return null;
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

// Supports both bcrypt hashes (from website signup) and legacy scrypt format
// (from early Shopify app account creation). New accounts always use bcrypt.
async function verifyPassword(password, stored) {
  if (!stored) return false;
  if (stored.startsWith("$2")) {
    return bcrypt.compare(password, stored);
  }
  // Legacy scrypt format: "salt:hash"
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
    if (candidate.length !== hash.length) return false;
    return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

export async function sendWelcomeEmail(email, username) {
  if (!email) return;
  await sendEmail({
    from: "Vaultd <noreply@updates.vaultd.pro>",
    to: email,
    subject: "Welcome to Vaultd",
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0a0a;color:#f0f0f0;border-radius:12px">
<p style="font-size:24px;font-weight:800;margin:0 0 16px;letter-spacing:-0.5px">Welcome to Vaultd${username ? `, ${username}` : ""}!</p>
<p style="font-size:15px;color:#a0a0a0;margin:0 0 20px">Your account has been created. Install the Vaultd app on your Shopify store and choose a plan to get started.</p>
<p style="font-size:13px;color:#505050;margin:24px 0 0">If you didn't create this account, you can safely ignore this email.</p>
</div>`,
  });
}

async function sendAccountDeletionEmail(email, username) {
  if (!email) return;
  await sendEmail({
    from: "Vaultd <noreply@updates.vaultd.pro>",
    to: email,
    subject: "Your Vaultd account has been deleted",
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0a0a;color:#f0f0f0;border-radius:12px">
<p style="font-size:24px;font-weight:800;margin:0 0 16px;letter-spacing:-0.5px">Account deleted</p>
<p style="font-size:15px;color:#a0a0a0;margin:0 0 16px">Your Vaultd account${username ? ` (${username})` : ""} has been permanently deleted and all associated data removed.</p>
<p style="font-size:14px;color:#a0a0a0;margin:0 0 8px">If you had an active Shopify subscription, please cancel it from your Shopify admin to stop being charged — Vaultd cannot cancel Shopify subscriptions on your behalf.</p>
<p style="font-size:13px;color:#505050;margin:24px 0 0">Questions? Contact us at support@vaultd.pro.</p>
</div>`,
  });
}

// Deletes a VaultdAccount and unlinks all associated shops.
// Shopify subscriptions are NOT cancelled — the merchant must do this from their Shopify admin.
export async function deleteAccount(accountId) {
  const account = await db.vaultdAccount.findUnique({ where: { id: accountId } });
  if (!account) return { error: "Account not found." };

  await db.shopSettings.updateMany({
    where: { vaultdAccountId: accountId },
    data: { vaultdAccountId: null },
  });
  await db.passwordResetCode.deleteMany({ where: { vaultdAccountId: accountId } });
  await db.vaultdAccount.delete({ where: { id: accountId } });

  try {
    await sendAccountDeletionEmail(account.email, null);
  } catch (_) {}

  return { success: true };
}

// Creates a new VaultdAccount and links it to the given shopDomain.
// If an account with the same email already exists, the shop is linked to it instead.
export async function createAccountForShop(shopDomain, { email, password, username } = {}) {
  let passwordHash;
  if (password) {
    const passwordError = validatePassword(password);
    if (passwordError) return { error: passwordError };
    passwordHash = await hashPassword(password);
  } else {
    passwordHash = await hashPassword(crypto.randomBytes(24).toString("hex"));
  }

  if (email) {
    const existing = await db.vaultdAccount.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    if (existing) {
      await db.shopSettings.upsert({
        where: { shopDomain },
        create: { shopDomain, vaultdAccountId: existing.id },
        update: { vaultdAccountId: existing.id },
      });
      return { account: await getAccountForShop(shopDomain) };
    }
  }

  const account = await db.vaultdAccount.create({
    data: { email: email || null, passwordHash },
  });
  await db.shopSettings.upsert({
    where: { shopDomain },
    create: { shopDomain, vaultdAccountId: account.id },
    update: { vaultdAccountId: account.id },
  });

  if (email) sendWelcomeEmail(email).catch(() => {});

  return { account: await getAccountForShop(shopDomain) };
}

export async function requestPasswordReset(email) {
  const normalizedEmail = (email || "").trim().toLowerCase();
  if (!normalizedEmail) return;

  const account = await db.vaultdAccount.findFirst({
    where: { email: { equals: normalizedEmail, mode: "insensitive" } },
  });
  if (!account) return;

  const code = crypto.randomInt(100000, 1000000).toString();
  await db.passwordResetCode.create({
    data: {
      code,
      vaultdAccountId: account.id,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  await sendEmail({
    from: "Vaultd <noreply@updates.vaultd.pro>",
    to: account.email,
    subject: "Your Vaultd password reset code",
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0a0a;color:#f0f0f0;border-radius:12px">
<p style="font-size:20px;font-weight:700;margin:0 0 16px">Reset your password</p>
<p style="font-size:15px;color:#a0a0a0;margin:0 0 20px">Your password reset code:</p>
<p style="font-size:36px;font-weight:900;letter-spacing:8px;margin:0 0 20px;font-family:monospace;color:#f0f0f0">${code}</p>
<p style="font-size:14px;color:#606060;margin:0 0 8px">Expires in 15 minutes. If you didn't request this, you can ignore this email.</p>
</div>`,
  });
}

export async function resetPasswordWithCode({ email, code, newPassword }) {
  const normalizedEmail = (email || "").trim().toLowerCase();
  const trimmedCode = (code || "").trim();

  const passwordError = validatePassword(newPassword);
  if (passwordError) return { error: passwordError };

  const account = await db.vaultdAccount.findFirst({
    where: { email: { equals: normalizedEmail, mode: "insensitive" } },
  });
  if (!account) return { error: "Invalid or expired reset code." };

  const resetCode = await db.passwordResetCode.findFirst({
    where: {
      vaultdAccountId: account.id,
      code: trimmedCode,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!resetCode) return { error: "Invalid or expired reset code." };

  await db.passwordResetCode.update({
    where: { id: resetCode.id },
    data: { usedAt: new Date() },
  });
  await db.vaultdAccount.update({
    where: { id: account.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  return { success: true };
}

// Links a shop to an existing account by ID + password (Elite only).
export async function loginToAccount({ accountId, password, shopDomain }) {
  const account = await db.vaultdAccount.findUnique({ where: { id: accountId } });
  if (!account || !(await verifyPassword(password, account.passwordHash))) {
    return { error: "Invalid account ID or password." };
  }
  if (account.plan !== "ELITE") {
    return { error: "Linking a store to an existing account is only available on the Elite plan." };
  }

  const existing = await db.shopSettings.findUnique({ where: { shopDomain } });
  if (existing?.vaultdAccountId === account.id) {
    return { error: "This shop is already linked to this account." };
  }

  await db.shopSettings.upsert({
    where: { shopDomain },
    create: { shopDomain, vaultdAccountId: account.id },
    update: { vaultdAccountId: account.id },
  });
  return { account: await getAccountForShop(shopDomain) };
}
