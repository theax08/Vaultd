// app/routes/app.emails.jsx

import { useLoaderData, useActionData, useSubmit } from "react-router";
import { useState, useEffect } from "react";
import {
  pagePopStyle,
  pageHeaderRowStyle,
  pageHeaderTitleRowStyle,
  pageHeaderTitleStyle,
  GridIcon,
  cardPadded,
  inputStyle,
  textareaStyle,
  primaryButtonStyle,
  primaryButtonDisabledStyle,
  secondaryButtonStyle,
  pillBadge,
  AutoDismissBanner,
} from "../styles/pop-ui";

const TYPES = {
  WAITLIST_CONFIRMATION: "WAITLIST_CONFIRMATION",
  WAITLIST_RANK_UPDATE: "WAITLIST_RANK_UPDATE",
  DROP_LIVE: "DROP_LIVE",
  DROP_ENDED: "DROP_ENDED",
};

// ==========================================
// SERVER: loader – Charge ou initialise EmailAutomations
// ==========================================
export const loader = async ({ request }) => {
  const [{ authenticate }, dbModule] = await Promise.all([
    import("../shopify.server"),
    import("../db.server"),
  ]);

  const db =
    dbModule.default ??
    dbModule.prisma ??
    dbModule.db ??
    dbModule.client ??
    dbModule;

  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Génère un nom de marque par défaut basé sur le shopDomain
  const defaultShopName = shopDomain
    .replace(".myshopify.com", "")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  // Helper pour charger / créer
  async function getOrCreate(type, defaults) {
    let automation = await db.emailAutomation.findFirst({
      where: { shopDomain, type },
    });

    if (!automation) {
      automation = await db.emailAutomation.create({
        data: {
          shopDomain,
          type,
          brandName: defaultShopName,
          mainColor: "#1a1a1a",
          dropExternalId: "",
          ...defaults,
        },
      });
    }

    return automation;
  }

  // 1) Instant Confirmation
  const waitlistConfirmation = await getOrCreate(
    TYPES.WAITLIST_CONFIRMATION,
    {
      subject: "You are in. Waitlist status inside.",
      body:
        "Hey,\n\n" +
        "Your entry has been validated for {{drop_name}}. Here's your current status.",
    }
  );

  // 2) Rank Update
  const waitlistRankUpdate = await getOrCreate(TYPES.WAITLIST_RANK_UPDATE, {
    subject: "Your waitlist rank just moved.",
    body:
      "Hey,\n\n" +
      "Your entry for {{drop_name}} has been recalculated. Here's your new status.",
  });

  // 3) Drop Live
  const dropLiveAutomation = await getOrCreate(TYPES.DROP_LIVE, {
    subject: "{{drop_name}} is live. Your window is open.",
    body:
      "Hey,\n\n" +
      "{{drop_name}} is now live. You're #{{position}} on the list — your access link is below.",
  });

  // 4) Drop Ended
  const dropEndedAutomation = await getOrCreate(TYPES.DROP_ENDED, {
    subject: "{{drop_name}} is sold out. Here's what happened.",
    body:
      "Hey,\n\n" +
      "{{drop_name}} is officially closed. Here's how it went.",
  });

  const tabs = [
    { id: "waitlist", label: "Waitlist Email Rank", type: "WAITLIST_GROUP" },
    { id: "live", label: "Drop is Live, Get Your Item", type: TYPES.DROP_LIVE },
    {
      id: "ended",
      label: "Drop Ended, Don't Miss the Next Drop",
      type: TYPES.DROP_ENDED,
    },
  ];

  // Pour le selecteur "Drop" : on propose les drops par nom plutot que de
  // demander de copier-coller leur ID.
  // Seuls les drops pas encore lances ont besoin d'etre lies a une
  // automation email : un drop ENDED ne doit plus apparaitre dans la liste.
  const drops = await db.drop.findMany({
    where: { shopDomain, status: "DRAFT" },
    orderBy: { createdAt: "desc" },
    select: { externalId: true, name: true },
  });

  return {
    defaultShopName,
    tabs,
    drops,
    automationsByType: {
      [TYPES.WAITLIST_CONFIRMATION]: waitlistConfirmation,
      [TYPES.WAITLIST_RANK_UPDATE]: waitlistRankUpdate,
      [TYPES.DROP_LIVE]: dropLiveAutomation,
      [TYPES.DROP_ENDED]: dropEndedAutomation,
    },
  };
};

// ==========================================
// SERVER: action – Sauvegarder une automation
// ==========================================
export const action = async ({ request }) => {
  const [{ authenticate }, dbModule] = await Promise.all([
    import("../shopify.server"),
    import("../db.server"),
  ]);

  const db =
    dbModule.default ??
    dbModule.prisma ??
    dbModule.db ??
    dbModule.client ??
    dbModule;

  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "SAVE_TEMPLATE" || intent === "SAVE_AUTOMATION") {
    const id = formData.get("id")?.toString();
    const type = formData.get("type")?.toString();

    const brandName = formData.get("brandName")?.toString() || "";
    const mainColor = formData.get("mainColor")?.toString() || "#1a1a1a";
    const dropExternalId = formData.get("dropExternalId")?.toString() || "";
    const subject = formData.get("subject")?.toString() || "";
    const body = formData.get("body")?.toString() || "";
    const ctaUrl = formData.get("ctaUrl")?.toString() || null;
    const logoUrl = formData.get("logoUrl")?.toString() || null;

    let dropId = null;

    // Pour SAVE_TEMPLATE, tu peux éventuellement ignorer dropExternalId/dropId,
    // ou les laisser tels quels, à toi de décider.
    if (intent === "SAVE_AUTOMATION" && dropExternalId) {
      const drop = await db.drop.findFirst({
        where: {
          shopDomain,
          externalId: dropExternalId,
        },
      });

      if (!drop) {
        return { intent, error: "Invalid drop ID. Check it and try again." };
      }
      if (drop.status === "ENDED") {
        return {
          intent,
          error: "This drop has ended. Link your automation to an active or upcoming drop instead.",
        };
      }

      dropId = drop.id;
    }

    if (id) {
      await db.emailAutomation.update({
        where: { id },
        data: {
          brandName,
          mainColor,
          // Si SAVE_TEMPLATE ne doit PAS lier le drop, tu peux gérer ici :
          dropExternalId: intent === "SAVE_AUTOMATION" ? dropExternalId : "",
          dropId: intent === "SAVE_AUTOMATION" ? dropId : null,
          subject,
          body,
          ctaUrl,
          logoUrl,
        },
      });
    } else if (type) {
      await db.emailAutomation.create({
        data: {
          shopDomain,
          type,
          brandName,
          mainColor,
          dropExternalId: intent === "SAVE_AUTOMATION" ? dropExternalId : "",
          dropId: intent === "SAVE_AUTOMATION" ? dropId : null,
          subject,
          body,
          ctaUrl,
          logoUrl,
        },
      });
    }

    return { intent, success: true };
  }

  return { intent, success: false };
};

// ==========================================
// CLIENT: UI – Page Emails
// ==========================================
export default function EmailsPage() {
  const { defaultShopName, tabs, drops, automationsByType } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();

  const [selectedTabId, setSelectedTabId] = useState(tabs[0].id);

  // Automation base (pour brand + couleur + drop ID)
  const baseAutomation = automationsByType[TYPES.WAITLIST_CONFIRMATION];

  // Brand name laissé vide par défaut (placeholder = defaultShopName)
  const [brandName, setBrandName] = useState(baseAutomation.brandName || "");
  const [mainColor, setMainColor] = useState(
    baseAutomation.mainColor || "#1a1a1a"
  );
  const [dropExternalId, setDropExternalId] = useState(
    baseAutomation.dropExternalId || ""
  );
  // Texte affiche dans le champ : le nom du drop si on en reconnait un pour
  // l'ID deja enregistre, sinon l'ID tel quel (saisie manuelle anterieure).
  const [dropQuery, setDropQuery] = useState(() => {
    const current = baseAutomation.dropExternalId || "";
    const match = drops.find((d) => d.externalId === current);
    return match ? match.name : current;
  });

  const handleDropQueryChange = (value) => {
    setDropQuery(value);
    // Si le texte tape correspond exactement au nom d'un drop (cas du clic
    // sur une suggestion de la datalist), on stocke son vrai ID. Sinon on
    // suppose que c'est un ID colle a la main.
    const match = drops.find((d) => d.name === value);
    setDropExternalId(match ? match.externalId : value);
  };

  // Logo chargé ou non (input file) + preview. On stocke directement le
  // data URL base64 (persistant) plutôt qu'un blob: URL (qui ne survit pas
  // à la sauvegarde et n'est jamais accessible depuis le serveur).
  const [hasLogo, setHasLogo] = useState(Boolean(baseAutomation.logoUrl));
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(
    baseAutomation.logoUrl || ""
  );

  // Erreur globale si brand name / drop ID manquants (pour SAVE_AUTOMATION)
  const [showValidationError, setShowValidationError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Statut de connexion du drop (pour le badge Pending / Automated)
  const [isConnected, setIsConnected] = useState(
    Boolean(baseAutomation.dropExternalId)
  );

  // Subject/body par type
  const [subjects, setSubjects] = useState({
    [TYPES.WAITLIST_CONFIRMATION]:
      automationsByType[TYPES.WAITLIST_CONFIRMATION].subject,
    [TYPES.WAITLIST_RANK_UPDATE]:
      automationsByType[TYPES.WAITLIST_RANK_UPDATE].subject,
    [TYPES.DROP_LIVE]: automationsByType[TYPES.DROP_LIVE].subject,
    [TYPES.DROP_ENDED]: automationsByType[TYPES.DROP_ENDED].subject,
  });

  const [bodies, setBodies] = useState({
    [TYPES.WAITLIST_CONFIRMATION]:
      automationsByType[TYPES.WAITLIST_CONFIRMATION].body,
    [TYPES.WAITLIST_RANK_UPDATE]:
      automationsByType[TYPES.WAITLIST_RANK_UPDATE].body,
    [TYPES.DROP_LIVE]: automationsByType[TYPES.DROP_LIVE].body,
    [TYPES.DROP_ENDED]: automationsByType[TYPES.DROP_ENDED].body,
  });

  // URL de destination du bouton CTA (page produit pour Drop Live, page de
  // waitlist du prochain drop pour Drop Ended). Pas utilise pour les emails waitlist.
  const [ctaUrls, setCtaUrls] = useState({
    [TYPES.DROP_LIVE]: automationsByType[TYPES.DROP_LIVE].ctaUrl || "",
    [TYPES.DROP_ENDED]: automationsByType[TYPES.DROP_ENDED].ctaUrl || "",
  });

  useEffect(() => {
    if (actionData?.success) {
      // Dès que la sauvegarde réussit, on met à jour le statut
      setIsConnected(Boolean(dropExternalId));
      setIsSaving(false);
    } else if (actionData?.error) {
      setIsSaving(false);
    }
  }, [actionData, dropExternalId]);

  // SAVE_TEMPLATE : sauvegarde le sujet/texte sans lier de drop precis.
  // SAVE_AUTOMATION : lie en plus l'automation a un drop via son ID externe
  // (necessite brandName + dropExternalId).
  const handleSave = (automation, type, intent) => {
    if (intent === "SAVE_AUTOMATION" && (!brandName || !dropExternalId)) {
      setShowValidationError(true);
      return;
    }

    setShowValidationError(false);
    setIsSaving(true);

    const formData = new FormData();
    formData.set("intent", intent);
    formData.set("id", automation.id);
    formData.set("type", type);
    formData.set("brandName", brandName);
    formData.set("mainColor", mainColor);
    formData.set("dropExternalId", dropExternalId);
    formData.set("subject", subjects[type]);
    formData.set("body", bodies[type]);
    formData.set("logoUrl", logoPreviewUrl || "");
    if (ctaUrls[type] !== undefined) {
      formData.set("ctaUrl", ctaUrls[type]);
    }

    submit(formData, { method: "post" });
  };

  const handleSubjectChange = (type, value) => {
    setSubjects((prev) => ({ ...prev, [type]: value }));
  };

  const handleBodyChange = (type, value) => {
    setBodies((prev) => ({ ...prev, [type]: value }));
  };

  const handleCtaUrlChange = (type, value) => {
    setCtaUrls((prev) => ({ ...prev, [type]: value }));
  };

  // Config d’affichage par type
  const configByType = {
    [TYPES.WAITLIST_CONFIRMATION]: {
      title: "1. Instant Confirmation",
      description: "Sent automatically when a user joins the waitlist.",
      meta: ["{{drop_name}}", "{{position}}", "{{brand_name}}"],
    },
    [TYPES.WAITLIST_RANK_UPDATE]: {
      title: "2. Rank Update",
      description:
        "Sent when a customer moves up in the waitlist (position improves).",
      meta: ["{{drop_name}}", "{{position}}", "{{brand_name}}"],
    },
    [TYPES.DROP_LIVE]: {
      title: "Drop is Live",
      description: "Sent when a drop moves to LIVE.",
      meta: ["{{drop_name}}", "{{position}}", "{{brand_name}}", "{{access_link}}"],
      ctaLabel: "Destination URL (product page the \"Access\" button opens)",
    },
    [TYPES.DROP_ENDED]: {
      title: "Drop Ended",
      description: "Sent when a drop ends.",
      meta: ["{{drop_name}}", "{{brand_name}}"],
      ctaLabel: "Destination URL (where the \"Join the waitlist\" button opens)",
    },
  };

  const currentTab = tabs.find((t) => t.id === selectedTabId);

  // Helper pour savoir si la section est complète
  const sectionIncomplete = !brandName || !hasLogo || !dropExternalId;

  return (
    <div style={pagePopStyle}>

      {actionData?.success && (
        <div style={{ marginBottom: 12 }}>
          <AutoDismissBanner message="Changes saved" dismissKey={actionData} />
        </div>
      )}
      {actionData?.error && (
        <div style={{ marginBottom: 12 }}>
          <AutoDismissBanner tone="error" message={actionData.error} dismissKey={actionData} />
        </div>
      )}
      <div style={cardPadded}>
          {/* ===== Email customization & automatization ===== */}
          <div
            style={{
              padding: "16px",
              borderRadius: "12px",
              backgroundColor: "#f6f6f7",
            }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)" }}>
              Email customization & automatization
            </span>

            <div
              style={{
                display: "flex",
                gap: "32px",
                marginTop: "12px",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "nowrap",
              }}
            >
              {/* Carré Upload avec preview */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                }}
              >
                <label
                  style={{
                    display: "inline-flex",
                    width: "80px",
                    height: "80px",
                    borderRadius: "12px",
                    border: "1px dashed #C9CCCF",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    color: "#6D7175",
                    cursor: "pointer",
                    background: "#FFFFFF",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  {logoPreviewUrl ? (
                    <img
                      src={logoPreviewUrl}
                      alt="Logo preview"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    "Upload"
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files && e.target.files[0];
                      if (!file) {
                        setHasLogo(false);
                        setLogoPreviewUrl("");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        setHasLogo(true);
                        setLogoPreviewUrl(reader.result);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              </div>

              {/* Brand name – barre large */}
              <div style={{ flex: 1 }}>
                <span style={{ marginBottom: 6, display: "block", fontSize: 13, color: "#6d7175" }}>
                  Brand name
                </span>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder={defaultShopName}
                  style={{
                    border: "1px solid #C9CCCF",
                    borderRadius: "8px",
                    padding: "8px 10px",
                    fontSize: "14px",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Main color : carré de couleur + hex */}
              <div style={{ flex: 1, maxWidth: "260px" }}>
                <span style={{ marginBottom: 6, display: "block", fontSize: 13, color: "#6d7175" }}>
                  Main color
                </span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  {/* Carré 32x32 sans espace blanc entre bord et couleur */}
                  <style>{`
                    .vaultd-color-input::-webkit-color-swatch-wrapper { padding: 0; }
                    .vaultd-color-input::-webkit-color-swatch { border: none; border-radius: 7px; }
                    .vaultd-color-input::-moz-color-swatch { border: none; border-radius: 7px; }
                  `}</style>
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      border: "1px solid #C9CCCF",
                      overflow: "hidden",
                      padding: 0,
                      flexShrink: 0,
                    }}
                  >
                    <input
                      type="color"
                      className="vaultd-color-input"
                      value={mainColor}
                      onChange={(e) => setMainColor(e.target.value)}
                      style={{
                        width: "100%",
                        height: "100%",
                        border: "none",
                        padding: 0,
                        margin: 0,
                        cursor: "pointer",
                        appearance: "none",
                        WebkitAppearance: "none",
                        background: "transparent",
                      }}
                    />
                  </div>
                  <input
                    type="text"
                    value={mainColor}
                    onChange={(e) => setMainColor(e.target.value)}
                    placeholder="#000000"
                    style={{
                      border: "1px solid #C9CCCF",
                      borderRadius: "8px",
                      padding: "8px 10px",
                      fontSize: "14px",
                      width: "100%",
                    }}
                  />
                </div>
              </div>

              {/* Drop : champ unique "2 en 1" -- cliquer dedans propose les
                  drops par nom (datalist native), mais on peut aussi taper
                  ou coller un ID directement dans le meme champ. */}
              <div style={{ flex: 1, maxWidth: "260px" }}>
                <span style={{ marginBottom: 6, display: "block", fontSize: 13, color: "#6d7175" }}>
                  Drop
                </span>
                <input
                  type="text"
                  list="vaultd-drops-datalist"
                  value={dropQuery}
                  onChange={(e) => handleDropQueryChange(e.target.value)}
                  placeholder="Search a drop or paste an ID"
                  style={{
                    border: "1px solid #C9CCCF",
                    borderRadius: "8px",
                    padding: "8px 10px",
                    fontSize: "14px",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
                <datalist id="vaultd-drops-datalist">
                  {drops.map((d) => (
                    <option key={d.externalId} value={d.name} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Message d'erreur global de la section */}
            {showValidationError && sectionIncomplete && (
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "12px",
                  color: "#D82C0D",
                  textAlign: "right",
                }}
              >
                Section must be completed*
              </div>
            )}
          </div>

          {/* ===== TABS ===== */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid #E4E5E7",
              marginTop: "24px",
            }}
          >
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => setSelectedTabId(tab.id)}
                style={{
                  padding: "12px 16px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: selectedTabId === tab.id ? "600" : "400",
                  color:
                    selectedTabId === tab.id
                      ? "var(--vaultd-accent, #202223)"
                      : "#6D7175",
                  borderBottom:
                    selectedTabId === tab.id
                      ? "3px solid var(--vaultd-accent, #000000)"
                      : "3px solid transparent",
                  transition: "all 0.15s ease",
                }}
              >
                {tab.label}
              </div>
            ))}
          </div>

          {/* ===== CONTENUS ===== */}

          {currentTab.id === "waitlist" && (
            <div
              style={{
                marginTop: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <AutomationCard
                type={TYPES.WAITLIST_CONFIRMATION}
                brandName={brandName}
                mainColor={mainColor}
                dropExternalId={dropExternalId}
                automation={automationsByType[TYPES.WAITLIST_CONFIRMATION]}
                subjects={subjects}
                bodies={bodies}
                config={configByType[TYPES.WAITLIST_CONFIRMATION]}
                onSubjectChange={handleSubjectChange}
                onBodyChange={handleBodyChange}
                onSave={handleSave}
                isConnected={isConnected}
                isSaving={isSaving}
              />
              <AutomationCard
                type={TYPES.WAITLIST_RANK_UPDATE}
                brandName={brandName}
                mainColor={mainColor}
                dropExternalId={dropExternalId}
                automation={automationsByType[TYPES.WAITLIST_RANK_UPDATE]}
                subjects={subjects}
                bodies={bodies}
                config={configByType[TYPES.WAITLIST_RANK_UPDATE]}
                onSubjectChange={handleSubjectChange}
                onBodyChange={handleBodyChange}
                onSave={handleSave}
                isConnected={isConnected}
                isSaving={isSaving}
              />
            </div>
          )}

          {currentTab.id === "live" && (
            <div style={{ marginTop: "16px" }}>
              <AutomationCard
                type={TYPES.DROP_LIVE}
                brandName={brandName}
                mainColor={mainColor}
                dropExternalId={dropExternalId}
                automation={automationsByType[TYPES.DROP_LIVE]}
                subjects={subjects}
                bodies={bodies}
                config={configByType[TYPES.DROP_LIVE]}
                onSubjectChange={handleSubjectChange}
                onBodyChange={handleBodyChange}
                onSave={handleSave}
                isConnected={isConnected}
                isSaving={isSaving}
                ctaUrl={ctaUrls[TYPES.DROP_LIVE]}
                onCtaUrlChange={handleCtaUrlChange}
              />
            </div>
          )}

          {currentTab.id === "ended" && (
            <div style={{ marginTop: "16px" }}>
              <AutomationCard
                type={TYPES.DROP_ENDED}
                brandName={brandName}
                mainColor={mainColor}
                dropExternalId={dropExternalId}
                automation={automationsByType[TYPES.DROP_ENDED]}
                subjects={subjects}
                bodies={bodies}
                config={configByType[TYPES.DROP_ENDED]}
                onSubjectChange={handleSubjectChange}
                onBodyChange={handleBodyChange}
                onSave={handleSave}
                isConnected={isConnected}
                isSaving={isSaving}
                ctaUrl={ctaUrls[TYPES.DROP_ENDED]}
                onCtaUrlChange={handleCtaUrlChange}
              />
            </div>
          )}
      </div>
    </div>
  );
}

/**
 * Composant réutilisable pour une carte d’automation
 */
function AutomationCard({
  type,
  automation,
  subjects,
  bodies,
  config,
  onSubjectChange,
  onBodyChange,
  onSave,
  isConnected,
  isSaving,
  ctaUrl,
  onCtaUrlChange,
}) {
  const statusLabel = isConnected ? "⚡ Automated" : "⏱ Pending";

  return (
    <div style={cardPadded}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)" }}>
            {config.title}
          </div>
          <p style={{ fontSize: 12.5, color: "#6d7175", margin: "4px 0 0 0" }}>
            {config.description}
          </p>
        </div>
        <span style={pillBadge(isConnected ? "success" : "warning")}>
          {statusLabel}
        </span>
      </div>

      <div>
        <div style={{ marginTop: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--vaultd-accent, #1a1a1a)" }}>Email Subject</span>
          <input
            type="text"
            name="subject"
            value={subjects[type]}
            onChange={(e) => onSubjectChange(type, e.target.value)}
            style={{ ...inputStyle, marginTop: 8 }}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--vaultd-accent, #1a1a1a)" }}>Message Content</span>
          <textarea
            name="body"
            rows={8}
            value={bodies[type]}
            onChange={(e) => onBodyChange(type, e.target.value)}
            style={{ ...textareaStyle, marginTop: 8 }}
          />
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "8px",
              marginTop: "8px",
              marginBottom: "20px",
            }}
          >
            <span style={{ fontSize: 12, color: "#6d7175" }}>Tags :</span>
            {config.meta.map((tag) => (
              <span
                key={tag}
                style={{
                  display: "inline-block",
                  fontSize: "12px",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  background: "#F0F0F0",
                  border: "1px solid var(--vaultd-accent, #D1D1D1)",
                  color: "var(--vaultd-accent, #5C5F62)",
                  borderRadius: "6px",
                  padding: "6px 12px",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {config.ctaLabel && (
          <div style={{ marginTop: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--vaultd-accent, #1a1a1a)" }}>{config.ctaLabel}</span>
            <input
              type="url"
              name="ctaUrl"
              value={ctaUrl}
              onChange={(e) => onCtaUrlChange(type, e.target.value)}
              placeholder="https://your-store.myshopify.com/products/..."
              style={{ ...inputStyle, marginTop: 8 }}
            />
          </div>
        )}

        {/* Bouton noir, vrai bouton, avec espace au-dessus */}
        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => onSave(automation, type, "SAVE_TEMPLATE")}
            style={isSaving ? { ...secondaryButtonStyle, opacity: 0.6, cursor: "default" } : secondaryButtonStyle}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={() => onSave(automation, type, "SAVE_AUTOMATION")}
            style={isSaving ? primaryButtonDisabledStyle : primaryButtonStyle}
          >
            {isSaving ? "Saving..." : "Save automation"}
          </button>
        </div>
      </div>
    </div>
  );
}