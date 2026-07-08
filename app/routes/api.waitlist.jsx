import db from "../db.server";
import {
  sendWaitlistConfirmationEmail,
  sendWaitlistRankUpdateEmail,
} from "../email-automations.server";
import { buildUnsubscribeUrl, buildLogoUrl } from "../unsubscribe.server";
import { checkBotProtection } from "../bot-protection.server";

export const action = async ({ request }) => {
  try {
    const formData = await request.formData();

    const email = (formData.get("email") || "").toString().trim().toLowerCase();
    const externalDropId = (formData.get("dropId") || "").toString().trim();
    const referralCode = (formData.get("ref") || "").toString().trim();
    const intent = formData.get("intent");

    if (intent !== "join") {
      console.error("waitlist: invalid intent", intent);
      return jsonError("Invalid intent", 400);
    }

    if (!email || !externalDropId) {
      console.error("waitlist: missing email or dropId", { email, externalDropId });
      return jsonError("Missing email or dropId", 400);
    }

    // 1) Trouver le Drop par son externalId (celui que tu colles dans le thème)
    const drop = await db.drop.findFirst({
      where: { externalId: externalDropId },
    });

    if (!drop) {
      console.error("waitlist: unknown externalDropId", externalDropId);
      return jsonError("Unknown dropId", 400);
    }

    // Honeypot / timing / rate-limit (toujours actifs) + Turnstile (si
    // active par le marchand). On reste volontairement vague dans la
    // reponse pour ne pas aider un bot a affiner son comportement.
    const botReason = await checkBotProtection(request, formData, drop.shopDomain);
    if (botReason) {
      console.warn("waitlist: blocked submission", botReason, drop.shopDomain);
      return jsonError("Unable to process this request", 400);
    }

    // 2) On travaille maintenant avec drop.id (PK interne) pour WaitlistEntry.dropId
    const dbDropId = drop.id;

    // 3) Vérifier si l'email est déjà inscrit pour ce drop
    let entry = await db.waitlistEntry.findFirst({
      where: { dropId: dbDropId, email },
    });

    let isNewEntry = false;

    if (!entry && drop.maxWaitlistSize != null) {
      const currentCount = await db.waitlistEntry.count({
        where: { dropId: dbDropId, unsubscribedAt: null },
      });
      if (currentCount >= drop.maxWaitlistSize) {
        return jsonError("This waitlist is full", 409);
      }
    }

    // Resoud le parrain (si un code de parrainage valide a ete fourni)
    let referrer = null;
    if (drop.referralEnabled && referralCode) {
      referrer = await db.waitlistEntry.findFirst({
        where: { dropId: dbDropId, referralCode },
      });
    }

    if (!entry) {
      try {
        entry = await db.waitlistEntry.create({
          data: {
            dropId: dbDropId,
            email,
            referredById: referrer && referrer.email !== email ? referrer.id : null,
          },
        });
        isNewEntry = true;
      } catch (err) {
        // En cas de condition de course sur @@unique([dropId, email])
        console.error("waitlist: create failed, trying to read existing", err);
        entry = await db.waitlistEntry.findFirst({
          where: { dropId: dbDropId, email },
        });
      }
    } else if (entry.unsubscribedAt) {
      // Reinscription explicite : on annule la desinscription precedente.
      entry = await db.waitlistEntry.update({
        where: { id: entry.id },
        data: { unsubscribedAt: null },
      });
    }

    // Recompense le parrain : +referralPointsPerShare points de score.
    if (isNewEntry && referrer && drop.referralEnabled) {
      try {
        await db.waitlistEntry.update({
          where: { id: referrer.id },
          data: { score: { increment: drop.referralPointsPerShare } },
        });
      } catch (err) {
        console.error("waitlist: failed to credit referrer score", referrer.id, err);
      }
    }

    // 4) Récupérer les entrées actives de ce drop, triées par score de
    // parrainage (desc) puis date d'inscription (asc), pour calculer la position.
    const entries = await db.waitlistEntry.findMany({
      where: { dropId: dbDropId, unsubscribedAt: null },
      orderBy: [{ score: "desc" }, { createdAt: "asc" }],
    });

    const position = entries.findIndex((e) => e.email === email) + 1;

    // 4bis) Un nouveau parrainage peut changer le classement des autres.
    // On recalcule et on notifie ceux qui montent.
    const rankUpdateAutomation = await db.emailAutomation.findFirst({
      where: { shopDomain: drop.shopDomain, type: "WAITLIST_RANK_UPDATE" },
    });

    await Promise.all(
      entries.map(async (e, index) => {
        const currentPosition = index + 1;
        const previousPosition = e.lastPosition;
        if (previousPosition === currentPosition) return;

        try {
          await db.waitlistEntry.update({
            where: { id: e.id },
            data: { lastPosition: currentPosition, lastPositionUpdatedAt: new Date() },
          });
        } catch (err) {
          console.error("waitlist: failed to update lastPosition for entry", e.id, err);
        }

        const movedUp = previousPosition != null && currentPosition < previousPosition;
        if (movedUp && rankUpdateAutomation && e.email) {
          try {
            await sendWaitlistRankUpdateEmail({
              to: e.email,
              boutiqueName: rankUpdateAutomation.brandName,
              boutiqueLogo: buildLogoUrl(rankUpdateAutomation),
              brandColor: rankUpdateAutomation.mainColor || "#1a1a1a",
              subject: rankUpdateAutomation.subject,
              body: rankUpdateAutomation.body,
              dropName: drop.name,
              position: currentPosition,
              previousPosition,
              unsubscribeUrl: buildUnsubscribeUrl(e.id),
            });
          } catch (err) {
            console.error("waitlist: failed to send rank update email for", e.email, err);
          }
        }
      })
    );

    // 5) Si c'est un nouvel inscrit, envoyer l'email de "Waitlist confirmation"
    if (isNewEntry) {
      try {
        const automation = await db.emailAutomation.findFirst({
          where: {
            shopDomain: drop.shopDomain,
            type: "WAITLIST_CONFIRMATION",
          },
        });

        if (automation) {
          const boutiqueLogo = buildLogoUrl(automation);
          const boutiqueName = automation.brandName || drop.shopDomain;
          const brandColor = automation.mainColor || "#1a1a1a";

          await sendWaitlistConfirmationEmail({
            to: email,
            boutiqueName,
            boutiqueLogo,
            brandColor,
            subject: automation.subject,
            body: automation.body,
            dropName: drop.name,
            position,
            unsubscribeUrl: buildUnsubscribeUrl(entry.id),
          });
        } else {
          console.warn(
            "waitlist: no WAITLIST_CONFIRMATION automation found for shop",
            drop.shopDomain
          );
        }
      } catch (err) {
        console.error(
          "waitlist: failed to send confirmation email for",
          email,
          err
        );
      }
    }

    // 6) Réponse API
    return Response.json({
      success: true,
      rank: position,
      isNewEntry,
      referralCode: drop.referralEnabled ? entry.referralCode : null,
    });
  } catch (error) {
    console.error("waitlist: unhandled error", error);
    return jsonError("Internal error", 500);
  }
};

export const loader = async () => {
  return new Response("Method not allowed", { status: 405 });
};

function jsonError(message, status) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
