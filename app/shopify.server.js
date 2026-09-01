import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  BillingReplacementBehavior,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PLAN_LABELS, STORE_ADDON_LABEL, STORE_ADDON_PRICE_USD } from "./vaultd-plans.js";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

function normalizeAppUrl(value) {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value.replace(/\/$/, "");
  }
  return `https://${value}`.replace(/\/$/, "");
}

const appUrl = normalizeAppUrl(
  process.env.SHOPIFY_APP_URL ||
    process.env.APP_URL ||
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.RAILWAY_STATIC_URL ||
    "",
);

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  billing: {
    [PLAN_LABELS.GROWTH]: {
      replacementBehavior: BillingReplacementBehavior.ApplyImmediately,
      lineItems: [
        {
          amount: 49,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    [PLAN_LABELS.PRO]: {
      replacementBehavior: BillingReplacementBehavior.ApplyImmediately,
      lineItems: [
        {
          amount: 149,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    [PLAN_LABELS.SCALE]: {
      replacementBehavior: BillingReplacementBehavior.ApplyImmediately,
      lineItems: [
        {
          amount: 299,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    [PLAN_LABELS.ELITE]: {
      replacementBehavior: BillingReplacementBehavior.ApplyImmediately,
      lineItems: [
        {
          amount: 499,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    // Facture sur SA PROPRE session Shopify une boutique qui rejoint le
    // compte Elite d'une autre boutique — pas le plein tarif Elite.
    [STORE_ADDON_LABEL]: {
      replacementBehavior: BillingReplacementBehavior.ApplyImmediately,
      lineItems: [
        {
          amount: STORE_ADDON_PRICE_USD,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
  hooks: {
    // Reconcile the stored plan with Shopify's actual subscription state
    // right after every OAuth completion (install AND reinstall) — a
    // safety net for App Store requirement 1.2.2 ("request approval for
    // charges again on reinstall"). The app otherwise trusts
    // account.plan to stay in sync purely via the app_subscriptions/update
    // webhook; if that webhook were ever missed (delivery isn't
    // guaranteed) for the subscription Shopify auto-cancels on uninstall,
    // a reinstalling merchant would keep full paid access with no fresh
    // charge. This runs a live check instead of trusting stored state.
    afterAuth: async ({ session, admin }) => {
      try {
        const { getAccountForShop } = await import("./vaultd-account.server");
        const db = (await import("./db.server")).default;
        const account = await getAccountForShop(session.shop);
        if (!account) return;
        // Secondary (linked) shops don't carry their own plan-tier
        // subscription — their own OAuth completion says nothing about
        // the shared account's plan.
        if (account.primaryShopDomain && account.primaryShopDomain !== session.shop) return;

        const res = await admin.graphql(
          `{ currentAppInstallation { activeSubscriptions { name status } } }`
        );
        const { data } = await res.json();
        const subs = data?.currentAppInstallation?.activeSubscriptions ?? [];
        const activePlanKey =
          Object.entries(PLAN_LABELS).find(([, label]) =>
            subs.some((s) => s.name === label && s.status === "ACTIVE")
          )?.[0] ?? "FREE";

        if (account.plan !== activePlanKey) {
          await db.vaultdAccount.update({
            where: { id: account.id },
            data: { plan: activePlanKey },
          });
        }
      } catch (err) {
        console.error("[afterAuth] plan reconciliation failed for", session.shop, err?.message ?? err);
      }
    },
  },
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
