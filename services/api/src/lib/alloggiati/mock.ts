import { lookupsToCsv } from "./lookups.js";
import { buildMockRicevutaPdf } from "./ricevuta-pdf.js";
import {
  SCHEDINA_LENGTH,
  SCHEDINA_LENGTH_WITH_APARTMENT,
  type TipoTabella,
} from "./protocol.js";
import {
  failEsito,
  okEsito,
  type AlloggiatiApartment,
  type AlloggiatiClient,
  type AlloggiatiCredentials,
  type AlloggiatiSession,
  type ElencoSchedineEsito,
  type EsitoOperazioneServizio,
  type SchedineCallResult,
  type TokenInfo,
} from "./types.js";

function failIfBadCredentials(credentials: AlloggiatiCredentials): void {
  if (!credentials.utente.trim() || !credentials.password.trim() || !credentials.wsKey.trim()) {
    throw new Error("Inserisci Utente, Password e WSKEY.");
  }
  const utente = credentials.utente.trim().toLowerCase();
  const password = credentials.password.trim().toLowerCase();
  if (utente === "errore" || password === "sbagliata") {
    throw new Error("Autenticazione Alloggiati non riuscita. Controlla Utente, Password e WSKEY.");
  }
}

function validateRows(rows: string[], expected: number[]): EsitoOperazioneServizio[] {
  return rows.map((row) => {
    if (!expected.includes(row.length)) {
      return failEsito(
        "11",
        "SCHEDINA_FORMATO_NON_CORRETTO",
        `Dimensione Riga errata (attesi ${expected.join(" o ")} caratteri)`,
      );
    }
    return okEsito();
  });
}

function toSchedineResult(dettaglio: EsitoOperazioneServizio[]): SchedineCallResult {
  const schedineValide = dettaglio.filter((item) => item.esito).length;
  const allOk = dettaglio.length > 0 && schedineValide === dettaglio.length;
  return {
    result: allOk
      ? okEsito()
      : failEsito("11", "SCHEDINA_FORMATO_NON_CORRETTO", `${schedineValide} schedine valide su ${dettaglio.length}`),
    elenco: { schedineValide, dettaglio } satisfies ElencoSchedineEsito,
  };
}

export function createMockAlloggiatiClient(): AlloggiatiClient {
  const apartments: AlloggiatiApartment[] = [
    {
      id: "1",
      description: "Appartamento demo",
      comune: "FIRENZE",
      provincia: "FI",
      indirizzo: "Via de' Bardi 12",
      proprietario: "Martina Bianchi",
    },
    {
      id: "2",
      description: "Loft Santa Croce",
      comune: "FIRENZE",
      provincia: "FI",
      indirizzo: "Piazza Santa Croce 8",
      proprietario: "Martina Bianchi",
    },
  ];

  return {
    async generateToken(credentials: AlloggiatiCredentials): Promise<TokenInfo> {
      failIfBadCredentials(credentials);
      const issued = new Date();
      const expires = new Date(issued.getTime() + 60 * 60 * 1000);
      return {
        token: `mock-token-${credentials.utente.trim()}`,
        issued,
        expires,
      };
    },

    async authenticationTest(_session: AlloggiatiSession): Promise<EsitoOperazioneServizio> {
      return okEsito();
    },

    async test(_session: AlloggiatiSession, rows: string[]) {
      if (rows.length === 0) {
        return toSchedineResult([]);
      }
      return toSchedineResult(validateRows(rows, [SCHEDINA_LENGTH]));
    },

    async send(session: AlloggiatiSession, rows: string[]) {
      return this.test(session, rows);
    },

    async ricevuta(_session: AlloggiatiSession, date: Date) {
      const pdf = await buildMockRicevutaPdf({
        protocol: `MOCK-${date.toISOString().slice(0, 10).replaceAll("-", "")}`,
        issuedAt: date,
        guests: [],
      });
      return { result: okEsito(), pdfBase64: Buffer.from(pdf).toString("base64") };
    },

    async tabella(_session: AlloggiatiSession, tipo: TipoTabella) {
      if (tipo === "ListaAppartamenti") {
        const header = "IDAPP;Descrizione;COMUNE;PROV;Indirizzo;Proprietario";
        const body = apartments
          .map(
            (item) =>
              `${item.id};${item.description};${item.comune ?? ""};${item.provincia ?? ""};${item.indirizzo ?? ""};${item.proprietario ?? ""}`,
          )
          .join("\n");
        return { result: okEsito(), csv: `${header}\n${body}` };
      }
      if (tipo === "Luoghi") {
        return { result: okEsito(), csv: lookupsToCsv("comune") };
      }
      if (tipo === "Tipi_Documento") {
        return { result: okEsito(), csv: lookupsToCsv("documento") };
      }
      return { result: okEsito(), csv: `tipo;${tipo}\nmock;ok\n` };
    },

    gestioneAppartamenti: {
      async test(_session, rows, _idAppartamento) {
        return toSchedineResult(validateRows(rows, [SCHEDINA_LENGTH]));
      },
      async send(session, rows, idAppartamento) {
        return this.test(session, rows, idAppartamento);
      },
      async fileUnicoTest(_session, rows) {
        return toSchedineResult(validateRows(rows, [SCHEDINA_LENGTH_WITH_APARTMENT]));
      },
      async fileUnicoSend(session, rows) {
        return this.fileUnicoTest(session, rows);
      },
      async aggiungiAppartamento(_session, apartment) {
        apartments.push({
          id: String(apartments.length + 1),
          description: apartment.descrizione,
          comune: apartment.comuneCodice,
          indirizzo: apartment.indirizzo,
          proprietario: apartment.proprietario,
        });
        return okEsito();
      },
      async disabilitaAppartamento(_session, idAppartamento) {
        const index = apartments.findIndex((item) => item.id === String(idAppartamento));
        if (index < 0) {
          return failEsito("4", "APPARTAMENTO_NON_TROVATO", "Appartamento non trovato.");
        }
        apartments.splice(index, 1);
        return okEsito();
      },
      async lista(_session) {
        return apartments;
      },
    },
  };
}
