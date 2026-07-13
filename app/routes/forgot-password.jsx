import { redirect } from "react-router";
import { Form, Link, useActionData, useSearchParams } from "react-router";
import { requestPasswordReset, resetPasswordWithCode } from "../vaultd-account.server";

export const action = async ({ request }) => {
  const form = await request.formData();
  const step = form.get("step")?.toString() ?? "email";

  if (step === "email") {
    const email = form.get("email")?.toString().toLowerCase().trim() ?? "";
    if (!email) return { step, error: "Email is required." };
    // Always show "if found" message — never reveal whether email exists
    await requestPasswordReset(email).catch(() => {});
    return redirect(`/forgot-password?step=code&email=${encodeURIComponent(email)}`);
  }

  if (step === "code") {
    const email = form.get("email")?.toString().toLowerCase().trim() ?? "";
    const code = form.get("code")?.toString().trim() ?? "";
    const newPassword = form.get("newPassword")?.toString() ?? "";
    const result = await resetPasswordWithCode({ email, code, newPassword });
    if (result.error) return { step, error: result.error };
    return redirect("/login?reset=1");
  }

  return { error: "Unknown step." };
};

export default function ForgotPasswordPage() {
  const actionData = useActionData();
  const [searchParams] = useSearchParams();
  const step = searchParams.get("step") ?? "email";
  const emailParam = searchParams.get("email") ?? "";

  return (
    <div style={rootStyle}>
      <header style={headerStyle}>
        <Link to="/" style={logoStyle}>Vaultd</Link>
      </header>

      <div style={boxStyle}>
        {step === "email" ? (
          <>
            <h1 style={titleStyle}>Reset password</h1>
            <p style={subtitleStyle}>
              Enter your account email — we&apos;ll send you a reset code.
            </p>

            {actionData?.error && <div style={errorStyle}>{actionData.error}</div>}

            <Form method="post" style={formStyle}>
              <input type="hidden" name="step" value="email" />
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                style={inputStyle}
              />
              <button type="submit" style={btnStyle}>Send reset code</button>
            </Form>
          </>
        ) : (
          <>
            <h1 style={titleStyle}>Enter reset code</h1>
            <p style={subtitleStyle}>
              If <strong style={{ color: "#c0c0c0" }}>{emailParam}</strong> is linked to a Vaultd account, a 6-digit code was just sent to it.
            </p>

            {actionData?.error && <div style={errorStyle}>{actionData.error}</div>}

            <Form method="post" style={formStyle}>
              <input type="hidden" name="step" value="code" />
              <input type="hidden" name="email" value={emailParam} />

              <label style={labelStyle}>Reset code</label>
              <input
                type="text"
                name="code"
                required
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                style={inputStyle}
              />

              <label style={{ ...labelStyle, marginTop: 12 }}>New password</label>
              <input
                type="password"
                name="newPassword"
                required
                autoComplete="new-password"
                style={inputStyle}
              />
              <p style={hintStyle}>Min. 8 characters, with uppercase, lowercase, digit and special character.</p>

              <button type="submit" style={btnStyle}>Reset password</button>
            </Form>
          </>
        )}

        <div style={{ marginTop: 14, textAlign: "center" }}>
          <Link to="/login" style={backStyle}>← Back to log in</Link>
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
  padding: "0 32px",
  height: 60,
  borderBottom: "1px solid #141414",
  background: "rgba(8,8,8,0.88)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  zIndex: 100,
};
const logoStyle = { fontSize: 18, fontWeight: 800, color: "#f0f0f0", textDecoration: "none", letterSpacing: "-0.5px" };
const boxStyle = { width: "100%", maxWidth: 360 };
const titleStyle = { color: "#f0f0f0", fontSize: 26, fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.5px" };
const subtitleStyle = { color: "#606060", fontSize: 14, margin: "0 0 28px" };
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
const backStyle = { fontSize: 13, color: "#505050", textDecoration: "none" };
