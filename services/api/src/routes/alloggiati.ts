import type { FastifyInstance } from "fastify";
import { AlloggiatiOnboardingStep } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { getAlloggiatiClient } from "../lib/alloggiati/index.js";
import { planApartmentSync } from "../lib/alloggiati/apartment-sync.js";
import { getAlloggiatiMode } from "../lib/alloggiati/mode.js";
import { decryptSecret, encryptSecret } from "../lib/encryption.js";
import { requireOrganization } from "../plugins/session.js";

const credentialsSchema = z.object({
  utente: z.string().trim().min(1, "Inserisci l'utente Alloggiati."),
  password: z.string().min(1, "Inserisci la password."),
  wskey: z.string().trim().min(1, "Inserisci la WSKEY."),
});

const onboardingStepSchema = z.nativeEnum(AlloggiatiOnboardingStep);

const onboardingPrepSchema = z.object({
  prepModulo: z.boolean().optional(),
  prepDocumento: z.boolean().optional(),
  prepAutorizzazione: z.boolean().optional(),
});

export function registerAlloggiatiRoutes(app: FastifyInstance): void {
  // Stato collegamento + onboarding + appartamenti remoti da abbinare.
  app.get("/api/alloggiati/status", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const [credential, onboarding] = await Promise.all([
      prisma.alloggiatiCredential.findUnique({
        where: { organizationId: ctx.organization.id },
      }),
      prisma.alloggiatiOnboarding.findUnique({
        where: { organizationId: ctx.organization.id },
      }),
    ]);

    let utenteHint: string | null = null;
    if (credential) {
      try {
        utenteHint = decryptSecret(credential.utenteEnc);
      } catch {
        utenteHint = null;
      }
    }

    const connected = credential?.lastTestOk === true;
    const mode = getAlloggiatiMode();

    let unmatched: { id: string; description: string; indirizzo: string | null }[] = [];
    if (connected && credential) {
      try {
        const utente = decryptSecret(credential.utenteEnc);
        const password = decryptSecret(credential.passwordEnc);
        const wsKey = decryptSecret(credential.wskeyEnc);
        const client = getAlloggiatiClient();
        const { token } = await client.generateToken({ utente, password, wsKey });
        const remote = await client.gestioneAppartamenti.lista({ utente, token });
        const existing = await prisma.property.findMany({
          where: { organizationId: ctx.organization.id },
          select: { id: true, name: true, alloggiatiApartmentId: true },
        });
        unmatched = planApartmentSync(existing, remote).unmatched.map((item) => ({
          id: item.id,
          description: item.description,
          indirizzo: item.indirizzo ?? null,
        }));
      } catch {
        unmatched = [];
      }
    }

    return reply.send({
      connected,
      mode,
      credential: {
        hasCredential: Boolean(credential),
        lastTestOk: credential?.lastTestOk ?? null,
        lastTestMessage: credential?.lastTestMessage ?? null,
        utenteHint,
      },
      onboarding: {
        step: onboarding?.step ?? AlloggiatiOnboardingStep.preparazione,
        prep: {
          prepModulo: onboarding?.prepModulo ?? false,
          prepDocumento: onboarding?.prepDocumento ?? false,
          prepAutorizzazione: onboarding?.prepAutorizzazione ?? false,
        },
        submittedAt: onboarding?.submittedAt?.toISOString() ?? null,
      },
      unmatched,
    });
  });

  app.post("/api/alloggiati/credentials", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Dati non validi.",
      });
    }

    const { utente, password, wskey } = parsed.data;
    const utenteEnc = encryptSecret(utente);
    const passwordEnc = encryptSecret(password);
    const wskeyEnc = encryptSecret(wskey);

    try {
      const client = getAlloggiatiClient();
      const { token } = await client.generateToken({ utente, password, wsKey: wskey });
      const authTest = await client.authenticationTest({ utente, token });
      const test = {
        ok: authTest.esito,
        message: authTest.esito
          ? "Collegamento di prova riuscito (Authentication_Test)."
          : [authTest.erroreDes, authTest.erroreDettaglio].filter(Boolean).join(" — ") ||
            "Authentication_Test non riuscito.",
      };

      await prisma.alloggiatiCredential.upsert({
        where: { organizationId: ctx.organization.id },
        create: {
          organizationId: ctx.organization.id,
          utenteEnc,
          passwordEnc,
          wskeyEnc,
          lastTestOk: test.ok,
          lastTestAt: new Date(),
          lastTestMessage: test.message,
        },
        update: {
          utenteEnc,
          passwordEnc,
          wskeyEnc,
          lastTestOk: test.ok,
          lastTestAt: new Date(),
          lastTestMessage: test.message,
        },
      });

      let message = test.message;

      if (test.ok) {
        try {
          const remote = await client.gestioneAppartamenti.lista({ utente, token });
          const existing = await prisma.property.findMany({
            where: { organizationId: ctx.organization.id },
            select: { id: true, name: true, alloggiatiApartmentId: true },
          });
          const plan = planApartmentSync(existing, remote);
          if (plan.create.length > 0) {
            await prisma.property.createMany({
              data: plan.create.map((item) => ({
                organizationId: ctx.organization.id,
                name: item.name,
                address: item.address,
                alloggiatiApartmentId: item.alloggiatiApartmentId,
              })),
            });
          }
          for (const item of plan.link) {
            await prisma.property.updateMany({
              where: { id: item.propertyId, organizationId: ctx.organization.id },
              data: { alloggiatiApartmentId: item.alloggiatiApartmentId },
            });
          }
          if (plan.create.length > 0) {
            message += ` Importati ${plan.create.length} appartamenti.`;
          }
          if (plan.unmatched.length > 0) {
            message += ` ${plan.unmatched.length} da abbinare.`;
          }
        } catch (syncError) {
          const syncMessage =
            syncError instanceof Error
              ? syncError.message
              : "Import appartamenti non riuscito.";
          message += ` Import appartamenti fallito: ${syncMessage}`;
          return reply.send({ ok: true, message });
        }
      }

      return reply.send({ ok: test.ok, message });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Collegamento Alloggiati non riuscito.";
      await prisma.alloggiatiCredential.upsert({
        where: { organizationId: ctx.organization.id },
        create: {
          organizationId: ctx.organization.id,
          utenteEnc,
          passwordEnc,
          wskeyEnc,
          lastTestOk: false,
          lastTestAt: new Date(),
          lastTestMessage: message,
        },
        update: {
          utenteEnc,
          passwordEnc,
          wskeyEnc,
          lastTestOk: false,
          lastTestAt: new Date(),
          lastTestMessage: message,
        },
      });
      return reply.code(502).send({ ok: false, message });
    }
  });

  app.post("/api/alloggiati/import-apartments", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const credential = await prisma.alloggiatiCredential.findUnique({
      where: { organizationId: ctx.organization.id },
    });
    if (!credential || credential.lastTestOk !== true) {
      return reply.code(409).send({
        ok: false,
        message: "Collega Alloggiati prima di importare gli appartamenti.",
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
        message: "Impossibile leggere le credenziali cifrate.",
      });
    }

    const client = getAlloggiatiClient();
    const { token } = await client.generateToken({ utente, password, wsKey });
    const remote = await client.gestioneAppartamenti.lista({ utente, token });
    const existing = await prisma.property.findMany({
      where: { organizationId: ctx.organization.id },
      select: { id: true, name: true, alloggiatiApartmentId: true },
    });
    const plan = planApartmentSync(existing, remote);
    if (plan.unmatched.length === 0) {
      return reply.send({ ok: true, message: "Nessun appartamento nuovo da importare." });
    }
    const toCreate = planApartmentSync([], plan.unmatched).create;
    await prisma.property.createMany({
      data: toCreate.map((item) => ({
        organizationId: ctx.organization.id,
        name: item.name,
        address: item.address,
        alloggiatiApartmentId: item.alloggiatiApartmentId,
      })),
    });
    return reply.send({ ok: true, message: `Importati ${toCreate.length} appartamenti.` });
  });

  app.put("/api/alloggiati/onboarding/step", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const parsed = onboardingStepSchema.safeParse((request.body as { step?: unknown })?.step);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Passo non valido." });
    }
    try {
      await prisma.alloggiatiOnboarding.upsert({
        where: { organizationId: ctx.organization.id },
        create: { organizationId: ctx.organization.id, step: parsed.data },
        update: { step: parsed.data },
      });
      return reply.send({ ok: true });
    } catch {
      return reply.code(500).send({ ok: false, error: "Impossibile aggiornare il passo." });
    }
  });

  app.put("/api/alloggiati/onboarding/prep", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    const parsed = onboardingPrepSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Dato non valido." });
    }
    const data = parsed.data;
    try {
      await prisma.alloggiatiOnboarding.upsert({
        where: { organizationId: ctx.organization.id },
        create: {
          organizationId: ctx.organization.id,
          prepModulo: data.prepModulo ?? false,
          prepDocumento: data.prepDocumento ?? false,
          prepAutorizzazione: data.prepAutorizzazione ?? false,
        },
        update: {
          ...(typeof data.prepModulo === "boolean" ? { prepModulo: data.prepModulo } : {}),
          ...(typeof data.prepDocumento === "boolean" ? { prepDocumento: data.prepDocumento } : {}),
          ...(typeof data.prepAutorizzazione === "boolean"
            ? { prepAutorizzazione: data.prepAutorizzazione }
            : {}),
        },
      });
      return reply.send({ ok: true });
    } catch {
      return reply.code(500).send({ ok: false, error: "Impossibile salvare la checklist." });
    }
  });

  app.post("/api/alloggiati/onboarding/submit", async (request, reply) => {
    const ctx = await requireOrganization(request, reply);
    if (!ctx) return;

    try {
      await prisma.alloggiatiOnboarding.upsert({
        where: { organizationId: ctx.organization.id },
        create: {
          organizationId: ctx.organization.id,
          step: AlloggiatiOnboardingStep.ricezione,
          submittedAt: new Date(),
        },
        update: { step: AlloggiatiOnboardingStep.ricezione, submittedAt: new Date() },
      });
      return reply.send({ ok: true });
    } catch {
      return reply.code(500).send({ ok: false, error: "Impossibile registrare l'invio." });
    }
  });
}
