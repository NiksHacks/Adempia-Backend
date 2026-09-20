# Adempia backend

Tutti i servizi di Adempia girano qui. Il frontend Next.js (deploy su Vercel) **non**
esegue logica di dominio direttamente: chiama questo backend via HTTP. Deploy su **Railway**.

## Servizi

| Servizio | Stack | Ruolo |
| --- | --- | --- |
| `services/api` | Node 22 + Fastify (TypeScript) + Prisma + Better Auth | **Gateway**: unico ingresso. Autenticazione, sessioni, tutta la logica di dominio (Alloggiati/SOAP, tassa di soggiorno, iCal, checklist), proxy OCR, accesso database Supabase. |
| `services/ocr` | Python 3.12 + FastAPI + Tesseract + `mrz` | OCR **open-source gratis** dei documenti (MRZ → dati ospite). Nessun modello a pagamento. |

Il frontend parla **solo** con `services/api`; l'API parla con `services/ocr` e con il database Supabase Postgres.

## Database

Il database è **Supabase Postgres**. Lo schema Prisma è in `services/api/prisma/schema.prisma`
(unica fonte di verità — il frontend non ha più un suo schema).

Variabili d'ambiente richieste:

- `DATABASE_URL` — pooler transaction mode (porta 6543) con `?pgbouncer=true`
- `DIRECT_URL` — session mode (porta 5432) per le migrazioni Prisma
- `BETTER_AUTH_SECRET` — segreto sessioni Better Auth (≥32 caratteri)
- `BETTER_AUTH_URL` — URL pubblico del backend (base URL Better Auth)
- `FRONTEND_URL` — URL pubblico del frontend (trusted origin)
- `ENCRYPTION_KEY` — 32 byte hex per cifrare le credenziali Alloggiati a riposo

L'integrazione Alloggiati Web usa sempre l'adapter SOAP reale verso
`alloggiatiweb.poliziadistato.it`: ogni operazione richiede le credenziali Questura
(Utente, Password, WSKEY) salvate dalla pagina Collega.

## Autenticazione

Better Auth vive nel gateway (`/api/auth/*`) con sessioni persistite su Postgres via
Prisma adapter. Il frontend Next.js espone un **proxy** su `/api/auth/*` verso il gateway,
così i cookie di sessione restano first-party sul dominio del frontend. Tutte le route
`/api/*` (tranne check-in pubblico e lookup) richiedono la sessione e risolvono
l'organizzazione dell'utente.

## Endpoint (gateway)

### Infra

- `GET  /health` — healthcheck base
- `GET  /health/db` — verifica connessione database Supabase
- `POST /ocr/mrz` — multipart `file` (immagine documento) → campi documento
- `POST /ocr/mrz/text` — `{ "mrz": "..." }` → parsing deterministico
- `POST /reminders/compute` — `{ stays: [...], now?, reminderWindowHours? }` → reminder/scaduti

### Auth & sessione

- `ALL  /api/auth/*` — Better Auth (sign-up, sign-in, sign-out, session)
- `GET  /api/session` — utente + organizzazione correnti

### Dominio (richiedono sessione)

- `GET    /api/dashboard` — immobili, soggiorni con checklist, task aperti, checklist compliance
- `PUT    /api/compliance-checklist` — aggiorna promemoria tassa/ISTAT
- `GET    /api/settings` — riepilogo impostazioni (stato Alloggiati, conteggi)
- `GET    /api/properties` · `POST /api/properties` · `PUT /api/properties/:id` · `DELETE /api/properties/:id`
- `GET    /api/stays` · `GET /api/stays/:id` (con checklist) · `POST /api/stays` · `PUT /api/stays/:id` · `DELETE /api/stays/:id`
- `POST   /api/stays/:id/check-in-token` — genera/recupera il token del link check-in
- `POST   /api/stays/:id/tax-collected` — segna la tassa di soggiorno come riscossa
- `GET    /api/invio` — schedine pronte/errori + ricevute
- `POST   /api/invio/send` — `{ stayIds: [...] }` → trasmissione SOAP ad Alloggiati + ricevuta PDF ufficiale
- `GET    /api/receipts/:id/pdf` — download ricevuta
- `GET    /api/alloggiati/status` — stato credenziali, onboarding, appartamenti da abbinare
- `POST   /api/alloggiati/credentials` — salva credenziali cifrate + test di collegamento + sync appartamenti
- `POST   /api/alloggiati/import-apartments` — importa gli appartamenti non abbinati
- `PUT    /api/alloggiati/onboarding/step` · `PUT /api/alloggiati/onboarding/prep` · `POST /api/alloggiati/onboarding/submit`
- `GET    /api/calendars` · `POST /api/calendars` · `DELETE /api/calendars/:id` · `POST /api/calendars/:id/sync`
- `GET    /api/adempimenti?mese=YYYY-MM` — soggiorni del mese, riepilogo ISTAT, CSV tassa/ISTAT
- `POST   /api/adempimenti/recalculate` — `{ year, month }` → ricalcolo imposte

### Pubblici (nessuna sessione)

- `GET  /api/check-in/:token` — dati soggiorno per il form check-in ospite
- `POST /api/check-in/submit` — invio dati ospite (validazione + ricalcolo stato/tassa)
- `GET  /api/lookups?kind=comune|stato|documento&q=...` — tabelle di lookup Questura

## Sviluppo locale

Con Docker:

```bash
docker compose up --build
# gateway: http://localhost:8080  · ocr: http://localhost:8000
```

Senza Docker:

```bash
# OCR
cd services/ocr
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000
# (richiede il binario tesseract-ocr installato)

# API
cd services/api
npm install
cp ../../.env.example .env   # compila le variabili
npx prisma generate
npx prisma db push           # crea lo schema sul DB configurato
npm run dev                  # carica .env automaticamente
```

## Test

```bash
cd services/ocr && . .venv/bin/activate && PYTHONPATH=. pytest -q
cd services/api && npm test
```

I test del gateway coprono la logica di dominio portata dal frontend: tracciato schedine
Alloggiati (168/174 caratteri), deadline, lookup, sync appartamenti, parsing iCal,
checklist soggiorno, normalizzazione documenti, tassa di soggiorno, reminder.

## Deploy su Railway

Crea **due servizi** nel progetto Railway, ciascuno con la sua *Root Directory*:

1. **OCR** — Root Directory `services/ocr`, builder Dockerfile. Railway inietta `$PORT`.
2. **API** — Root Directory `services/api`, builder Dockerfile. Variabili: tutte quelle
   elencate in [Database](#database) più `OCR_SERVICE_URL` = URL interno del servizio OCR
   (es. `http://ocr.railway.internal:8000`).

Entrambi espongono `GET /health` per l'healthcheck. Serve `RAILWAY_TOKEN` nei Secrets per il deploy via CLI/CI.
