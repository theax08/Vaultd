import { redirect } from "react-router";
import { Link, useLoaderData, Form } from "react-router";
import { getWebAccountOptional } from "../../auth.web.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  const account = await getWebAccountOptional(request);
  const initial = account
    ? ((account.username || account.email || "?")[0] ?? "?").toUpperCase()
    : null;
  return { loggedIn: Boolean(account), accountInitial: initial };
};

function Icon({ d, viewBox = "0 0 24 24" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {d}
    </svg>
  );
}

const FEATURES = [
  {
    icon: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    title: "Waitlist Engine",
    desc: "Referral-based waitlists that build hype before your drop goes live.",
  },
  {
    icon: (
      <>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </>
    ),
    title: "Drop Analytics",
    desc: "Revenue, conversion rate, sell-out time — real data after every drop.",
  },
  {
    icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    title: "Bot Protection",
    desc: "Cloudflare Turnstile keeps bots off your waitlist and checkout.",
  },
  {
    icon: (
      <>
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </>
    ),
    title: "Email Automations",
    desc: "Auto-send launch, reminder, and post-drop emails to your subscribers.",
  },
  {
    icon: (
      <>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </>
    ),
    title: "Multi-store",
    desc: "One Vaultd account linked to multiple Shopify stores.",
  },
  {
    icon: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
    title: "Live Drop View",
    desc: "Watch orders and waitlist activity stream in during a live drop.",
  },
];

const PLANS = [
  {
    name: "Growth",
    price: "$49",
    features: ["Waitlists & referrals", "Drop analytics", "3 drops/month", "Up to 200 units/drop"],
  },
  {
    name: "Pro",
    price: "$149",
    popular: true,
    features: ["Email automations", "Hype widgets", "10 drops/month", "Up to 500 units/drop"],
  },
  {
    name: "Scale",
    price: "$299",
    features: ["Auto-launch & close", "Unlimited drops", "Up to 1,500 units/drop"],
  },
  {
    name: "Elite",
    price: "$499",
    features: ["Bot protection", "Multi-store accounts", "Priority support", "Unlimited units"],
  },
];

export default function LandingPage() {
  const { loggedIn, accountInitial } = useLoaderData();

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        background: "#080808",
        color: "#f0f0f0",
        minHeight: "100vh",
        margin: 0,
      }}
    >
      {/* ─── Header ─── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 48px",
          height: 60,
          borderBottom: "1px solid #141414",
          background: "rgba(8,8,8,0.88)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <Link
          to="/"
          style={{ fontSize: 17, fontWeight: 800, color: "#f0f0f0", textDecoration: "none", letterSpacing: "-0.5px" }}
        >
          Vaultd
        </Link>

        <nav style={{ display: "flex", gap: 2, alignItems: "center" }}>
          <a href="#features" style={{ color: "#444", textDecoration: "none", fontSize: 14, padding: "7px 13px" }}>
            Features
          </a>
          <a href="#pricing" style={{ color: "#444", textDecoration: "none", fontSize: 14, padding: "7px 13px" }}>
            Pricing
          </a>
          <span style={{ width: 1, height: 14, background: "#1e1e1e", margin: "0 8px" }} />
          {loggedIn ? (
            <>
              <Link
                to="/logout"
                style={{ color: "#383838", textDecoration: "none", fontSize: 13, padding: "7px 10px" }}
              >
                Log out
              </Link>
              <Link
                to="/account"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "#151515",
                  border: "1px solid #252525",
                  color: "#b0b0b0",
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {accountInitial}
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" style={{ color: "#505050", textDecoration: "none", fontSize: 14, padding: "7px 13px" }}>
                Log in
              </Link>
              <Link
                to="/signup"
                style={{
                  background: "#f0f0f0",
                  color: "#080808",
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: 700,
                  padding: "8px 18px",
                  borderRadius: 8,
                }}
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* ─── Hero ─── */}
      <section
        style={{
          position: "relative",
          textAlign: "center",
          padding: "104px 24px 88px",
          overflow: "hidden",
        }}
      >
        {/* background glow */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 800,
            height: 420,
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.045) 0%, transparent 68%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative" }}>
          {/* eyebrow badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: "#0f0f0f",
              border: "1px solid #1c1c1c",
              borderRadius: 20,
              padding: "5px 14px",
              fontSize: 12,
              color: "#484848",
              marginBottom: 30,
              letterSpacing: "0.01em",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#22c55e",
                display: "inline-block",
              }}
            />
            Shopify drop management
          </div>

          <h1
            style={{
              fontSize: 68,
              fontWeight: 900,
              letterSpacing: "-2.5px",
              margin: "0 0 22px",
              lineHeight: 1.02,
              color: "#f0f0f0",
            }}
          >
            Drop management
            <br />
            for Shopify
          </h1>

          <p
            style={{
              fontSize: 17,
              color: "#4a4a4a",
              margin: "0 auto 50px",
              maxWidth: 460,
              lineHeight: 1.65,
            }}
          >
            Waitlists, analytics, bot protection, and email automations — everything you need for exclusive product launches.
          </p>

          <Form
            method="get"
            action="/auth/login"
            style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 20 }}
          >
            <input
              type="text"
              name="shop"
              placeholder="your-store.myshopify.com"
              style={{
                background: "#0d0d0d",
                border: "1px solid #1c1c1c",
                color: "#f0f0f0",
                borderRadius: 10,
                padding: "13px 18px",
                fontSize: 14,
                width: 280,
                outline: "none",
              }}
            />
            <button
              type="submit"
              style={{
                background: "#f0f0f0",
                color: "#080808",
                border: "none",
                borderRadius: 10,
                padding: "13px 26px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Install on Shopify
            </button>
          </Form>

          <p style={{ fontSize: 13, color: "#2e2e2e" }}>
            Already a user?{" "}
            <Link
              to={loggedIn ? "/account" : "/login"}
              style={{ color: "#484848", textDecoration: "none" }}
            >
              {loggedIn ? "Go to your account →" : "Log in →"}
            </Link>
          </p>
        </div>
      </section>

      <div
        style={{
          height: 1,
          background:
            "linear-gradient(90deg, transparent, #191919 25%, #191919 75%, transparent)",
        }}
      />

      {/* ─── Features ─── */}
      <section id="features" style={{ padding: "88px 48px", maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ marginBottom: 52 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#333",
              marginBottom: 12,
            }}
          >
            Features
          </div>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "-0.8px",
              margin: "0 0 12px",
              color: "#e0e0e0",
            }}
          >
            Everything your drops need
          </h2>
          <p style={{ fontSize: 15, color: "#484848", margin: 0, maxWidth: 480 }}>
            Built specifically for Shopify merchants running exclusive launches.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{
                background: "#0c0c0c",
                border: "1px solid #161616",
                borderRadius: 12,
                padding: "24px",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  background: "#141414",
                  border: "1px solid #1e1e1e",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#505050",
                  marginBottom: 16,
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {f.icon}
                </svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#c8c8c8", marginBottom: 8 }}>
                {f.title}
              </div>
              <div style={{ fontSize: 13, color: "#484848", lineHeight: 1.65 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <div
        style={{
          height: 1,
          background:
            "linear-gradient(90deg, transparent, #191919 25%, #191919 75%, transparent)",
        }}
      />

      {/* ─── Pricing ─── */}
      <section id="pricing" style={{ padding: "88px 48px" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#333",
              marginBottom: 12,
            }}
          >
            Pricing
          </div>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "-0.8px",
              margin: "0 0 12px",
              color: "#e0e0e0",
            }}
          >
            Simple pricing
          </h2>
          <p style={{ fontSize: 15, color: "#484848", margin: 0 }}>
            Paid plans from $49/month. No free tier.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
            maxWidth: 900,
            margin: "0 auto",
          }}
        >
          {PLANS.map((p) => (
            <div
              key={p.name}
              style={{
                background: p.popular ? "#111" : "#0c0c0c",
                border: p.popular ? "1px solid #252525" : "1px solid #161616",
                borderRadius: 14,
                padding: "28px 24px",
                minWidth: 196,
                flex: 1,
                position: "relative",
              }}
            >
              {p.popular && (
                <div
                  style={{
                    position: "absolute",
                    top: -1,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "#f0f0f0",
                    color: "#080808",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    padding: "3px 12px",
                    borderRadius: "0 0 8px 8px",
                    whiteSpace: "nowrap",
                  }}
                >
                  Most popular
                </div>
              )}

              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#404040",
                  marginBottom: 14,
                }}
              >
                {p.name}
              </div>

              <div
                style={{
                  fontSize: 36,
                  fontWeight: 900,
                  letterSpacing: "-1.5px",
                  color: "#d8d8d8",
                  lineHeight: 1,
                  marginBottom: 4,
                }}
              >
                {p.price}
              </div>
              <div style={{ fontSize: 12, color: "#333", marginBottom: 22 }}>/month</div>

              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 9,
                }}
              >
                {p.features.map((feat) => (
                  <li
                    key={feat}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 9,
                      fontSize: 12.5,
                      color: "#484848",
                      lineHeight: 1.45,
                    }}
                  >
                    <span style={{ color: "#2a2a2a", flexShrink: 0, marginTop: 1 }}>—</span>
                    {feat}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer
        style={{
          padding: "28px 48px",
          borderTop: "1px solid #111",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "#282828",
          fontSize: 13,
        }}
      >
        <span>© 2026 Vaultd</span>
        <div style={{ display: "flex", gap: 24 }}>
          <Link to="/privacy-policy" style={{ color: "#282828", textDecoration: "none" }}>
            Privacy
          </Link>
          <Link
            to={loggedIn ? "/account" : "/signup"}
            style={{ color: "#282828", textDecoration: "none" }}
          >
            {loggedIn ? "My account" : "Create account"}
          </Link>
        </div>
      </footer>
    </div>
  );
}
