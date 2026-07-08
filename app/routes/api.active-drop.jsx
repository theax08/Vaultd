import db from "../db.server";

export const loader = async ({ request }) => {
  // Récupérer le prochain drop dans le futur
  const nextDrop = await db.drop.findFirst({
    where: {
      status: "DRAFT",
      startTime: { gt: new Date() }
    },
    orderBy: { startTime: 'asc' }
  });

  return Response.json({ drop: nextDrop });
};