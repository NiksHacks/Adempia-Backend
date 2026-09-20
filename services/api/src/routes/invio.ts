import type { FastifyInstance } from "fastify";
import type { GuestStay, Property } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { getAlloggiatiClient, getAlloggiatiMode } from "../lib/alloggiati/index.js";
import { buildSchedinaRow } from "../lib/alloggiati/schedina.js";
import { buildMockRicevutaPdf } from "../lib/alloggiati/ricevuta-pdf.js";
import {
  esitoToMessage,
  type AlloggiatiClient,
  type AlloggiatiSession,
  type GuestSchedinaInput,
  type SchedineCallResult,
} from "../lib/alloggiati/types.js";
import { decryptSecret } from "../lib/encryption.js";
import { requireOrganization } from "../plugins/session.js";

type StayWithProperty = GuestStay & { property: Property };

function toInput(stay: StayWithProperty): GuestSchedinaInput {
  return {
    guestType: stay.guestType,
    arrivalDate: stay.arrivalDate,
    nights: stay.nights,
    lastName: stay.lastName,
    firstName: stay.firstName,
    sex: stay.sex,
    birthDate: stay.birthDate,
    birthComuneCode: stay.birthComuneCode,
    birthProvince: stay.birthProvince,
    birthCountryCode: stay.birthCountryCode,
    citizenshipCode: stay.citizenshipCode,
    documentType: stay.documentType,
    documentNumber: stay.documentNumber,
    documentIssuePlace: stay.documentIssuePlace,
    apartmentId: stay.property.alloggiatiApartmentId,
  };
}

function failedSchedineMessage(call: SchedineCallResult): string {
  const rowErrors = call.elenco.dettaglio
    .map((item, index) =>
      item.esito ? null : `Riga ${index + 1}: ${item.erroreDes || item.erroreDettaglio}`.trim(),
    )
    .filter((item): item is string => Boolean(item));
  const general = esitoToMessage(call.result, "").message;
  if (rowErrors.length > 0) {
    return rowErrors.join(" ");
  }
  return general || "Invio Alloggiati non riuscito.";
}

async function transmit(
  client: AlloggiatiClient,
  session: AlloggiatiSession,
  stays: StayWithProperty[],
): Promise<SchedineCallResult | { error: string }> {
  const ids = stays.map((stay) => stay.property.alloggiatiApartmentId?.trim() || null);
  const present = ids.filter((id): id is string => Boolean(id));
  const unique = new Set(present);

  if (present.length === 0) {
    const rows = stays.map((stay) => buildSchedinaRow(toInput(stay), { includeApartment: false }));
    const test = await client.test(session, rows);
    if (test.elenco.schedineValide !== rows.length) {
      return test;
    }
    return client.send(session, rows);
  }

  if (present.length !== stays.length) {
    return {
      error:
        "Per l'invio multi-appartamento ogni immobile deve avere l'ID Alloggiati, oppure nessuno.",
    };
  }

  if (unique.size === 1) {
    const id = Number.parseInt([...unique][0]!, 10);
    if (!Number.isFinite(id)) {
      return { error: "ID appartamento Alloggiati non numerico." };
    }
    const rows = stays.map((stay) => buildSchedinaRow(toInput(stay), { includeApartment: false }));
    const test = await client.gestioneAppartamenti.test(session, rows, id);
    if (test.elenco.schedineValide !== rows.length) {
      return test;
    }
    return client.gestioneAppartamenti.send(session, rows, id);
  }

  const rows = stays.map((stay) =>
    buildSchedinaRow(toInput(stay), { includeApartment: true }),
  );
  const test = await client.gestioneAppartamenti.fileUnicoTest(session, rows);
  if (test.elenco.schedineValide !== rows.length) {
    return test;
  }
  return client.gestioneAppartamenti.fileUnicoSend(session, rows);
}

const sendBodySchema = z.object({
  stayIds: z.array(z.string().min(1)),
});

export function registerInvioRoutes(app: FastifyInstance): void {
  app.get("/api/invio", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const [readyStays, errorStays, receipts] = await Promise.all([
      prisma.guestStay.findMany({
        where: { organizationId: ctx.organization.id, status: "ready" },
        include: { property: true },
        orderBy: { arrivalDate: "asc" },
      }),
      prisma.guestStay.findMany({
        where: { organizationId: ctx.organization.id, status: "error" },
        include: { property: true },
        orderBy: { arrivalDate: "asc" },
      }),
      prisma.receipt.findMany({
        where: { organizationId: ctx.organization.id },
        include: { stay: { include: { property: true } } },
        orderBy: { issuedAt: "desc" },
      }),
    ]);

    return reply.send({
      readyStays: readyStays.map((stay) => ({
        id: stay.id,
        lastName: stay.lastName,
        firstName: stay.firstName,
        documentType: stay.documentType,
        documentNumber: stay.documentNumber,
        arrivalDate: stay.arrivalDate.toISOString(),
        propertyName: stay.property.name,
      })),
      errorStays: errorStays.map((stay) => ({
        id: stay.id,
        lastName: stay.lastName,
        firstName: stay.firstName,
        propertyName: stay.property.name,
        errorMessage: stay.errorMessage,
      })),
      receipts: receipts.map((receipt) => ({
        id: receipt.id,
        issuedAt: receipt.issuedAt.toISOString(),
        guestName: `${receipt.stay.lastName} ${receipt.stay.firstName}`,
        propertyName: receipt.stay.property.name,
      })),
    });
  });

  app.post("/api/invio/send", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const parsed = sendBodySchema.safeParse(request.body);
    if (!parsed.success || parsed.data.stayIds.length === 0) {
      return reply.code(400).send({
        ok: false,
        message: "Seleziona almeno una schedina pronta.",
        receiptIds: [],
      });
    }
    const { stayIds } = parsed.data;

    const credential = await prisma.alloggiatiCredential.findUnique({
      where: { organizationId: ctx.organization.id },
    });
    if (!credential || credential.lastTestOk !== true) {
      return reply.code(409).send({
        ok: false,
        message: "Collega Alloggiati e completa la prova di collegamento prima di inviare.",
        receiptIds: [],
      });
    }

    const stays = await prisma.guestStay.findMany({
      where: {
        id: { in: stayIds },
        organizationId: ctx.organization.id,
        status: "ready",
      },
      include: { property: true },
    });

    if (stays.length !== stayIds.length) {
      return reply.code(409).send({
        ok: false,
        message: "Una o più schedine non sono pronte o non appartengono al tuo account.",
        receiptIds: [],
      });
    }

    let utente: string;
    let password: string;
    let wsKey: string;
    try {
      utente = decryptSecret(credential.utenteEnc);
      password = decryptSecret(credential.passwordEnc);
      wsKey = decryptSecret(credential.wskeyEnc);
    } catch {
      return reply.code(500).send({
        ok: false,
        message: "Impossibile leggere le credenziali cifrate. Salvale di nuovo da Collega Alloggiati.",
        receiptIds: [],
      });
    }

    const client = getAlloggiatiClient();
    try {
      const { token } = await client.generateToken({ utente, password, wsKey });
      const session = { utente, token };
      const sent = await transmit(client, session, stays);
      if ("error" in sent) {
        return reply.code(502).send({ ok: false, message: sent.error, receiptIds: [] });
      }
      if (sent.elenco.schedineValide !== stays.length) {
        await prisma.guestStay.updateMany({
          where: { id: { in: stays.map((stay) => stay.id) } },
          data: { status: "error", errorMessage: failedSchedineMessage(sent) },
        });
        return reply.code(502).send({
          ok: false,
          message: failedSchedineMessage(sent),
          receiptIds: [],
        });
      }

      const issuedAt = new Date();
      const protocol = `AW-${issuedAt.toISOString().slice(0, 10).replaceAll("-", "")}-${stays.length}`;
      let pdfBytes = await buildMockRicevutaPdf({
        protocol,
        issuedAt,
        guests: stays.map((stay) => ({
          lastName: stay.lastName,
          firstName: stay.firstName,
          arrivalDate: stay.arrivalDate,
        })),
      });

      if (getAlloggiatiMode() === "live") {
        const ricevuta = await client.ricevuta(session, issuedAt);
        if (ricevuta.result.esito && ricevuta.pdfBase64) {
          pdfBytes = Buffer.from(ricevuta.pdfBase64, "base64");
        }
      }

      const receiptIds: string[] = [];
      for (const stay of stays) {
        const receipt = await prisma.receipt.create({
          data: {
            stayId: stay.id,
            organizationId: ctx.organization.id,
            pdfBytes: Buffer.from(pdfBytes),
            issuedAt,
          },
        });
        await prisma.guestStay.update({
          where: { id: stay.id },
          data: {
            status: "sent",
            sentAt: issuedAt,
            errorMessage: null,
          },
        });
        receiptIds.push(receipt.id);
      }

      return reply.send({
        ok: true,
        message: `Trasmesse ${stays.length} schedine.`,
        receiptIds,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invio alla Questura non riuscito.";
      await prisma.guestStay.updateMany({
        where: { id: { in: stays.map((stay) => stay.id) } },
        data: { status: "error", errorMessage: message },
      });
      return reply.code(502).send({ ok: false, message, receiptIds: [] });
    }
  });

  app.get("/api/receipts/:id/pdf", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const { id } = request.params as { id: string };
    const receipt = await prisma.receipt.findFirst({
      where: { id, organizationId: ctx.organization.id },
      include: { stay: true },
    });
    if (!receipt) {
      return reply.code(404).send({ error: "Ricevuta non trovata." });
    }

    const filename = `ricevuta-${receipt.stay.lastName.toLowerCase()}-${receipt.issuedAt
      .toISOString()
      .slice(0, 10)}.pdf`;

    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(Buffer.from(receipt.pdfBytes));
  });
}
