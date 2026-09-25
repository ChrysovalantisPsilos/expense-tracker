-- Budgeer status page storage (Cloudflare D1 / SQLite). Times are ISO-8601
-- UTC strings ("2026-09-25T07:40:00.000Z"), which sort as text. Component ids
-- are the ones in src/components.js.

-- What each 10-minute check saw (the automatic state, before overrides,
-- incidents and maintenance). Kept 48 hours.
create table checks (
  id          integer primary key,
  component   text not null,
  checked_at  text not null,
  state       text not null check (state in ('working', 'slow', 'down', 'unknown')),
  latency_ms  integer
);
create index checks_time on checks (checked_at);
create index checks_component_time on checks (component, checked_at);

-- One row per component per UTC day: how many checks counted towards uptime
-- (total), how many of those were fine (ok) and the worst state shown that day
-- (after overrides, incidents and maintenance). Kept 90 days.
create table daily (
  day        text not null,
  component  text not null,
  ok         integer not null default 0,
  total      integer not null default 0,
  worst      text not null check (worst in ('working', 'slow', 'partial', 'down', 'maint', 'unknown')),
  primary key (day, component)
);

-- Incidents posted from /admin. components: JSON array of component ids.
-- resolved_at is set by a "Resolved" update and cleared if a later update
-- reopens it.
create table incidents (
  id           integer primary key,
  title        text not null,
  impact       text not null check (impact in ('minor', 'partial', 'major')),
  components   text not null default '[]',
  started_at   text not null,
  resolved_at  text
);
create index incidents_started on incidents (started_at);
create index incidents_resolved on incidents (resolved_at);

create table incident_updates (
  id           integer primary key,
  incident_id  integer not null references incidents (id) on delete cascade,
  stage        text not null check (stage in ('investigating', 'identified', 'monitoring', 'resolved')),
  message      text not null,
  created_at   text not null
);
create index incident_updates_incident on incident_updates (incident_id, created_at);

-- Planned maintenance. Rows are pruned 90 days after they end.
create table maintenance (
  id          integer primary key,
  title       text not null,
  message     text not null default '',
  components  text not null default '[]',
  starts_at   text not null,
  ends_at     text not null,
  check (ends_at > starts_at)
);
create index maintenance_ends on maintenance (ends_at);

-- Manual overrides from /admin. No row means "automatic" (the checks decide).
create table overrides (
  component  text primary key,
  state      text not null check (state in ('working', 'slow', 'down')),
  set_at     text not null
);
