import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { getAlloggiatiMode } from "../lib/alloggiati/mode.js";
import {
  buildStayChecklist,
  openChecklistTasks,
  type StayWithRelations,
} from "../lib/stays/checklist.js";
import { requireOrganization } from "../plugins/session.js";

const complianceSchema = z.object({
  touristTaxChecked: z.boolean().optional(),
  istatChecked: z.boolean().optional(),
});

export function registerDashboardRoutes(app: FastifyInstance): void {
  // Sessione corrente + organizzazione: usato dal layout dashboard del frontend.
  app.get("/api/session", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    return reply.send({
      user: ctx.user,
      organization: {
        id: ctx.organization.id,
        name: ctx.organization.name,
      },
      mode: getAlloggiatiMode(),
    });
  });

  // Dati per la pagina Oggi: immobili, soggiorni con relazioni, checklist compliance.
  app.get("/api/dashboard", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const [properties, stays, checklist] = await Promise.all([
      prisma.property.findMany({
        where: { organizationId: ctx.organization.id },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.guestStay.findMany({
        where: { organizationId: ctx.organization.id },
        include: { property: true, receipt: true },
        orderBy: [{ arrivalDate: "asc" }, { lastName: "asc" }],
      }),
      prisma.complianceChecklist.findUnique({
        where: { organizationId: ctx.organization.id },
      }),
    ]);

    const now = new Date();
    const stayRows = stays as StayWithRelations[];
    const tasks = openChecklistTasks(stayRows, now)
      .slice(0, 8)
      .map(({ stay, item }) => ({
        stayId: stay.id,
        lastName: stay.lastName,
        firstName: stay.firstName,
        propertyName: stay.property.name,
        arrivalDate: stay.arrivalDate.toISOString(),
        item,
      }));

    return reply.send({
      properties,
      stays: stayRows.map((stay) => ({
        ...stay,
        checklist: buildStayChecklist(stay, now),
      })),
      tasks,
      checklist: {
        touristTaxChecked: checklist?.touristTaxChecked ?? false,
        istatChecked: checklist?.istatChecked ?? false,
      },
    });
  });

  // Riepilogo per la pagina Impostazioni.
  app.get("/api/settings", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const [credential, calendarCount, propertyCount] = await Promise.all([
      prisma.alloggiatiCredential.findUnique({
        where: { organizationId: ctx.organization.id },
        select: { lastTestOk: true },
      }),
      prisma.channelCalendar.count({ where: { organizationId: ctx.organization.id } }),
      prisma.property.count({ where: { organizationId: ctx.organization.id } }),
    ]);

    return reply.send({
      connected: credential?.lastTestOk === true,
      mode: getAlloggiatiMode(),
      calendarCount,
      propertyCount,
    });
  });

  app.put("/api/compliance-checklist", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const parsed = complianceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Dato non valido." });
    }
    const input = parsed.data;

    try {
      await prisma.complianceChecklist.upsert({
        where: { organizationId: ctx.organization.id },
        create: {
          organizationId: ctx.organization.id,
          touristTaxChecked: input.touristTaxChecked ?? false,
          istatChecked: input.istatChecked ?? false,
        },
        update: {
          ...(typeof input.touristTaxChecked === "boolean"
            ? { touristTaxChecked: input.touristTaxChecked }
            : {}),
          ...(typeof input.istatChecked === "boolean"
            ? { istatChecked: input.istatChecked }
            : {}),
        },
      });
      return reply.send({ ok: true });
    } catch {
      return reply.code(500).send({ ok: false, error: "Impossibile salvare la checklist." });
    }
  });
}
