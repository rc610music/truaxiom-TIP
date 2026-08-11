# Supabase Bootstrap Checklist

**Project:** TruaXiom Intelligence Platform  
**Sprint:** SPRINT-002  
**Status:** Waiting on Supabase organization billing resolution

---

## Current Blocker

Creating the dedicated Supabase project is blocked by overdue invoices on the TruaXiom organization.

The intended project remains:

```text
Name: TruaXiom TIP
Organization: nlxkwdvtkardlquwsekq
Region: us-east-2
```

---

## Once Billing Is Cleared

### 1. Create Project

Create the dedicated Supabase project:

```text
TruaXiom TIP
```

### 2. Capture Project Values

Add these values to local environment files and future deployment secrets:

```text
SUPABASE_PROJECT_ID=
SUPABASE_URL=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Never commit real key values.

### 3. Apply Schema Files

Apply the database files in order:

```text
database/schema.sql
database/002_content_ingestion.sql
database/003_data_access_and_crawler.sql
database/004_supabase_adapter_and_candidates.sql
database/005_ai_and_review_workflows.sql
database/006_api_runtime.sql
database/007_review_queue.sql
```

### 4. Generate Types

Generate Supabase TypeScript types and save them under a future path such as:

```text
packages/types/src/supabase.generated.ts
```

### 5. Update API Runtime Mode

Switch the API mode from:

```text
TIP_API_MODE=local-static
```

to:

```text
TIP_API_MODE=supabase
```

### 6. Seed Bootstrap Data

Use the bootstrap snapshot from:

```text
packages/core/src/bootstrapSnapshot.ts
```

to seed:

- organizations,
- products,
- projects,
- modules,
- agents,
- knowledge objects,
- tasks,
- recommendations,
- ingestion sources,
- content maps,
- review queues.

### 7. Run Advisors

After schema application, run Supabase security and performance advisors.

Focus areas:

- Row Level Security policies,
- exposed service-role behavior,
- missing indexes,
- expensive queries,
- API exposure boundaries.

### 8. Keep Dangerous Features Disabled

Do not enable these until separately approved:

```text
TIP_ENABLE_LIVE_CRAWLER=true
TIP_AI_PROVIDER=<paid-provider>
production publishing workflows
```

---

## Current Safe Runtime

Until Supabase is available, TIP runs with:

```text
Mission Control → local API → packages/core → in-memory snapshot
```

That local-first path is the approved temporary bridge.
