import { useEffect, useRef, useState } from "react";
import { useLoaderData, useActionData, useSubmit, useSearchParams, Link } from "react-router";
import { authenticate } from "../shopify.server";
import { getAccountForShop } from "../vaultd-account.server";
import {
  listTicketsForShop,
  getTicketForShop,
  createTicket,
  appendMessage,
  resolveTicket,
  markTicketRead,
  notifyOwnerOfNewMessage,
} from "../support.server";
import { SUPPORT_CATEGORIES } from "../support-faq";
import {
  pagePopStyle,
  pageHeaderTitleStyle,
  GridIcon,
  card,
  pillBadge,
  inputStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  backLinkStyle,
} from "../styles/pop-ui";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const account = await getAccountForShop(shopDomain);

  const tickets = await listTicketsForShop(shopDomain);

  return { tickets, plan: account?.plan ?? null };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const account = await getAccountForShop(shopDomain);
  const plan = account?.plan ?? null;
  const customerEmail = account?.email || session.email || null;

  const formData = await request.formData();
  const intent = formData.get("intent");
  const ticketId = (formData.get("ticketId") || "").toString();

  if (intent === "ask_faq") {
    const question = (formData.get("question") || "").toString();
    const answer = (formData.get("answer") || "").toString();
    if (!question || !answer) return { success: false };

    let ticket;
    if (ticketId) {
      ticket = await getTicketForShop(ticketId, shopDomain);
    }
    if (ticket && ticket.status === "OPEN") {
      await appendMessage(ticket.id, "merchant", question);
      await appendMessage(ticket.id, "bot", answer);
    } else {
      ticket = await createTicket({
        shopDomain,
        plan,
        customerEmail,
        firstMessages: [
          { sender: "merchant", body: question },
          { sender: "bot", body: answer },
        ],
      });
    }
    return { success: true, ticketId: ticket.id };
  }

  if (intent === "send_message") {
    const body = (formData.get("body") || "").toString().trim();
    if (!body) return { success: false };

    let ticket;
    if (ticketId) {
      ticket = await getTicketForShop(ticketId, shopDomain);
    }
    if (ticket && ticket.status === "OPEN") {
      await appendMessage(ticket.id, "merchant", body);
    } else {
      ticket = await createTicket({
        shopDomain,
        plan,
        customerEmail,
        firstMessages: [{ sender: "merchant", body }],
      });
    }

    await appendMessage(
      ticket.id,
      "bot",
      "Your request was sent to our team. We'll get back to you by email shortly."
    );
    await notifyOwnerOfNewMessage({ shopDomain, plan, title: ticket.title, body, ticketId: ticket.id });

    return { success: true, ticketId: ticket.id };
  }

  if (intent === "resolve_ticket") {
    await resolveTicket(ticketId, shopDomain);
    return { success: true, ticketId };
  }

  if (intent === "mark_read") {
    await markTicketRead(ticketId, shopDomain);
    return { success: true };
  }

  return { success: false };
};

function Bubble({ sender, body }) {
  const isMerchant = sender === "merchant";
  return (
    <div style={{ display: "flex", justifyContent: isMerchant ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "75%",
          padding: "8px 12px",
          borderRadius: 12,
          fontSize: 13.5,
          whiteSpace: "pre-wrap",
          background: isMerchant ? "var(--vaultd-accent, #1a1a1a)" : "#f2f2f2",
          color: isMerchant ? "#ffffff" : "#1a1a1a",
        }}
      >
        {body}
      </div>
    </div>
  );
}

export default function SupportPage() {
  const { tickets } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const [searchParams, setSearchParams] = useSearchParams();
  const from = searchParams.get("from") === "settings" ? "settings" : "home";
  const backTo = from === "settings" ? "/app/settings" : "/app";
  const selectedTicketId = searchParams.get("ticket");

  const [search, setSearch] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [menuCategory, setMenuCategory] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) || null;
  const isComposing = !selectedTicket || selectedTicket.status === "OPEN";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [selectedTicket?.messages?.length]);

  useEffect(() => {
    if (actionData?.success && actionData.ticketId) {
      setCustomMessage("");
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("ticket", actionData.ticketId);
        return next;
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionData]);

  const handleSelectTicket = (id) => {
    setMenuCategory(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("ticket", id);
      return next;
    });
    // Marque le ticket comme lu si il a une reponse non lue.
    const t = tickets.find((tk) => tk.id === id);
    if (t?.hasUnreadOwnerReply) {
      submit({ intent: "mark_read", ticketId: id }, { method: "post" });
    }
  };

  const handleNewChat = () => {
    setMenuCategory(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("ticket");
      return next;
    });
  };

  const handleAskFaq = (item) => {
    setMenuCategory(null);
    submit(
      { intent: "ask_faq", ticketId: selectedTicketId || "", question: item.question, answer: item.answer },
      { method: "post" }
    );
  };

  const handleSendCustom = (e) => {
    e.preventDefault();
    const trimmed = customMessage.trim();
    if (!trimmed) return;

    if (trimmed.toLowerCase() === "!help") {
      setMenuCategory(null);
      setCustomMessage("");
      return;
    }

    submit(
      { intent: "send_message", ticketId: selectedTicketId || "", body: trimmed },
      { method: "post" }
    );
  };

  const handleOther = () => {
    inputRef.current?.focus();
  };

  const handleResolve = () => {
    if (!selectedTicketId) return;
    submit({ intent: "resolve_ticket", ticketId: selectedTicketId }, { method: "post" });
  };

  const filteredTickets = tickets.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase())
  );

  const activeCategory = SUPPORT_CATEGORIES.find((c) => c.key === menuCategory) || null;

  return (
    <div style={{ ...pagePopStyle, display: "flex", flexDirection: "column", minHeight: "calc(100vh - 64px)" }}>
      <Link to={backTo} style={backLinkStyle}>
        ← Back
      </Link>

      <div style={{ ...card, display: "flex", alignItems: "stretch", flex: 1, minHeight: 0, padding: 0, overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{ width: 260, display: "flex", flexDirection: "column", padding: 14, minHeight: 0, borderRight: "1px solid #e3e3e3" }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            style={{ ...inputStyle, marginBottom: 10, fontSize: 13 }}
          />
          <button type="button" onClick={handleNewChat} style={{ ...primaryButtonStyle, marginBottom: 12 }}>
            + New chat
          </button>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {filteredTickets.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectTicket(t.id)}
                style={{
                  textAlign: "left",
                  border: "none",
                  background: selectedTicketId === t.id ? "#f2f2f2" : "transparent",
                  borderRadius: 8,
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 10.5, color: "#919191", fontFamily: "ui-monospace, monospace" }}>
                    TKT-{t.id.slice(-4).toUpperCase()}
                  </span>
                  <span style={pillBadge(t.status === "OPEN" ? "warning" : "neutral")}>
                    {t.status === "OPEN" ? "Open" : "Resolved"}
                  </span>
                  {t.hasUnreadOwnerReply && (
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#c2410c", flexShrink: 0 }} />
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{t.title}</div>
              </button>
            ))}
            {filteredTickets.length === 0 && (
              <p style={{ fontSize: 12.5, color: "#919191", padding: "0 10px" }}>No conversations yet.</p>
            )}
          </div>
        </div>

        {/* Thread */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 14, minHeight: 0 }}>
          {selectedTicket && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>{selectedTicket.title}</span>
              <span style={pillBadge(selectedTicket.status === "OPEN" ? "warning" : "neutral")}>
                {selectedTicket.status === "OPEN" ? "Open" : "Resolved"}
              </span>
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {!selectedTicket && (
              <p style={{ fontSize: 13, color: "#6d7175" }}>
                Pick a topic below, or describe what's going on. Type <code>!help</code> anytime to see the topics again.
              </p>
            )}
            {selectedTicket?.messages.map((m) => (
              <Bubble key={m.id} sender={m.sender} body={m.body} />
            ))}
            <div ref={bottomRef} />
          </div>

          {isComposing && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {!activeCategory ? (
                <>
                  {SUPPORT_CATEGORIES.map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setMenuCategory(cat.key)}
                      style={{ ...secondaryButtonStyle, padding: "6px 10px", fontSize: 12.5 }}
                    >
                      {cat.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleOther}
                    style={{ ...secondaryButtonStyle, padding: "6px 10px", fontSize: 12.5 }}
                  >
                    Other
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setMenuCategory(null)}
                    style={{ ...secondaryButtonStyle, padding: "6px 10px", fontSize: 12.5 }}
                  >
                    ← All topics
                  </button>
                  {activeCategory.questions.map((item) => (
                    <button
                      key={item.question}
                      type="button"
                      onClick={() => handleAskFaq(item)}
                      style={{ ...secondaryButtonStyle, padding: "6px 10px", fontSize: 12.5 }}
                    >
                      {item.question}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleOther}
                    style={{ ...secondaryButtonStyle, padding: "6px 10px", fontSize: 12.5 }}
                  >
                    Other
                  </button>
                </>
              )}
            </div>
          )}

          {isComposing && (
            <form onSubmit={handleSendCustom} style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                ref={inputRef}
                type="text"
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Other — describe your question, or type !help…"
                style={inputStyle}
              />
              <button type="submit" style={primaryButtonStyle}>
                Send
              </button>
              {selectedTicket && (
                <button type="button" onClick={handleResolve} style={secondaryButtonStyle}>
                  Close chat
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
