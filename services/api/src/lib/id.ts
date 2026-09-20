import { randomBytes } from "node:crypto";

/** Token URL-safe per check-in e riferimenti esterni. */
export function createId(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}
