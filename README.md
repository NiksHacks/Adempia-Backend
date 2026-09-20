# Adempia backend

Tutti i servizi di Adempia girano qui. Il frontend Next.js (deploy su Vercel) **non**
esegue logica di dominio direttamente: chiama questo backend via HTTP. Deploy su **Railway**.

> Nota: idealmente questo vive in un repository separato (`adempia-backend`). È stato creato
> qui come progetto autonomo perché il token dell'agente è limitato al repo `Adempia`.
> Per estrarlo in un repo dedicato vedi [Estrazione in repo separato](#estrazione-in-repo-separato).

## Servizi

| Servizio | Stack | Ruolo |
| --- | --- | --- |
| `services/api` | Node 22 + Fastify (TypeScript) | **Gateway**: unico ingresso. Proxy OCR, calcolo reminder. Qui migreranno auth/dati/SOAP. |
| `services/ocr` | Python 3.12 + FastAPI + Tesseract + `mrz` | OCR **open-source gratis** dei documenti (MRZ → dati ospite). Nessun modello a pagamento. |

Il frontend parla **solo** con `services/api`; l'API parla con `services/ocr`.

## Endpoint (gateway)

- `GET  /health`
- `POST /ocr/mrz` — multipart `file` (immagine documento) → campi documento.
- `POST /ocr/mrz/text` — `{ "mrz": "..." }` → parsing deterministico.
- `POST /reminders/compute` — `{ stays: [...], now?, reminderWindowHours? }` → reminder/scaduti.

## Sviluppo locale

Con Docker:

```bash
cd backend
docker compose up --build
# gateway: http://localhost:8080  · ocr: http://localhost:8000
```

Senza Docker:

```bash
# OCR
cd backend/services/ocr
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000
# (richiede il binario tesseract-ocr installato)

# API
cd backend/services/api
npm install
OCR_SERVICE_URL=http://localhost:8000 npm run dev
```

## Test

```bash
cd backend/services/ocr && . .venv/bin/activate && PYTHONPATH=. pytest -q
cd backend/services/api && npm test
```

## Deploy su Railway

Crea **due servizi** nel progetto Railway, ciascuno con la sua *Root Directory*:

1. **OCR** — Root Directory `backend/services/ocr`, builder Dockerfile. Railway inietta `$PORT`.
2. **API** — Root Directory `backend/services/api`, builder Dockerfile. Variabili:
   - `OCR_SERVICE_URL` = URL interno del servizio OCR (es. `http://ocr.railway.internal:8000` o l'URL pubblico dell'OCR).

Entrambi espongono `GET /health` per l'healthcheck. Serve `RAILWAY_TOKEN` nei Secrets per il deploy via CLI/CI.

## Estrazione in repo separato

Quando avrai un token con permesso di creare repo (o crei manualmente `adempia-backend`):

```bash
cd backend
git init && git add . && git commit -m "Init adempia-backend"
git remote add origin https://github.com/NiksHacks/adempia-backend.git
git push -u origin main
```

Poi su Railway punta i due servizi alla root del nuovo repo (`services/ocr`, `services/api`).
