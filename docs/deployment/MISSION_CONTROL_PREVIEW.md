# Mission Control Preview

**Status:** Sprint 002 visual preview path  
**Preview type:** static GitHub Pages build  
**Primary workflow:** `Mission Control Pages Preview`  

---

## Purpose

This preview exists so the founder can see TIP Mission Control visually without setting up a local development terminal.

The first browser preview is intentionally static fallback mode:

```text
Mission Control UI → static fallback data
```

That is expected because GitHub Pages hosts static files and does not run the TIP API server.

---

## What the Preview Shows

The visual dashboard shows:

- TIP / Mission Control identity,
- live/static runtime status,
- system-flow map,
- product count,
- review queue count,
- RootWork content map snapshot,
- recommendations,
- review decision controls,
- next-stage build checklist.

The review buttons only become live when Mission Control is connected to the API runtime.

---

## How to Run the Preview from GitHub

From the repository:

```text
Actions → Mission Control Pages Preview → Run workflow → main → Run workflow
```

If GitHub Pages is enabled and configured for Actions, the workflow deploys a page URL.

Expected GitHub Pages URL pattern:

```text
https://rc610music.github.io/truaxiom-TIP/
```

---

## Fallback If Pages Is Not Enabled

The workflow also uploads a downloadable artifact named:

```text
mission-control-static-preview
```

Use this if Pages deployment is blocked by repository settings.

The artifact contains the static build from:

```text
apps/mission-control/dist
```

---

## Current Limitations

This preview does not run:

- the local API,
- live crawler actions,
- persistent database writes,
- paid AI provider actions.

Those require a deployed API runtime.

---

## Next Stage

After the static preview works, the next stage is:

```text
Deploy TIP API separately → connect Mission Control to API URL → enable live review queue decisions in-browser
```

Recommended API deployment target for the next pass:

```text
Render / Railway / Fly.io / Cloudflare Worker adapter
```

For simplest short-term validation, use a Node-friendly API host first.
