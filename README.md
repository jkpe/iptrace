# iptrace

Single-page app on **[Cloudflare Workers](https://developers.cloudflare.com/workers/)** showing your **public IP**, **edge metadata** from `request.cf` (geo, ASN, colo, HTTP/TLS, TCP RTT, optional TLS fingerprint fields when Cloudflare provides them), and **all inbound request headers**.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Wrangler prints (often `http://localhost:8787`). Geo fields may be sparse in local dev; deploy to Cloudflare for full `request.cf` data.

## Deploy

```bash
npx wrangler login   # once
npm run deploy
```

## API

`GET /api` returns JSON:

```json
{
  "ip": "...",
  "location": { "country": "...", "city": "...", ... },
  "headers": { "...": "..." }
}
```

`GET /` serves the HTML shell (same app).

## Project layout

| Path | Role |
|------|------|
| `src/index.ts` | Worker: `/` → HTML, `/api` → trace JSON |
| `src/shell.html` | UI (styles + client JS, bundled as text) |
| `wrangler.jsonc` | Worker name, compatibility date, HTML import rule |
