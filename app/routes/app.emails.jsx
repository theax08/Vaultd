// app/routes/app.emails.jsx

import { useLoaderData, useActionData, useSubmit, useFetcher, Link } from "react-router";
import { PLAN_ORDER } from "../vaultd-plans";
import { useState, useEffect, useRef } from "react";
import {
  popFontFamily,
  pageHeaderTitleStyle,
  cardPadded,
  inputStyle,
  textareaStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  toggleSwitchStyle,
  toggleSwitchKnobStyle,
  monoNumberStyle,
  AutoDismissBanner,
} from "../styles/pop-ui";

const TYPES = {
  WAITLIST_CONFIRMATION: "WAITLIST_CONFIRMATION",
  WAITLIST_RANK_UPDATE: "WAITLIST_RANK_UPDATE",
  DROP_LIVE: "DROP_LIVE",
  DROP_ENDED: "DROP_ENDED",
};

const SUBJECT_RECOMMENDED_LIMIT = 60;
const PREVIEW_SAMPLE_POSITION = 248;

// Anti-abus basique sur "Send a test" — en memoire (un seul process Railway),
// pas besoin de plus pour une fonctionnalite a faible enjeu.
const TEST_SEND_LIMIT = 3;
const TEST_SEND_WINDOW_MS = 60_000;
const testSendLog = new Map(); // shopDomain -> timestamps[]

function isTestSendRateLimited(shopDomain) {
  const now = Date.now();
  const recent = (testSendLog.get(shopDomain) || []).filter((t) => now - t < TEST_SEND_WINDOW_MS);
  testSendLog.set(shopDomain, recent);
  return recent.length >= TEST_SEND_LIMIT;
}
function recordTestSend(shopDomain) {
  const recent = testSendLog.get(shopDomain) || [];
  recent.push(Date.now());
  testSendLog.set(shopDomain, recent);
}

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

  // Pour le selecteur "Drop d'aperçu" : on propose les drops par nom plutot
  // que de demander de copier-coller leur ID. Seuls les drops pas encore
  // lances ont besoin d'un aperçu (un drop ENDED n'a plus d'automation a tester).
  const drops = await db.drop.findMany({
    where: { shopDomain, status: "DRAFT" },
    orderBy: { createdAt: "desc" },
    select: { externalId: true, name: true },
  });

  let plan = null;
  let accountEmail = null;
  try {
    const { getAccountForShop } = await import("../vaultd-account.server");
    const account = await getAccountForShop(shopDomain);
    plan = PLAN_ORDER.includes(account?.plan) ? account.plan : null;
    accountEmail = account?.email ?? null;
  } catch {}

  return {
    defaultShopName,
    plan,
    accountEmail,
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
// SERVER: action
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

  // Enregistre le modele (marque, couleur, logo, drop d'apercu, objet/corps
  // par type) pour les 4 automations en une fois — separe de l'activation,
  // qui a son propre intent immediat plus bas.
  if (intent === "SAVE_TEMPLATE") {
    const brandName = formData.get("brandName")?.toString() || "";
    const mainColor = formData.get("mainColor")?.toString() || "#1a1a1a";
    const dropExternalId = formData.get("dropExternalId")?.toString() || "";
    const logoUrl = formData.get("logoUrl")?.toString() || null;

    let dropId = null;
    if (dropExternalId) {
      const drop = await db.drop.findFirst({
        where: { shopDomain, externalId: dropExternalId },
      });
      if (!drop) {
        return { intent, error: "Invalid preview drop. Check it and try again." };
      }
      dropId = drop.id;
    }

    let perType;
    try {
      perType = JSON.parse(formData.get("perType")?.toString() || "{}");
    } catch {
      return { intent, error: "Could not read the submitted templates." };
    }

    await Promise.all(
      Object.entries(perType).map(([type, fields]) => {
        const data = {
          brandName,
          mainColor,
          dropExternalId,
          dropId,
          subject: fields.subject ?? "",
          body: fields.body ?? "",
          ctaUrl: fields.ctaUrl ?? null,
          logoUrl,
        };
        if (fields.id) {
          return db.emailAutomation.update({ where: { id: fields.id }, data });
        }
        return db.emailAutomation.create({ data: { shopDomain, type, active: true, ...data } });
      })
    );

    return { intent, success: true };
  }

  // Interrupteur "Envoi automatique" — reversible, immediat, independant de
  // l'enregistrement du modele. C'est le seul champ qui gate reellement les
  // envois (drop-lifecycle.server.js / api.waitlist.jsx verifient `active`).
  if (intent === "TOGGLE_ACTIVE") {
    const id = formData.get("id")?.toString();
    const active = formData.get("active") === "true";
    if (!id) return { intent, error: "Missing automation." };

    try {
      const updated = await db.emailAutomation.update({
        where: { id },
        data: { active },
      });
      return { intent, success: true, id, active: updated.active };
    } catch (err) {
      console.error("[emails] TOGGLE_ACTIVE failed:", err);
      // Renvoie l'etat d'avant pour que le client puisse annuler sa mise a
      // jour optimiste — sans ca l'interrupteur mentirait sur ce qui part vraiment.
      return { intent, error: "Could not update. Try again.", id, active: !active };
    }
  }

  // Envoie un test avec les valeurs actuellement affichees (pas forcement
  // sauvegardees) a l'adresse choisie par le marchand.
  if (intent === "SEND_TEST") {
    const id = formData.get("id")?.toString();
    const type = formData.get("type")?.toString();
    const subject = formData.get("subject")?.toString() || "";
    const body = formData.get("body")?.toString() || "";
    const brandName = formData.get("brandName")?.toString() || "";
    const mainColor = formData.get("mainColor")?.toString() || "#1a1a1a";
    const ctaUrl = formData.get("ctaUrl")?.toString() || null;
    const dropName = formData.get("dropName")?.toString() || "";
    const to = formData.get("to")?.toString().trim() || "";

    if (!dropName) {
      return { intent, error: "Choose a preview drop before sending a test." };
    }
    if (!to || !/^\S+@\S+\.\S+$/.test(to)) {
      return { intent, error: "Enter a valid email address to send the test to." };
    }
    if (isTestSendRateLimited(shopDomain)) {
      return { intent, error: "Too many test emails sent — wait a minute and try again." };
    }

    const [emailAutomations, { buildLogoUrl }] = await Promise.all([
      import("../email-automations.server"),
      import("../unsubscribe.server"),
    ]);

    const automation = id ? await db.emailAutomation.findUnique({ where: { id } }) : null;
    const boutiqueLogo = automation ? buildLogoUrl(automation) : "";

    const shared = {
      to,
      boutiqueName: brandName,
      boutiqueLogo,
      brandColor: mainColor,
      subject,
      body,
      dropName,
      unsubscribeUrl: "#",
    };

    try {
      if (type === TYPES.WAITLIST_CONFIRMATION) {
        await emailAutomations.sendWaitlistConfirmationEmail({ ...shared, position: PREVIEW_SAMPLE_POSITION });
      } else if (type === TYPES.WAITLIST_RANK_UPDATE) {
        await emailAutomations.sendWaitlistRankUpdateEmail({
          ...shared,
          position: PREVIEW_SAMPLE_POSITION,
          previousPosition: PREVIEW_SAMPLE_POSITION + 5,
        });
      } else if (type === TYPES.DROP_LIVE) {
        await emailAutomations.sendDropLiveEmail({
          ...shared,
          position: PREVIEW_SAMPLE_POSITION,
          openedLabel: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          accessLink: ctaUrl,
          maxUnits: 100,
        });
      } else if (type === TYPES.DROP_ENDED) {
        await emailAutomations.sendDropEndedEmail({
          ...shared,
          soldOut: true,
          itemsSold: 100,
          waitlistCount: PREVIEW_SAMPLE_POSITION,
          nextDropCtaUrl: ctaUrl,
        });
      } else {
        return { intent, error: "Unknown email type." };
      }
    } catch (err) {
      console.error("[emails] SEND_TEST failed:", err);
      return { intent, error: "Could not send the test email. Try again in a moment." };
    }

    recordTestSend(shopDomain);
    return { intent, success: true, to };
  }

  // Rendu HTML reel (email-templates.js) pour l'apercu — les memes fonctions
  // que celles utilisees pour un vrai envoi, donc l'apercu ne peut pas
  // diverger du rendu final.
  if (intent === "RENDER_PREVIEW") {
    const type = formData.get("type")?.toString();
    const subject = formData.get("subject")?.toString() || "";
    const body = formData.get("body")?.toString() || "";
    const brandName = formData.get("brandName")?.toString() || "";
    const mainColor = formData.get("mainColor")?.toString() || "#1a1a1a";
    const logoUrl = formData.get("logoUrl")?.toString() || "";
    const ctaUrl = formData.get("ctaUrl")?.toString() || "";
    const dropName = formData.get("dropName")?.toString() || "Your Drop";

    const templates = await import("../email-templates");
    const vars = { drop_name: dropName, position: PREVIEW_SAMPLE_POSITION, brand_name: brandName, access_link: ctaUrl };
    const resolvedSubject = templates.renderTemplate(subject, vars);
    const bodyText = templates.renderTemplate(body, vars);

    const shared = {
      boutiqueName: brandName,
      boutiqueLogo: logoUrl,
      brandColor: mainColor,
      bodyText,
      dropName,
      unsubscribeUrl: "#",
    };

    let html = "";
    if (type === TYPES.WAITLIST_CONFIRMATION) {
      html = templates.renderWaitlistConfirmationEmail({ ...shared, position: PREVIEW_SAMPLE_POSITION });
    } else if (type === TYPES.WAITLIST_RANK_UPDATE) {
      html = templates.renderWaitlistRankUpdateEmail({
        ...shared,
        position: PREVIEW_SAMPLE_POSITION,
        previousPosition: PREVIEW_SAMPLE_POSITION + 5,
      });
    } else if (type === TYPES.DROP_LIVE) {
      html = templates.renderDropLiveEmail({
        ...shared,
        position: PREVIEW_SAMPLE_POSITION,
        openedLabel: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        closesInLabel: "6h",
        accessLink: ctaUrl || "#",
        linkValidHoursLabel: "6 hours",
        maxUnits: 30,
      });
    } else if (type === TYPES.DROP_ENDED) {
      html = templates.renderDropEndedEmail({
        ...shared,
        soldOut: true,
        closedAtLabel: new Date().toLocaleString("en-US"),
        itemsSold: 30,
        selloutLabel: "6h03m",
        waitlistCount: PREVIEW_SAMPLE_POSITION,
        nextDropName: "Drop 02",
        nextDropCtaUrl: ctaUrl || "#",
      });
    } else {
      return { intent, error: "Unknown email type." };
    }

    return { intent, success: true, type, html, subject: resolvedSubject };
  }

  return { intent, success: false };
};

// ==========================================
// CLIENT: UI – Page Emails
// ==========================================
// Plan minimum par groupe : waitlist = GROWTH+, live/ended = PRO+.
// rank_update n'est pas un groupe mais un e-mail a l'interieur du groupe
// waitlist (mise a jour de position/referral) — reservee a PRO+, meme si
// la confirmation de waitlist reste dispo des GROWTH.
const STEP_MIN_PLAN = { waitlist: "GROWTH", rank_update: "PRO", live: "PRO", ended: "PRO" };

function isStepLocked(stepId, plan) {
  const minPlan = STEP_MIN_PLAN[stepId] ?? "PRO";
  const planIdx = PLAN_ORDER.indexOf(plan);
  const minIdx = PLAN_ORDER.indexOf(minPlan);
  return planIdx < minIdx; // -1 si plan null → toujours locked
}

// Groupes = contextes (axe horizontal), pas une sequence — seuls les
// e-mails A L'INTERIEUR d'un groupe forment une chaine dans le temps
// (VAULTD-DESIGN-emails.md 8.12).
const GROUPS = [
  { id: "waitlist", label: "Waitlist", types: [TYPES.WAITLIST_CONFIRMATION, TYPES.WAITLIST_RANK_UPDATE] },
  { id: "live", label: "Drop live", types: [TYPES.DROP_LIVE] },
  { id: "ended", label: "After the drop", types: [TYPES.DROP_ENDED] },
];

// Config d'affichage par type
const CONFIG_BY_TYPE = {
  [TYPES.WAITLIST_CONFIRMATION]: {
    title: "Instant confirmation",
    description: "Sent when a customer joins the waitlist.",
    meta: ["{{drop_name}}", "{{position}}", "{{brand_name}}"],
  },
  [TYPES.WAITLIST_RANK_UPDATE]: {
    title: "Rank update",
    description: "Sent when a customer moves up in the waitlist (position improves).",
    meta: ["{{drop_name}}", "{{position}}", "{{brand_name}}"],
  },
  [TYPES.DROP_LIVE]: {
    title: "Drop is live",
    description: "Sent when a drop moves to live.",
    meta: ["{{drop_name}}", "{{position}}", "{{brand_name}}", "{{access_link}}"],
    ctaLabel: "Destination URL (product page the \"Access\" button opens)",
  },
  [TYPES.DROP_ENDED]: {
    title: "Drop ended",
    description: "Sent when a drop ends.",
    meta: ["{{drop_name}}", "{{brand_name}}"],
    ctaLabel: "Destination URL (where the \"Join the waitlist\" button opens)",
  },
};

function unlockedTypesInGroup(group, plan) {
  return group.types.filter((t) => !isStepLocked(t === TYPES.WAITLIST_RANK_UPDATE ? "rank_update" : group.id, plan));
}

// Pastille d'activation (8.10, corrigee) — actif est l'etat normal, il ne
// doit pas sauter aux yeux ; inactif est ce qui merite d'etre vu (rien ne
// part). Namespace .vd-pill--auto-* separe de l'etat d'un drop.
function ActivePill({ active, label }) {
  return (
    <span className={`vd-pill vd-pill--auto-${active ? "active" : "inactive"}`}>
      <span className="vd-dot" />
      {label ?? (active ? "Active" : "Inactive — no emails sent")}
    </span>
  );
}

function LockedCard({ title, description, planName }) {
  return (
    <div style={cardPadded}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>{title}</div>
          <p style={{ fontSize: 12.5, color: "#6d7175", margin: "4px 0 0 0" }}>{description}</p>
        </div>
      </div>
      <p style={{ fontSize: 13, color: "#6d7175", marginTop: 14, marginBottom: 0 }}>
        Available on the {planName} plan.{" "}
        <Link to="/app/plans" style={{ color: "#1a1a1a", fontWeight: 600 }}>Upgrade to unlock →</Link>
      </p>
    </div>
  );
}

function LockedGroupPanel({ planName }) {
  return (
    <div style={{ ...cardPadded, textAlign: "center", padding: "32px 20px" }}>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>
        Available on the {planName} plan
      </div>
      <p style={{ fontSize: 13, color: "#6d7175", margin: "0 0 16px 0" }}>
        Upgrade to unlock automated emails for this step.
      </p>
      <Link to="/app/plans" style={{ ...primaryButtonStyle, display: "inline-block", textDecoration: "none" }}>
        View plans →
      </Link>
    </div>
  );
}

export default function EmailsPage() {
  const { defaultShopName, plan, accountEmail, drops, automationsByType } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const toggleFetcher = useFetcher();
  const testFetcher = useFetcher();
  const previewFetcher = useFetcher();

  const baseAutomation = automationsByType[TYPES.WAITLIST_CONFIRMATION];

  // ---- Modèle (brand + couleur + logo + drop d'aperçu) — géré par la SaveBar ----
  const [brandName, setBrandName] = useState(baseAutomation.brandName || "");
  const [mainColor, setMainColor] = useState(baseAutomation.mainColor || "#1a1a1a");
  const [logoUrl, setLogoUrl] = useState(baseAutomation.logoUrl || "");
  const [previewDropExternalId, setPreviewDropExternalId] = useState(baseAutomation.dropExternalId || "");
  const [previewDropQuery, setPreviewDropQuery] = useState(() => {
    const current = baseAutomation.dropExternalId || "";
    const match = drops.find((d) => d.externalId === current);
    return match ? match.name : current;
  });

  const handlePreviewDropQueryChange = (value) => {
    setPreviewDropQuery(value);
    const match = drops.find((d) => d.name === value);
    setPreviewDropExternalId(match ? match.externalId : value);
  };

  const [subjects, setSubjects] = useState({
    [TYPES.WAITLIST_CONFIRMATION]: automationsByType[TYPES.WAITLIST_CONFIRMATION].subject,
    [TYPES.WAITLIST_RANK_UPDATE]: automationsByType[TYPES.WAITLIST_RANK_UPDATE].subject,
    [TYPES.DROP_LIVE]: automationsByType[TYPES.DROP_LIVE].subject,
    [TYPES.DROP_ENDED]: automationsByType[TYPES.DROP_ENDED].subject,
  });
  const [bodies, setBodies] = useState({
    [TYPES.WAITLIST_CONFIRMATION]: automationsByType[TYPES.WAITLIST_CONFIRMATION].body,
    [TYPES.WAITLIST_RANK_UPDATE]: automationsByType[TYPES.WAITLIST_RANK_UPDATE].body,
    [TYPES.DROP_LIVE]: automationsByType[TYPES.DROP_LIVE].body,
    [TYPES.DROP_ENDED]: automationsByType[TYPES.DROP_ENDED].body,
  });
  const [ctaUrls, setCtaUrls] = useState({
    [TYPES.DROP_LIVE]: automationsByType[TYPES.DROP_LIVE].ctaUrl || "",
    [TYPES.DROP_ENDED]: automationsByType[TYPES.DROP_ENDED].ctaUrl || "",
  });

  // ---- Activation — indépendante du modèle, immédiate ----
  const [activeStates, setActiveStates] = useState({
    [TYPES.WAITLIST_CONFIRMATION]: automationsByType[TYPES.WAITLIST_CONFIRMATION].active,
    [TYPES.WAITLIST_RANK_UPDATE]: automationsByType[TYPES.WAITLIST_RANK_UPDATE].active,
    [TYPES.DROP_LIVE]: automationsByType[TYPES.DROP_LIVE].active,
    [TYPES.DROP_ENDED]: automationsByType[TYPES.DROP_ENDED].active,
  });
  const [justActivated, setJustActivated] = useState(null); // type juste passe a actif, pour le message ponctuel

  const handleToggleActive = (type) => {
    const automation = automationsByType[type];
    const nextActive = !activeStates[type];
    setActiveStates((prev) => ({ ...prev, [type]: nextActive }));
    if (nextActive) setJustActivated(type);
    toggleFetcher.submit(
      { intent: "TOGGLE_ACTIVE", id: automation.id, active: String(nextActive) },
      { method: "post" }
    );
  };

  // Le toggle est optimiste (il flippe avant la reponse serveur) — si l'appel
  // echoue, on revient a l'etat reel renvoye par le serveur. Sans ca
  // l'interrupteur pourrait afficher "Active" alors que rien n'a ete sauvegarde.
  useEffect(() => {
    const data = toggleFetcher.data;
    if (data?.intent !== "TOGGLE_ACTIVE" || !data.error || !data.id) return;
    const type = Object.keys(automationsByType).find((t) => automationsByType[t].id === data.id);
    if (type) setActiveStates((prev) => ({ ...prev, [type]: data.active }));
    // eslint-disable-next-line
  }, [toggleFetcher.data]);

  // ---- Snapshot enregistré (pour la SaveBar + Discard) ----
  const buildSnapshot = () => ({
    brandName,
    mainColor,
    logoUrl,
    previewDropExternalId,
    subjects,
    bodies,
    ctaUrls,
  });
  const [savedSnapshot, setSavedSnapshot] = useState(buildSnapshot);
  const currentSnapshot = buildSnapshot();
  const isDirty = JSON.stringify(currentSnapshot) !== JSON.stringify(savedSnapshot);

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (actionData?.intent === "SAVE_TEMPLATE") {
      if (actionData?.success) {
        setSavedSnapshot(currentSnapshot);
        setIsSaving(false);
      } else if (actionData?.error) {
        setIsSaving(false);
      }
    }
    // eslint-disable-next-line
  }, [actionData]);

  const handleSaveTemplate = () => {
    setIsSaving(true);
    const perType = {};
    for (const type of Object.keys(TYPES).map((k) => TYPES[k])) {
      perType[type] = {
        id: automationsByType[type].id,
        subject: subjects[type],
        body: bodies[type],
        ctaUrl: ctaUrls[type] ?? null,
      };
    }
    const formData = new FormData();
    formData.set("intent", "SAVE_TEMPLATE");
    formData.set("brandName", brandName);
    formData.set("mainColor", mainColor);
    formData.set("dropExternalId", previewDropExternalId);
    formData.set("logoUrl", logoUrl || "");
    formData.set("perType", JSON.stringify(perType));
    submit(formData, { method: "post" });
  };

  const handleDiscard = () => {
    setBrandName(savedSnapshot.brandName);
    setMainColor(savedSnapshot.mainColor);
    setLogoUrl(savedSnapshot.logoUrl);
    setPreviewDropExternalId(savedSnapshot.previewDropExternalId);
    const match = drops.find((d) => d.externalId === savedSnapshot.previewDropExternalId);
    setPreviewDropQuery(match ? match.name : savedSnapshot.previewDropExternalId);
    setSubjects(savedSnapshot.subjects);
    setBodies(savedSnapshot.bodies);
    setCtaUrls(savedSnapshot.ctaUrls);
  };

  // ---- Save bar App Bridge (contextuelle, apparait des qu'un champ change) ----
  const saveBarRef = useRef(null);
  useEffect(() => {
    const el = saveBarRef.current;
    if (!el) return;
    if (isDirty) {
      el.show?.();
    } else {
      el.hide?.();
    }
  }, [isDirty]);

  // ---- Navigation : onglets horizontaux (groupe) + accordéon vertical (e-mail) ----
  const [selectedGroupId, setSelectedGroupId] = useState("waitlist");
  const selectedGroup = GROUPS.find((g) => g.id === selectedGroupId);
  const [openEmailType, setOpenEmailType] = useState(TYPES.WAITLIST_CONFIRMATION);
  const [previewMode, setPreviewMode] = useState("desktop");

  const handleSubjectChange = (type, value) => setSubjects((prev) => ({ ...prev, [type]: value }));
  const handleBodyChange = (type, value) => setBodies((prev) => ({ ...prev, [type]: value }));
  const handleCtaUrlChange = (type, value) => setCtaUrls((prev) => ({ ...prev, [type]: value }));

  // ---- Envoyer un test — destinataire modifiable, drop d'aperçu obligatoire ----
  const [testEmail, setTestEmail] = useState(accountEmail || "");
  const canSendTest = Boolean(previewDropQuery);

  const handleSendTest = (type) => {
    if (!canSendTest) return;
    testFetcher.submit(
      {
        intent: "SEND_TEST",
        id: automationsByType[type].id,
        type,
        subject: subjects[type],
        body: bodies[type],
        brandName,
        mainColor,
        ctaUrl: ctaUrls[type] ?? "",
        dropName: previewDropQuery,
        to: testEmail,
      },
      { method: "post" }
    );
  };

  // ---- Aperçu — rendu reel via email-templates.js (memes fonctions qu'un
  // vrai envoi), pas une reconstitution maison qui pourrait diverger. ----
  const previewDropName = previewDropQuery || "Your Drop";
  useEffect(() => {
    const timer = setTimeout(() => {
      previewFetcher.submit(
        {
          intent: "RENDER_PREVIEW",
          type: openEmailType,
          subject: subjects[openEmailType] || "",
          body: bodies[openEmailType] || "",
          brandName: brandName || defaultShopName,
          mainColor,
          logoUrl: logoUrl || "",
          ctaUrl: ctaUrls[openEmailType] || "",
          dropName: previewDropName,
        },
        { method: "post" }
      );
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line
  }, [openEmailType, subjects[openEmailType], bodies[openEmailType], ctaUrls[openEmailType], brandName, mainColor, logoUrl, previewDropName]);

  return (
    <div style={{ fontFamily: popFontFamily, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {(actionData?.success || actionData?.error) && (
        <div style={{ padding: "20px 20px 0" }}>
          {actionData?.success && actionData?.intent === "SAVE_TEMPLATE" && (
            <div style={{ marginBottom: 12 }}>
              <AutoDismissBanner message="Saved" dismissKey={actionData} />
            </div>
          )}
          {actionData?.error && (
            <div style={{ marginBottom: 12 }}>
              <AutoDismissBanner tone="error" message={actionData.error} dismissKey={actionData} />
            </div>
          )}
        </div>
      )}
      {testFetcher.data?.intent === "SEND_TEST" && (
        <div style={{ padding: "20px 20px 0" }}>
          {testFetcher.data.success && (
            <div style={{ marginBottom: 12 }}>
              <AutoDismissBanner message={`Test sent to ${testFetcher.data.to}`} dismissKey={testFetcher.data} />
            </div>
          )}
          {testFetcher.data.error && (
            <div style={{ marginBottom: 12 }}>
              <AutoDismissBanner tone="error" message={testFetcher.data.error} dismissKey={testFetcher.data} />
            </div>
          )}
        </div>
      )}
      {toggleFetcher.data?.intent === "TOGGLE_ACTIVE" && toggleFetcher.data.error && (
        <div style={{ padding: "20px 20px 0" }}>
          <div style={{ marginBottom: 12 }}>
            <AutoDismissBanner tone="error" message={toggleFetcher.data.error} dismissKey={toggleFetcher.data} />
          </div>
        </div>
      )}

      <div style={{ padding: "16px 20px 0" }}>
        <h1 style={pageHeaderTitleStyle}>Emails</h1>
      </div>

      <BrandBar
        brandName={brandName}
        setBrandName={setBrandName}
        mainColor={mainColor}
        setMainColor={setMainColor}
        logoUrl={logoUrl}
        setLogoUrl={setLogoUrl}
        defaultShopName={defaultShopName}
        drops={drops}
        previewDropQuery={previewDropQuery}
        onPreviewDropQueryChange={handlePreviewDropQueryChange}
      />

      {/* ===== Niveau 1 — onglets horizontaux (groupes = contextes) ===== */}
      <div style={{ display: "flex", gap: 4, padding: "14px 20px 0", borderBottom: "1px solid var(--vd-hairline, #e3e3e3)" }}>
        {GROUPS.map((group) => {
          const locked = isStepLocked(group.id, plan);
          const unlocked = unlockedTypesInGroup(group, plan);
          const inactiveCount = locked ? 0 : unlocked.filter((t) => !activeStates[t]).length;
          const isSelected = selectedGroupId === group.id;
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => {
                setSelectedGroupId(group.id);
                if (!locked) setOpenEmailType(unlocked[0] ?? group.types[0]);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                background: "none",
                border: "none",
                borderBottom: isSelected ? "2px solid var(--vd-ink, #1a1a1a)" : "2px solid transparent",
                marginBottom: -1,
                fontSize: 13.5,
                fontWeight: isSelected ? 700 : 500,
                color: locked ? "var(--vd-ink-3, #8B93A0)" : isSelected ? "var(--vd-ink, #1a1a1a)" : "#6d7175",
                cursor: "pointer",
              }}
            >
              {group.label}
              {locked && (
                <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--vd-ink-3, #8B93A0)" }}>Pro</span>
              )}
              {!locked && inactiveCount > 0 && (
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--vd-sched-fg, #7A5600)" }}>
                  ({inactiveCount} inactive)
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* ===== Niveau 2 — accordéon vertical des e-mails du groupe ===== */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 32px" }}>
          {isStepLocked(selectedGroup.id, plan) ? (
            <LockedGroupPanel planName="Pro" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {selectedGroup.types.map((type, index) => {
                const typeLocked = isStepLocked(
                  type === TYPES.WAITLIST_RANK_UPDATE ? "rank_update" : selectedGroup.id,
                  plan
                );
                if (typeLocked) {
                  return (
                    <LockedCard
                      key={type}
                      title={CONFIG_BY_TYPE[type].title}
                      description={CONFIG_BY_TYPE[type].description}
                      planName="Pro"
                    />
                  );
                }

                const isOpenItem = openEmailType === type;
                const showRail = selectedGroup.types.length > 1;

                return (
                  <div key={type} style={{ display: "flex", gap: 12 }}>
                    {showRail && (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 14, flexShrink: 0 }}>
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            marginTop: 14,
                            flexShrink: 0,
                            background: isOpenItem ? "var(--vd-ink, #14181F)" : "transparent",
                            boxShadow: isOpenItem ? "none" : "inset 0 0 0 1.5px var(--vd-ink-3, #8B93A0)",
                          }}
                        />
                        {index < selectedGroup.types.length - 1 && (
                          <div style={{ width: 1, flex: 1, background: "var(--vd-hairline, #E3E3E3)", marginTop: 6 }} />
                        )}
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isOpenItem ? (
                        <AutomationEditor
                          type={type}
                          config={CONFIG_BY_TYPE[type]}
                          subject={subjects[type]}
                          body={bodies[type]}
                          ctaUrl={ctaUrls[type]}
                          active={activeStates[type]}
                          justActivated={justActivated === type}
                          onSubjectChange={handleSubjectChange}
                          onBodyChange={handleBodyChange}
                          onCtaUrlChange={handleCtaUrlChange}
                          onToggleActive={() => handleToggleActive(type)}
                          onSendTest={() => handleSendTest(type)}
                          isSendingTest={
                            testFetcher.state !== "idle" &&
                            testFetcher.formData?.get("type") === type
                          }
                          canSendTest={canSendTest}
                          testEmail={testEmail}
                          onTestEmailChange={setTestEmail}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setOpenEmailType(type)}
                          style={{
                            ...cardPadded,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "100%",
                            cursor: "pointer",
                            textAlign: "left",
                            font: "inherit",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>{CONFIG_BY_TYPE[type].title}</div>
                            <p style={{ fontSize: 12.5, color: "#6d7175", margin: "4px 0 0 0" }}>{CONFIG_BY_TYPE[type].description}</p>
                          </div>
                          <ActivePill active={activeStates[type]} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ===== APERÇU (sticky) ===== */}
        <div
          style={{
            width: 340,
            flexShrink: 0,
            borderLeft: "1px solid var(--vd-hairline, #e3e3e3)",
            padding: 16,
            overflowY: "auto",
          }}
        >
          <PreviewPanel
            subject={previewFetcher.data?.type === openEmailType ? previewFetcher.data.subject : subjects[openEmailType]}
            html={previewFetcher.data?.type === openEmailType ? previewFetcher.data.html : ""}
            isLoading={previewFetcher.state !== "idle"}
            previewMode={previewMode}
            setPreviewMode={setPreviewMode}
          />
        </div>
      </div>

      {/* ===== Barre de sauvegarde contextuelle (App Bridge) ===== */}
      <ui-save-bar id="vaultd-emails-save-bar" ref={saveBarRef} discardConfirmation="true">
        <button type="button" variant="primary" onClick={handleSaveTemplate} loading={isSaving ? "" : undefined}>
          Save
        </button>
        <button type="button" onClick={handleDiscard}>Discard</button>
      </ui-save-bar>
    </div>
  );
}

/**
 * Barre de marque — logo, nom, couleur, drop d'aperçu, toujours visibles et
 * editables directement (pas de pastille d'etat : ce n'est pas une
 * automatisation, section 8.11).
 */
function BrandBar({
  brandName,
  setBrandName,
  mainColor,
  setMainColor,
  logoUrl,
  setLogoUrl,
  defaultShopName,
  drops,
  previewDropQuery,
  onPreviewDropQueryChange,
}) {
  return (
    <div style={{ padding: "16px 20px 0" }}>
      <div
        style={{
          padding: "16px",
          borderRadius: "var(--vd-radius, 10px)",
          background: "var(--vd-subtle, #F5F6F7)",
          display: "flex",
          gap: "32px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
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
            {logoUrl ? (
              <img src={logoUrl} alt="Logo preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              "Upload"
            )}
            <input
              type="file"
              accept="image/png,image/svg+xml,image/jpeg"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) {
                  setLogoUrl("");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => setLogoUrl(reader.result);
                reader.readAsDataURL(file);
              }}
            />
          </label>
          <span style={{ fontSize: 11, color: "#919191", maxWidth: 90 }}>PNG or SVG, 512px min</span>
        </div>

        <div style={{ flex: 1, minWidth: 160 }}>
          <span style={{ marginBottom: 6, display: "block", fontSize: 13, color: "#6d7175" }}>Brand name</span>
          <input
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder={defaultShopName}
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 160, maxWidth: "260px" }}>
          <span style={{ marginBottom: 6, display: "block", fontSize: 13, color: "#6d7175" }}>Main color</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <style>{`
              .vaultd-color-input::-webkit-color-swatch-wrapper { padding: 0; }
              .vaultd-color-input::-webkit-color-swatch { border: none; border-radius: 7px; }
              .vaultd-color-input::-moz-color-swatch { border: none; border-radius: 7px; }
            `}</style>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", border: "1px solid #C9CCCF", overflow: "hidden", padding: 0, flexShrink: 0 }}>
              <input
                type="color"
                className="vaultd-color-input"
                value={mainColor}
                onChange={(e) => setMainColor(e.target.value)}
                style={{ width: "100%", height: "100%", border: "none", padding: 0, margin: 0, cursor: "pointer", appearance: "none", WebkitAppearance: "none", background: "transparent" }}
              />
            </div>
            <input
              type="text"
              value={mainColor}
              onChange={(e) => setMainColor(e.target.value)}
              placeholder="#000000"
              style={{ ...inputStyle, width: "100%" }}
            />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 160, maxWidth: "260px" }}>
          <span style={{ marginBottom: 6, display: "block", fontSize: 13, color: "#6d7175" }}>
            Preview drop
          </span>
          <input
            type="text"
            list="vaultd-drops-datalist"
            value={previewDropQuery}
            onChange={(e) => onPreviewDropQueryChange(e.target.value)}
            placeholder="Search a drop or paste an ID"
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
          />
          <datalist id="vaultd-drops-datalist">
            {drops.map((d) => (
              <option key={d.externalId} value={d.name} />
            ))}
          </datalist>
        </div>
      </div>
    </div>
  );
}

/**
 * Panneau d'aperçu permanent — rendu HTML reel (email-templates.js), pas une
 * reconstitution maison : ne peut donc pas diverger de ce qui part vraiment.
 */
function PreviewPanel({ subject, html, isLoading, previewMode, setPreviewMode }) {
  const PANEL_W = 300;
  const frameW = previewMode === "mobile" ? 375 : 640;
  const frameH = 900;
  const scale = PANEL_W / frameW;

  return (
    <div style={{ position: "sticky", top: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#919191", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Preview
        </span>
        <div style={{ display: "flex", borderRadius: 7, overflow: "hidden", border: "1px solid var(--vd-hairline, #e3e3e3)" }}>
          <button
            type="button"
            onClick={() => setPreviewMode("desktop")}
            style={{
              padding: "4px 10px",
              border: "none",
              background: previewMode === "desktop" ? "#1a1a1a" : "#ffffff",
              color: previewMode === "desktop" ? "#ffffff" : "#6d7175",
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Desktop
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode("mobile")}
            style={{
              padding: "4px 10px",
              border: "none",
              background: previewMode === "mobile" ? "#1a1a1a" : "#ffffff",
              color: previewMode === "mobile" ? "#ffffff" : "#6d7175",
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Mobile
          </button>
        </div>
      </div>

      <div style={{ fontSize: 10.5, color: "#919191", marginBottom: 3 }}>Subject</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 12, opacity: isLoading ? 0.5 : 1 }}>
        {subject || "(empty subject)"}
      </div>

      <div
        style={{
          width: PANEL_W,
          height: frameH * scale,
          overflow: "hidden",
          borderRadius: 8,
          boxShadow: "var(--vd-ring, 0 0 0 1px rgba(20,24,31,.07))",
          background: "#ffffff",
          opacity: isLoading ? 0.6 : 1,
          transition: "opacity .1s ease",
        }}
      >
        {html && (
          <iframe
            srcDoc={html}
            title="Email preview"
            sandbox=""
            style={{ width: frameW, height: frameH, border: "none", transform: `scale(${scale})`, transformOrigin: "top left" }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Carte d'édition d'une automation (8.3, 8.4, 8.9, 8.15). N'apparait qu'une
 * fois ouverte — la pastille d'etat n'existe donc qu'ici quand elle est
 * ouverte, jamais en double avec la ligne repliee (8.10).
 */
function AutomationEditor({
  type,
  config,
  subject,
  body,
  ctaUrl,
  active,
  justActivated,
  onSubjectChange,
  onBodyChange,
  onCtaUrlChange,
  onToggleActive,
  onSendTest,
  isSendingTest,
  canSendTest,
  testEmail,
  onTestEmailChange,
}) {
  const activeFieldRef = useRef(null); // ref vers le <input>/<textarea> actuellement focus

  const insertTagAtCursor = (tag) => {
    const field = activeFieldRef.current;
    // Seuls objet et message acceptent des tags — l'URL de destination n'en
    // a pas besoin, et y inserer ecrirait dans le mauvais champ d'etat.
    if (!field || (field.name !== "subject" && field.name !== "body")) return;
    const isSubjectField = field.name === "subject";
    const value = isSubjectField ? subject : body;
    const start = field.selectionStart ?? value.length;
    const end = field.selectionEnd ?? value.length;
    const nextValue = value.slice(0, start) + tag + value.slice(end);

    if (isSubjectField) onSubjectChange(type, nextValue);
    else onBodyChange(type, nextValue);

    requestAnimationFrame(() => {
      field.focus();
      const cursor = start + tag.length;
      field.setSelectionRange(cursor, cursor);
    });
  };

  const subjectLen = subject.length;
  const overSubjectLimit = subjectLen > SUBJECT_RECOMMENDED_LIMIT;

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
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <ActivePill active={active} />
          <button
            type="button"
            role="switch"
            aria-checked={active}
            aria-label="Automatic sending"
            onClick={onToggleActive}
            style={toggleSwitchStyle(active)}
          >
            <span style={toggleSwitchKnobStyle(active)} />
          </button>
        </div>
      </div>

      {justActivated && (
        <p style={{ fontSize: 12, color: "#6d7175", marginTop: 8, marginBottom: 0 }}>
          Turned on — it'll send the next time this happens.
        </p>
      )}

      <div>
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--vaultd-accent, #1a1a1a)" }}>Email subject</span>
            <span style={{ fontSize: 11, color: overSubjectLimit ? "#c2410c" : "#919191", ...monoNumberStyle }}>
              {subjectLen} / {SUBJECT_RECOMMENDED_LIMIT}
            </span>
          </div>
          <input
            type="text"
            name="subject"
            onFocus={(e) => { activeFieldRef.current = e.target; }}
            value={subject}
            onChange={(e) => onSubjectChange(type, e.target.value)}
            style={{ ...inputStyle, marginTop: 8 }}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--vaultd-accent, #1a1a1a)" }}>Message content</span>
          <textarea
            name="body"
            rows={8}
            onFocus={(e) => { activeFieldRef.current = e.target; }}
            value={body}
            onChange={(e) => onBodyChange(type, e.target.value)}
            style={{ ...textareaStyle, fontFamily: "var(--vd-sans, inherit)", marginTop: 8 }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginTop: "8px", marginBottom: "20px" }}>
            <span style={{ fontSize: 12, color: "#6d7175" }}>Insert:</span>
            {config.meta.map((tag) => (
              <button
                key={tag}
                type="button"
                className="vd-tag-chip"
                onClick={() => insertTagAtCursor(tag)}
                style={{
                  display: "inline-block",
                  fontSize: "12px",
                  fontFamily: "var(--vd-mono, ui-monospace, monospace)",
                  background: "var(--vd-sched-bg, #FFF4DC)",
                  color: "var(--vd-sched-fg, #7A5600)",
                  border: "1px solid transparent",
                  borderRadius: "6px",
                  padding: "6px 12px",
                  cursor: "pointer",
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {config.ctaLabel && (
          <div style={{ marginTop: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--vaultd-accent, #1a1a1a)" }}>{config.ctaLabel}</span>
            <input
              type="url"
              name="ctaUrl"
              onFocus={(e) => { activeFieldRef.current = e.target; }}
              value={ctaUrl}
              onChange={(e) => onCtaUrlChange(type, e.target.value)}
              placeholder="https://your-store.myshopify.com/products/..."
              style={{ ...inputStyle, marginTop: 8 }}
            />
          </div>
        )}

        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => onTestEmailChange(e.target.value)}
              placeholder="you@example.com"
              style={{ ...inputStyle, width: 220, fontSize: 12.5, padding: "7px 10px" }}
            />
            <button
              type="button"
              disabled={isSendingTest || !canSendTest}
              onClick={onSendTest}
              style={
                isSendingTest || !canSendTest
                  ? { ...secondaryButtonStyle, opacity: 0.5, cursor: "default" }
                  : secondaryButtonStyle
              }
            >
              {isSendingTest ? "Sending…" : "Send a test"}
            </button>
          </div>
          {!canSendTest && (
            <span style={{ fontSize: 11.5, color: "#919191" }}>
              Choose a preview drop above to send a test.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
