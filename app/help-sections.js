// Contenu detaille de la page Help, partage entre la liste (app.help.jsx) et
// la page de detail (app.help_.$key.jsx). Hors server-only, donc importable
// directement dans le JSX des deux routes.

export const SECTIONS = [
  {
    key: "waitlist",
    title: "Waitlists",
    minPlan: "GROWTH",
    intro: "Let customers join a waitlist for a drop and track their position in real time.",
    tips: [
      "Every signup gets an instant confirmation email — customize it from the Emails page, in the Waitlist Email Rank tab. It's included on every plan.",
      "Share your drop's waitlist link on social media before the drop goes live to build a queue.",
      "Customers can see their live position and how many people are ahead of them.",
      "Use the Waitlists page to export or review who joined, and when.",
    ],
  },
  {
    key: "waitlist_limit",
    title: "Waitlist size limit",
    minPlan: "GROWTH",
    intro: "Cap the number of people who can join a drop's waitlist.",
    tips: [
      "Set a cap when scarcity itself is part of the hype — a visibly limited waitlist creates urgency.",
      "Leave it uncapped for drops where you want maximum reach instead of artificial scarcity.",
      "The cap is set per drop in the drop editor, not globally — every drop can use a different limit.",
    ],
  },
  {
    key: "drop_history",
    title: "Drop history & analytics",
    minPlan: "GROWTH",
    intro: "Revenue, conversion rate, sell-out time and product rankings for every past drop.",
    tips: [
      "Compare conversion rate across drops to see which products or pricing convert best.",
      "Sell-out time tells you if you should increase stock or run shorter drop windows.",
      "Use the per-product breakdown to plan inventory for your next drop.",
      "Traffic source data (Instagram, TikTok, Vaultd Emails, etc.) is recorded by the Vaultd waitlist widget on your storefront page. Each time a visitor loads the page, the widget reads the ?vaultd_src= parameter from the URL and logs the source. If the widget isn't embedded on the page, or the visitor arrives without that parameter (typed the URL directly, followed an untracked link), the visit is counted as 'other' or not recorded at all. Vaultd email links are tagged automatically when sent. For social sources, add ?vaultd_src=instagram or ?vaultd_src=tiktok to any link you share — e.g. your Instagram story swipe-up URL or TikTok bio link.",
    ],
  },
  {
    key: "hype_widgets",
    title: "Hype building widgets",
    minPlan: "PRO",
    intro: "Countdown and social proof widgets for your storefront theme.",
    tips: [
      "Add the countdown widget to your product page a few days before launch to build anticipation.",
      "The social proof widget shows live waitlist activity — it works best once you already have signups.",
      "Both widgets are added through your theme editor as app blocks, no code required.",
      "Widgets only appear on your storefront when a drop exists with status LIVE or DRAFT with a scheduled launch date. If a widget isn't showing, check that a drop is active in Vaultd.",
      "For a clean layout, stack them in this order: Countdown → Social proof → Waitlist form. Each widget has a background color setting in the theme editor so you can match your store's style.",
      "The Social proof widget's \"Progress bar\" design only appears if the drop has a waitlist size limit enabled. Without a capacity set on the drop, the progress bar has no data to display and will stay hidden — use the Simple text or Avatar stack design instead.",
    ],
  },
  {
    key: "referral",
    title: "Referral program",
    minPlan: "PRO",
    intro: "Let customers move up the waitlist by sharing their referral link.",
    tips: [
      "Toggle it on per drop in the drop editor, and set how many positions a successful referral is worth (1 to 3).",
      "Each waitlist entry gets its own referral link — sharing it moves the referrer up the queue when someone signs up through it.",
      "Referral links are a merchant-side feature: customers have no way to know a referral program is active just from the widget. Announce it explicitly in your drop marketing — email, caption, or story — so customers know to share their link.",
      "On Growth, the referral toggle in the drop editor is disabled — upgrade to Pro to turn it on.",
    ],
  },
  {
    key: "automated_emails",
    title: "Automated customer emails",
    minPlan: "PRO",
    intro: "Rank update, drop-is-live and drop-ended emails sent automatically — on top of the instant waitlist confirmation email included on every plan.",
    tips: [
      "The instant waitlist confirmation email is included starting at Growth. Pro unlocks the rest: rank-update, drop-is-live, and drop-ended.",
      "Link each automation to a specific drop from the Emails page — it only fires for that drop.",
      "Customize the brand color and logo so emails match your store, not a generic template.",
      "Rank update emails are a strong re-engagement tool: they remind people they're close to getting in.",
      "Tip — for the \"Drop ended\" email's destination URL, you don't need a finished drop yet: you can create the next drop in advance, leave the link pointing to a dedicated page with the waitlist widget on it, and edit the drop's details later. If you'd rather not set up a separate page, simply pointing to your store's homepage works too.",
    ],
  },
  {
    key: "automatic_launch",
    title: "Automatic launch & close",
    minPlan: "SCALE",
    intro: "Schedule a drop to go live automatically and close it once all units are sold.",
    tips: [
      "In the drop editor, set a start time then toggle Auto-launch & auto-close on.",
      "Auto-launch only checks while Vaultd is open in your Shopify admin — it runs on page load, not in the background. If nobody has the app open at the scheduled time, the drop won't go live until someone opens Vaultd again.",
      "Auto-close fires once all units are sold. There's a 5-minute grace period after the last sale before the drop is officially ended — this covers edge cases like a last-minute cancellation that frees up a unit.",
      "Important: Vaultd closing a drop does not modify your Shopify inventory. Your store can still accept new orders after Vaultd marks a drop as sold out. If you need to prevent additional sales, set the relevant product variants to \"out of stock\" in your Shopify admin manually, or use Shopify's inventory policy to cap available quantity.",
      "Combine with the countdown widget so customers see the exact same launch time you scheduled.",
    ],
  },
  {
    key: "unlimited_drops",
    title: "Unlimited drops",
    minPlan: "SCALE",
    intro: "No monthly cap on the number of drops you can run.",
    tips: [
      "Lower plans cap how many drops you can run per month — Scale and Elite remove that cap entirely.",
      "Useful if you run frequent, smaller drops rather than a few big ones.",
    ],
  },
  {
    key: "bot_protection",
    title: "Bot protection",
    minPlan: "ELITE",
    intro: "Cloudflare Turnstile challenge on top of the always-on honeypot and rate-limiting.",
    tips: [
      "Three layers work together: a honeypot field (invisible to humans, catches simple bots that fill in every field), rate-limiting (blocks an IP that submits the waitlist form too many times too fast), and Turnstile (a visible challenge for harder cases). The first two are always on, on every plan — Turnstile is the Elite-only layer on top.",
      "What it protects you from: scripts/bots that flood a popular drop's waitlist with fake signups to grab spots, skew your analytics, or scrape email addresses for spam — without making real customers solve annoying puzzles.",
      "Step 1 — Create a free Cloudflare account at cloudflare.com if you don't have one yet.",
      "Step 2 — In the Cloudflare dashboard, go to Turnstile and add a new site. Use your storefront domain (e.g. your-store.myshopify.com or your custom domain).",
      "Step 3 — Cloudflare gives you two keys: a Site Key (public) and a Secret Key (private). Copy both.",
      "Step 4 — Go to the Bot protection page in Vaultd, paste the Site Key and Secret Key into the matching fields, and toggle bot protection on.",
      "Step 5 — Save. The waitlist signup widget on your storefront will now show a small \"Verifying you are human\" check before the form submits — most real visitors won't even notice it, it usually resolves invisibly in the background.",
      "If you ever rotate your Cloudflare keys, just paste the new ones in the same fields — no need to disable/re-enable first.",
    ],
  },
  {
    key: "multi_store",
    title: "Multi-store accounts",
    minPlan: "ELITE",
    intro: "Link multiple Shopify stores to the same Elite Vaultd account.",
    tips: [
      "On the store you want to link, go to Settings → Account and use \"Join a different account\" with the Elite account's ID and password (visible on Settings on the account's home store).",
      "The store being linked pays a $50/month add-on on its own Shopify billing — not the full Elite price again. You'll be redirected to approve that charge before the link completes.",
      "Linked stores keep their own drops and waitlists — only the Vaultd account (plan, identity) is shared across all linked stores.",
      "If a linked store's $50/month add-on lapses (payment fails, subscription cancelled), that store is automatically unlinked — the other stores on the account are not affected.",
    ],
  },
  {
    key: "priority_support",
    title: "Priority support",
    minPlan: "ELITE",
    intro: "Faster response times when you contact support.",
    tips: [
      "Use the Contact support link from the Dashboard — Elite requests are flagged for priority handling.",
    ],
  },
  {
    key: "account_management",
    title: "Account & subscription management",
    minPlan: "GROWTH",
    intro: "How to manage your Vaultd account, cancel your subscription, or delete your account.",
    tips: [
      "Your Vaultd account is created automatically when you subscribe to a plan via the Shopify App Store. If you signed up at vaultd.pro before installing the app and used the same email, the accounts are linked automatically.",
      "To cancel your subscription or delete your account, go to Settings → Account and click \"Cancel subscription / Delete account\" — this opens the account portal on vaultd.pro where you can manage everything.",
      "Deleting your Vaultd account removes all your data (drops, waitlists, analytics). It does NOT cancel your Shopify subscription automatically — you must also cancel it from your Shopify admin (Apps → Manage apps → Vaultd → Cancel plan) to stop being charged.",
      "To reset your password, visit vaultd.pro/forgot-password. A reset code is emailed to the address on your account.",
      "A confirmation email is sent to your account email address for account creation and account deletion.",
    ],
  },
];

export function getSection(key) {
  return SECTIONS.find((s) => s.key === key) ?? null;
}
