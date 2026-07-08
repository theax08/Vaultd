// Public route — no Shopify auth required.
// Shopify App Store requires a reachable privacy policy URL.
export default function PrivacyPolicy() {
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 720, margin: "0 auto", padding: "48px 24px", color: "#1a1a1a", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ color: "#6d7175", fontSize: 13, marginTop: 0, marginBottom: 40 }}>
        Last updated: June 2025 &nbsp;·&nbsp; Vaultd
      </p>

      <p>
        Vaultd ("<strong>we</strong>", "<strong>us</strong>", "<strong>our</strong>") is a Shopify app that helps
        merchants manage limited-edition product drops, waitlists, and hype-building campaigns. This Privacy Policy
        describes how we collect, use, and protect information when you install and use our application.
      </p>

      <h2 style={h2}>1. Information we collect</h2>

      <h3 style={h3}>From merchants (Shopify store owners)</h3>
      <ul style={ul}>
        <li><strong>Shopify store data</strong> — shop domain, access token, and basic store information provided by Shopify during installation via OAuth.</li>
        <li><strong>Account data</strong> — email address, password (stored as a one-way hash — we never store plain-text passwords), and account preferences you set in Vaultd.</li>
        <li><strong>Order data</strong> — order IDs, amounts, and product information from drops you run, synced via Shopify webhooks for analytics purposes.</li>
        <li><strong>Email automation content</strong> — subject lines, body text, brand colors, and logos you configure for automated customer emails.</li>
        <li><strong>Cloudflare Turnstile keys</strong> — if you enable bot protection, we store your Turnstile Site Key and Secret Key to verify waitlist submissions.</li>
      </ul>

      <h3 style={h3}>From your customers (waitlist members)</h3>
      <ul style={ul}>
        <li><strong>Email address</strong> — collected when a customer joins a drop waitlist through the widget on your storefront.</li>
        <li><strong>Name</strong> (optional) — if collected during waitlist signup.</li>
        <li><strong>Referral activity</strong> — whether a customer was referred by another waitlist member, used to calculate queue position.</li>
        <li><strong>Signup timestamp and waitlist position</strong> — for queue management and rank-update emails.</li>
      </ul>

      <p>
        We do <strong>not</strong> collect payment card numbers, social security numbers, or any financial data from your customers. All purchases happen directly through your Shopify store checkout — Vaultd has no involvement in payment processing.
      </p>

      <h2 style={h2}>2. How we use this information</h2>
      <ul style={ul}>
        <li>To operate and display your drops, waitlists, and analytics within the Vaultd dashboard.</li>
        <li>To send automated waitlist emails (confirmation, rank updates, drop-live, drop-ended) to your customers on your behalf using Resend (our email delivery provider).</li>
        <li>To calculate queue positions, referral scores, and post-drop analytics (revenue, conversion rate, sell-out time).</li>
        <li>To enforce bot protection on waitlist signups when you enable Cloudflare Turnstile.</li>
        <li>To respond to support requests you submit through the in-app chat.</li>
        <li>To maintain your Vaultd account and process subscription billing through Shopify.</li>
      </ul>

      <h2 style={h2}>3. Data sharing and third-party services</h2>
      <p>We do not sell or rent your data or your customers' data. We share data only with the following services, which are necessary to operate Vaultd:</p>
      <ul style={ul}>
        <li><strong>Shopify</strong> — your store sessions and billing subscriptions are managed through Shopify's platform. Data is subject to Shopify's own privacy policy.</li>
        <li><strong>Resend</strong> — we use Resend to deliver transactional emails to your customers. Customer email addresses are transmitted to Resend solely to send the emails you configure. Resend's privacy policy applies.</li>
        <li><strong>Cloudflare</strong> — if you enable bot protection, your storefront visitors' browser signals are processed by Cloudflare Turnstile to distinguish humans from bots. No personally identifiable information is stored by Cloudflare for this purpose.</li>
        <li><strong>Hosting and database infrastructure</strong> — we use a cloud infrastructure provider to host the application and store data. Data is encrypted at rest and in transit.</li>
      </ul>

      <h2 style={h2}>4. Data retention</h2>
      <ul style={ul}>
        <li><strong>Merchant data</strong> — retained while your Vaultd account is active. If you uninstall the app, we retain your data for 30 days to allow reinstallation, then permanently delete it.</li>
        <li><strong>Customer waitlist data</strong> — retained for the lifetime of the associated drop, plus a 90-day post-drop window for analytics. Customers can request removal at any time by using the unsubscribe link in any waitlist email.</li>
        <li><strong>Session tokens</strong> — Shopify access tokens are stored for as long as the app is installed. They are deleted when you uninstall.</li>
      </ul>

      <h2 style={h2}>5. Security</h2>
      <p>
        We take reasonable technical and organizational measures to protect data against unauthorized access, loss, or misuse. These include encrypted database storage, HTTPS-only communication, hashed passwords, and rate-limiting on all public-facing endpoints. No system is 100% secure; we encourage you to use strong account credentials.
      </p>

      <h2 style={h2}>6. Your rights and choices</h2>
      <ul style={ul}>
        <li><strong>Access and correction</strong> — you can view and edit your Vaultd account information at any time from the Settings page.</li>
        <li><strong>Data deletion</strong> — uninstalling the app triggers deletion of your data within 30 days. To request immediate deletion, contact us at the address below.</li>
        <li><strong>Customer unsubscribe</strong> — every waitlist email includes an unsubscribe link. Unsubscribed customers remain in your waitlist records for historical accuracy but are excluded from future emails.</li>
        <li><strong>GDPR / data portability</strong> — if you are subject to GDPR and need a data export or deletion request processed, contact us and we will respond within 30 days.</li>
      </ul>

      <h2 style={h2}>7. Cookies and tracking</h2>
      <p>
        The Vaultd dashboard (embedded in Shopify admin) does not use any analytics cookies or third-party tracking pixels. The storefront widgets (countdown, social proof, waitlist form) make API calls to our servers to load drop data but do not set cookies on your customers' browsers.
      </p>

      <h2 style={h2}>8. Children's privacy</h2>
      <p>
        Vaultd is a business-to-business service intended for Shopify merchants. We do not knowingly collect personal information from individuals under 16 years of age. The app is not directed at consumers and should not be used to collect data from minors.
      </p>

      <h2 style={h2}>9. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. If we make material changes, we will notify you via the Vaultd app or by email. Continued use of Vaultd after a policy update constitutes acceptance of the revised terms.
      </p>

      <h2 style={h2}>10. Contact us</h2>
      <p>
        If you have questions about this policy or want to exercise your data rights, contact us at:{" "}
        <a href="mailto:support@vaultd.pro" style={{ color: "#1a1a1a" }}>support@vaultd.pro</a>.
      </p>

      <hr style={{ border: "none", borderTop: "1px solid #e3e3e3", margin: "40px 0" }} />
      <p style={{ fontSize: 12, color: "#919191" }}>
        Vaultd · <a href="mailto:support@vaultd.pro" style={{ color: "#919191" }}>support@vaultd.pro</a>
      </p>
    </div>
  );
}

const h2 = {
  fontSize: 18,
  fontWeight: 700,
  marginTop: 36,
  marginBottom: 8,
};

const h3 = {
  fontSize: 15,
  fontWeight: 600,
  marginTop: 20,
  marginBottom: 4,
};

const ul = {
  paddingLeft: 20,
  margin: "8px 0 16px 0",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
