# EasyGrow

## Project Overview

EasyGrow is a full-stack CSV import tool that parses uploaded files, maps source columns to a CRM schema, and streams processing progress back to the client.

## Features

- CSV upload, validation, and preview
- Rule-based column detection with OpenRouter-backed fallback mapping
- Server-sent events for import progress
- Client and server-side validation
- Structured logging and request tracing

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: Express, TypeScript, OpenRouter, csv-parser, Multer, Pino
- Tooling: Vitest, Docker

## Architecture

The frontend runs in Next.js and communicates with the backend through HTTP and SSE. The backend parses CSV files, stores upload state in memory during processing, and returns mapped CRM records to the client.

## Installation

```bash
git clone https://github.com/yourusername/easygrow.git
cd easygrow/backend
npm install
cd ../frontend
npm install
```

Run the apps locally:

```bash
cd backend
npm run dev

cd frontend
npm run dev
```

## Environment Variables

Backend:

```env
PORT=5000
OPENROUTER_API_KEY=sk-or-v1-your-key-here
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development
```

Frontend:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

## Deployment

- Backend: Railway using [backend/railway.json](backend/railway.json)
- Frontend: Vercel using [frontend/vercel.json](frontend/vercel.json)

## Screenshots

Add production screenshots of the upload flow and import results here.

## Live Demo

Add the deployed URLs here once production environments are available.

## License

MIT. See [LICENSE](LICENSE) for details.
