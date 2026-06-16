# RR Foods Web Dashboard (Sprint 8)

Next.js frontend for WhatsApp Accounting. Talks to the backend `/api/v1` endpoints.

## Setup

1. Install [Node.js](https://nodejs.org/) (v18+).
2. From this folder:

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

3. Open http://localhost:3000 and sign in with the same **team password** as the backend dashboard.

## Environment

| Variable | Description |
|----------|-------------|
| `API_URL` | Backend URL (default: live Render app) |

## Pages

- **Dashboard** — cash summary and review counts
- **Transactions** — recent cash entries
- **Deliveries** — delivery notes
- **Parties** — balances and amount owed
- **Review** — confirm/reject pending items
- **Reports** — monthly summary
- **Products** — edit unit prices

## How login works

The web app runs on a different domain than the API (e.g. localhost vs Render). Login goes through a small Next.js server route that forwards your password to the backend and stores the session securely. No CORS cookie issues in the browser.

## Deploy (later)

Deploy this folder to Vercel (or similar). Set `API_URL` to your Render backend URL. Use the same team password — no backend code changes needed.
