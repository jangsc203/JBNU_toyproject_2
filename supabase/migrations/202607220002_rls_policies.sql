-- RLS policies for public data, user-owned chat data, and service-role writes.
-- Edge Functions use the service role for system writes and external API workflows.

alter table public.products enable row level security;
alter table public.price_records enable row level security;
alter table public.data_sync_jobs enable row level security;
alter table public.risk_results enable row level security;
alter table public.analysis_documents enable row level security;
alter table public.vector_sync_jobs enable row level security;
alter table public.reports enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.feedback enable row level security;

create policy "Anyone can read active products"
on public.products
for select
to anon, authenticated
using (is_active = true);

create policy "Anyone can read price records"
on public.price_records
for select
to anon, authenticated
using (true);

create policy "Anyone can read risk results"
on public.risk_results
for select
to anon, authenticated
using (true);

create policy "Authenticated users can read analysis documents"
on public.analysis_documents
for select
to authenticated
using (true);

create policy "Anyone can read public reports"
on public.reports
for select
to anon, authenticated
using (visibility = 'public');

create policy "Users can read own reports"
on public.reports
for select
to authenticated
using (created_by = auth.uid());

create policy "Users can read own conversations"
on public.conversations
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create own conversations"
on public.conversations
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own conversations"
on public.conversations
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own conversations"
on public.conversations
for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read own messages"
on public.messages
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create own user messages"
on public.messages
for insert
to authenticated
with check (
  user_id = auth.uid()
  and role = 'user'
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and c.user_id = auth.uid()
  )
);

create policy "Users can read own feedback"
on public.feedback
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create own feedback"
on public.feedback
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.messages m
    where m.id = message_id
      and m.user_id = auth.uid()
  )
);

create policy "Users can update own feedback"
on public.feedback
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.messages m
    where m.id = message_id
      and m.user_id = auth.uid()
  )
);

create policy "Users can delete own feedback"
on public.feedback
for delete
to authenticated
using (user_id = auth.uid());

create or replace view public.data_sync_job_summaries as
select
  id,
  job_type,
  status,
  triggered_by,
  period_start,
  period_end,
  total_count,
  success_count,
  failed_count,
  skipped_count,
  error_summary,
  started_at,
  finished_at,
  created_at,
  updated_at
from public.data_sync_jobs;

create or replace view public.vector_sync_job_summaries as
select
  id,
  analysis_document_id,
  status,
  pinecone_index_name,
  pinecone_namespace,
  embedding_model,
  embedding_dimension,
  error_summary,
  started_at,
  finished_at,
  created_at,
  updated_at
from public.vector_sync_jobs;

revoke all on public.products from anon, authenticated;
revoke all on public.price_records from anon, authenticated;
revoke all on public.data_sync_jobs from anon, authenticated;
revoke all on public.risk_results from anon, authenticated;
revoke all on public.analysis_documents from anon, authenticated;
revoke all on public.vector_sync_jobs from anon, authenticated;
revoke all on public.reports from anon, authenticated;
revoke all on public.conversations from anon, authenticated;
revoke all on public.messages from anon, authenticated;
revoke all on public.feedback from anon, authenticated;
revoke all on public.data_sync_job_summaries from anon, authenticated;
revoke all on public.vector_sync_job_summaries from anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on public.products to anon, authenticated;
grant select on public.price_records to anon, authenticated;
grant select on public.risk_results to anon, authenticated;
grant select on public.reports to anon, authenticated;
grant select on public.analysis_documents to authenticated;

grant select on public.data_sync_job_summaries to anon, authenticated;
grant select on public.vector_sync_job_summaries to anon, authenticated;

grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert, update, delete on public.feedback to authenticated;
