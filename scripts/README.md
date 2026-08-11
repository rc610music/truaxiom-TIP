# TIP Scripts

This folder contains lightweight utility scripts that can run without production credentials.

## Current Scripts

### `check-repo-structure.mjs`

Validates that the expected Sprint 001 and Sprint 002 project structure exists.

Run with:

```bash
npm run check:structure
```

This script is also used by GitHub Actions.

## Rule

Scripts should be safe by default.

No script should mutate live data, publish content, or call paid services unless that behavior is explicit and protected by environment configuration.
