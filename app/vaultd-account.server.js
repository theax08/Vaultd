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

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
}

// `email`/`password` sont optionnels : certaines actions (ex. changer de
// plan depuis /app/plans) creent un compte implicitement, sans passer par le
// formulaire d'inscription de Settings. Dans ce cas on genere un mot de passe
// aleatoire (le marchand pourra le redefinir plus tard depuis Settings) au
// lieu de planter ou d'exiger un mot de passe qui n'a pas encore de sens ici.
export async function createAccountForShop(shopDomain, { email, password } = {}) {
  let passwordHash;
  if (password) {
    const passwordError = validatePassword(password);
    if (passwordError) return { error: passwordError };
    passwordHash = hashPassword(password);
  } else {
    passwordHash = hashPassword(crypto.randomBytes(24).toString("hex"));
  }

  const account = await db.vaultdAccount.create({
    data: { email: email || null, passwordHash },
  });
  await db.shopSettings.upsert({
    where: { shopDomain },
    create: { shopDomain, vaultdAccountId: account.id },
    update: { vaultdAccountId: account.id },
  });
  return { account: await getAccountForShop(shopDomain) };
}

// Demande de reinitialisation : on ne revele jamais si l'email correspond a
// un compte (message generique cote route), pour eviter de laisser deviner
// quels emails sont enregistres.
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
    html: `<p>Your password reset code is:</p><p style="font-size:24px;font-weight:700;letter-spacing:3px">${code}</p><p>This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p>`,
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
    data: { passwordHash: hashPassword(newPassword) },
  });

  return { success: true };
}

// Connexion a un compte Vaultd existant depuis une autre boutique (id de
// compte + mot de passe), pour lier la boutique courante. Reserve aux
// comptes Elite (le multi-boutique est un avantage Elite), verifie ici plutot
// que dans la route pour eviter de dupliquer la regle.
export async function loginToAccount({ accountId, password, shopDomain }) {
  const account = await db.vaultdAccount.findUnique({ where: { id: accountId } });
  if (!account || !verifyPassword(password, account.passwordHash)) {
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
