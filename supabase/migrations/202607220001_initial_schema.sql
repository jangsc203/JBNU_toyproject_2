-- Initial schema for Jeonnam agricultural price and supply-risk analysis.
-- Supabase Postgres is the source of truth; Pinecone stores derived vectors only.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.products (
  id uuid primary key default extensions.gen_random_uuid(),
  display_name text not null,
  category_name text,
  kamis_category_code text,
  kamis_item_code text not null,
  kamis_kind_code text,
  kamis_rank_code text,
  default_unit text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint products_display_name_not_blank check (btrim(display_name) <> ''),
  constraint products_kamis_item_code_not_blank check (btrim(kamis_item_code) <> '')
);

create unique index products_kamis_code_unique_idx
on public.products (
  kamis_item_code,
  coalesce(kamis_kind_code, ''),
  coalesce(kamis_rank_code, '')
);

create index products_active_sort_idx
on public.products (is_active, sort_order, display_name);

create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create table public.data_sync_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  job_type text not null,
  status text not null default 'pending',
  triggered_by text not null default 'manual',
  requested_by uuid references auth.users(id) on delete set null,
  target_product_ids uuid[] not null default '{}'::uuid[],
  period_start date,
  period_end date,
  total_count integer not null default 0,
  success_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  error_summary text,
  error_detail jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint data_sync_jobs_job_type_check check (
    job_type in ('kamis_daily', 'kamis_period', 'risk_analysis', 'document_generation')
  ),
  constraint data_sync_jobs_status_check check (
    status in ('pending', 'running', 'success', 'partial_success', 'failed', 'retrying', 'skipped')
  ),
  constraint data_sync_jobs_triggered_by_check check (
    triggered_by in ('cron', 'manual', 'retry', 'seed')
  ),
  constraint data_sync_jobs_counts_non_negative check (
    total_count >= 0 and success_count >= 0 and failed_count >= 0 and skipped_count >= 0
  ),
  constraint data_sync_jobs_period_order check (
    period_start is null or period_end is null or period_start <= period_end
  )
);

create index data_sync_jobs_type_status_created_idx
on public.data_sync_jobs (job_type, status, created_at desc);

create index data_sync_jobs_created_idx
on public.data_sync_jobs (created_at desc);

create trigger set_data_sync_jobs_updated_at
before update on public.data_sync_jobs
for each row execute function public.set_updated_at();

create table public.price_records (
  id uuid primary key default extensions.gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  price_date date not null,
  price numeric(12, 2),
  unit text,
  county_code text not null,
  county_name text,
  market_name text,
  product_cls_code text not null,
  product_cls_name text,
  source text not null default 'KAMIS',
  source_action text not null,
  source_payload jsonb not null default '{}'::jsonb,
  data_status text not null default 'valid',
  is_mock boolean not null default false,
  sync_job_id uuid references public.data_sync_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint price_records_price_non_negative check (price is null or price >= 0),
  constraint price_records_data_status_check check (data_status in ('valid', 'missing', 'invalid', 'mock')),
  constraint price_records_product_cls_code_check check (product_cls_code in ('01', '02')),
  constraint price_records_source_not_blank check (btrim(source) <> ''),
  constraint price_records_source_action_not_blank check (btrim(source_action) <> '')
);

create unique index price_records_natural_key_idx
on public.price_records (
  product_id,
  price_date,
  county_code,
  product_cls_code,
  market_name,
  source
) nulls not distinct;

create index price_records_product_date_idx
on public.price_records (product_id, price_date desc);

create index price_records_county_date_idx
on public.price_records (county_code, price_date desc);

create index price_records_latest_lookup_idx
on public.price_records (product_id, county_code, product_cls_code, price_date desc);

create trigger set_price_records_updated_at
before update on public.price_records
for each row execute function public.set_updated_at();

create table public.risk_results (
  id uuid primary key default extensions.gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  county_code text not null,
  risk_score numeric(5, 2),
  risk_grade text not null,
  score_version text not null default 'v1',
  evidence jsonb not null default '{}'::jsonb,
  data_quality jsonb not null default '{}'::jsonb,
  source_price_count integer not null default 0,
  sync_job_id uuid references public.data_sync_jobs(id) on delete set null,
  is_latest boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint risk_results_score_range check (risk_score is null or (risk_score >= 0 and risk_score <= 100)),
  constraint risk_results_grade_check check (risk_grade in ('high', 'watch', 'stable', 'insufficient_data')),
  constraint risk_results_source_price_count_non_negative check (source_price_count >= 0),
  constraint risk_results_period_order check (period_start <= period_end),
  constraint risk_results_score_version_not_blank check (btrim(score_version) <> '')
);

create unique index risk_results_analysis_key_idx
on public.risk_results (
  product_id,
  county_code,
  period_start,
  period_end,
  score_version
);

create unique index risk_results_latest_unique_idx
on public.risk_results (product_id, county_code, score_version)
where is_latest;

create index risk_results_product_latest_idx
on public.risk_results (product_id, county_code, is_latest);

create index risk_results_period_idx
on public.risk_results (period_start, period_end);

create trigger set_risk_results_updated_at
before update on public.risk_results
for each row execute function public.set_updated_at();

create table public.reports (
  id uuid primary key default extensions.gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  period_start date,
  period_end date,
  title text not null,
  summary text,
  content text not null,
  model_name text,
  source_document_ids uuid[] not null default '{}'::uuid[],
  created_by uuid references auth.users(id) on delete set null,
  visibility text not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reports_visibility_check check (visibility in ('public', 'private')),
  constraint reports_title_not_blank check (btrim(title) <> ''),
  constraint reports_content_not_blank check (btrim(content) <> ''),
  constraint reports_period_order check (
    period_start is null or period_end is null or period_start <= period_end
  )
);

create index reports_product_period_idx
on public.reports (product_id, period_end desc);

create index reports_visibility_created_idx
on public.reports (visibility, created_at desc);

create trigger set_reports_updated_at
before update on public.reports
for each row execute function public.set_updated_at();

create table public.analysis_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  document_type text not null,
  source_table text not null,
  source_id uuid not null,
  product_id uuid references public.products(id) on delete set null,
  risk_result_id uuid references public.risk_results(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  period_start date,
  period_end date,
  title text not null,
  content text not null,
  content_hash text not null,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  vector_status text not null default 'pending',
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint analysis_documents_type_check check (document_type in ('risk_summary', 'price_summary', 'report')),
  constraint analysis_documents_vector_status_check check (vector_status in ('pending', 'synced', 'failed', 'skipped')),
  constraint analysis_documents_version_positive check (version > 0),
  constraint analysis_documents_title_not_blank check (btrim(title) <> ''),
  constraint analysis_documents_content_not_blank check (btrim(content) <> ''),
  constraint analysis_documents_hash_not_blank check (btrim(content_hash) <> ''),
  constraint analysis_documents_period_order check (
    period_start is null or period_end is null or period_start <= period_end
  )
);

create unique index analysis_documents_source_version_idx
on public.analysis_documents (source_table, source_id, document_type, version);

create index analysis_documents_product_type_period_idx
on public.analysis_documents (product_id, document_type, period_end desc);

create index analysis_documents_vector_status_updated_idx
on public.analysis_documents (vector_status, updated_at);

create index analysis_documents_content_hash_idx
on public.analysis_documents (content_hash);

create trigger set_analysis_documents_updated_at
before update on public.analysis_documents
for each row execute function public.set_updated_at();

create table public.vector_sync_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  analysis_document_id uuid not null references public.analysis_documents(id) on delete cascade,
  status text not null default 'pending',
  pinecone_index_name text not null default 'toy-project-2',
  pinecone_namespace text not null default 'jeonnam-agri-analysis',
  pinecone_vector_id text,
  embedding_model text not null default 'gemini-embedding-2',
  embedding_dimension integer not null default 1024,
  content_hash text not null,
  error_summary text,
  error_detail jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vector_sync_jobs_status_check check (
    status in ('pending', 'running', 'success', 'failed', 'retrying', 'skipped')
  ),
  constraint vector_sync_jobs_embedding_dimension_check check (embedding_dimension = 1024),
  constraint vector_sync_jobs_index_not_blank check (btrim(pinecone_index_name) <> ''),
  constraint vector_sync_jobs_namespace_not_blank check (btrim(pinecone_namespace) <> ''),
  constraint vector_sync_jobs_embedding_model_not_blank check (btrim(embedding_model) <> ''),
  constraint vector_sync_jobs_content_hash_not_blank check (btrim(content_hash) <> '')
);

create unique index vector_sync_jobs_document_hash_idx
on public.vector_sync_jobs (
  analysis_document_id,
  content_hash,
  pinecone_index_name,
  pinecone_namespace
);

create index vector_sync_jobs_status_created_idx
on public.vector_sync_jobs (status, created_at desc);

create trigger set_vector_sync_jobs_updated_at
before update on public.vector_sync_jobs
for each row execute function public.set_updated_at();

create table public.conversations (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_last_message_idx
on public.conversations (user_id, last_message_at desc nulls last, created_at desc);

create trigger set_conversations_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create table public.messages (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  model_name text,
  period_start date,
  period_end date,
  evidence_document_ids uuid[] not null default '{}'::uuid[],
  data_limitations jsonb not null default '{}'::jsonb,
  status text not null default 'success',
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint messages_role_check check (role in ('user', 'assistant', 'system')),
  constraint messages_status_check check (status in ('success', 'failed', 'insufficient_evidence')),
  constraint messages_content_not_blank check (btrim(content) <> ''),
  constraint messages_period_order check (
    period_start is null or period_end is null or period_start <= period_end
  )
);

create index messages_conversation_created_idx
on public.messages (conversation_id, created_at);

create index messages_user_created_idx
on public.messages (user_id, created_at desc);

create trigger set_messages_updated_at
before update on public.messages
for each row execute function public.set_updated_at();

create table public.feedback (
  id uuid primary key default extensions.gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating text not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint feedback_rating_check check (rating in ('up', 'down', 'neutral'))
);

create unique index feedback_message_user_idx
on public.feedback (message_id, user_id);

create index feedback_user_created_idx
on public.feedback (user_id, created_at desc);

create trigger set_feedback_updated_at
before update on public.feedback
for each row execute function public.set_updated_at();
