import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { searchLookup, type LookupKind } from "../lib/alloggiati/lookups.js";

const querySchema = z.object({
  kind: z.enum(["comune", "stato", "documento"]),
  q: z.string().optional(),
});

/**
 * Tabelle di lookup Questura (comuni, stati, tipi documento). Dati statici
 * pubblici: nessuna sessione richiesta, così il form di check-in ospite
 * può usarle senza login.
 */
export function registerLookupRoutes(app: FastifyInstance): void {
  app.get("/api/lookups", async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Parametri non validi." });
    }
    const entries = searchLookup(parsed.data.q ?? "", parsed.data.kind as LookupKind);
    return reply.send({ entries });
  });
}
