import { redirect } from "react-router";
import { Form, Link, useActionData, useSearchParams } from "react-router";
import bcrypt from "bcryptjs";
import { getWebSession, commitWebSession, getWebAccountOptional } from "../auth.web.server";

export const loader = async ({ request }) => {
  const account = await getWebAccountOptional(request);
  if (account) return redirect("/account");
  return null;
};

export const action = async ({ request }) => {
  const form = await request.formData();
  const email = form.get("email")?.toString().toLowerCase().trim() ?? "";
  const password = form.get("password")?.toString() ?? "";

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const { default: db } = await import("../db.server");
  const account = await db.vaultdAccount.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  if (!account || !account.passwordHash) {
    return { error: "Invalid email or password." };
  }

  let valid = false;
  try {
    if (account.passwordHash.startsWith("$2")) {
      valid = await bcrypt.compare(password, account.passwordHash);
    } else {
      // Legacy scrypt format
      const crypto = await import("node:crypto");
      const [salt, hash] = account.passwordHash.split(":");
      if (salt && hash) {
        const candidate = crypto.default.scryptSync(password, salt, 64).toString("hex");
        valid = crypto.default.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
      }
    }
  } catch {
    return { error: "Invalid email or password." };
  }

  if (!valid) {
    return { error: "Invalid email or password." };
  }

  const session = await getWebSession(request);
  session.set("accountId", account.id);

  return redirect("/account", {
    headers: { "Set-Cookie": await commitWebSession(session) },
  });
};

export default function LoginPage() {
  const actionData = useActionData();
  const [searchParams] = useSearchParams();
  const resetSuccess = searchParams.get("reset") === "1";

  return (
    <div style={rootStyle}>
      <header style={headerStyle}>
        <Link to="/" style={logoStyle}>Vaultd</Link>
        <Link to="/signup" style={headerBtnStyle}>Create account</Link>
      </header>

      <div style={boxStyle}>
        <h1 style={titleStyle}>Log in</h1>
        <p style={subtitleStyle}>
          No account?{" "}
          <Link to="/signup" style={linkStyle}>Sign up</Link>
        </p>

        {resetSuccess && (
          <div style={successStyle}>Password reset successfully. You can log in now.</div>
        )}

        {actionData?.error && (
          <div style={errorStyle}>{actionData.error}</div>
        )}

        <Form method="post" style={formStyle}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            style={inputStyle}
          />
          <label style={{ ...labelStyle, marginTop: 12 }}>Password</label>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            style={inputStyle}
          />
          <button type="submit" style={btnStyle}>Log in</button>
        </Form>

        <div style={{ marginTop: 14, textAlign: "center" }}>
          <Link to="/forgot-password" style={forgotStyle}>Forgot password?</Link>
        </div>
      </div>
    </div>
  );
}

const rootStyle = {
  fontFamily: "system-ui, -apple-system, sans-serif",
  background: "#0a0a0a",
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
};
const headerStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 32px",
};
const logoStyle = {
  fontSize: 18,
  fontWeight: 800,
  color: "#f0f0f0",
  textDecoration: "none",
  letterSpacing: "-0.5px",
};
const headerBtnStyle = {
  background: "#f0f0f0",
  color: "#0a0a0a",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 700,
  padding: "8px 16px",
  borderRadius: 8,
};
const boxStyle = { width: "100%", maxWidth: 360 };
const titleStyle = { color: "#f0f0f0", fontSize: 26, fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.5px" };
const subtitleStyle = { color: "#606060", fontSize: 14, margin: "0 0 28px" };
const linkStyle = { color: "#c0c0c0", textDecoration: "none", fontWeight: 600 };
const successStyle = {
  background: "#0a1f0a",
  border: "1px solid #1a4a1a",
  color: "#4ade80",
  borderRadius: 8,
  padding: "11px 14px",
  marginBottom: 18,
  fontSize: 13.5,
};
const errorStyle = {
  background: "#1a0808",
  border: "1px solid #3a1515",
  color: "#f87171",
  borderRadius: 8,
  padding: "11px 14px",
  marginBottom: 18,
  fontSize: 13.5,
};
const formStyle = { display: "flex", flexDirection: "column" };
const labelStyle = { color: "#707070", fontSize: 12.5, fontWeight: 500, marginBottom: 6 };
const inputStyle = {
  background: "#141414",
  border: "1px solid #242424",
  borderRadius: 8,
  padding: "11px 14px",
  color: "#f0f0f0",
  fontSize: 14,
  outline: "none",
  marginBottom: 4,
};
const btnStyle = {
  background: "#f0f0f0",
  color: "#0a0a0a",
  border: "none",
  borderRadius: 8,
  padding: "12px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  marginTop: 18,
};
const forgotStyle = {
  fontSize: 13,
  color: "#505050",
  textDecoration: "none",
};
