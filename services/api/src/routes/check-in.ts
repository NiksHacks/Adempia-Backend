import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { parseDateOnly } from "../lib/dates.js";
import { deriveStayStatus } from "../lib/stays.js";
import { normalizeStayDocuments } from "../lib/stays-normalize.js";
import { taxFieldsForStay } from "../lib/tax/apply.js";

const checkInSchema = z.object({
  token: z.string().min(8),
  lastName: z.string().trim().min(1, "Cognome obbligatorio."),
  firstName: z.string().trim().min(1, "Nome obbligatorio."),
  sex: z.enum(["1", "2"]),
  birthDate: z.string().min(1, "Data di nascita obbligatoria."),
  birthComuneCode: z.string().trim().optional(),
  birthProvince: z.string().trim().optional(),
  birthCountryCode: z.string().trim().min(1, "Stato di nascita obbligatorio."),
  citizenshipCode: z.string().trim().min(1, "Cittadinanza obbligatoria."),
  documentType: z.string().trim().min(1, "Tipo documento obbligatorio."),
  documentNumber: z.string().trim().min(1, "Numero documento obbligatorio."),
  documentIssuePlace: z.string().trim().min(1, "Luogo di rilascio obbligatorio."),
});

/**
 * Flusso check-in pubblico: l'ospite apre il link con token e compila i dati.
 * Nessuna sessione richiesta — il token lungo e casuale è l'autorizzazione.
 */
export function registerCheckInRoutes(app: FastifyInstance): void {
  app.get("/api/check-in/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const stay = await prisma.guestStay.findFirst({
      where: { checkInToken: token },
      include: { property: true },
    });

    if (!stay) {
      return reply.code(404).send({ ok: false, message: "Link non valido o scaduto." });
    }
    if (stay.status === "sent") {
      return reply.code(409).send({
        ok: false,
        message: "Questa schedina è già stata inviata alla Questura.",
      });
    }

    return reply.send({
      ok: true,
      stay: {
        propertyName: stay.property.name,
        arrivalDate: stay.arrivalDate.toISOString(),
        nights: stay.nights,
        defaults: {
          lastName: stay.lastName === "Ospite" ? "" : stay.lastName,
          firstName:
            stay.firstName === "Da completare" || stay.firstName === "—" ? "" : stay.firstName,
          sex: stay.sex,
          birthDate: stay.birthDate.toISOString(),
          birthComuneCode: stay.birthComuneCode,
          birthProvince: stay.birthProvince,
          birthCountryCode: stay.birthCountryCode,
          citizenshipCode: stay.citizenshipCode,
          documentType: stay.documentType,
          documentNumber: stay.documentNumber,
          documentIssuePlace: stay.documentIssuePlace,
        },
      },
    });
  });

  app.post("/api/check-in/submit", async (request, reply) => {
    const parsed = checkInSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Dati non validi.",
      });
    }

    const stay = await prisma.guestStay.findFirst({
      where: { checkInToken: parsed.data.token },
      include: { property: true },
    });
    if (!stay) {
      return reply.code(404).send({ ok: false, message: "Link non valido o scaduto." });
    }
    if (stay.status === "sent") {
      return reply.code(409).send({
        ok: false,
        message: "Questa schedina è già stata inviata alla Questura.",
      });
    }

    const docs = normalizeStayDocuments({
      guestType: stay.guestType,
      documentType: parsed.data.documentType,
      documentNumber: parsed.data.documentNumber,
      documentIssuePlace: parsed.data.documentIssuePlace,
    });

    const status = deriveStayStatus({
      guestType: stay.guestType,
      documentType: docs.documentType,
      documentNumber: docs.documentNumber,
      documentIssuePlace: docs.documentIssuePlace,
    });

    await prisma.guestStay.update({
      where: { id: stay.id },
      data: {
        lastName: parsed.data.lastName,
        firstName: parsed.data.firstName,
        sex: parsed.data.sex,
        birthDate: parseDateOnly(parsed.data.birthDate),
        birthComuneCode: parsed.data.birthComuneCode ?? "",
        birthProvince: parsed.data.birthProvince ?? "",
        birthCountryCode: parsed.data.birthCountryCode,
        citizenshipCode: parsed.data.citizenshipCode,
        documentType: docs.documentType,
        documentNumber: docs.documentNumber,
        documentIssuePlace: docs.documentIssuePlace,
        status,
        errorMessage: null,
        source: stay.source === "manual" ? "checkin" : stay.source,
        ...taxFieldsForStay({
          property: stay.property,
          birthDate: parseDateOnly(parsed.data.birthDate),
          arrivalDate: stay.arrivalDate,
          nights: stay.nights,
          previousStatus: stay.touristTaxStatus,
        }),
      },
    });

    return reply.send({
      ok: true,
      message:
        status === "ready"
          ? "Grazie. I dati sono pronti per l’invio Alloggiati."
          : "Dati salvati. Il gestore completerà eventuali campi mancanti.",
    });
  });
}
