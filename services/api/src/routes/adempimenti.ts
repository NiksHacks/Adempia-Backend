import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { taxFieldsForStay } from "../lib/tax/apply.js";
import { buildIstatMonth, istatToCsv, touristTaxToCsv } from "../lib/tax/exports.js";
import { requireOrganization } from "../plugins/session.js";

const monthQuerySchema = z.object({
  mese: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

const recalcBodySchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export function registerAdempimentiRoutes(app: FastifyInstance): void {
  app.get("/api/adempimenti", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const parsed = monthQuerySchema.safeParse(request.query);
    const mese = parsed.success ? parsed.data.mese : undefined;

    let year: number;
    let month: number;
    if (mese) {
      const [y, m] = mese.split("-").map(Number);
      year = y!;
      month = m!;
    } else {
      const now = new Date();
      year = now.getUTCFullYear();
      month = now.getUTCMonth() + 1;
    }
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));

    const stays = await prisma.guestStay.findMany({
      where: {
        organizationId: ctx.organization.id,
        arrivalDate: { gte: start, lt: end },
      },
      include: { property: true },
      orderBy: [{ arrivalDate: "asc" }, { lastName: "asc" }],
    });

    const istat = buildIstatMonth({
      stays: stays.map((s) => ({
        propertyName: s.property.name,
        nights: s.nights,
      })),
    });

    const taxCsv = touristTaxToCsv(
      key,
      stays.map((s) => ({
        guestName: `${s.lastName} ${s.firstName}`,
        propertyName: s.property.name,
        nights: s.nights,
        cents: s.touristTaxCents,
        status: s.touristTaxStatus,
      })),
    );
    const istatCsv = istatToCsv(key, istat.rows, istat.totals);

    return reply.send({
      year,
      month,
      key,
      stays,
      istat,
      taxCsv,
      istatCsv,
    });
  });

  app.post("/api/adempimenti/recalculate", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const parsed = recalcBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, message: "Dati non validi." });
    }
    const { year, month } = parsed.data;

    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const stays = await prisma.guestStay.findMany({
      where: {
        organizationId: ctx.organization.id,
        arrivalDate: { gte: start, lt: end },
      },
      include: { property: true },
    });

    for (const stay of stays) {
      const tax = taxFieldsForStay({
        property: stay.property,
        birthDate: stay.birthDate,
        arrivalDate: stay.arrivalDate,
        nights: stay.nights,
        previousStatus: stay.touristTaxStatus,
      });
      await prisma.guestStay.update({
        where: { id: stay.id },
        data: tax,
      });
    }

    return reply.send({ ok: true, message: `Ricalcolate ${stays.length} schedine.` });
  });
}
