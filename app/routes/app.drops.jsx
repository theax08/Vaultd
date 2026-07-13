import { useState, useEffect } from "react";
import {
  useLoaderData,
  useActionData,
  useSubmit,
  useRevalidator,
  useSearchParams,
  Form,
  redirect,
  Link,
} from "react-router";
import crypto from "node:crypto";
import {
  pagePopStyle,
  pageHeaderRowStyle,
  pageHeaderTitleRowStyle,
  pageHeaderTitleStyle,
  GridIcon,
  cardPadded,
  pillBadge,
  primaryButtonStyle,
  secondaryButtonStyle,
  destructiveTextButtonStyle,
  toggleSwitchStyle,
  toggleSwitchKnobStyle,
  modalOverlayStyle,
  modalCardStyle,
} from "../styles/pop-ui";
import { getAccountForShop } from "../vaultd-account.server";
import { PLAN_LIMITS, PLAN_FEATURES } from "../vaultd-plans";

// ==========================================
// SERVER: loader – Récupère les drops
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

  // Auto-launch : verifie si des drops programmes doivent passer en LIVE
  const { runAutoDropLifecycle } = await import("../drop-lifecycle.server");
  await runAutoDropLifecycle(shopDomain);

  const account = await getAccountForShop(shopDomain);
  const plan = account?.plan ?? "FREE";
  const limits = PLAN_LIMITS[plan];

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const dropsThisMonth = await db.drop.count({
    where: { shopDomain, createdAt: { gte: startOfMonth } },
  });

  const dropsLeftThisMonth =
    limits.maxDropsPerMonth == null ? null : Math.max(0, limits.maxDropsPerMonth - dropsThisMonth);

  const canSetWaitlistLimit = PLAN_FEATURES[plan].includes("waitlist_limit");
  const canAutoLaunch = PLAN_FEATURES[plan].includes("automatic_launch");

  // 1) Récupérer tous les drops de cette boutique
  const drops = await db.drop.findMany({
    where: { shopDomain },
    orderBy: { createdAt: "desc" },
  });

  // 2) Pour chacun, charger les entrées de waitlist
  const dropsWithWaitlist = await Promise.all(
    drops.map(async (drop) => {
      const dbDropId = drop.id; // PK interne, liée à WaitlistEntry.dropId

      const entries = await db.waitlistEntry.findMany({
        where: { dropId: dbDropId },
        orderBy: { createdAt: "asc" },
      });

      const preview = entries.map((entry, index) => ({
        email: entry.email,
        position: index + 1,
      }));

      return {
        ...drop,
        waitlistPreview: preview,
      };
    })
  );

  return {
    drops: dropsWithWaitlist,
    shopDomain,
    maxUnitsPerDrop: limits.maxUnitsPerDrop,
    dropsLeftThisMonth,
    canSetWaitlistLimit,
    canAutoLaunch,
  };
};

// ==========================================
// SERVER: action – Gère les requêtes (Create, Update, Delete, Launch, End)
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

  const { session, admin } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent");

  // --- TRAITEMENT LOGIQUE : CREATE OU UPDATE ---
  if (intent === "create" || intent === "update") {
    const dropId = formData.get("dropId");
    const name = (formData.get("name") || "").toString().trim();
    const startTimeRaw = (formData.get("startTime") || "").toString();
    const description = (formData.get("description") || "").toString().trim();
    const productIds = (formData.get("productIds") || "").toString().trim();
    let autoLaunch = formData.get("autoLaunch") === "on";
    const maxWaitlistSizeRaw = (formData.get("maxWaitlistSize") || "").toString().trim();
    const referralEnabled = formData.get("referralEnabled") === "on";
    const referralPointsPerShareRaw = (formData.get("referralPointsPerShare") || "1").toString();

    let errors = {};
    let hasErrors = false;

    // Validation du Nom
    if (!name) {
      errors.name = "Section must be completed*";
      hasErrors = true;
    }

    // Validation des Produits
    if (!productIds) {
      errors.productIds = "Section must be completed*";
      hasErrors = true;
    }

    // Validation de la limite de waitlist (optionnelle)
    let maxWaitlistSize = null;
    if (maxWaitlistSizeRaw) {
      const n = Number.parseInt(maxWaitlistSizeRaw, 10);
      if (!Number.isInteger(n) || n <= 0) {
        errors.maxWaitlistSize = "Must be a positive whole number*";
        hasErrors = true;
      } else {
        maxWaitlistSize = n;
      }
    }

    // Validation des points de parrainage (1 a 3)
    const referralPointsPerShare = Math.min(
      3,
      Math.max(1, Number.parseInt(referralPointsPerShareRaw, 10) || 1)
    );

    // Validation de l'Heure
    let startTime = null;
    if (!startTimeRaw) {
      errors.startTime = "Section must be completed*";
      hasErrors = true;
    } else {
      const isoInput = formData.get("startTimeISO");
      const d = new Date(isoInput || startTimeRaw);
      const now = new Date();

      if (Number.isNaN(d.getTime())) {
        errors.startTime = "Start time must be a valid date/time*";
        hasErrors = true;
      } else if (d < new Date(now.getTime() + 59 * 1000)) {
        errors.startTime =
          "Start time cannot be in the past. It must be scheduled at least 1 minute from now.*";
        hasErrors = true;
      } else {
        startTime = d.toISOString();
      }
    }

    if (hasErrors) {
      return {
        intent,
        errors,
        values: {
          id: dropId,
          name,
          startTime: startTimeRaw,
          description,
          productIds,
          autoLaunch,
          maxWaitlistSize: maxWaitlistSizeRaw,
          referralEnabled,
          referralPointsPerShare,
        },
      };
    }

    // Stock reel disponible pour les produits selectionnes (somme du
    // totalInventory Shopify), pour ne jamais afficher un faux "0 left".
    let maxUnits = await computeTotalInventory(admin, productIds);

    const account = await getAccountForShop(shopDomain);
    const plan = account?.plan ?? "FREE";
    const limits = PLAN_LIMITS[plan];

    // Le plafond d'unites par drop est une limite du forfait, pas du stock
    // Shopify : on ne depasse jamais le stock reel, mais on plafonne en plus
    // si le forfait l'impose (ex. Free = 100 pieces/drop max).
    if (limits.maxUnitsPerDrop != null) {
      maxUnits = Math.min(maxUnits, limits.maxUnitsPerDrop);
    }

    // La limite de waitlist par drop est une fonctionnalite Growth+.
    if (!PLAN_FEATURES[plan].includes("waitlist_limit")) {
      maxWaitlistSize = null;
    }

    // L'auto-launch et l'auto-close sont des fonctionnalites Scale+.
    if (!PLAN_FEATURES[plan].includes("automatic_launch")) {
      autoLaunch = false;
    }

    if (intent === "create") {
      if (limits.maxDropsPerMonth != null) {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const dropsThisMonth = await db.drop.count({
          where: { shopDomain, createdAt: { gte: startOfMonth } },
        });
        if (dropsThisMonth >= limits.maxDropsPerMonth) {
          return {
            intent,
            errors: {
              name: `You've reached your plan's limit of ${limits.maxDropsPerMonth} drop${limits.maxDropsPerMonth > 1 ? "s" : ""}/month. Upgrade your plan to create more.`,
            },
            values: {
              id: dropId,
              name,
              startTime: startTimeRaw,
              description,
              productIds,
              autoLaunch,
              maxWaitlistSize: maxWaitlistSizeRaw,
              referralEnabled,
              referralPointsPerShare,
            },
          };
        }
      }

      // Compte combien de drops existent déjà pour cette boutique
      const existingCount = await db.drop.count({
        where: { shopDomain },
      });

      const index = existingCount + 1;
      const externalId = buildDropExternalId(shopDomain, index);

      await db.drop.create({
        data: {
          shopDomain,
          name,
          status: "DRAFT",
          startTime,
          maxUnits,
          maxWaitlistSize,
          description,
          productIds,
          externalId,
          autoLaunch,
          referralEnabled,
          referralPointsPerShare,
        },
      });
    } else if (intent === "update") {
      // On ne recalcule le stock que si le drop n'a pas encore demarre : une
      // fois LIVE/ENDED, maxUnits doit rester fige (sinon les stats de vente
      // n'auraient plus de sens).
      const existing = await db.drop.findFirst({ where: { id: dropId, shopDomain } });
      const data = {
        name,
        startTime,
        description,
        productIds,
        autoLaunch,
        maxWaitlistSize,
        referralEnabled,
        referralPointsPerShare,
      };
      if (existing?.status === "DRAFT") {
        data.maxUnits = maxUnits;
      }

      await db.drop.update({
        where: { id: dropId },
        data,
      });
    }

    return { intent, success: true };
  }

  // --- TRAITEMENT LOGIQUE : DELETE ---
  if (intent === "delete") {
    const dropId = formData.get("dropId");
    await db.drop.delete({
      where: { id: dropId },
    });
    return { intent, success: true };
  }

  // --- TRAITEMENT LOGIQUE : LAUNCH ---
  if (intent === "launch") {
    const dropId = formData.get("dropId");
    const drop = await db.drop.findFirst({ where: { id: dropId, shopDomain } });
    if (!drop) {
      throw new Response("Drop not found", { status: 404 });
    }

    // Logique partagee avec l'auto-launch : passe en LIVE et notifie la waitlist.
    const { launchDrop } = await import("../drop-lifecycle.server");
    await launchDrop(drop);

    return { intent, success: true };
  }

  // --- TRAITEMENT LOGIQUE : END ---
  if (intent === "end") {
    const dropId = formData.get("dropId");
    if (!dropId) {
      throw new Response("Missing dropId", { status: 400 });
    }

    // 1) Récupérer le drop + ses données liées pour calculer les stats finales
    const drop = await db.drop.findFirst({
      where: { id: dropId, shopDomain },
    });

    if (!drop) {
      throw new Response("Drop not found", { status: 404 });
    }

    // Calcule les stats finales et cloture le drop (logique partagee avec l'auto-end)
    const { endDrop } = await import("../drop-lifecycle.server");
    await endDrop(drop);

    // Rediriger vers la page détail post-drop
    return redirect(`/app/drops-history/detail/${dropId}`);
  }

  return null;
};

// Somme le stock reel (totalInventory) des produits selectionnes pour le
// drop. productIds est une liste de GID Shopify separes par des virgules.
async function computeTotalInventory(admin, productIds) {
  const ids = (productIds || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (ids.length === 0) return 0;

  try {
    const response = await admin.graphql(
      `#graphql
        query DropProductsInventory($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              totalInventory
            }
          }
        }`,
      { variables: { ids } }
    );
    const { data } = await response.json();
    return (data?.nodes || []).reduce(
      (sum, node) => sum + (node?.totalInventory || 0),
      0
    );
  } catch (err) {
    console.error("computeTotalInventory: failed to fetch inventory", err);
    return 0;
  }
}

// Helper pour externalId
function buildDropExternalId(shopDomain, index) {
  // 1) Derive a "shop name" part from the shop domain
  let baseName = shopDomain || "shop";
  const dotIndex = baseName.indexOf(".");
  if (dotIndex !== -1) {
    baseName = baseName.substring(0, dotIndex);
  }

  // 2) Normalize: only keep letters, digits, dashes, underscores
  baseName = baseName
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 20); // avoid super long names

  // 3) Format index on 6 digits: 1 -> "000001"
  const paddedNumber = String(index).padStart(6, "0");

  // 4) For now we always use "a" as the suffix letter
  const suffixLetter = "a";

  return `drop_${baseName}${paddedNumber}${suffixLetter}`;
}

// ==========================================
// CLIENT: UI Component
// ==========================================
export default function DropsPage() {
  const { drops, shopDomain, dropsLeftThisMonth, canSetWaitlistLimit, canAutoLaunch } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const revalidator = useRevalidator();

  const errors = actionData?.errors ?? {};
  const values = actionData?.values ?? {};

  // Pendant que cette page reste ouverte, on revalide periodiquement pour que
  // les drops programmes en auto-launch passent en LIVE, et que les drops LIVE
  // sold-out se cloturent automatiquement, sans avoir a rafraichir.
  useEffect(() => {
    const hasAutoManagedDrop = drops.some(
      (d) => d.autoLaunch && (d.status === "DRAFT" || d.status === "LIVE")
    );
    if (!hasAutoManagedDrop) return;

    const intervalId = setInterval(() => {
      if (revalidator.state === "idle") {
        revalidator.revalidate();
      }
    }, 30000);

    return () => clearInterval(intervalId);
  }, [drops, revalidator]);

  // États de l'éditeur principal
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState("create"); // "create" ou "edit"
  const [currentDropId, setCurrentDropId] = useState(null);

  // États pour les formulaires de l'éditeur
  const [dropName, setDropName] = useState("");
  const [descriptionText, setDescriptionText] = useState("");
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [displayDateText, setDisplayDateText] = useState("");
  const [isoDateText, setIsoDateText] = useState("");
  const [autoLaunchEnabled, setAutoLaunchEnabled] = useState(false);
  const [maxWaitlistSizeText, setMaxWaitlistSizeText] = useState("");
  const [referralEnabled, setReferralEnabled] = useState(true);
  const [referralPointsPerShare, setReferralPointsPerShare] = useState(1);

  // États du sélecteur de date imbriqué
  const [isStartPickerOpen, setIsStartPickerOpen] = useState(false);
  const [pickerDate, setPickerDate] = useState("");
  const [pickerTime, setPickerTime] = useState("");

  // État de la boîte de dialogue de confirmation de suppression
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [dropToDelete, setDropToDelete] = useState(null);

  const handleSelectProducts = async () => {
    const selected = await window.shopify.resourcePicker({
      type: "product",
      multiple: true,
      action: "select",
    });

    if (selected && selected.length > 0) {
      const productsData = selected.map((p) => ({
        id: p.id,
        title: p.title,
      }));
      setSelectedProducts(productsData);
    }
  };

  // Synchronisation des réponses de l'action serveur
  useEffect(() => {
    if (actionData?.success) {
      setIsEditorOpen(false);
      setIsDeleteConfirmOpen(false);
      setDropToDelete(null);
      resetEditorFields();
    } else if (actionData?.errors) {
      setIsEditorOpen(true);
    }
  }, [actionData]);

  const resetEditorFields = () => {
    setCurrentDropId(null);
    setDropName("");
    setDescriptionText("");
    setSelectedProducts([]);
    setDisplayDateText("");
    setIsoDateText("");
    setPickerDate("");
    setPickerTime("");
    setAutoLaunchEnabled(false);
    setMaxWaitlistSizeText("");
    setReferralEnabled(true);
    setReferralPointsPerShare(1);
  };

  // Ouverture en mode création
  const openCreateEditor = () => {
    resetEditorFields();
    setEditorMode("create");
    setIsEditorOpen(true);
  };

  // Lien profond depuis le Dashboard ("Create drop" -> /app/drops?new=1) :
  // ouvre directement l'editeur de creation au chargement de la page.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      if (dropsLeftThisMonth !== 0) openCreateEditor();
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("new");
        return next;
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ouverture en mode édition pré-remplie
  const openEditEditor = (drop) => {
    resetEditorFields();
    setEditorMode("edit");
    setCurrentDropId(drop.id);
    setDropName(drop.name);
    setDescriptionText(drop.description || "");

    if (drop.startTime) {
      const d = new Date(drop.startTime);
      setIsoDateText(drop.startTime);

      const options = {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      };
      setDisplayDateText(d.toLocaleString("en-US", options));

      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const min = String(d.getMinutes()).padStart(2, "0");
      setPickerDate(`${yyyy}-${mm}-${dd}`);
      setPickerTime(`${hh}:${min}`);
    }

    if (drop.productIds) {
      const placeholderProducts = drop.productIds
        .split(",")
        .map((id) => ({
          id,
          title: `Product ID: ${id.substring(0, 12)}...`,
        }));
      setSelectedProducts(placeholderProducts);
    }

    setAutoLaunchEnabled(Boolean(drop.autoLaunch));
    setMaxWaitlistSizeText(
      drop.maxWaitlistSize != null ? String(drop.maxWaitlistSize) : ""
    );
    setReferralEnabled(drop.referralEnabled !== false);
    setReferralPointsPerShare(drop.referralPointsPerShare || 1);

    setIsEditorOpen(true);
  };

  const cancelEditor = () => {
    setIsEditorOpen(false);
    setIsStartPickerOpen(false);
    resetEditorFields();
  };

  const openStartPicker = () => {
    setIsStartPickerOpen(true);
  };
  const cancelStartPicker = () => {
    setIsStartPickerOpen(false);
  };

  const confirmStartPicker = () => {
    if (!pickerDate || !pickerTime) {
      alert("Please select both a date and a time.");
      return;
    }

    const targetDateTime = new Date(`${pickerDate}T${pickerTime}`);
    const now = new Date();
    const minimumAllowedTime = new Date(now.getTime() + 60 * 1000);

    if (targetDateTime < minimumAllowedTime) {
      alert(
        "Security Block: Start time cannot be in the past. It must be scheduled at least 1 minute from now."
      );
      return;
    }

    const options = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    };
    const formattedEnglish = targetDateTime.toLocaleString(
      "en-US",
      options
    );

    setDisplayDateText(formattedEnglish);
    setIsoDateText(targetDateTime.toISOString());
    setIsStartPickerOpen(false);
  };

  const handleSaveDrop = (event) => {
    event.preventDefault();
    const formElement = document.getElementById("drop-editor-form");
    if (formElement) {
      submit(formElement);
    }
  };

  // Gestionnaires pour la suppression sécurisée
  const triggerDeleteConfirm = (dropId, dropName) => {
    setDropToDelete({ id: dropId, name: dropName });
    setIsDeleteConfirmOpen(true);
  };

  const handleDeleteDrop = () => {
    if (!dropToDelete) return;
    const formData = new FormData();
    formData.append("intent", "delete");
    formData.append("dropId", dropToDelete.id);
    submit(formData, { method: "post" });
  };

  return (
    <div style={pagePopStyle}>
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "flex-end" }}>
        {dropsLeftThisMonth === 0 ? (
          <button type="button" disabled style={{ ...primaryButtonStyle, opacity: 0.55, cursor: "default" }}>
            Drop limit reached for this month
          </button>
        ) : (
          <button type="button" onClick={openCreateEditor} style={primaryButtonStyle}>
            Create drop
          </button>
        )}
      </div>

      {dropsLeftThisMonth !== null && (
        <p style={{ fontSize: 12.5, color: dropsLeftThisMonth === 0 ? "#c2410c" : "#919191", margin: "0 0 10px 0" }}>
          {dropsLeftThisMonth} drop{dropsLeftThisMonth === 1 ? "" : "s"} left this month
        </p>
      )}
      <div style={{ marginBottom: dropsLeftThisMonth !== null ? 6 : 16 }} />

        {drops.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "#6d7175" }}>
            You don't have any drops yet. Click "Create drop" to get
            started.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {drops.map((drop) => (
              <div key={drop.id} style={cardPadded}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    marginBottom: 10,
                  }}
                >
                  {/* Partie gauche : nom + status */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)" }}>
                        {drop.name}
                      </span>
                      <span
                        style={pillBadge(
                          drop.status === "LIVE"
                            ? "success"
                            : drop.status === "ENDED"
                            ? "neutral"
                            : "warning"
                        )}
                      >
                        {drop.status}
                      </span>
                    </div>
                  </div>

                  {/* Partie droite : Drop ID + Copy */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    {drop.externalId ? (
                      <>
                        <span style={{ fontSize: 12, color: "#6d7175" }}>
                          ID: {drop.externalId}
                        </span>
                        <button
                          type="button"
                          style={secondaryButtonStyle}
                          onClick={() => {
                            navigator.clipboard
                              .writeText(drop.externalId)
                              .catch((err) => {
                                console.error(
                                  "Failed to copy drop ID",
                                  err
                                );
                              });
                          }}
                        >
                          Copy
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: "#6d7175" }}>ID not set</span>
                    )}
                  </div>
                </div>

                <p style={{ fontSize: 13, color: "#303030", margin: "0 0 4px 0" }}>
                  <strong style={{ color: "#1a1a1a" }}>Start time: </strong>
                  {drop.startTime
                    ? new Date(drop.startTime).toLocaleString("en-US")
                    : "Not set"}
                </p>
                <p style={{ fontSize: 13, color: "#303030", margin: "0 0 12px 0" }}>
                  <strong style={{ color: "#1a1a1a" }}>Description: </strong>
                  {drop.description || "No description yet"}
                </p>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {drop.status === "DRAFT" && (
                    <>
                      {/* LAUNCH DROP */}
                      <Form
                        method="post"
                        id={`launch-form-${drop.id}`}
                        style={{ display: "inline" }}
                      >
                        <input
                          type="hidden"
                          name="intent"
                          value="launch"
                        />
                        <input
                          type="hidden"
                          name="dropId"
                          value={drop.id}
                        />
                        <button
                          type="button"
                          style={primaryButtonStyle}
                          onClick={(e) => {
                            e.preventDefault();
                            const form =
                              document.getElementById(
                                `launch-form-${drop.id}`
                              );
                            if (form) submit(form);
                          }}
                        >
                          Launch drop
                        </button>
                      </Form>

                      {/* EDIT DROP */}
                      <button
                        type="button"
                        style={secondaryButtonStyle}
                        onClick={() => openEditEditor(drop)}
                      >
                        Edit drop
                      </button>
                    </>
                  )}

                  {drop.status === "LIVE" && (
                    <Link
                      to={`/app/live?dropId=${drop.id}`}
                      style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}
                    >
                      Open live dashboard
                    </Link>
                  )}

                  {drop.status === "ENDED" && (
                    <span style={{ fontSize: 12, color: "#6d7175" }}>
                      Drop ended · Post-drop analytics will be
                      available in the History section
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      {/* MODALE MUTANTE : CREATE OU EDIT DROP */}
      {isEditorOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)", margin: "0 0 16px 0" }}>
              {editorMode === "create"
                ? "Create a new drop"
                : `Edit Drop: ${dropName}`}
            </h2>
              <Form method="post" id="drop-editor-form">
                <input
                  type="hidden"
                  name="intent"
                  value={
                    editorMode === "edit" ? "update" : "create"
                  }
                />
                {editorMode === "edit" && (
                  <input
                    type="hidden"
                    name="dropId"
                    value={currentDropId}
                  />
                )}
                <input
                  type="hidden"
                  name="productIds"
                  value={selectedProducts
                    .map((p) => p.id)
                    .join(",")}
                />
                <input
                  type="hidden"
                  name="startTimeISO"
                  value={isoDateText}
                />

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* DROP NAME */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)" }}>
                        Drop Name
                      </span>
                    </div>
                    <input
                      name="name"
                      style={inputStyleWithError(!!errors.name)}
                      type="text"
                      value={dropName}
                      onChange={(e) =>
                        setDropName(e.target.value)
                      }
                      placeholder="e.g. Noir Hoodie Drop"
                    />
                    {errors.name && (
                      <div style={inputErrorTextStyle}>
                        {errors.name}
                      </div>
                    )}
                  </div>

                  {/* START TIME */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)" }}>
                        Start time
                      </span>
                    </div>
                    <div
                      style={{
                        position: "relative",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <input
                        name="startTime"
                        style={inputStyleWithError(
                          !!errors.startTime
                        )}
                        type="text"
                        value={displayDateText}
                        readOnly
                        placeholder="Select start date and time..."
                      />
                      <div
                        style={{
                          position: "absolute",
                          right: "12px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        onClick={openStartPicker}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <rect
                            x="3"
                            y="4"
                            width="18"
                            height="18"
                            rx="3"
                            stroke="#5C5F62"
                            strokeWidth="1.5"
                          />
                          <path
                            d="M8 2V6"
                            stroke="#5C5F62"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                          <path
                            d="M16 2V6"
                            stroke="#5C5F62"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                          <path
                            d="M3 10H21"
                            stroke="#5C5F62"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </div>
                    </div>
                    {errors.startTime && (
                      <div style={inputErrorTextStyle}>
                        {errors.startTime}
                      </div>
                    )}
                  </div>

                  {/* AUTO-LAUNCH & AUTO-CLOSE — Scale+ only */}
                  <div style={{ marginBottom: 14 }}>
                    {canAutoLaunch ? (
                      <>
                        <input
                          type="checkbox"
                          name="autoLaunch"
                          checked={autoLaunchEnabled}
                          onChange={() => {}}
                          style={{ display: "none" }}
                          tabIndex={-1}
                          readOnly
                        />
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "2px 0",
                          }}
                        >
                          <span style={{ fontWeight: 600, color: "#1a1a1a" }}>
                            Auto-launch &amp; auto-close
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={autoLaunchEnabled}
                            onClick={() => setAutoLaunchEnabled((v) => !v)}
                            style={toggleSwitchStyle(autoLaunchEnabled)}
                          >
                            <span style={toggleSwitchKnobStyle(autoLaunchEnabled)} />
                          </button>
                        </div>
                        {autoLaunchEnabled && (
                          <p style={{ fontSize: 12, color: "#6d7175", margin: "4px 0 0 0" }}>
                            Launches at the scheduled time. Closes automatically once all units are sold (5-minute grace period).
                          </p>
                        )}
                      </>
                    ) : (
                      <div>
                        <span style={{ fontWeight: 600, color: "#919191" }}>
                          Auto-launch &amp; auto-close
                        </span>
                        <p style={{ fontSize: 12.5, color: "#919191", margin: "4px 0 0 0" }}>
                          Available on Scale and above.{" "}
                          <a href="/app/plans" style={{ color: "#1a1a1a", fontWeight: 600 }}>View plans →</a>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* WAITLIST LIMIT — Growth+ only */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, color: canSetWaitlistLimit ? "var(--vaultd-accent, #1a1a1a)" : "#919191" }}>
                        Waitlist limit
                      </span>
                    </div>
                    {canSetWaitlistLimit ? (
                      <>
                        <input
                          name="maxWaitlistSize"
                          style={inputStyleWithError(!!errors.maxWaitlistSize)}
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          value={maxWaitlistSizeText}
                          onChange={(e) =>
                            setMaxWaitlistSizeText(e.target.value)
                          }
                          placeholder="Unlimited"
                        />
                        {errors.maxWaitlistSize && (
                          <div style={inputErrorTextStyle}>
                            {errors.maxWaitlistSize}
                          </div>
                        )}
                      </>
                    ) : (
                      <p style={{ fontSize: 12.5, color: "#919191", margin: 0 }}>
                        Available on Growth and above.{" "}
                        <a href="/app/plans" style={{ color: "#1a1a1a", fontWeight: 600 }}>View plans →</a>
                      </p>
                    )}
                  </div>

                  {/* PARRAINAGE */}
                  <div style={{ marginBottom: 14 }}>
                    <input
                      type="checkbox"
                      name="referralEnabled"
                      checked={referralEnabled}
                      onChange={() => {}}
                      style={{ display: "none" }}
                      tabIndex={-1}
                      readOnly
                    />
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "2px 0",
                      }}
                    >
                      <span style={{ fontWeight: 600, color: "#1a1a1a" }}>
                        Allow waitlist referrals
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={referralEnabled}
                        onClick={() => setReferralEnabled((v) => !v)}
                        style={toggleSwitchStyle(referralEnabled)}
                      >
                        <span style={toggleSwitchKnobStyle(referralEnabled)} />
                      </button>
                    </div>

                    {referralEnabled && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginTop: 8,
                        }}
                      >
                        <span style={{ color: "#6d7175" }}>
                          Positions gained per successful referral
                        </span>
                        <input
                          type="hidden"
                          name="referralPointsPerShare"
                          value={referralPointsPerShare}
                        />
                        <div style={{ display: "flex", gap: 4 }}>
                          {[1, 2, 3].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setReferralPointsPerShare(n)}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                border: "1px solid #c9cccf",
                                background:
                                  referralPointsPerShare === n
                                    ? "var(--vaultd-accent, #1a1a1a)"
                                    : "#ffffff",
                                color:
                                  referralPointsPerShare === n
                                    ? "#ffffff"
                                    : "#303030",
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              +{n}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SÉLECTION DES PRODUITS */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)" }}>
                        Select the products for the drop
                      </span>
                    </div>
                    <div
                      style={{
                        marginBottom: "8px",
                        padding: errors.productIds
                          ? "8px"
                          : "0",
                        borderRadius: "8px",
                        background: errors.productIds
                          ? "#FFF5F5"
                          : "transparent",
                        border: errors.productIds
                          ? "1px solid #D72C0D"
                          : "none",
                      }}
                    >
                      <button
                        type="button"
                        style={secondaryButtonStyle}
                        onClick={handleSelectProducts}
                      >
                        Select Products...
                      </button>
                    </div>
                    {errors.productIds && (
                      <div style={inputErrorTextStyle}>
                        {errors.productIds}
                      </div>
                    )}

                    {selectedProducts.length === 0 ? (
                      <span style={{ color: "#6d7175" }}>
                        No products attached yet. This drop will not
                        appear on any page.
                      </span>
                    ) : (
                      <div
                        style={{
                          background: "#F6F6F7",
                          padding: "8px 12px",
                          borderRadius: "8px",
                          border:
                            "1px solid #EDEDF0",
                          marginTop: "8px",
                        }}
                      >
                        <span style={{ fontWeight: 700, color: "#007a5a" }}>
                          Selected ({selectedProducts.length}) :
                        </span>
                        <ul
                          style={{
                            margin: "4px 0 0 0",
                            paddingLeft: "20px",
                            fontSize: "13px",
                            color: "#202223",
                          }}
                        >
                          {selectedProducts.map((p) => (
                            <li key={p.id}>{p.title}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* DESCRIPTION */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)" }}>
                        Description
                      </span>
                    </div>
                    <textarea
                      name="description"
                      style={{
                        ...inputBaseStyle,
                        minHeight: "72px",
                      }}
                      value={descriptionText}
                      onChange={(e) =>
                        setDescriptionText(e.target.value)
                      }
                      placeholder="Short description of the drop (optional)"
                    />
                  </div>

                  {/* FOOTER ACTIONS */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: "8px",
                    }}
                  >
                    <div style={{ display: "flex", gap: 10 }}>
                      <button type="button" style={primaryButtonStyle} onClick={handleSaveDrop}>
                        {editorMode === "create"
                          ? "Save drop"
                          : "Update drop"}
                      </button>
                      <button type="button" style={secondaryButtonStyle} onClick={cancelEditor}>
                        Cancel
                      </button>
                    </div>

                    {editorMode === "edit" && (
                      <button
                        type="button"
                        style={destructiveTextButtonStyle}
                        onClick={() =>
                          triggerDeleteConfirm(
                            currentDropId,
                            dropName
                          )
                        }
                      >
                        Delete drop
                      </button>
                    )}
                  </div>
                </div>
              </Form>
          </div>
        </div>
      )}

      {/* DATE-TIME PICKER OVERLAY */}
      {isEditorOpen && isStartPickerOpen && (
        <div style={modalOverlayStyle}>
          <div style={{ ...modalCardStyle, width: "320px", zIndex: 1100 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)", margin: "0 0 16px 0" }}>
              Select start date &amp; time
            </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)" }}>Date</span>
                  </div>
                  <input
                    type="date"
                    style={inputBaseStyle}
                    value={pickerDate}
                    onChange={(e) =>
                      setPickerDate(e.target.value)
                    }
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)" }}>Time</span>
                  </div>
                  <input
                    type="time"
                    style={inputBaseStyle}
                    value={pickerTime}
                    onChange={(e) =>
                      setPickerTime(e.target.value)
                    }
                  />
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" style={primaryButtonStyle} onClick={confirmStartPicker}>
                    Confirm
                  </button>
                  <button type="button" style={secondaryButtonStyle} onClick={cancelStartPicker}>
                    Cancel
                  </button>
                </div>
              </div>
          </div>
        </div>
      )}

      {/* MODALE DE CONFIRMATION DE SUPPRESSION */}
      {isDeleteConfirmOpen && dropToDelete && (
        <div
          style={{
            ...modalOverlayStyle,
            zIndex: 2000,
          }}
        >
          <div
            style={{
              ...modalCardStyle,
              width: "420px",
              borderTop: "4px solid #c2410c",
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)", margin: "0 0 16px 0" }}>
              Are you absolutely sure?
            </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ marginBottom: 6 }}>
                  You are about to permanently delete the
                  drop{" "}
                  <span style={{ fontWeight: 700, color: "#1a1a1a" }}>
                    "{dropToDelete.name}"
                  </span>{" "}
                  and its associated waitlist queue.
                </div>
                <div
                  style={{
                    color: "#c2410c",
                    fontSize: "13px",
                    fontWeight: "500",
                  }}
                >
                  ⚠️ This action cannot be undone. All
                  customer records attached to this drop
                  queue will be lost.
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "12px",
                    marginTop: "16px",
                  }}
                >
                  <button type="button" style={secondaryButtonStyle} onClick={() => setIsDeleteConfirmOpen(false)}>
                    Cancel
                  </button>
                  <button type="button" style={primaryButtonStyle} onClick={handleDeleteDrop}>
                    Delete
                  </button>
                </div>
              </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// STYLES EXTERNES
// ==========================================
const globalFontFamily =
  '-apple-system, BlinkMacSystemFont, "San Francisco", "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

const inputBaseStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  border: "1px solid #BABFC3",
  marginTop: "4px",
  fontSize: "14px",
  boxSizing: "border-box",
  fontFamily: globalFontFamily,
};

const inputStyleWithError = (hasErr) => ({
  ...inputBaseStyle,
  border: hasErr ? "1px solid #D72C0D" : "1px solid #BABFC3",
  background: hasErr ? "#FFF5F5" : "#FFF",
});

const inputErrorTextStyle = {
  color: "#D72C0D",
  fontSize: "12px",
  marginTop: "4px",
  fontWeight: "500",
  fontFamily: globalFontFamily,
};