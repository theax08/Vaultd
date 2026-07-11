import { redirect } from "react-router";
import { Link, useLoaderData, Form } from "react-router";
import { getWebAccountOptional } from "../../auth.web.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  const account = await getWebAccountOptional(request);
  return { loggedIn: Boolean(account) };
};

const s = {
  root: {
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    background: "#0a0a0a",
    color: "#f0f0f0",
    minHeight: "100vh",
    margin: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 48px",
    borderBottom: "1px solid #1c1c1c",
  },
  logo: {
    fontSize: 19,
    fontWeight: 800,
    letterSpacing: "-0.5px",
    color: "#f0f0f0",
    textDecoration: "none",
  },
  nav: { display: "flex", gap: 10, alignItems: "center" },
  navLink: { color: "#a0a0a0", textDecoration: "none", fontSize: 14, padding: "7px 14px" },
  navCta: {
    background: "#f0f0f0",
    color: "#0a0a0a",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 700,
    padding: "8px 18px",
    borderRadius: 8,
  },
  hero: { textAlign: "center", padding: "90px 24px 70px" },
  h1: { fontSize: 60, fontWeight: 900, letterSpacing: "-2px", margin: "0 0 18px", lineHeight: 1.05, color: "#f5f5f5" },
  sub: { fontSize: 18, color: "#707070", margin: "0 auto 44px", maxWidth: 480, lineHeight: 1.6 },
  installForm: { display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 },
  shopInput: {
    background: "#141414",
    border: "1px solid #2a2a2a",
    color: "#f0f0f0",
    borderRadius: 9,
    padding: "13px 16px",
    fontSize: 14,
    width: 270,
    outline: "none",
  },
  primaryBtn: {
    background: "#f0f0f0",
    color: "#0a0a0a",
    border: "none",
    borderRadius: 9,
    padding: "13px 24px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  signupNote: { fontSize: 13.5, color: "#555", marginTop: 8 },
  section: { padding: "60px 48px", maxWidth: 1040, margin: "0 auto" },
  sectionTitle: { fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 8 },
  sectionSub: { color: "#606060", fontSize: 15, marginBottom: 36 },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 },
  card: { background: "#111", border: "1px solid #1c1c1c", borderRadius: 12, padding: "22px 20px" },
  cardTitle: { fontSize: 14, fontWeight: 700, marginBottom: 7, color: "#e0e0e0" },
  cardDesc: { fontSize: 13, color: "#666", lineHeight: 1.65 },
  pricingRow: { display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" },
  pricingCard: { background: "#111", border: "1px solid #1c1c1c", borderRadius: 12, padding: "22px 32px", textAlign: "center", minWidth: 130 },
  pricingName: { fontSize: 12, color: "#606060", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" },
  pricingPrice: { fontSize: 26, fontWeight: 900, letterSpacing: "-0.5px" },
  pricingUnit: { fontSize: 11, color: "#444", marginTop: 2 },
  footer: {
    padding: "36px 48px",
    borderTop: "1px solid #1c1c1c",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "#444",
    fontSize: 13,
  },
};

const FEATURES = [
  { title: "Waitlist Engine", desc: "Referral-based waitlists that build hype before your drop goes live." },
  { title: "Drop Analytics", desc: "Revenue, conversion rate, sell-out time — real data after every drop." },
  { title: "Bot Protection", desc: "Cloudflare Turnstile keeps bots off your waitlist and checkout." },
  { title: "Email Automations", desc: "Auto-send launch, reminder, and post-drop emails to your subscribers." },
  { title: "Multi-store", desc: "One Vaultd account linked to multiple Shopify stores." },
  { title: "Live Drop View", desc: "Watch orders and waitlist activity stream in during a live drop." },
];

const PRICING = [
  { name: "Growth", price: "$49" },
  { name: "Pro", price: "$149" },
  { name: "Scale", price: "$299" },
  { name: "Elite", price: "$499" },
];

export default function LandingPage() {
  const { loggedIn } = useLoaderData();

  return (
    <div style={s.root}>
      <header style={s.header}>
        <Link to="/" style={s.logo}>Vaultd</Link>
        <nav style={s.nav}>
          {loggedIn ? (
            <>
              <Link to="/logout" style={{ ...s.navLink, color: "#555" }}>Log out</Link>
              <Link to="/account" style={s.navCta}>My account</Link>
            </>
          ) : (
            <>
              <Link to="/login" style={s.navLink}>Log in</Link>
              <Link to="/signup" style={s.navCta}>Sign up</Link>
            </>
          )}
        </nav>
      </header>

      <section style={s.hero}>
        <h1 style={s.h1}>
          Drop management<br />for Shopify
        </h1>
        <p style={s.sub}>
          Waitlists, analytics, bot protection, and email automations — everything you need for exclusive product launches.
        </p>
        <Form method="get" action="/auth/login" style={s.installForm}>
          <input
            type="text"
            name="shop"
            placeholder="your-store.myshopify.com"
            style={s.shopInput}
          />
          <button type="submit" style={s.primaryBtn}>Install on Shopify</button>
        </Form>
        <p style={s.signupNote}>
          Already a user?{" "}
          <Link to={loggedIn ? "/account" : "/login"} style={{ color: "#a0a0a0", textDecoration: "none" }}>
            {loggedIn ? "Go to your account →" : "Log in →"}
          </Link>
        </p>
      </section>

      <div style={{ borderTop: "1px solid #1c1c1c" }} />

      <div style={s.section}>
        <h2 style={s.sectionTitle}>Everything your drops need</h2>
        <p style={s.sectionSub}>Built specifically for Shopify merchants running exclusive launches.</p>
        <div style={s.grid3}>
          {FEATURES.map((f) => (
            <div key={f.title} style={s.card}>
              <div style={s.cardTitle}>{f.title}</div>
              <div style={s.cardDesc}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: "1px solid #1c1c1c" }} />

      <div style={{ ...s.section, textAlign: "center", maxWidth: "100%", padding: "60px 24px" }}>
        <h2 style={{ ...s.sectionTitle, marginBottom: 6 }}>Simple pricing</h2>
        <p style={{ ...s.sectionSub, marginBottom: 36 }}>Start free on dev stores. Paid plans from $49/month.</p>
        <div style={s.pricingRow}>
          {PRICING.map((p) => (
            <div key={p.name} style={s.pricingCard}>
              <div style={s.pricingName}>{p.name}</div>
              <div style={s.pricingPrice}>{p.price}</div>
              <div style={s.pricingUnit}>/month</div>
            </div>
          ))}
        </div>
      </div>

      <footer style={s.footer}>
        <span>© 2026 Vaultd</span>
        <div style={{ display: "flex", gap: 20 }}>
          <Link to="/privacy-policy" style={{ color: "#444", textDecoration: "none" }}>Privacy</Link>
          <Link to={loggedIn ? "/account" : "/signup"} style={{ color: "#444", textDecoration: "none" }}>
            {loggedIn ? "My account" : "Create account"}
          </Link>
        </div>
      </footer>
    </div>
  );
}
