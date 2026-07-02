import { createOrder, listOrdersForUser } from "../../../lib/server/db";
import { getCurrentUserFromRequest, json, unauthorized } from "../../../lib/server/http";
import { findService } from "../../../lib/catalog";

export async function GET() {
  const user = await getCurrentUserFromRequest();

  if (!user) {
    return unauthorized();
  }
  if (!user.emailVerified) {
    return json({ error: "Please confirm your email address first." }, 403);
  }

  return json({ orders: await listOrdersForUser(user.id) });
}

export async function POST(request) {
  const user = await getCurrentUserFromRequest();

  if (!user) {
    return unauthorized();
  }
  if (!user.emailVerified) {
    return json({ error: "Please confirm your email address first." }, 403);
  }

  const body = await request.json();
  const quantity = Number(body.quantity);
  const selectedService = findService(String(body.serviceId || ""));

  const minQuantity = selectedService?.min || 100;
  const maxQuantity = selectedService?.max || 2147483647;

  if (!selectedService || quantity < minQuantity || quantity > maxQuantity) {
    return json(
      { error: `Please choose a valid service and quantity between ${minQuantity.toLocaleString()} and ${maxQuantity.toLocaleString()}.` },
      400
    );
  }

  const targetLink = String(body.targetLink || "").trim();

  if (!targetLink) {
    return json({ error: "Target link is required." }, 400);
  }

  try {
    const order = await createOrder(user.id, {
      platform: selectedService.platform,
      service: selectedService.name,
      packageType: "Catalog",
      quantity,
      targetLink,
      deliveryMode: String(body.deliveryMode || "Instant"),
      notes: String(body.notes || "").trim(),
      rate: selectedService.priceRwf,
      cost: (quantity / 1000) * selectedService.priceRwf,
    });

    return json({ order }, 201);
  } catch (error) {
    return json({ error: error.message || "Order request failed." }, 400);
  }
}
