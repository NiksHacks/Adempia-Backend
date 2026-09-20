import type { FastifyInstance } from "fastify";
import { auth } from "../auth.js";
import { requestHeaders } from "../plugins/session.js";

/**
 * better-auth speaks the Web Fetch API (Request/Response). This route adapts
 * Fastify requests to Web Requests and pipes the Web Response back, preserving
 * status codes and Set-Cookie headers.
 */
export function registerAuthRoutes(app: FastifyInstance): void {
  app.route({
    method: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    url: "/api/auth/*",
    handler: async (request, reply) => {
      const url = new URL(request.raw.url ?? request.url, `http://${request.headers.host ?? "localhost"}`);
      const headers = requestHeaders(request);

      const hasBody = request.method !== "GET" && request.method !== "HEAD" && request.body !== undefined;
      const webRequest = new Request(url, {
        method: request.method,
        headers,
        body: hasBody ? JSON.stringify(request.body) : undefined,
      });

      const response = await auth.handler(webRequest);

      reply.code(response.status);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === "set-cookie") return;
        reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) {
        reply.header("set-cookie", cookies);
      }

      const text = await response.text();
      return reply.send(text);
    },
  });
}
