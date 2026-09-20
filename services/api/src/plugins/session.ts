import type { FastifyReply, FastifyRequest } from "fastify";
import type { Organization } from "@prisma/client";
import { auth } from "../auth.js";
import { prisma } from "../db.js";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};

export type OrgContext = {
  user: SessionUser;
  organization: Organization;
};

export function requestHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

export async function getSession(request: FastifyRequest) {
  return auth.api.getSession({ headers: requestHeaders(request) });
}

/**
 * Resolve the authenticated user + organization, or reject with 401.
 * Returns null when the request was already rejected on the reply.
 */
export async function requireOrganization(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<OrgContext | null> {
  const session = await getSession(request);
  if (!session?.user) {
    await reply.code(401).send({ error: "Non autenticato." });
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { organization: true },
  });

  if (!user?.organization) {
    await reply.code(401).send({ error: "Organizzazione non trovata." });
    return null;
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
    organization: user.organization,
  };
}
