# Bantoo Books Quiz — vajton.com

Interactive 40-question MCQ quiz about Bantoo Books infrastructure, with login protection.

## Login (default)

| Field | Value |
|-------|--------|
| Login ID | `ksunilrai` |
| Password | `Cristina,1` |

Override via env vars `QUIZ_USERNAME` and `QUIZ_PASSWORD` on Vercel.

## Local dev

```bash
cd vajton-quiz
cp .env.example .env.local
# Edit AUTH_SECRET in .env.local
npm install
npm run dev
```

Open http://localhost:3010

## Deploy to vajton.com (Vercel)

1. Push this folder to GitHub (or deploy from monorepo root with **Root Directory** = `vajton-quiz`).
2. In [Vercel](https://vercel.com) → New Project → import repo.
3. Set **Root Directory** to `vajton-quiz`.
4. Environment variables:
   - `AUTH_SECRET` — random string (`openssl rand -base64 32`)
   - `QUIZ_USERNAME` — `ksunilrai`
   - `QUIZ_PASSWORD` — `Cristina,1`
5. Add domain **vajton.com** in Project → Settings → Domains.
6. Deploy.

## Features

- JWT session cookie (7-day login)
- One question at a time with instant feedback
- Progress bar by section
- Final score + review of every wrong answer
- Sign out / try again
