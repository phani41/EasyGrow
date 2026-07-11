<div align="center">
  <br />
  <img src="./frontend/public/favicon.ico" alt="EasyGrow" width="80" />
  <h1>EasyGrow</h1>
  <p><strong>AI-Powered CSV Importer — Smart Column Mapping with OpenRouter AI</strong></p>

  <p>
    <a href="#features">Features</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#deployment">Deployment</a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/Next.js-15-black?style=flat&logo=next.js" alt="Next.js 15" />
    <img src="https://img.shields.io/badge/Express-4.21-blue?style=flat&logo=express" alt="Express.js" />
    <img src="https://img.shields.io/badge/OpenRouter-AI-blue?style=flat&logo=openai" alt="OpenRouter AI" />
    <img src="https://img.shields.io/badge/license-MIT-green?style=flat" alt="License" />
  </p>
</div>

<br />

EasyGrow intelligently imports CSV data into your CRM using OpenRouter AI for smart column mapping. Upload any CSV — regardless of column naming conventions — and EasyGrow automatically maps, transforms, and validates your data into a standardized CRM schema with real-time progress updates.

---

## Features

- **AI-powered column mapping** — Maps columns by semantic meaning, not just exact name matches
- **Rule-based pre-mapping** — 60%+ fields detected automatically without AI calls
- **Split field merging** — Combines `first_name` + `last_name` into full names
- **Multi-format date parsing** — Converts dates like `01/15/2024`, `15 Jan 2024`, `2024-03-15T14:30:00` into ISO 8601
- **Phone number normalization** — Extracts country codes, strips formatting
- **Status inference** — Maps common status labels to CRM statuses
- **Real-time SSE progress** — Live batch tracking during AI processing
- **Client + server validation** — File type, size, encoding, structural checks
- **Rate limiting & request tracing** — Per-endpoint rate limits, UUID request IDs
- **CSV injection protection** — Formula payloads sanitized on export

---

## Architecture

The frontend (Next.js on Vercel) communicates with the backend (Express on Railway) via HTTP and SSE. The backend uses OpenRouter AI for column mapping, with rule-based detection as a fallback. Parsed CSV data is cached in-memory during processing.

---

## Tech Stack

**Frontend:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, TanStack Table, React Dropzone, Axios

**Backend:** Express.js, TypeScript, OpenRouter AI, csv-parser, Multer, Helmet, Pino, prom-client

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm or pnpm
- OpenRouter API key — Get one free at [OpenRouter](https://openrouter.ai/keys)

### Installation

```bash
git clone https://github.com/yourusername/easygrow.git
cd easygrow

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### Environment Variables

**Backend** (`backend/.env`):

```env
PORT=5000
OPENROUTER_API_KEY=sk-or-v1-your-key-here
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development
```

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | — | OpenRouter API key |
| `OPENROUTER_MODEL` | `openrouter/auto` | AI model for column mapping |
| `OPENROUTER_MOCK_MODE` | `false` | Skip API calls, use heuristic mapping |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed frontend origin |
| `PORT` | `5000` | Server port |
| `MAX_FILE_SIZE` | `52428800` | Max upload size in bytes (50 MB) |
| `LOG_LEVEL` | `debug` | Pino log level |

**Frontend** (`frontend/.env.local`):

```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:5000" > frontend/.env.local
```

### Running Locally

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Visit **http://localhost:3000**.

For development without an API key, set `OPENROUTER_MOCK_MODE=true` in `backend/.env`.

---

## Deployment

### Backend → Railway

1. Push to GitHub
2. Create a new Railway project from your repo
3. Railway auto-detects the `backend/railway.json` config
4. Add environment variables: `OPENROUTER_API_KEY`, `CORS_ORIGIN`, `NODE_ENV=production`

### Frontend → Vercel

1. Create a new Vercel project from your GitHub repo
2. Set Root Directory to `frontend`
3. Add `NEXT_PUBLIC_API_URL` pointing to your Railway backend

---

## License

MIT License — see [LICENSE](LICENSE) for details.
