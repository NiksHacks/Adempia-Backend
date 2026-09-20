import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { parseDateOnly } from "../lib/dates.js";
import { createId } from "../lib/id.js";
import { deriveStayStatus } from "../lib/stays.js";
import { normalizeStayDocuments } from "../lib/stays-normalize.js";
import { buildStayChecklist } from "../lib/stays/checklist.js";
import { taxFieldsForStay } from "../lib/tax/apply.js";
import { requireOrganization } from "../plugins/session.js";

const staySchema = z.object({
  propertyId: z.string().min(1, "Seleziona un immobile."),
  guestType: z.enum(["16", "17", "18", "19", "20"]),
  lastName: z.string().trim().min(1, "Inserisci il cognome."),
  firstName: z.string().trim().min(1, "Inserisci il nome."),
  sex: z.enum(["1", "2"]),
  birthDate: z.string().min(1, "Inserisci la data di nascita."),
  birthComuneCode: z.string().trim().optional(),
  birthProvince: z.string().trim().optional(),
  birthCountryCode: z.string().trim().min(1, "Inserisci lo stato di nascita."),
  citizenshipCode: z.string().trim().min(1, "Inserisci la cittadinanza."),
  documentType: z.string().trim().optional(),
  documentNumber: z.string().trim().optional(),
  documentIssuePlace: z.string().trim().optional(),
  arrivalDate: z.string().min(1, "Inserisci la data di arrivo."),
  nights: z.coerce.number().int().min(1).max(30),
});

export function registerStayRoutes(app: FastifyInstance): void {
  app.get("/api/stays", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const stays = await prisma.guestStay.findMany({
      where: { organizationId: ctx.organization.id },
      include: { property: true, receipt: true },
      orderBy: [{ arrivalDate: "asc" }, { lastName: "asc" }],
    });
    return reply.send({ stays });
  });

  app.get("/api/stays/:id", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const { id } = request.params as { id: string };
    const stay = await prisma.guestStay.findFirst({
      where: { id, organizationId: ctx.organization.id },
      include: { property: true, receipt: true },
    });
    if (!stay) {
      return reply.code(404).send({ ok: false, message: "Ospite non trovato." });
    }
    const checklist = buildStayChecklist(stay, new Date());
    return reply.send({ stay, checklist });
  });

  app.post("/api/stays", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const parsed = staySchema.safeParse(request.body);
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

    const documents = normalizeStayDocuments({
      guestType: parsed.data.guestType,
      documentType: parsed.data.documentType ?? "",
      documentNumber: parsed.data.documentNumber ?? "",
      documentIssuePlace: parsed.data.documentIssuePlace ?? "",
    });

    const birthDate = parseDateOnly(parsed.data.birthDate);
    const arrivalDate = parseDateOnly(parsed.data.arrivalDate);
    const tax = taxFieldsForStay({
      property,
      birthDate,
      arrivalDate,
      nights: parsed.data.nights,
    });

    const stay = await prisma.guestStay.create({
      data: {
        organizationId: ctx.organization.id,
        propertyId: property.id,
        guestType: parsed.data.guestType,
        lastName: parsed.data.lastName,
        firstName: parsed.data.firstName,
        sex: parsed.data.sex,
        birthDate,
        birthComuneCode: parsed.data.birthComuneCode ?? "",
        birthProvince: parsed.data.birthProvince ?? "",
        birthCountryCode: parsed.data.birthCountryCode,
        citizenshipCode: parsed.data.citizenshipCode,
        ...documents,
        arrivalDate,
        nights: parsed.data.nights,
        status: deriveStayStatus({
          guestType: parsed.data.guestType,
          ...documents,
        }),
        checkInToken: createId(),
        source: "manual",
        ...tax,
      },
    });
    return reply.send({ ok: true, message: "Ospite registrato.", stay });
  });

  app.put("/api/stays/:id", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const { id } = request.params as { id: string };
    const parsed = staySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Dati non validi.",
      });
    }

    const existing = await prisma.guestStay.findFirst({
      where: { id, organizationId: ctx.organization.id },
    });
    if (!existing) {
      return reply.code(404).send({ ok: false, message: "Ospite non trovato." });
    }
    if (existing.status === "sent") {
      return reply.code(409).send({
        ok: false,
        message: "Una schedina inviata non si modifica.",
      });
    }

    const property = await prisma.property.findFirst({
      where: { id: parsed.data.propertyId, organizationId: ctx.organization.id },
    });
    if (!property) {
      return reply.code(404).send({ ok: false, message: "Immobile non trovato." });
    }

    const documents = normalizeStayDocuments({
      guestType: parsed.data.guestType,
      documentType: parsed.data.documentType ?? "",
      documentNumber: parsed.data.documentNumber ?? "",
      documentIssuePlace: parsed.data.documentIssuePlace ?? "",
    });
    const status = deriveStayStatus({
      guestType: parsed.data.guestType,
      ...documents,
    });
    const birthDate = parseDateOnly(parsed.data.birthDate);
    const arrivalDate = parseDateOnly(parsed.data.arrivalDate);
    const tax = taxFieldsForStay({
      property,
      birthDate,
      arrivalDate,
      nights: parsed.data.nights,
      previousStatus: existing.touristTaxStatus,
    });

    await prisma.guestStay.update({
      where: { id: existing.id },
      data: {
        propertyId: property.id,
        guestType: parsed.data.guestType,
        lastName: parsed.data.lastName,
        firstName: parsed.data.firstName,
        sex: parsed.data.sex,
        birthDate,
        birthComuneCode: parsed.data.birthComuneCode ?? "",
        birthProvince: parsed.data.birthProvince ?? "",
        birthCountryCode: parsed.data.birthCountryCode,
        citizenshipCode: parsed.data.citizenshipCode,
        ...documents,
        arrivalDate,
        nights: parsed.data.nights,
        status,
        errorMessage: status === "ready" ? null : existing.errorMessage,
        ...tax,
      },
    });
    return reply.send({ ok: true, message: "Ospite aggiornato." });
  });

  app.delete("/api/stays/:id", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const { id } = request.params as { id: string };
    const stay = await prisma.guestStay.findFirst({
      where: { id, organizationId: ctx.organization.id },
    });
    if (!stay) {
      return reply.code(404).send({ ok: false, message: "Ospite non trovato." });
    }
    if (stay.status === "sent") {
      return reply.code(409).send({
        ok: false,
        message: "Una schedina inviata non si elimina.",
      });
    }
    await prisma.guestStay.delete({ where: { id: stay.id } });
    return reply.send({ ok: true, message: "Ospite eliminato." });
  });

  app.post("/api/stays/:id/check-in-token", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const { id } = request.params as { id: string };
    const stay = await prisma.guestStay.findFirst({
      where: { id, organizationId: ctx.organization.id },
    });
    if (!stay) {
      return reply.code(404).send({ ok: false, message: "Ospite non trovato." });
    }
    if (stay.status === "sent") {
      return reply.code(409).send({ ok: false, message: "Schedina già inviata." });
    }
    if (stay.checkInToken) {
      return reply.send({ ok: true, token: stay.checkInToken });
    }
    const token = createId();
    await prisma.guestStay.update({
      where: { id: stay.id },
      data: { checkInToken: token },
    });
    return reply.send({ ok: true, token });
  });

  app.post("/api/stays/:id/tax-collected", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const { id } = request.params as { id: string };
    const stay = await prisma.guestStay.findFirst({
      where: { id, organizationId: ctx.organization.id },
    });
    if (!stay) {
      return reply.code(404).send({ ok: false, message: "Ospite non trovato." });
    }
    if (stay.touristTaxStatus === "exempt" || stay.touristTaxStatus === "na") {
      return reply.code(409).send({
        ok: false,
        message: "Nessuna imposta da riscuotere.",
      });
    }
    await prisma.guestStay.update({
      where: { id: stay.id },
      data: { touristTaxStatus: "collected" },
    });
    return reply.send({ ok: true, message: "Imposta segnata come riscossa." });
  });
}
