drop table if exists annotations;
drop table if exists jobs;
drop table if exists claims;
drop table if exists documents;
drop table if exists users;

create table users (
  id          text primary key,
  name        text not null,
  role        text not null check (role in ('adjudicator','supervisor','auditor','admin')),
  team_id     text not null,
  avatar_hue  int  not null default 250
);

create table documents (
  id           text primary key,
  filename     text not null,
  byte_size    bigint not null,
  page_count   int not null,
  version      int not null default 1,
  storage_key  text not null,
  -- Seeded fixtures ship with the deployment and live on disk. Job output has
  -- nowhere durable to go on a serverless host, so it is stored here instead.
  -- In production both would be object storage, per src/lib/storage.ts
  bytes        bytea,
  created_at   timestamptz not null default now()
);

create index documents_storage_key on documents (storage_key);

create table claims (
  id            text primary key,
  claim_ref     text not null,
  claimant      text not null,
  insured       text not null,
  policy_no     text not null,
  claim_type    text not null,
  channel       text not null,
  amount        numeric(12,2) not null,
  currency      text not null default 'CHF',
  status        text not null,
  assignee_id   text references users(id),
  team_id       text not null,
  document_id   text references documents(id),
  created_at    timestamptz not null,
  updated_at    timestamptz not null
);

-- Composite index ordered to serve the default keyset sort directly.
create index claims_keyset on claims (updated_at desc, id desc);
create index claims_team on claims (team_id, updated_at desc);
create index claims_assignee on claims (assignee_id, updated_at desc);
create index claims_status on claims (status);
create index claims_search on claims using gin (
  to_tsvector('simple', claimant || ' ' || claim_ref || ' ' || insured || ' ' || policy_no)
);

create table annotations (
  id           text primary key,
  document_id  text not null references documents(id),
  page_index   int not null,
  kind         text not null check (kind in ('highlight','note','box')),
  -- normalised 0..1 so annotations survive zoom and re-render
  x            real not null,
  y            real not null,
  w            real not null,
  h            real not null,
  body         text,
  author_id    text not null references users(id),
  created_at   timestamptz not null default now()
);

create index annotations_page on annotations (document_id, page_index);

create table jobs (
  id              text primary key,
  document_id     text not null references documents(id),
  kind            text not null check (kind in ('split','merge','delete_pages')),
  status          text not null check (status in ('queued','running','done','failed','cancelled')),
  progress        int not null default 0,
  total_pages     int not null default 0,
  message         text,
  idempotency_key text unique,
  requested_by    text not null references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index jobs_document on jobs (document_id, created_at desc);
