import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { ALLOGGIATI_SOAP_ENDPOINT } from "../lib/alloggiati/protocol.js";
import { syncChannelCalendar } from "../lib/channels/sync.js";
import { requireOrganization } from "../plugins/session.js";

const calendarSchema = z.object({
  propertyId: z.string().min(1),
  platform: z.enum(["airbnb", "booking", "other"]),
  label: z.string().trim().optional(),
  icalUrl: z
    .string()
    .trim()
    .url("Inserisci un URL iCal valido (https://…)")
    .refine((url) => url.startsWith("https://") || url.startsWith("http://"), {
      message: "L’URL deve iniziare con http:// o https://",
    }),
});

export function registerCalendarRoutes(app: FastifyInstance): void {
  app.get("/api/calendars", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const [credential, properties, calendars] = await Promise.all([
      prisma.alloggiatiCredential.findUnique({
        where: { organizationId: ctx.organization.id },
      }),
      prisma.property.findMany({
        where: { organizationId: ctx.organization.id },
        orderBy: { name: "asc" },
      }),
      prisma.channelCalendar.findMany({
        where: { organizationId: ctx.organization.id },
        include: { property: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return reply.send({
      connected: credential?.lastTestOk === true,
      soapEndpoint: ALLOGGIATI_SOAP_ENDPOINT,
      properties: properties.map((p) => ({ id: p.id, name: p.name })),
      calendars,
    });
  });

  app.post("/api/calendars", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const parsed = calendarSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Dati non validi.",
      });
    }

    const property = await prisma.property.findFirst({
      where: { id: parsed.data.propertyId, organizationId: ctx.organization.id },
    });
    if (!property) {
      return reply.code(404).send({ ok: false, message: "Immobile non trovato." });
    }

    await prisma.channelCalendar.create({
      data: {
        organizationId: ctx.organization.id,
        propertyId: parsed.data.propertyId,
        platform: parsed.data.platform,
        label: parsed.data.label || null,
        icalUrl: parsed.data.icalUrl,
      },
    });
    return reply.send({ ok: true, message: "Calendario collegato." });
  });

  app.delete("/api/calendars/:id", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const { id } = request.params as { id: string };
    const calendar = await prisma.channelCalendar.findFirst({
      where: { id, organizationId: ctx.organization.id },
    });
    if (!calendar) {
      return reply.code(404).send({ ok: false, message: "Calendario non trovato." });
    }
    await prisma.channelCalendar.delete({ where: { id: calendar.id } });
    return reply.send({ ok: true, message: "Calendario rimosso." });
  });

  app.post("/api/calendars/:id/sync", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const { id } = request.params as { id: string };
    const calendar = await prisma.channelCalendar.findFirst({
      where: { id, organizationId: ctx.organization.id },
    });
    if (!calendar) {
      return reply.code(404).send({ ok: false, message: "Calendario non trovato." });
    }

    try {
      const result = await syncChannelCalendar(calendar.id);
      return reply.send({ ok: true, message: result.message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync non riuscita.";
      await prisma.channelCalendar.update({
        where: { id: calendar.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncOk: false,
          lastSyncMessage: message,
        },
      });
      return reply.code(502).send({ ok: false, message });
    }
  });
}
