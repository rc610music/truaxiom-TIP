# Mission Control Visual Preview

**Status:** Sprint 002 visual access path  
**Goal:** Give the founder a browser-viewable Mission Control surface instead of only backend tests and repo files.

---

## What changed

Mission Control has been converted into a visual-first dashboard that shows:

- API connection state,
- product / review / extracted-record / recommendation / decision counts,
- a live system-flow map,
- runtime and persistence mode,
- review queue items,
- Approve / Defer / Reject controls,
- RootWork intelligence snapshot,
- next build stage.

---

## Preview workflow

A GitHub Pages workflow now exists:

```text
.github/workflows/mission-control-pages.yml
```

It can be run from:

```text
GitHub → Actions → Mission Control Pages Preview → Run workflow
```

If GitHub Pages is enabled for the repo, the workflow should publish the frontend build as a Pages preview.

---

## Important limitation

The Pages preview is a static frontend preview.

That means:

- the UI can be viewed visually in a browser,
- the local API will not be running inside GitHub Pages,
- the dashboard will show static fallback unless a public API endpoint is deployed separately.

This is acceptable for the next visual milestone because the goal is to see the Mission Control surface.

---

## Next visual milestone

After the static preview is visible, the next step is:

```text
Deploy frontend preview
  ↓
Deploy API preview
  ↓
Point VITE_TIP_API_BASE_URL at API preview
  ↓
Test review queue actions in browser
```

---

## Recommended path

1. Use GitHub Pages for first visual confirmation.
2. Use Cloudflare Pages or Vercel/Netlify for easier environment variables later.
3. Deploy the API separately only when the visual surface is approved.
4. Connect Neon/Postgres or Supabase only after the UI workflow feels right.
