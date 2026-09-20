import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireOrganization } from "../plugins/session.js";

const propertySchema = z.object({
  name: z.string().trim().min(1, "Inserisci il nome dell'immobile."),
  address: z.string().trim().min(1, "Inserisci l'indirizzo."),
  cin: z.string().trim().optional(),
  alloggiatiApartmentId: z.string().trim().optional(),
});

export function registerPropertyRoutes(app: FastifyInstance): void {
  app.get("/api/properties", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const properties = await prisma.property.findMany({
      where: { organizationId: ctx.organization.id },
      orderBy: { name: "asc" },
      include: { _count: { select: { stays: true } } },
    });
    return reply.send({ properties });
  });

  app.post("/api/properties", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const parsed = propertySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Dati non validi.",
      });
    }

    const property = await prisma.property.create({
      data: {
        organizationId: ctx.organization.id,
        name: parsed.data.name,
        address: parsed.data.address,
        cin: parsed.data.cin || null,
        alloggiatiApartmentId: parsed.data.alloggiatiApartmentId || null,
      },
    });
    return reply.send({ ok: true, message: "Immobile aggiunto.", property });
  });

  app.put("/api/properties/:id", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const { id } = request.params as { id: string };
    const parsed = propertySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Dati non validi.",
      });
    }

    const result = await prisma.property.updateMany({
      where: { id, organizationId: ctx.organization.id },
      data: {
        name: parsed.data.name,
        address: parsed.data.address,
        cin: parsed.data.cin || null,
        alloggiatiApartmentId: parsed.data.alloggiatiApartmentId || null,
      },
    });
    if (result.count === 0) {
      return reply.code(404).send({ ok: false, message: "Immobile non trovato." });
    }
    return reply.send({ ok: true, message: "Immobile aggiornato." });
  });

  app.delete("/api/properties/:id", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const { id } = request.params as { id: string };
    const property = await prisma.property.findFirst({
      where: { id, organizationId: ctx.organization.id },
      include: { stays: { select: { status: true } } },
    });
    if (!property) {
      return reply.code(404).send({ ok: false, message: "Immobile non trovato." });
    }
    if (property.stays.some((stay) => stay.status === "sent")) {
      return reply.code(409).send({
        ok: false,
        message: "Non puoi eliminare un immobile con schedine già inviate.",
      });
    }
    await prisma.property.delete({ where: { id: property.id } });
    return reply.send({ ok: true, message: "Immobile eliminato." });
  });
}
