<div align="center">
  <br />
  <img src="./frontend/public/favicon.ico" alt="EasyGrow" width="80" />
  <h1>EasyGrow</h1>
  <p><strong>AI-Powered CSV Importer — Smart Column Mapping with OpenRouter AI</strong></p>

  <p>
    <a href="#features">Features</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#api-documentation">API Docs</a> •
    <a href="#deployment">Deployment</a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/Next.js-15-black?style=flat&logo=next.js" alt="Next.js 15" />
    <img src="https://img.shields.io/badge/Express-4.21-blue?style=flat&logo=express" alt="Express.js" />
    <img src="https://img.shields.io/badge/OpenRouter-AI-blue?style=flat&logo=openai" alt="OpenRouter AI" />
    <img src="https://img.shields.io/badge/TypeScript-5.7-blue?style=flat&logo=typescript" alt="TypeScript" />
    <img src="https://img.shields.io/badge/license-MIT-green?style=flat" alt="License" />
  </p>
</div>

<br />

EasyGrow intelligently imports CSV data into your CRM using OpenRouter AI for smart column mapping. Upload any CSV — regardless of column naming conventions — and EasyGrow automatically maps, transforms, and validates your data into a standardized CRM schema with real-time progress updates.

---

## Features

### 🤖 AI-Powered Column Mapping
- **Intelligent field detection** — Maps columns by semantic meaning, not just exact name matches
- **Rule-based pre-mapping** — 60%+ fields detected automatically without AI calls
- **Split field merging** — Automatically combines `first_name` + `last_name` into full names
- **Multi-format date parsing** — Converts dates like `01/15/2024`, `15 Jan 2024`, `2024-03-15T14:30:00` into ISO 8601
- **Phone number normalization** — Extracts country codes, strips formatting, cleans digits
- **Status inference** — Maps common status labels (`Interested` → `qualified`, `Customer` → `closed_won`)
- **Smart deduplication** — Multiple emails/phones per record are consolidated into notes

### 📊 Real-Time Streaming Progress
- **SSE-powered progress** — Watch each AI batch process in real-time
- **Live batch tracking** — See `Batch 3 of 12` as processing happens
- **Progressive results** — View cumulative records as they're processed

### 🛡️ Enterprise-Grade Validation
- **Client + server validation** — File type, size, encoding, and structure checks
- **Content analysis** — Duplicate headers, empty rows, column consistency
- **Data quality scoring** — Contact capture rate and field completeness metrics
- **CSV injection protection** — Formula payloads (`=`, `+`, `-`, `@`) are sanitized on export

### 🎨 Modern UI/UX
- **Drag-and-drop upload** — Powered by React Dropzone
- **Interactive CSV preview** — Sortable, resizable columns with TanStack Table
- **Dark mode** — System-aware theme switching with next-themes
- **Responsive design** — Works on desktop and tablet
- **Animated counters** — Smooth number transitions for import metrics
- **Cell detail modal** — Click to expand truncated cell content with copy support
- **Pagination + search** — Search across all CRM records with debounced input

### 🔒 Production Ready
- **Rate limiting** — Global, upload, and AI-mapping rate limits
- **Request tracing** — Every request gets a UUID for debugging
- **Graceful shutdown** — Cleanly closes connections on SIGTERM/SIGINT
- **SSE heartbeat** — Keep-alive pings detect dead connections
- **Error boundaries** — Frontend crash recovery without full page reload
- **Helmet security headers** — CSP, XSS protection, and more

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Vercel)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │  Upload   │  │  CSV     │  │  Import  │  │  Import    │  │
│  │  Zone     │→ │  Preview  │→ │  Results │  │  Summary   │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
│       │              │              │            │          │
│       ▼              ▼              ▼            ▼          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              API Client (Axios) + SSE                 │   │
│  └───────────────────┬──────────────────────────────────┘   │
└──────────────────────┼──────────────────────────────────────┘
                       │ HTTP / SSE
┌──────────────────────┼──────────────────────────────────────┐
│                      ▼                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Backend (Railway)                        │  │
│  │  ┌──────────┐  ┌────────────┐  ┌──────────────────┐  │  │
│  │  │  Routes   │→ │  Middleware │→ │   Controllers    │  │  │
│  │  └──────────┘  └────────────┘  └────────┬─────────┘  │  │
│  │       │                                  │            │  │
│  │       ▼                                  ▼            │  │
│  │  ┌──────────┐                    ┌──────────────┐    │  │
│  │  │  Cache   │                    │  Services     │    │  │
│  │  │  (InMem) │                    │  ┌──────────┐ │    │  │
│  │  └──────────┘                    │  │  CSV     │ │    │  │
│  │                                  │  │  Parser  │ │    │  │
│  │                                  │  ├──────────┤ │    │  │
│  │                                  │  │  Gemini  │ │    │  │
│  │                                  │  │  AI      │ │    │  │
│  │                                  │  ├──────────┤ │    │  │
│  │                                  │  │  Valid.  │ │    │  │
│  │                                  │  └──────────┘ │    │  │
│  │                                  └──────────────┘    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────┐
│  OpenRouter AI │
│  (OpenAI SDK)  │
└──────────────┘
```

---

## Tech Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| [Next.js 15](https://nextjs.org/) | React framework with App Router |
| [TypeScript](https://www.typescriptlang.org/) | Type safety |
| [Tailwind CSS](https://tailwindcss.com/) | Utility-first styling |
| [shadcn/ui](https://ui.shadcn.com/) | Accessible component primitives |
| [TanStack Table](https://tanstack.com/table) | Headless table with sorting/resizing |
| [React Dropzone](https://react-dropzone.js.org/) | Drag-and-drop file upload |
| [Lucide Icons](https://lucide.dev/) | Icon library |
| [next-themes](https://github.com/pacocoursey/next-themes) | Dark mode |
| [Axios](https://axios-http.com/) | HTTP client |

### Backend
| Technology | Purpose |
|-----------|---------|
| [Express.js](https://expressjs.com/) | HTTP server framework |
| [TypeScript](https://www.typescriptlang.org/) | Type safety |
| [OpenRouter AI](https://openrouter.ai/) | AI-powered column mapping |
| [csv-parser](https://github.com/mafintosh/csv-parser) | CSV parsing |
| [Multer](https://github.com/expressjs/multer) | File upload handling |
| [Helmet](https://helmetjs.github.io/) | Security headers |
| [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit) | API rate limiting |
| [Pino](https://getpino.io/) | Structured JSON logging |
| [prom-client](https://github.com/siimon/prom-client) | Prometheus metrics |
| [UUID](https://github.com/uuidjs/uuid) | Request ID generation |

---

## Getting Started

### Prerequisites
- **Node.js** 18 or later
- **npm** or **pnpm**
- **Google Gemini API key** — Get one free at [Google AI Studio](https://aistudio.google.com/apikey)

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/yourusername/easygrow.git
cd easygrow

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment

**Backend** (`backend/.env`):

```env
PORT=5000
OPENROUTER_API_KEY=sk-or-v1-your-key-here
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development
```

All environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | — | OpenRouter API key (starts with `sk-or-v1`) |
| `OPENROUTER_MODEL` | `openrouter/auto` | AI model for column mapping |
| `OPENROUTER_MOCK_MODE` | `false` | Skip API calls, use heuristic mapping |
| `OPENROUTER_TEMPERATURE` | `0.2` | AI response creativity |
| `OPENROUTER_MAX_TOKENS` | `4096` | Max output tokens per batch |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed frontend origin |
| `PORT` | `5000` | Server port |
| `MAX_FILE_SIZE` | `10485760` | Max upload size in bytes (10 MB) |
| `LOG_LEVEL` | `debug` | Pino log level (trace, debug, info, warn, error, fatal) |
| `GLOBAL_RATE_LIMIT` | `100` | Max requests per 15 min |
| `UPLOAD_RATE_LIMIT` | `10` | Max uploads per 15 min |
| `MAP_RATE_LIMIT` | `20` | Max AI calls per 15 min |

**Frontend** (`frontend/.env.local`):

```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:5000/api" > frontend/.env.local
```

### 3. Run Development Servers

```bash
# Terminal 1 — Backend
cd backend
npm run dev

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Visit **http://localhost:3000** to use EasyGrow.

### Mock Mode (No API Key)

For development without an API key:

```bash
# In backend/.env
OPENROUTER_MOCK_MODE=true
```

Mock mode simulates AI processing with realistic delays and heuristic-based mapping.

---

## API Documentation

### `GET /api/health`
Health check endpoint.

**Response:**
```json
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2024-12-15T10:30:00.000Z",
  "requestId": "uuid-here"
}
```

---

### `POST /api/upload`
Upload a CSV file for parsing and preview.

**Request:** `multipart/form-data`
| Field | Type | Description |
|-------|------|-------------|
| `file` | File | CSV file (max 10 MB) |

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "fileId": "uuid",
    "fileName": "contacts.csv",
    "totalRows": 1500,
    "headers": ["Full Name", "Email", "Phone", "Company"],
    "previewRows": [ { "Full Name": "..." } ],
    "validation": {
      "warnings": [],
      "warningCount": 0
    }
  }
}
```

**Error `422`** — CSV validation failed:
```json
{
  "success": false,
  "error": "CSV validation failed",
  "data": { "validation": { ... }, "fileName": "bad.csv" }
}
```

---

### `POST /api/map`
Map CSV columns to CRM schema using AI (non-streaming).

**Request:**
```json
{ "fileId": "uuid-from-upload" }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "records": [ { "name": "...", "email": "...", ... } ],
    "totalProcessed": 1450,
    "totalBatches": 29,
    "summary": {
      "totalProcessed": 1450,
      "skippedNoContact": 50,
      "emailsExtracted": 1300,
      "phonesExtracted": 1100
    }
  }
}
```

---

### `GET /api/map/stream?fileId=xxx`
Stream batch processing results via Server-Sent Events.

**Events:**

| Event | Description |
|-------|-------------|
| `connected` | Initial connection established |
| `batch-start` | A new batch is being processed |
| `batch-complete` | A batch finished with partial records |
| `complete` | All batches finished, final results |
| `error` | Processing error occurred |

**Example event:**
```json
// event: batch-complete
{
  "type": "batch-complete",
  "batchIndex": 2,
  "totalBatches": 30,
  "batchRecords": [ ... ],
  "cumulativeSummary": { ... },
  "message": "Batch 3 complete — 48 records extracted"
}
```

---

## Project Structure

```
easygrow/
├── .github/
│   └── workflows/
│       └── ci.yml              # CI pipeline
├── backend/
│   ├── src/
│   │   ├── config/             # Configuration
│   │   ├── constants/          # Constants
│   │   ├── controllers/        # Request handlers
│   │   │   └── upload.controller.ts
│   │   ├── interfaces/         # TypeScript interfaces
│   │   ├── middleware/         # Express middleware
│   │   │   ├── error.middleware.ts
│   │   │   ├── rate-limit.middleware.ts
│   │   │   ├── request-id.middleware.ts
│   │   │   ├── upload.middleware.ts
│   │   │   └── validation.middleware.ts
│   │   ├── prompts/           # AI prompt templates
│   │   │   └── crm.prompt.ts
│   │   ├── routes/            # Express route definitions
│   │   │   └── upload.routes.ts
│   │   ├── services/          # Business logic
│   │   │   ├── cache.service.ts
│   │   │   ├── csv.service.ts
│   │   │   ├── gemini.service.ts
│   │   │   ├── logger.service.ts
│   │   │   ├── mapping.service.ts
│   │   │   ├── metrics.service.ts
│   │   │   ├── openrouter.service.ts
│   │   │   └── validation.service.ts
│   │   ├── types/             # TypeScript types
│   │   │   ├── express.ts     # Request augmentation
│   │   │   └── index.ts
│   │   ├── utils/             # Helpers
│   │   │   └── helpers.ts
│   │   ├── validators/        # Validation logic
│   │   ├── __tests__/         # Backend tests
│   │   └── index.ts           # Server entry point
│   ├── uploads/               # Uploaded files (gitignored)
│   ├── logs/                  # Pino log files (gitignored)
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── railway.json
│   ├── Procfile
│   └── .env.example
│
├── frontend/
│   ├── __tests__/             # Frontend tests
│   ├── app/                   # Next.js App Router
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── ui/                # shadcn/ui primitives
│   │   ├── cell-detail-modal.tsx
│   │   ├── csv-preview.tsx
│   │   ├── error-boundary.tsx
│   │   ├── import-results.tsx
│   │   ├── import-summary.tsx
│   │   ├── theme-provider.tsx
│   │   ├── theme-toggle.tsx
│   │   └── upload-zone.tsx
│   ├── hooks/                 # Custom React hooks
│   ├── lib/
│   │   ├── api.ts             # API client
│   │   ├── config.ts          # Shared configuration
│   │   ├── sse.ts             # SSE client
│   │   ├── utils.ts           # Tailwind utility
│   │   └── validation.ts      # File validation
│   ├── public/                # Static assets
│   ├── styles/                # Additional styles
│   ├── types/                 # TypeScript types
│   │   └── index.ts
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── vercel.json
│
├── docker-compose.yml
├── Dockerfile
├── LICENSE
├── README.md
└── .gitignore
```

---

## Deployment

### Backend → Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

1. Push the repository to GitHub
2. Create a new Railway project from your repo
3. Railway auto-detects the `backend/railway.json` config
4. Set **Root Directory** to `backend` in Railway settings
5. Add required environment variables:
   - `OPENROUTER_API_KEY` — Your OpenRouter API key
   - `CORS_ORIGIN` — Your Vercel app URL
   - `NODE_ENV` — `production`

### Frontend → Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Create a new Vercel project from your GitHub repo
2. Set **Root Directory** to `frontend`
3. Add environment variable:
   - `NEXT_PUBLIC_API_URL` — Your Railway backend URL

### Post-Deployment

1. Update `CORS_ORIGIN` in Railway to match your Vercel domain
2. Verify the health endpoint: `GET https://your-backend.railway.app/api/health`
3. Test the full upload → preview → AI mapping flow

---

## Future Improvements

- [ ] **Redis caching** — Replace in-memory cache for multi-instance deployments
- [ ] **Database persistence** — Store import history and user sessions
- [ ] **Authentication** — Add user accounts with API key management
- [ ] **Custom CRM schemas** — User-defined target schemas beyond the default
- [ ] **Webhook notifications** — Notify external systems when imports complete
- [ ] **CSV download template** — Download pre-formatted CSV templates per schema
- [ ] **Import scheduling** — Schedule recurring imports from cloud storage (S3, GCS)
- [ ] **Deduplication** — Match imported records against existing CRM data
- [ ] **Batch export** — Export records to Salesforce, HubSpot, or other CRMs
- [ ] **Testing suite** — Unit tests for services and integration tests for API endpoints

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <p>
    Built with ❤️ using Next.js, Express, and Google Gemini AI
  </p>
  <p>
    <a href="https://codebuff.com">Codebuff</a> •
    <a href="https://github.com/yourusername/easygrow/issues">Report Issue</a> •
    <a href="https://github.com/yourusername/easygrow/discussions">Discussion</a>
  </p>
</div>
