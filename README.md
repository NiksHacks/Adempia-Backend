# Adempia backend

Tutti i servizi di Adempia girano qui. Il frontend Next.js (deploy su Vercel) **non**
esegue logica di dominio direttamente: chiama questo backend via HTTP. Deploy su **Railway**.

## Servizi

| Servizio | Stack | Ruolo |
| --- | --- | --- |
| `services/api` | Node 22 + Fastify (TypeScript) + Prisma | **Gateway**: unico ingresso. Proxy OCR, calcolo reminder, accesso database Supabase. |
| `services/ocr` | Python 3.12 + FastAPI + Tesseract + `mrz` | OCR **open-source gratis** dei documenti (MRZ → dati ospite). Nessun modello a pagamento. |

Il frontend parla **solo** con `services/api`; l'API parla con `services/ocr` e con il database Supabase Postgres.

## Database

Il database è **Supabase Postgres** (condiviso col frontend durante la migrazione). Lo schema Prisma è in `services/api/prisma/schema.prisma`.

Variabili d'ambiente richieste:

- `DATABASE_URL` — pooler transaction mode (porta 6543) con `?pgbouncer=true`
- `DIRECT_URL` — session mode (porta 5432) per le migrazioni Prisma

## Endpoint (gateway)

- `GET  /health` — healthcheck base
- `GET  /health/db` — verifica connessione database Supabase
- `POST /ocr/mrz` — multipart `file` (immagine documento) → campi documento
- `POST /ocr/mrz/text` — `{ "mrz": "..." }` → parsing deterministico
- `POST /reminders/compute` — `{ stays: [...], now?, reminderWindowHours? }` → reminder/scaduti

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
npx prisma generate
OCR_SERVICE_URL=http://localhost:8000 npm run dev
```

## Test

```bash
cd services/ocr && . .venv/bin/activate && PYTHONPATH=. pytest -q
cd services/api && npm test
```

## Deploy su Railway

Crea **due servizi** nel progetto Railway, ciascuno con la sua *Root Directory*:

1. **OCR** — Root Directory `services/ocr`, builder Dockerfile. Railway inietta `$PORT`.
2. **API** — Root Directory `services/api`, builder Dockerfile. Variabili:
   - `OCR_SERVICE_URL` = URL interno del servizio OCR (es. `http://ocr.railway.internal:8000`)
   - `DATABASE_URL` = connection string Supabase (transaction mode)
   - `DIRECT_URL` = connection string Supabase (session mode)

Entrambi espongono `GET /health` per l'healthcheck. Serve `RAILWAY_TOKEN` nei Secrets per il deploy via CLI/CI.
