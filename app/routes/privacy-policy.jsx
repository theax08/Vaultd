import { PrivacyPolicyContent, PRIVACY_POLICY_LAST_UPDATED } from "../privacy-policy-content";

// Public route — no Shopify auth required.
// Shopify App Store requires a reachable privacy policy URL.
export default function PrivacyPolicy() {
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 720, margin: "0 auto", padding: "48px 24px", color: "#1a1a1a" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Vaultd: Privacy Policy</h1>
      <p style={{ color: "#6d7175", fontSize: 13, marginTop: 0, marginBottom: 40 }}>
        Last updated: {PRIVACY_POLICY_LAST_UPDATED}
      </p>

      <PrivacyPolicyContent />

      <hr style={{ border: "none", borderTop: "1px solid #e3e3e3", margin: "40px 0 24px 0" }} />
      <p style={{ fontSize: 12, color: "#919191" }}>
        Vaultd · <a href="mailto:support@vaultd.pro" style={{ color: "#919191" }}>support@vaultd.pro</a>
      </p>
    </div>
  );
}
