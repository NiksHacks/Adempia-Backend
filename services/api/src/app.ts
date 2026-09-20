import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "./db.js";
import { computeDueReminders, type ReminderStay } from "./reminders.js";
import { registerAdempimentiRoutes } from "./routes/adempimenti.js";
import { registerAlloggiatiRoutes } from "./routes/alloggiati.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCalendarRoutes } from "./routes/calendars.js";
import { registerCheckInRoutes } from "./routes/check-in.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerInvioRoutes } from "./routes/invio.js";
import { registerLookupRoutes } from "./routes/lookups.js";
import { registerPropertyRoutes } from "./routes/properties.js";
import { registerStayRoutes } from "./routes/stays.js";

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL ?? "http://localhost:8000";

const reminderStaySchema = z.object({
  id: z.string(),
  checkInAt: z.string(),
  nights: z.number().int().nonnegative(),
  status: z.enum(["draft", "ready", "sent", "error"]),
  hasCheckInToken: z.boolean(),
});

const remindersBodySchema = z.object({
  stays: z.array(reminderStaySchema),
  now: z.string().optional(),
  reminderWindowHours: z.number().positive().optional(),
});

const mrzTextSchema = z.object({ mrz: z.string().min(1) });

/** Il servizio OCR può rispondere con corpi non-JSON (es. 500 di FastAPI). */
async function parseOcrResponse(res: Response): Promise<unknown | null> {
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });
  app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } });

  app.get("/health", async () => ({ status: "ok", service: "adempia-api" }));

  // Database health check — verifies Supabase Postgres connectivity.
  app.get("/health/db", async (request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({ status: "ok", database: "connected" });
    } catch (error) {
      request.log.error(error);
      return reply.code(503).send({ status: "error", database: "unreachable" });
    }
  });

  // OCR document scan — proxied to the OCR microservice. The frontend never
  // talks to the OCR service directly: everything goes through the gateway.
  app.post("/ocr/mrz", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: "Nessun file caricato." });
    }
    const buffer = await file.toBuffer();
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: file.mimetype }), file.filename);

    let res: Response;
    try {
      res = await fetch(`${OCR_SERVICE_URL}/ocr/mrz`, { method: "POST", body: form });
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "Servizio OCR non raggiungibile." });
    }
    const payload = await parseOcrResponse(res);
    return reply.code(payload === null ? 502 : res.status).send(
      payload ?? { error: `Risposta OCR non valida (HTTP ${res.status}).` },
    );
  });

  app.post("/ocr/mrz/text", async (request, reply) => {
    const parsed = mrzTextSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Campo 'mrz' mancante." });
    }
    let res: Response;
    try {
      res = await fetch(`${OCR_SERVICE_URL}/ocr/mrz/text`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "Servizio OCR non raggiungibile." });
    }
    const payload = await parseOcrResponse(res);
    return reply.code(payload === null ? 502 : res.status).send(
      payload ?? { error: `Risposta OCR non valida (HTTP ${res.status}).` },
    );
  });

  // Reminder / overdue computation for a batch of stays.
  app.post("/reminders/compute", async (request, reply) => {
    const parsed = remindersBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Payload non valido.", issues: parsed.error.issues });
    }
    const now = parsed.data.now ? new Date(parsed.data.now) : new Date();
    const due = computeDueReminders(parsed.data.stays as ReminderStay[], now, {
      reminderWindowHours: parsed.data.reminderWindowHours,
    });
    return reply.send({ now: now.toISOString(), due });
  });

  registerAuthRoutes(app);
  registerDashboardRoutes(app);
  registerPropertyRoutes(app);
  registerStayRoutes(app);
  registerInvioRoutes(app);
  registerAlloggiatiRoutes(app);
  registerCalendarRoutes(app);
  registerAdempimentiRoutes(app);
  registerCheckInRoutes(app);
  registerLookupRoutes(app);

  return app;
}
