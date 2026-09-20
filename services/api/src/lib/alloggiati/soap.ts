import {
  ALLOGGIATI_SOAP_ENDPOINT,
  ALLOGGIATI_SOAP_NAMESPACE,
  type SoapMethod,
} from "./protocol.js";
import type {
  AlloggiatiApartment,
  AlloggiatiClient,
  AlloggiatiCredentials,
  AlloggiatiSession,
  ElencoSchedineEsito,
  EsitoOperazioneServizio,
  NewApartment,
  SchedineCallResult,
  TokenInfo,
} from "./types.js";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function envelope(inner: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:all="${ALLOGGIATI_SOAP_NAMESPACE}">
  <soap:Header/>
  <soap:Body>
    ${inner}
  </soap:Body>
</soap:Envelope>`;
}

function firstTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "i"));
  return match?.[1]?.trim() ?? null;
}

function selfOrEmpty(xml: string, tag: string): string {
  if (new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?/>`, "i").test(xml)) {
    return "";
  }
  return firstTag(xml, tag) ?? "";
}

function soapFault(xml: string): string | null {
  return firstTag(xml, "faultstring") ?? firstTag(xml, "Text");
}

function parseEsito(xml: string): EsitoOperazioneServizio {
  const esitoRaw = (firstTag(xml, "esito") ?? "").toLowerCase();
  return {
    esito: esitoRaw === "true" || esitoRaw === "1",
    erroreCod: selfOrEmpty(xml, "ErroreCod"),
    erroreDes: selfOrEmpty(xml, "ErroreDes"),
    erroreDettaglio: selfOrEmpty(xml, "ErroreDettaglio"),
  };
}

function parseElenco(xml: string): ElencoSchedineEsito {
  const resultBlock = firstTag(xml, "result") ?? xml;
  const valide = Number.parseInt(firstTag(resultBlock, "SchedineValide") ?? "0", 10);
  const dettaglioXml = firstTag(resultBlock, "Dettaglio") ?? "";
  const items = [
    ...dettaglioXml.matchAll(
      /<(?:\w+:)?EsitoOperazioneServizio(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?EsitoOperazioneServizio>/gi,
    ),
  ].map((match) => parseEsito(match[1]));
  return {
    schedineValide: Number.isFinite(valide) ? valide : 0,
    dettaglio: items,
  };
}

function schedineResult(xml: string, resultTag: string): SchedineCallResult {
  const resultXml = firstTag(xml, resultTag) ?? xml;
  return {
    result: parseEsito(resultXml),
    elenco: parseElenco(xml),
  };
}

function toSoapDateTime(date: Date): string {
  return `${date.toISOString().slice(0, 10)}T00:00:00`;
}

function elencoXml(rows: string[]): string {
  return rows.map((row) => `<all:string>${escapeXml(row)}</all:string>`).join("");
}

async function callSoap(method: SoapMethod, inner: string): Promise<string> {
  const response = await fetch(ALLOGGIATI_SOAP_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/soap+xml; charset=utf-8",
      SOAPAction: `"${ALLOGGIATI_SOAP_NAMESPACE}/${method}"`,
    },
    body: envelope(inner),
  });
  const xml = await response.text();
  const fault = soapFault(xml);
  if (!response.ok) {
    throw new Error(fault ?? `Chiamata SOAP ${method} non riuscita (HTTP ${response.status}).`);
  }
  if (fault) {
    throw new Error(fault);
  }
  return xml;
}

function parseCsvApartments(csv: string): AlloggiatiApartment[] {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows = lines[0]?.toUpperCase().startsWith("IDAPP") ? lines.slice(1) : lines;
  return rows.map((line) => {
    const [id, description, comune, provincia, indirizzo, proprietario] = line.split(";");
    return {
      id: (id ?? "").trim(),
      description: (description ?? "").trim(),
      comune: comune?.trim(),
      provincia: provincia?.trim(),
      indirizzo: indirizzo?.trim(),
      proprietario: proprietario?.trim(),
    };
  }).filter((item) => item.id !== "");
}

export function createSoapAlloggiatiClient(): AlloggiatiClient {
  const client: AlloggiatiClient = {
    async generateToken(credentials: AlloggiatiCredentials): Promise<TokenInfo> {
      const xml = await callSoap(
        "GenerateToken",
        `<all:GenerateToken>
          <all:Utente>${escapeXml(credentials.utente)}</all:Utente>
          <all:Password>${escapeXml(credentials.password)}</all:Password>
          <all:WsKey>${escapeXml(credentials.wsKey)}</all:WsKey>
        </all:GenerateToken>`,
      );
      const result = parseEsito(firstTag(xml, "result") ?? xml);
      const token = firstTag(xml, "token");
      if (!result.esito || !token) {
        throw new Error(result.erroreDes || "GenerateToken non ha restituito un token.");
      }
      const issued = firstTag(xml, "issued");
      const expires = firstTag(xml, "expires");
      return {
        token,
        issued: issued ? new Date(issued) : null,
        expires: expires ? new Date(expires) : null,
      };
    },

    async authenticationTest(session: AlloggiatiSession): Promise<EsitoOperazioneServizio> {
      const xml = await callSoap(
        "Authentication_Test",
        `<all:Authentication_Test>
          <all:Utente>${escapeXml(session.utente)}</all:Utente>
          <all:token>${escapeXml(session.token)}</all:token>
        </all:Authentication_Test>`,
      );
      return parseEsito(firstTag(xml, "Authentication_TestResult") ?? xml);
    },

    async test(session: AlloggiatiSession, rows: string[]): Promise<SchedineCallResult> {
      const xml = await callSoap(
        "Test",
        `<all:Test>
          <all:Utente>${escapeXml(session.utente)}</all:Utente>
          <all:token>${escapeXml(session.token)}</all:token>
          <all:ElencoSchedine>${elencoXml(rows)}</all:ElencoSchedine>
        </all:Test>`,
      );
      return schedineResult(xml, "TestResult");
    },

    async send(session: AlloggiatiSession, rows: string[]): Promise<SchedineCallResult> {
      const xml = await callSoap(
        "Send",
        `<all:Send>
          <all:Utente>${escapeXml(session.utente)}</all:Utente>
          <all:token>${escapeXml(session.token)}</all:token>
          <all:ElencoSchedine>${elencoXml(rows)}</all:ElencoSchedine>
        </all:Send>`,
      );
      return schedineResult(xml, "SendResult");
    },

    async ricevuta(session: AlloggiatiSession, date: Date) {
      const xml = await callSoap(
        "Ricevuta",
        `<all:Ricevuta>
          <all:Utente>${escapeXml(session.utente)}</all:Utente>
          <all:token>${escapeXml(session.token)}</all:token>
          <all:Data>${toSoapDateTime(date)}</all:Data>
        </all:Ricevuta>`,
      );
      const result = parseEsito(firstTag(xml, "RicevutaResult") ?? xml);
      return { result, pdfBase64: firstTag(xml, "PDF") ?? "" };
    },

    async tabella(session, tipo) {
      const xml = await callSoap(
        "Tabella",
        `<all:Tabella>
          <all:Utente>${escapeXml(session.utente)}</all:Utente>
          <all:token>${escapeXml(session.token)}</all:token>
          <all:tipo>${tipo}</all:tipo>
        </all:Tabella>`,
      );
      return {
        result: parseEsito(firstTag(xml, "TabellaResult") ?? xml),
        csv: firstTag(xml, "CSV") ?? "",
      };
    },

    gestioneAppartamenti: {
      async test(session, rows, idAppartamento) {
        const xml = await callSoap(
          "GestioneAppartamenti_Test",
          `<all:GestioneAppartamenti_Test>
            <all:Utente>${escapeXml(session.utente)}</all:Utente>
            <all:token>${escapeXml(session.token)}</all:token>
            <all:ElencoSchedine>${elencoXml(rows)}</all:ElencoSchedine>
            <all:IdAppartamento>${idAppartamento}</all:IdAppartamento>
          </all:GestioneAppartamenti_Test>`,
        );
        return schedineResult(xml, "GestioneAppartamenti_TestResult");
      },
      async send(session, rows, idAppartamento) {
        const xml = await callSoap(
          "GestioneAppartamenti_Send",
          `<all:GestioneAppartamenti_Send>
            <all:Utente>${escapeXml(session.utente)}</all:Utente>
            <all:token>${escapeXml(session.token)}</all:token>
            <all:ElencoSchedine>${elencoXml(rows)}</all:ElencoSchedine>
            <all:IdAppartamento>${idAppartamento}</all:IdAppartamento>
          </all:GestioneAppartamenti_Send>`,
        );
        return schedineResult(xml, "GestioneAppartamenti_SendResult");
      },
      async fileUnicoTest(session, rows) {
        const xml = await callSoap(
          "GestioneAppartamenti_FileUnico_Test",
          `<all:GestioneAppartamenti_FileUnico_Test>
            <all:Utente>${escapeXml(session.utente)}</all:Utente>
            <all:token>${escapeXml(session.token)}</all:token>
            <all:ElencoSchedine>${elencoXml(rows)}</all:ElencoSchedine>
          </all:GestioneAppartamenti_FileUnico_Test>`,
        );
        return schedineResult(xml, "GestioneAppartamenti_FileUnico_TestResult");
      },
      async fileUnicoSend(session, rows) {
        const xml = await callSoap(
          "GestioneAppartamenti_FileUnico_Send",
          `<all:GestioneAppartamenti_FileUnico_Send>
            <all:Utente>${escapeXml(session.utente)}</all:Utente>
            <all:token>${escapeXml(session.token)}</all:token>
            <all:ElencoSchedine>${elencoXml(rows)}</all:ElencoSchedine>
          </all:GestioneAppartamenti_FileUnico_Send>`,
        );
        return schedineResult(xml, "GestioneAppartamenti_FileUnico_SendResult");
      },
      async aggiungiAppartamento(session, apartment: NewApartment) {
        const xml = await callSoap(
          "GestioneAppartamenti_AggiungiAppartamento",
          `<all:GestioneAppartamenti_AggiungiAppartamento>
            <all:Utente>${escapeXml(session.utente)}</all:Utente>
            <all:token>${escapeXml(session.token)}</all:token>
            <all:Descrizione>${escapeXml(apartment.descrizione)}</all:Descrizione>
            <all:ComuneCodice>${escapeXml(apartment.comuneCodice)}</all:ComuneCodice>
            <all:Indirizzo>${escapeXml(apartment.indirizzo)}</all:Indirizzo>
            <all:Proprietario>${escapeXml(apartment.proprietario)}</all:Proprietario>
          </all:GestioneAppartamenti_AggiungiAppartamento>`,
        );
        return parseEsito(firstTag(xml, "GestioneAppartamenti_AggiungiAppartamentoResult") ?? xml);
      },
      async disabilitaAppartamento(session, idAppartamento: number) {
        const xml = await callSoap(
          "GestioneAppartamenti_DisabilitaAppartamento",
          `<all:GestioneAppartamenti_DisabilitaAppartamento>
            <all:Utente>${escapeXml(session.utente)}</all:Utente>
            <all:token>${escapeXml(session.token)}</all:token>
            <all:IdAppartamento>${idAppartamento}</all:IdAppartamento>
          </all:GestioneAppartamenti_DisabilitaAppartamento>`,
        );
        return parseEsito(firstTag(xml, "GestioneAppartamenti_DisabilitaAppartamentoResult") ?? xml);
      },
      async lista(session) {
        const table = await client.tabella(session, "ListaAppartamenti");
        if (!table.result.esito) {
          throw new Error(table.result.erroreDes || "Tabella ListaAppartamenti non disponibile.");
        }
        return parseCsvApartments(table.csv);
      },
    },
  };
  return client;
}
