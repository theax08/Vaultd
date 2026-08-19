// Contenu partage entre app/routes/privacy-policy.jsx (page publique
// complete) et le modal de app/routes/app.help.jsx — une seule source de
// verite pour ne plus jamais avoir deux textes qui divergent silencieusement.
export const PRIVACY_POLICY_LAST_UPDATED = "July 2, 2026";

const pStyle = { fontSize: 13.5, color: "#303030", lineHeight: 1.65, margin: "0 0 14px 0" };
const h2Style = { fontSize: 16, fontWeight: 700, color: "#1a1a1a", margin: "22px 0 6px 0" };
const ulStyle = { paddingLeft: 18, margin: "0 0 14px 0", display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5, color: "#303030", lineHeight: 1.65 };

export function PrivacyPolicyContent() {
  return (
    <>
      <p style={pStyle}>
        Vaultd ("we," "our," or "us") is committed to protecting the privacy of merchants who use our Shopify
        application and the customers who interact with our services. This Privacy Policy outlines how we collect,
        use, and disclose personal data.
      </p>

      <h2 style={h2Style}>1. Information We Collect</h2>
      <p style={pStyle}>As a Shopify App, Vaultd accesses data via the Shopify API and through user interactions:</p>
      <ul style={ulStyle}>
        <li><strong>Merchant Data:</strong> Shop name, shop email, shop domain, and plan details to manage your Vaultd account. If you create a Vaultd account password (for linking multiple stores), it is stored as a one-way hash — we never store plain-text passwords.</li>
        <li><strong>Customer &amp; Drop Data:</strong> For the purpose of providing waitlists, referrals, and live analytics, we collect customer email addresses (when they sign up for a waitlist), traffic referral sources, and anonymized interaction data (conversion rates, sales velocity).</li>
        <li><strong>Security Data:</strong> IP addresses and, when a merchant enables Cloudflare Turnstile bot protection, device signals processed by Cloudflare — solely for the purpose of bot protection and preventing scalping.</li>
      </ul>

      <h2 style={h2Style}>2. How We Use Your Information</h2>
      <p style={pStyle}>We use the collected information to:</p>
      <ul style={ulStyle}>
        <li>Provide, operate, and maintain the Vaultd platform.</li>
        <li>Process and manage pre-launch waitlists and referral loops.</li>
        <li>Generate real-time analytics and post-drop performance charts for merchants.</li>
        <li>Protect store inventory against automated bot attacks.</li>
        <li>Process subscription billing through Shopify.</li>
      </ul>

      <h2 style={h2Style}>3. Data Sharing and Third Parties</h2>
      <p style={pStyle}>
        We do not sell personal data. We only share information with third-party service providers strictly
        necessary to run our app — Shopify (store sessions and billing subscriptions, governed by Shopify's own
        privacy policy), Resend (email delivery to your customers), and Cloudflare Turnstile (bot protection, when
        enabled) — or when required by law.
      </p>

      <h2 style={h2Style}>4. Data Retention</h2>
      <p style={pStyle}>
        We retain customer data (like waitlist emails) only for as long as necessary to fulfill the services
        requested by the merchant. Merchants can request data deletion at any time. When you uninstall Vaultd,
        Shopify's mandatory data redaction process automatically triggers permanent deletion of your store's data 48
        hours after uninstallation.
      </p>

      <h2 style={h2Style}>5. GDPR &amp; CCPA Compliance</h2>
      <p style={pStyle}>
        If you or your customers are located in the EU or California, you have the right to access, correct, or
        delete your personal data. Vaultd complies with Shopify's mandatory privacy webhooks to automatically
        process deletion requests.
      </p>

      <h2 style={h2Style}>6. Cookies and Tracking</h2>
      <p style={pStyle}>
        The Vaultd dashboard (embedded in Shopify admin) does not use any analytics cookies or third-party tracking
        pixels. The storefront widgets (countdown, social proof, waitlist form) make API calls to our servers to
        load drop data but do not set cookies on your customers' browsers.
      </p>

      <h2 style={h2Style}>7. Children's Privacy</h2>
      <p style={pStyle}>
        Vaultd is a business-to-business service intended for Shopify merchants. We do not knowingly collect
        personal information from individuals under 16 years of age. The app is not directed at consumers and
        should not be used to collect data from minors.
      </p>

      <h2 style={h2Style}>8. Changes to This Policy</h2>
      <p style={pStyle}>
        We may update this Privacy Policy from time to time. If we make material changes, we will notify you via
        the Vaultd app or by email. Continued use of Vaultd after a policy update constitutes acceptance of the
        revised terms.
      </p>

      <h2 style={h2Style}>9. Contact Us</h2>
      <p style={{ ...pStyle, marginBottom: 0 }}>
        If you have any questions about this Privacy Policy, please contact us at:{" "}
        <a href="mailto:support@vaultd.pro?subject=Privacy%20Policy" style={{ color: "#1a1a1a" }}>support@vaultd.pro</a>
        {" "}— please name the subject "Privacy Policy" or the email won't be read.
      </p>
    </>
  );
}
