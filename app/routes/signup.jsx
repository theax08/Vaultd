import { redirect } from "react-router";
import { Form, Link, useActionData } from "react-router";
import bcrypt from "bcryptjs";
import { getWebSession, commitWebSession, getWebAccountOptional } from "../auth.web.server";
import { sendWelcomeEmail, validatePassword } from "../vaultd-account.server";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export const loader = async ({ request }) => {
  const account = await getWebAccountOptional(request);
  if (account) return redirect("/account");
  return null;
};

export const action = async ({ request }) => {
  const form = await request.formData();
  const email = form.get("email")?.toString().toLowerCase().trim() ?? "";
  const username = form.get("username")?.toString().toLowerCase().trim() ?? "";
  const password = form.get("password")?.toString() ?? "";
  const confirm = form.get("confirm")?.toString() ?? "";

  if (!email || !password || !username) {
    return { error: "All fields are required." };
  }
  if (!USERNAME_RE.test(username)) {
    return { error: "Username must be 3–20 characters: lowercase letters, numbers, or underscore only." };
  }
  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const { default: db } = await import("../db.server");

  const existingEmail = await db.vaultdAccount.findFirst({ where: { email } });
  if (existingEmail) {
    return { error: "An account with this email already exists." };
  }
  const existingUsername = await db.vaultdAccount.findFirst({ where: { username } });
  if (existingUsername) {
    return { error: "This username is already taken." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const account = await db.vaultdAccount.create({
    data: { email, passwordHash, username },
  });

  try {
    await sendWelcomeEmail(email, username);
  } catch (_) {}

  const session = await getWebSession(request);
  session.set("accountId", account.id);

  return redirect("/account", {
    headers: { "Set-Cookie": await commitWebSession(session) },
  });
};

export default function SignupPage() {
  const actionData = useActionData();

  return (
    <div style={rootStyle}>
      <header style={headerStyle}>
        <Link to="/" style={logoStyle}>Vaultd</Link>
        <Link to="/login" style={headerBtnStyle}>Log in</Link>
      </header>

      <div style={boxStyle}>
        <h1 style={titleStyle}>Create account</h1>
        <p style={subtitleStyle}>
          Already have one?{" "}
          <Link to="/login" style={linkStyle}>Log in</Link>
        </p>

        {actionData?.error && (
          <div style={errorStyle}>{actionData.error}</div>
        )}

        <Form method="post" style={formStyle}>
          <label style={labelStyle}>Username</label>
          <input
            type="text"
            name="username"
            required
            autoComplete="username"
            placeholder="e.g. mybrand"
            style={inputStyle}
          />
          <p style={hintStyle}>3–20 characters, lowercase letters, numbers, or underscore.</p>

          <label style={{ ...labelStyle, marginTop: 12 }}>Email</label>
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
            autoComplete="new-password"
            style={inputStyle}
          />
          <p style={hintStyle}>Min. 8 characters, with uppercase, lowercase, digit and special character.</p>

          <label style={{ ...labelStyle, marginTop: 12 }}>Confirm password</label>
          <input
            type="password"
            name="confirm"
            required
            autoComplete="new-password"
            style={inputStyle}
          />
          <button type="submit" style={btnStyle}>Create account</button>
        </Form>
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
const hintStyle = { color: "#404040", fontSize: 11.5, margin: "4px 0 0" };
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
