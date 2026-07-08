// Inbox support transverse (toutes boutiques), reserve a toi : ce n'est PAS
// une route embarquee Shopify (pas de session marchand), juste une page
// protegee par une cle partagee dans l'URL. Sert a repondre aux tickets
// "Other" qui ont besoin d'une vraie reponse humaine, en priorisant par
// plan (Elite d'abord).
import { useState } from "react";
import { useLoaderData, useActionData, useSubmit, Form } from "react-router";
import db from "../db.server";
import { addOwnerReplyToTicket } from "../support.server";
import {
  pagePopStyle,
  pageHeaderTitleStyle,
  card,
  cardLabel,
  pillBadge,
  inputStyle,
  textareaStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from "../styles/pop-ui";
import { PLAN_ORDER } from "../vaultd-plans";

function checkKey(url) {
  const provided = url.searchParams.get("key");
  return Boolean(process.env.ADMIN_SUPPORT_SECRET) && provided === process.env.ADMIN_SUPPORT_SECRET;
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  if (!checkKey(url)) {
    return { authorized: false };
  }

  const tickets = await db.supportTicket.findMany({
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  const planRank = (plan) => PLAN_ORDER.indexOf(plan);
  tickets.sort((a, b) => {
    if (a.status !== b.status) return a.status === "OPEN" ? -1 : 1;
    return planRank(b.plan) - planRank(a.plan);
  });

  return { authorized: true, tickets, key: url.searchParams.get("key") };
};

export const action = async ({ request }) => {
  const url = new URL(request.url);
  if (!checkKey(url)) {
    return { success: false, error: "Unauthorized" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");
  const ticketId = (formData.get("ticketId") || "").toString();

  if (intent === "reply") {
    const body = (formData.get("body") || "").toString().trim();
    if (!body || !ticketId) return { success: false };

    const ticket = await addOwnerReplyToTicket(ticketId, body);
    if (!ticket) return { success: false, error: "Ticket not found" };

    return { success: true };
  }

  if (intent === "resolve") {
    await db.supportTicket.update({ where: { id: ticketId }, data: { status: "RESOLVED" } });
    return { success: true };
  }

  return { success: false };
};

function Bubble({ sender, body }) {
  const isOwner = sender === "owner";
  return (
    <div style={{ display: "flex", justifyContent: isOwner ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "80%",
          padding: "8px 12px",
          borderRadius: 12,
          fontSize: 13.5,
          whiteSpace: "pre-wrap",
          background: isOwner ? "#1a1a1a" : "#f2f2f2",
          color: isOwner ? "#ffffff" : "#1a1a1a",
        }}
      >
        {body}
      </div>
    </div>
  );
}

export default function AdminSupportInbox() {
  const data = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const [selectedId, setSelectedId] = useState(null);
  const [reply, setReply] = useState("");

  if (!data.authorized) {
    return (
      <div style={{ ...pagePopStyle, padding: 40, maxWidth: 360 }}>
        <h1 style={pageHeaderTitleStyle}>Vaultd support inbox</h1>
        <Form method="get" style={{ marginTop: 16 }}>
          <input type="password" name="key" placeholder="Access key" style={inputStyle} />
          <button type="submit" style={{ ...primaryButtonStyle, marginTop: 10, width: "100%" }}>
            Enter
          </button>
        </Form>
      </div>
    );
  }

  const { tickets } = data;
  const selected = tickets.find((t) => t.id === selectedId) || null;

  const handleReply = (e) => {
    e.preventDefault();
    if (!reply.trim() || !selected) return;
    submit({ intent: "reply", ticketId: selected.id, body: reply.trim() }, { method: "post" });
    setReply("");
  };

  return (
    <div style={{ ...pagePopStyle, padding: 24 }}>
      <h1 style={{ ...pageHeaderTitleStyle, color: "#1a1a1a", marginBottom: 16 }}>Support inbox</h1>
      <div style={{ display: "flex", gap: 14, height: 600 }}>
        <div style={{ ...card, width: 320, padding: 12, overflowY: "auto" }}>
          {tickets.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                border: "none",
                background: selectedId === t.id ? "#f2f2f2" : "transparent",
                borderRadius: 8,
                padding: "10px",
                marginBottom: 4,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                <span style={pillBadge(t.plan === "ELITE" ? "success" : "neutral")}>{t.plan}</span>
                <span style={pillBadge(t.status === "OPEN" ? "warning" : "neutral")}>{t.status}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{t.title}</div>
              <div style={{ fontSize: 11.5, color: "#919191" }}>{t.shopDomain}</div>
            </button>
          ))}
        </div>

        <div style={{ ...card, flex: 1, padding: 14, display: "flex", flexDirection: "column" }}>
          {!selected ? (
            <p style={{ fontSize: 13, color: "#6d7175" }}>Select a ticket.</p>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <div style={cardLabel}>{selected.shopDomain} · {selected.plan}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{selected.title}</div>
                {selected.customerEmail && (
                  <div style={{ fontSize: 12, color: "#6d7175" }}>{selected.customerEmail}</div>
                )}
              </div>
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {selected.messages.map((m) => (
                  <Bubble key={m.id} sender={m.sender} body={m.body} />
                ))}
              </div>
              {actionData?.error && <p style={{ color: "#c2410c", fontSize: 12.5 }}>{actionData.error}</p>}
              <form onSubmit={handleReply} style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Reply to merchant…"
                  rows={2}
                  style={{ ...textareaStyle, flex: 1 }}
                />
                <button type="submit" style={primaryButtonStyle}>Send</button>
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={() => submit({ intent: "resolve", ticketId: selected.id }, { method: "post" })}
                >
                  Mark resolved
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
