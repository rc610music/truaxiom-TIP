# TIP API Preview on Render

**Status:** Sprint 002 preview deployment path  
**Goal:** Deploy the TIP API so Mission Control can connect to a public backend URL.

---

## What this deploy gives us

This deployment exposes the local-first TIP API as a public preview service.

Expected runtime path:

```text
Mission Control Pages preview
  ↓
VITE_TIP_API_BASE_URL
  ↓
Render web service
  ↓
TIP API
  ↓
local-memory review decision repository
```

This is still safe preview mode:

- no live crawler,
- no paid AI provider,
- no permanent database writes,
- no Supabase dependency,
- review decisions reset when the API restarts.

---

## Files involved

```text
render.yaml
apps/api/package.json
apps/api/src/server.ts
packages/core/src/apiGateway.ts
packages/core/src/serverRuntime.ts
```

---

## Render blueprint settings

The repo includes:

```text
render.yaml
```

Service name:

```text
truaxiom-tip-api
```

Build command:

```bash
npm install
```

Start command:

```bash
npm run start:api
```

Health check path:

```text
/health
```

---

## Environment values

The blueprint sets safe preview values:

```env
TIP_ENV=production
TIP_API_MODE=api
TIP_API_HOST=0.0.0.0
TIP_PERSISTENCE_PROVIDER=local-memory
TIP_CORS_ORIGINS=https://rc610music.github.io,http://localhost:5173,http://127.0.0.1:5173
TIP_ENABLE_LIVE_CRAWLER=false
TIP_AI_PROVIDER=manual
```

Do not set `TIP_API_PORT` on Render. Render supplies `PORT`, and the API reads that automatically.

---

## Manual deploy steps

1. Open Render.
2. Choose **New**.
3. Choose **Blueprint**.
4. Connect GitHub repo:

```text
rc610music/truaxiom-TIP
```

5. Select the `render.yaml` blueprint.
6. Create the service.
7. Wait for deploy to finish.
8. Open:

```text
https://<render-service-url>/health
```

You should see a JSON response with:

```json
{
  "status": "ok",
  "service": "TIP API Gateway"
}
```

---

## After Render gives us the URL

Copy the Render service URL, then update Mission Control Pages build with:

```env
VITE_TIP_API_BASE_URL=https://<render-service-url>
```

Then rerun:

```text
Actions → Mission Control Pages Preview → Run workflow
```

After that, Mission Control should show API-connected mode instead of static fallback.
