

# Support ticket triage app

This repository is the starting point for an educational project in which
computer science students will build a support ticket triage application. The
planned application will use a large language model (LLM) from the backend to
help analyze incoming support requests and support the triage process.

The codebase is intentionally a basic skeleton. It provides a small chat
interface and server endpoint as a first step: before building the full triage
workflow, students can use this chat to validate the connection between
the application and an LLM provider.

## Current status

The chat feature sends messages from the server to an LLM using the OpenAI
client and an OpenAI-compatible provider endpoint. The API key is read only on
the server from environment variables and is never sent to the browser.

The triage flow is available at `/triage`. Requests and responses are checked
with Zod, and the LLM response uses the same JSON schema sent to the provider.
Each result displays input, output, and total token usage.

The triage page also starts smoke tests against a random sample of either
dataset. Labelled samples show predicted and expected category/priority values
and mismatch summaries. Each run is stored in `data/smoke-runs.json` and is
listed at `/admin` with accuracy, outcomes, latency, cost, and model. Cost is
calculated from the optional `LLM_*_COST_PER_1K` environment variables.

## Sample data

The `data/` folder contains two support-ticket datasets:

- **500 unlabelled tickets** in
  [`support_tickets_500.csv`](./data/support_tickets_500.csv) and
  [`support_tickets_500.json`](./data/support_tickets_500.json), for exploring
  and developing the triage workflow.
- **100 labelled tickets** in
  [`support_tickets_100_labelled.csv`](./data/support_tickets_100_labelled.csv)
  and
  [`support_tickets_100_labelled.json`](./data/support_tickets_100_labelled.json).
  These include triage annotations such as category, priority, and whether a
  ticket needs human review, making them useful for testing and evaluating
  triage approaches.

## Run locally

Requires Node.js 20.9 or newer.

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and set the provider values before sending
a chat message:

```dotenv
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
LLM_API_KEY=your-gemini-api-key
LLM_MODEL=gemini-2.5-flash
```

Open http://localhost:3033 and send a message. Both `npm run dev` and
`npm run start` use port 3033.

Open http://localhost:3033/triage to triage tickets and run smoke tests.

The Send button is disabled when the message is empty or contains only spaces,
and while a request is in progress.

The client posts `{ "message": "your text" }` to `/api/chat`. The App Router
handler in `app/api/chat/route.ts` returns `{ "answer": "..." }` from the LLM.
Invalid JSON or an empty/non-string message returns HTTP 400 with an `error`.

## Checks

```sh
npm run typecheck
npm run build
```
