export type AlloggiatiMode = "mock" | "live";

export function getAlloggiatiMode(): AlloggiatiMode {
  return process.env.ALLOGGIATI_MODE === "live" ? "live" : "mock";
}
