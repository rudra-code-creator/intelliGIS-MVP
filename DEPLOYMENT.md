# intelliGIS — Netlify Deployment Guide

This guide walks through deploying intelliGIS to Netlify with Supabase and OpenAI.

## Prerequisites

- GitHub repository with the intelliGIS codebase
- [Netlify](https://netlify.com) account
- [Supabase](https://supabase.com) project
- [OpenAI](https://platform.openai.com) API key

## Step 1: Supabase Setup

1. Create a new Supabase project
2. Open **SQL Editor** and run `supabase/migrations/001_initial_schema.sql`
3. Go to **Authentication → Providers** and enable Email
4. Go to **Project Settings → API** and copy:
   - Project URL → `VITE_SUPABASE_URL`
   - anon public key → `VITE_SUPABASE_ANON_KEY`

## Step 2: Deploy to Netlify

### Via Git (recommended)

1. Push your code to GitHub
2. In Netlify: **Add new site → Import an existing project**
3. Connect your GitHub repo
4. Build settings are read from `netlify.toml` automatically:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`

### Via CLI

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

## Step 3: Environment Variables

In Netlify **Site settings → Environment variables**, add:

| Key | Value | Scopes |
|-----|-------|--------|
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` | All |
| `VITE_SUPABASE_ANON_KEY` | Your anon key | All |
| `OPENAI_API_KEY` | `sk-...` | Functions |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Functions |

> Redeploy after adding `VITE_*` variables — they are embedded at build time.

## Step 4: Verify Deployment

1. Visit your Netlify URL
2. Sign up for an account
3. Create a project and upload `public/samples/sydney-suburbs.geojson`
4. Test the AI chat (requires `OPENAI_API_KEY`)

### Health check

```bash
curl https://your-site.netlify.app/.netlify/functions/health
```

Expected: `{"status":"ok","service":"intelliGIS"}`

## Redirect Rules

Configured in `netlify.toml`:

- `/api/*` → Netlify Functions
- `/*` → SPA fallback to `index.html`

## Security Headers

Production headers include:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` restrictions

## CI/CD

GitHub Actions workflow at `.github/workflows/ci.yml` runs on push/PR:

- Install dependencies
- Lint
- Type check and build

Connect Netlify to your repo for automatic deploys on merge to `main`.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Auth not working | Verify Supabase URL/key; check RLS policies ran |
| AI chat 500 error | Set `OPENAI_API_KEY` in Netlify env vars |
| Upload fails | Confirm `datasets` storage bucket exists |
| Blank page after deploy | Check build logs; ensure `VITE_*` vars set before build |
| CORS on functions | Functions include `Access-Control-Allow-Origin` header |

## Local Development with Functions

```bash
cp .env.example .env
# Fill in credentials
npm run dev:netlify
```

This runs Vite + Netlify Functions on port 8888.
