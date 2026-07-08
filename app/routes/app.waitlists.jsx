// app/routes/app.waitlists.jsx

import { useLoaderData } from "react-router";
import { useState } from "react";
import {
  pagePopStyle,
  pageHeaderRowStyle,
  pageHeaderTitleRowStyle,
  pageHeaderTitleStyle,
  GridIcon,
  cardPadded,
  cardLabel,
  pillBadge,
  secondaryButtonStyle,
} from "../styles/pop-ui";

// ==========================================
// SERVER: loader – Récupère & trie les données
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
  const drops = await db.drop.findMany({
    where: { shopDomain },
    include: {
      waitlistEntries: { orderBy: [{ score: "desc" }, { createdAt: "asc" }] },
    },
  });

  // Lecture seule : la position/trend est calculée à l'affichage.
  // La mise à jour de lastPosition + l'envoi d'email "rank update" se fait
  // uniquement au moment d'un vrai événement (une inscription/parrainage), dans api.waitlist.jsx.
  const waitlists = drops.map((drop) => {
    const activeEntries = drop.waitlistEntries.filter((e) => !e.unsubscribedAt);
    const unsubscribedEntries = drop.waitlistEntries.filter((e) => e.unsubscribedAt);

    const entries = activeEntries.map((entry, index) => {
      const currentPosition = index + 1;
      const previousPosition = entry.lastPosition;

      let trend = "same";
      if (previousPosition == null) {
        trend = "new";
      } else if (currentPosition < previousPosition) {
        trend = "up";
      } else if (currentPosition > previousPosition) {
        trend = "down";
      }

      return {
        id: entry.id,
        email: entry.email,
        position: currentPosition,
        createdAt: entry.createdAt,
        score: entry.score,
        trend,
      };
    });

    const unsubscribed = unsubscribedEntries.map((entry) => ({
      id: entry.id,
      email: entry.email,
      createdAt: entry.createdAt,
      unsubscribedAt: entry.unsubscribedAt,
    }));

    return {
      dropId: drop.id,
      dropName: drop.name,
      status: drop.status,
      startTime: drop.startTime,
      waitlistSize: entries.length,
      totalWaitlistSize: drop.waitlistEntries.length,
      unsubscribedCount: unsubscribed.length,
      entries,
      unsubscribed,
    };
  });

  return { shopDomain, waitlists };
};

// ==========================================
// CLIENT: UI COMPONENT – Affichage dynamique
// ==========================================
const SORT_OPTIONS = [
  { key: "date", label: "Date" },
  { key: "people", label: "People" },
  { key: "unsubscribed", label: "Unsubscribed" },
];

function sortValue(item, key) {
  switch (key) {
    case "people":
      return item.waitlistSize ?? 0;
    case "unsubscribed":
      return item.unsubscribedCount ?? 0;
    case "date":
    default:
      return item.startTime ? new Date(item.startTime).getTime() : 0;
  }
}

export default function WaitlistsPage() {
  const { shopDomain, waitlists } = useLoaderData();
  const [expandedCards, setExpandedCards] = useState({});
  const [expandedUnsub, setExpandedUnsub] = useState({});

  const [search, setSearch] = useState("");
  const [sortOpen, setSortOpen] = useState(false);
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  const visibleWaitlists = waitlists
    .filter((item) => {
      const query = search.trim().toLowerCase();
      return !query || item.dropName.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      return sortDir === "asc" ? va - vb : vb - va;
    });

  // Styles locaux basiques pour notre tableau d'inscrits
  const tableHeaderStyle = {
    textAlign: "left",
    padding: "10px",
    borderBottom: "2px solid #E1E3E5",
    color: "#5C5F62",
    fontSize: "13px",
    fontWeight: "600",
  };

  const tableRowStyle = {
    borderBottom: "1px solid #E1E3E5",
    fontSize: "14px",
  };

  const tableCellStyle = {
    padding: "10px",
    color: "#202223",
  };

  return (
    <div style={pagePopStyle}>
      <div style={pageHeaderRowStyle}>
        <div style={pageHeaderTitleRowStyle}>
          <GridIcon />
          <h1 style={pageHeaderTitleStyle}>Waitlists</h1>
        </div>
      </div>

      <div style={cardLabel}>ALL ACTIVE QUEUES</div>
      <div>
        {waitlists.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "#6d7175" }}>
            You don’t have any waitlists yet. Create a drop and start
            collecting signups.
          </p>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 16,
                flexWrap: "nowrap",
                position: "relative",
                zIndex: 5,
              }}
            >
              <div style={{ position: "relative", flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>
                <input
                  type="text"
                  placeholder="Search by drop name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    border: "1px solid #c9cccf",
                    borderRadius: 8,
                    fontSize: 13.5,
                    fontFamily: "inherit",
                    color: "#1a1a1a",
                    background: "#ffffff",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ position: "relative", flexGrow: 0, flexShrink: 0, margin: 0 }}>
                <button
                  type="button"
                  onClick={() => setSortOpen((v) => !v)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 14px",
                    border: "1px solid #c9cccf",
                    borderRadius: 8,
                    background: "#ffffff",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#303030",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ display: "inline-flex" }}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <line x1="3" y1="3" x2="11" y2="3" stroke="#505050" strokeWidth="1.4" strokeLinecap="round" />
                      <line x1="3" y1="7" x2="11" y2="7" stroke="#505050" strokeWidth="1.4" strokeLinecap="round" />
                      <line x1="3" y1="11" x2="8" y2="11" stroke="#505050" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span>
                    Sort:{" "}
                    {SORT_OPTIONS.find((o) => o.key === sortKey)?.label}{" "}
                    {sortDir === "desc" ? "↓" : "↑"}
                  </span>
                </button>

                {sortOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      right: 0,
                      background: "#ffffff",
                      border: "1px solid #e0e0e0",
                      borderRadius: 8,
                      boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
                      padding: 6,
                      zIndex: 10,
                      minWidth: 160,
                    }}
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          if (sortKey === opt.key) {
                            setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                          } else {
                            setSortKey(opt.key);
                            setSortDir("desc");
                          }
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          width: "100%",
                          padding: "6px 8px",
                          fontSize: 13,
                          color: sortKey === opt.key ? "#1a1a1a" : "#505050",
                          fontWeight: sortKey === opt.key ? 600 : 400,
                          background: sortKey === opt.key ? "#f2f2f2" : "transparent",
                          border: "none",
                          borderRadius: 6,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span>{opt.label}</span>
                        {sortKey === opt.key && (
                          <span>{sortDir === "desc" ? "↓" : "↑"}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {visibleWaitlists.length === 0 ? (
              <p style={{ fontSize: 13.5, color: "#6d7175" }}>No waitlist matches your search/filters.</p>
            ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {visibleWaitlists.map((item) => (
              <div key={item.dropId} style={cardPadded}>
                {/* CARD HEADER: Informations sur le Drop */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "var(--vaultd-accent, #1a1a1a)" }}>{item.dropName}</span>
                  <span style={pillBadge(item.status === "LIVE" ? "success" : "neutral")}>
                    {item.status}
                  </span>
                </div>
                <p style={{ fontSize: 12.5, color: "#6d7175", margin: "0 0 12px 0" }}>
                  {item.startTime
                    ? `Starts at: ${new Date(item.startTime).toLocaleString()}`
                    : "Start time: Not set"}
                </p>

                {/* CARD BODY: Taille globale */}
                <p style={{ fontSize: 13.5, color: "#303030", margin: "0 0 12px 0" }}>
                  <strong style={{ color: "#1a1a1a" }}>Active:</strong>{" "}
                  {item.waitlistSize}{" "}
                  {item.waitlistSize === 1 ? "customer" : "customers"} waiting
                  {item.unsubscribedCount > 0 && (
                    <>
                      {" · "}
                      <span style={{ color: "#6d7175" }}>
                        {item.unsubscribedCount} unsubscribed
                      </span>
                      {" · "}
                      <span style={{ color: "#6d7175" }}>
                        {item.totalWaitlistSize} total ever joined
                      </span>
                    </>
                  )}
                </p>

                {/* DYNAMIC LIST: Tableau complet des inscrits */}
                <div>
                  {item.entries.length === 0 ? (
                    <p style={{ fontSize: 13, color: "#6d7175" }}>
                      * No users have joined this waitlist yet. *
                    </p>
                  ) : (
                    (() => {
                      const isExpanded = !!expandedCards[item.dropId];
                      const hasMore = item.entries.length > 3;
                      const visibleEntries = isExpanded
                        ? item.entries
                        : item.entries.slice(0, 3);

                      return (
                        <>
                          <div
                            style={{
                              position: "relative",
                              overflowX: "auto",
                              marginTop: "8px",
                              // Replie : ~3 lignes + un peu de la 4e. Deplie : jusqu'a ~10
                              // lignes visibles, puis scrollbar interne au lieu de pousser
                              // le reste de la page vers le bas.
                              maxHeight: isExpanded ? "420px" : "180px",
                              overflowY: isExpanded ? "auto" : "hidden",
                            }}
                          >
                            <table
                              style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                background: "#FFFFFF",
                                borderRadius: "8px",
                              }}
                            >
                              <thead>
                                <tr>
                                  <th style={tableHeaderStyle}>Pos.</th>
                                  <th style={tableHeaderStyle}>Customer Email</th>
                                  <th style={tableHeaderStyle}>Joined At</th>
                                  <th style={tableHeaderStyle}>Referred By</th>
                                </tr>
                              </thead>
                              <tbody>
                                {visibleEntries.map((entry) => (
                                  <tr key={entry.id} style={tableRowStyle}>
                                    <td
                                      style={{
                                        ...tableCellStyle,
                                        fontWeight: "bold",
                                        color: "#007a5a",
                                      }}
                                    >
                                      #{entry.position}
                                    </td>
                                    <td style={tableCellStyle}>{entry.email}</td>
                                    <td
                                      style={{
                                        ...tableCellStyle,
                                        color: "#6D7175",
                                      }}
                                    >
                                      {new Date(entry.createdAt).toLocaleDateString()}{" "}
                                      {new Date(entry.createdAt).toLocaleDateString() ===
                                        new Date().toLocaleDateString()
                                        ? "at " +
                                        new Date(entry.createdAt).toLocaleTimeString([], {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })
                                        : ""}
                                    </td>
                                    <td style={tableCellStyle}>
                                      {entry.trend === "up" && (
                                        <span style={{ color: "#007a5a", fontWeight: "bold" }}>↑</span>
                                      )}
                                      {entry.trend === "down" && (
                                        <span style={{ color: "#c2410c", fontWeight: "bold" }}>↓</span>
                                      )}
                                      {(entry.trend === "same" || entry.trend === "new") && (
                                        <span style={{ color: "#6d7175" }}>•</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {/* Gradient overlay quand replié et qu'il y a plus de 3 entrées */}
                            {!isExpanded && hasMore && (
                              <div
                                style={{
                                  position: "absolute",
                                  bottom: 0,
                                  left: 0,
                                  right: 0,
                                  height: "40px",
                                  background:
                                    "linear-gradient(to bottom, rgba(246,246,247,0), rgba(246,246,247,0.95))",
                                  pointerEvents: "none",
                                }}
                              />
                            )}
                          </div>

                          {/* Bouton See more / See less */}
                          {hasMore && (
                            <div style={{ marginTop: "8px", textAlign: "right" }}>
                              <button
                                type="button"
                                style={{ ...secondaryButtonStyle, padding: "5px 12px", fontSize: 12.5 }}
                                onClick={() => {
                                  setExpandedCards((prev) => ({
                                    ...prev,
                                    [item.dropId]: !prev[item.dropId],
                                  }));
                                }}
                              >
                                {isExpanded
                                  ? "See less"
                                  : `See more (${item.entries.length})`}
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()
                  )}
                </div>

                {/* UNSUBSCRIBED */}
                {item.unsubscribedCount > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#6d7175",
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: 0,
                      }}
                      onClick={() =>
                        setExpandedUnsub((prev) => ({
                          ...prev,
                          [item.dropId]: !prev[item.dropId],
                        }))
                      }
                    >
                      {expandedUnsub[item.dropId] ? "Hide" : "Show"} unsubscribed (
                      {item.unsubscribedCount})
                    </button>

                    {expandedUnsub[item.dropId] && (
                      <div style={{ maxHeight: "420px", overflowY: "auto", marginTop: "8px" }}>
                        <table
                          style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            background: "#FFFFFF",
                            borderRadius: "8px",
                          }}
                        >
                          <thead>
                            <tr>
                              <th style={tableHeaderStyle}>Customer Email</th>
                              <th style={tableHeaderStyle}>Joined At</th>
                              <th style={tableHeaderStyle}>Unsubscribed At</th>
                            </tr>
                          </thead>
                          <tbody>
                            {item.unsubscribed.map((entry) => (
                              <tr key={entry.id} style={tableRowStyle}>
                                <td style={tableCellStyle}>{entry.email}</td>
                                <td style={{ ...tableCellStyle, color: "#6D7175" }}>
                                  {new Date(entry.createdAt).toLocaleDateString()}
                                </td>
                                <td style={{ ...tableCellStyle, color: "#6D7175" }}>
                                  {new Date(entry.unsubscribedAt).toLocaleDateString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}