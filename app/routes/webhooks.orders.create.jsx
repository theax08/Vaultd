import { authenticate } from "../shopify.server";
import db from "../db.server";

// Convertit un id numerique Shopify (line_item.product_id) en GID,
// car app.drops.jsx stocke Drop.productIds sous forme de GIDs
// ("gid://shopify/Product/123") venus du resourcePicker.
function toProductGid(numericId) {
  return `gid://shopify/Product/${numericId}`;
}

export const action = async ({ request }) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const order = payload;
  const lineItems = Array.isArray(order.line_items) ? order.line_items : [];

  if (lineItems.length === 0) {
    return new Response();
  }

  // 1) Trouver un drop LIVE de cette boutique dont au moins un produit
  // de la commande fait partie de la selection du drop.
  const liveDrops = await db.drop.findMany({
    where: { shopDomain: shop, status: "LIVE" },
  });

  const orderedProductGids = new Set(
    lineItems.map((li) => toProductGid(li.product_id)).filter(Boolean)
  );

  const matchingDrop = liveDrops.find((drop) => {
    if (!drop.productIds) return false;
    const dropProductIds = drop.productIds.split(",").map((id) => id.trim());
    return dropProductIds.some((id) => orderedProductGids.has(id));
  });

  if (!matchingDrop) {
    // Commande hors drop : rien a faire ici.
    return new Response();
  }

  // 2) Idempotence : un webhook peut etre livre plusieurs fois.
  const existingOrder = await db.dropOrder.findUnique({
    where: {
      dropId_shopifyOrderId: { dropId: matchingDrop.id, shopifyOrderId: String(order.id) },
    },
  });

  if (existingOrder) {
    return new Response();
  }

  const dropProductIds = new Set(
    matchingDrop.productIds.split(",").map((id) => id.trim())
  );
  const matchingLineItems = lineItems.filter((li) =>
    dropProductIds.has(toProductGid(li.product_id))
  );

  const itemCount = matchingLineItems.reduce(
    (sum, li) => sum + Number(li.quantity || 0),
    0
  );
  const totalAmount = matchingLineItems.reduce(
    (sum, li) => sum + Number(li.price || 0) * Number(li.quantity || 0),
    0
  );

  const customerEmail = order.email || order.contact_email || null;

  let fromWaitlist = false;
  if (customerEmail) {
    const waitlistEntry = await db.waitlistEntry.findFirst({
      where: { dropId: matchingDrop.id, email: customerEmail.toLowerCase() },
    });
    fromWaitlist = Boolean(waitlistEntry);
  }

  const firstProductName =
    matchingLineItems[0]?.name || matchingLineItems[0]?.title || null;

  await db.dropOrder.create({
    data: {
      shopDomain: shop,
      dropId: matchingDrop.id,
      shopifyOrderId: String(order.id),
      shopifyOrderName: order.name || null,
      customerEmail,
      totalAmount,
      currencyCode: order.currency || matchingDrop.baseCurrency || "USD",
      itemCount,
      firstProductName,
      fromWaitlist,
    },
  });

  // 3) Stats par produit (pour le "Most Demanded" ranking)
  const orderCreatedAt = order.created_at ? new Date(order.created_at) : new Date();

  for (const li of matchingLineItems) {
    const productId = toProductGid(li.product_id);
    const variantId = li.variant_id ? String(li.variant_id) : null;
    const quantity = Number(li.quantity || 0);
    const revenue = Number(li.price || 0) * quantity;

    const existingStats = await db.dropProductStats.findFirst({
      where: { dropId: matchingDrop.id, productId },
    });

    if (existingStats) {
      await db.dropProductStats.update({
        where: { id: existingStats.id },
        data: {
          unitsSold: existingStats.unitsSold + quantity,
          revenue: Number(existingStats.revenue) + revenue,
          lastSoldAt: orderCreatedAt,
        },
      });
    } else {
      await db.dropProductStats.create({
        data: {
          shopDomain: shop,
          dropId: matchingDrop.id,
          productId,
          variantId,
          productName: li.name || li.title || "Unknown product",
          unitsSold: quantity,
          revenue,
          lastSoldAt: orderCreatedAt,
        },
      });
    }
  }

  // 4) Evenement pour le flux "Who is buying" de la live page
  const buyerName =
    order.customer?.first_name ||
    order.billing_address?.first_name ||
    "Someone";
  const firstItemName =
    matchingLineItems[0]?.name || matchingLineItems[0]?.title || "a product";

  await db.dropEvent.create({
    data: {
      shopDomain: shop,
      dropId: matchingDrop.id,
      type: "ORDER",
      payload: {
        buyerName,
        productName: firstItemName,
        itemCount,
        totalAmount,
        currencyCode: order.currency || matchingDrop.baseCurrency || "USD",
        fromWaitlist,
      },
    },
  });

  return new Response();
};
