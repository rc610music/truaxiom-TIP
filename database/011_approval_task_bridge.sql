-- Approval loop: founder-approved recommendations become durable tasks.
-- The API applies this same SQL before the first tasks read or write.
-- Existing tasks rows stay in place. Added columns hold owner, workflow, and evidence.

alter table tasks add column if not exists assigned_to text;
alter table tasks add column if not exists recommendation_id text;
alter table tasks add column if not exists workflow_status text;
alter table tasks add column if not exists acceptance_criteria jsonb not null default '[]'::jsonb;
alter table tasks add column if not exists tags jsonb not null default '[]'::jsonb;
alter table tasks add column if not exists evidence jsonb not null default '[]'::jsonb;
alter table tasks add column if not exists workflow jsonb not null default '{}'::jsonb;

comment on column tasks.assigned_to is 'Owner assigned when a recommendation approval creates the task.';
comment on column tasks.workflow_status is 'Task workflow status. Approval starts the task at in_progress.';
comment on column tasks.workflow is 'Started workflow run: id, owner, startedAt, entry step, and evidence.';
comment on column tasks.evidence is 'Evidence strings and the review-decision link copied from the approved recommendation.';
