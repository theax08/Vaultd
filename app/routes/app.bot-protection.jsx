import { useLoaderData, useActionData, useSubmit } from "react-router";
import { useState, useEffect } from "react";
import {
  pagePopStyle,
  pageHeaderRowStyle,
  pageHeaderTitleRowStyle,
  pageHeaderTitleStyle,
  GridIcon,
  cardPadded,
  cardLabel,
  inputStyle,
  primaryButtonStyle,
  primaryButtonDisabledStyle,
  toggleSwitchStyle,
  toggleSwitchKnobStyle,
  successBannerStyle,
} from "../styles/pop-ui";

export const loader = async ({ request }) => {
  const [{ authenticate }, { getShopSettings }] = await Promise.all([
    import("../shopify.server"),
    import("../bot-protection.server"),
  ]);

  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const settings = await getShopSettings(shopDomain);

  return { settings };
};

export const action = async ({ request }) => {
  const [{ authenticate }, dbModule] = await Promise.all([
    import("../shopify.server"),
    import("../db.server"),
  ]);

  const db = dbModule.default;
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const formData = await request.formData();
  const botProtectionEnabled = formData.get("botProtectionEnabled") === "on";
  const turnstileSiteKey = (formData.get("turnstileSiteKey") || "").toString().trim();
  const turnstileSecretKey = (formData.get("turnstileSecretKey") || "").toString().trim();

  await db.shopSettings.upsert({
    where: { shopDomain },
    create: {
      shopDomain,
      botProtectionEnabled,
      turnstileSiteKey: turnstileSiteKey || null,
      turnstileSecretKey: turnstileSecretKey || null,
    },
    update: {
      botProtectionEnabled,
      turnstileSiteKey: turnstileSiteKey || null,
      turnstileSecretKey: turnstileSecretKey || null,
    },
  });

  return { success: true };
};

export default function BotProtectionPage() {
  const { settings } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();

  const [enabled, setEnabled] = useState(settings.botProtectionEnabled);
  const [siteKey, setSiteKey] = useState(settings.turnstileSiteKey || "");
  const [secretKey, setSecretKey] = useState(settings.turnstileSecretKey || "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (actionData?.success) setIsSaving(false);
  }, [actionData]);

  const handleSave = () => {
    setIsSaving(true);
    const formData = new FormData();
    if (enabled) formData.set("botProtectionEnabled", "on");
    formData.set("turnstileSiteKey", siteKey);
    formData.set("turnstileSecretKey", secretKey);
    submit(formData, { method: "post" });
  };

  return (
    <div style={pagePopStyle}>

      <div style={{ ...cardPadded, maxWidth: 560 }}>
        <div style={cardLabel}>BOT PROTECTION</div>
        <p style={{ fontSize: 13.5, color: "#303030", margin: "0 0 14px 0" }}>
          Honeypot field, submission-timing checks and IP rate-limiting are
          always active on every waitlist signup, free of charge. Turning
          this on adds an invisible{" "}
          <a
            href="https://www.cloudflare.com/products/turnstile/"
            target="_blank"
            rel="noreferrer"
            style={{ color: "#1a1a1a", fontWeight: 600 }}
          >
            Cloudflare Turnstile
          </a>{" "}
          challenge on top, to stop scripted/automated signups from
          reserving limited drop spots.
        </p>

        {actionData?.success && (
          <div style={{ ...successBannerStyle, marginBottom: 14 }}>
            Settings saved
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <button
            type="button"
            onClick={() => setEnabled((v) => !v)}
            style={toggleSwitchStyle(enabled)}
            aria-pressed={enabled}
          >
            <span style={toggleSwitchKnobStyle(enabled)} />
          </button>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1a1a1a" }}>
            Enable Turnstile bot protection
          </span>
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 6 }}>
            Turnstile site key
          </span>
          <input
            type="text"
            value={siteKey}
            onChange={(e) => setSiteKey(e.target.value)}
            placeholder="0x4AAAAAAA..."
            style={{ ...inputStyle, maxWidth: 420 }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 6 }}>
            Turnstile secret key
          </span>
          <input
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder="0x4AAAAAAA..."
            style={{ ...inputStyle, maxWidth: 420 }}
          />
          <p style={{ marginTop: 6, fontSize: 12, color: "#6d7175" }}>
            Get both keys for free at{" "}
            <a
              href="https://dash.cloudflare.com/?to=/:account/turnstile"
              target="_blank"
              rel="noreferrer"
              style={{ color: "#1a1a1a", fontWeight: 600 }}
            >
              dash.cloudflare.com
            </a>{" "}
            — create a widget, "Managed" mode, and add your storefront domain.
          </p>
        </div>

        <div style={{ textAlign: "right" }}>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            style={isSaving ? primaryButtonDisabledStyle : primaryButtonStyle}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
