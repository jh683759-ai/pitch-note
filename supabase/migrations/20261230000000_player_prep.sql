-- =====================================================================
-- 선수용 자료 + 다음 경기 준비
--
-- 공식 경기 기록(출석·골·스코어)은 그대로 감독·기록원만 쓴다.
-- 선수가 직접 쓰는 것은 '내 준비 기록'뿐이다.
--
--   resources       : 감독이 올리는 자료 (제목·링크·한 줄). 팀 전체 / 포지션 / 선수 한 명.
--                     영상·사진은 저장하지 않고 링크만.
--   resource_views  : 선수가 '봤어요'를 누른 기록
--   training_logs   : 선수 개인 훈련 기록 (날짜, 한 줄, 몇 분, 연습한 '다음 경기 내 포인트')
--
-- 저장은 풍부하게, 화면에는 '지금 할 일'만.
-- 기록원은 이 세 테이블을 못 본다 (선수 개인 영역).
-- =====================================================================

-- 로그인한 선수의 포지션 (선수는 players 테이블을 직접 못 읽는다)
create or replace function public.my_position()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.main_position from public.players p where p.id = public.my_player_id();
$$;

-- ---------------------------------------------------------------------
-- 선수용 자료
-- ---------------------------------------------------------------------
create table public.resources (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) between 1 and 80),
  url         text not null check (url ~ '^https?://' and length(url) <= 500),
  note        text check (length(note) <= 200),
  -- team=팀 전체, position=포지션, player=선수 한 명
  audience    text not null default 'team' check (audience in ('team', 'position', 'player')),
  position    text check (position in ('GK', 'FIXO', 'ALA', 'PIVO')),
  player_id   uuid references public.players (id) on delete cascade,
  is_archived boolean not null default false,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (
    (audience = 'team' and position is null and player_id is null)
    or (audience = 'position' and position is not null and player_id is null)
    or (audience = 'player' and player_id is not null and position is null)
  )
);

comment on table public.resources is '감독이 선수에게 주는 자료(팁, 훈련 영상 링크). 링크만 저장.';
comment on column public.resources.is_archived is 'true=내림. 선수 화면에서 빠지고 본 기록은 남는다.';

create index resources_live_idx on public.resources (is_archived, created_at desc);

create trigger resources_set_updated_at
  before update on public.resources
  for each row execute function public.set_updated_at();

-- 이 자료가 로그인한 선수에게 온 것인지
create or replace function public.resource_for_me(r public.resources)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.my_player_id() is not null and not r.is_archived and (
    r.audience = 'team'
    or (r.audience = 'position' and r.position = public.my_position())
    or (r.audience = 'player' and r.player_id = public.my_player_id())
  );
$$;

alter table public.resources enable row level security;

create policy resources_coach_all on public.resources
  for all to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
create policy resources_player_select on public.resources
  for select to authenticated
  using (public.resource_for_me(resources));

grant select, insert, update, delete on public.resources to authenticated;

-- ---------------------------------------------------------------------
-- '봤어요'
-- ---------------------------------------------------------------------
create table public.resource_views (
  resource_id uuid not null references public.resources (id) on delete cascade,
  player_id   uuid not null references public.players (id) on delete cascade,
  seen_at     timestamptz not null default now(),
  primary key (resource_id, player_id)
);

comment on table public.resource_views is '선수가 자료를 봤다고 누른 기록. 감독이 누가 봤는지 본다.';

create index resource_views_player_idx on public.resource_views (player_id);

alter table public.resource_views enable row level security;

create policy resource_views_self_select on public.resource_views
  for select to authenticated
  using (player_id = (select public.my_player_id()));
create policy resource_views_self_insert on public.resource_views
  for insert to authenticated
  with check (
    player_id = (select public.my_player_id())
    and exists (select 1 from public.resources r where r.id = resource_id)  -- RLS: 나에게 온 자료만 보인다
  );
create policy resource_views_self_delete on public.resource_views
  for delete to authenticated
  using (player_id = (select public.my_player_id()));
create policy resource_views_coach_select on public.resource_views
  for select to authenticated
  using ((select public.is_coach()));

grant select, insert, delete on public.resource_views to authenticated;

-- ---------------------------------------------------------------------
-- 개인 훈련 기록 (선수가 직접 쓴다. 본인과 감독만 본다)
--   focus_match_id + focus_orders: 어느 노트의 '다음 경기 내 포인트' 몇 번을 연습했는지
-- ---------------------------------------------------------------------
create table public.training_logs (
  id             uuid primary key default gen_random_uuid(),
  player_id      uuid not null references public.players (id) on delete cascade,
  trained_on     date not null default current_date,
  body           text check (length(body) <= 200),
  minutes        smallint check (minutes between 1 and 600),
  focus_match_id uuid references public.matches (id) on delete set null,
  focus_orders   smallint[] not null default '{}' check (focus_orders <@ array[0, 1, 2]::smallint[]),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- 한 줄이든 포인트 체크든 하나는 있어야 한다
  check (length(trim(coalesce(body, ''))) > 0 or cardinality(focus_orders) > 0),
  check (cardinality(focus_orders) = 0 or focus_match_id is not null)
);

comment on table public.training_logs is '선수 개인 훈련 기록. 공식 경기 기록이 아니다. 본인과 감독만 본다.';

create index training_logs_player_idx on public.training_logs (player_id, trained_on desc);

create trigger training_logs_set_updated_at
  before update on public.training_logs
  for each row execute function public.set_updated_at();

alter table public.training_logs enable row level security;

create policy training_logs_self_select on public.training_logs
  for select to authenticated
  using (player_id = (select public.my_player_id()));
create policy training_logs_self_insert on public.training_logs
  for insert to authenticated
  with check (player_id = (select public.my_player_id()));
create policy training_logs_self_update on public.training_logs
  for update to authenticated
  using (player_id = (select public.my_player_id()))
  with check (player_id = (select public.my_player_id()));
create policy training_logs_self_delete on public.training_logs
  for delete to authenticated
  using (player_id = (select public.my_player_id()));
-- 감독: 읽기만 (선수의 글이라 고치지 않는다)
create policy training_logs_coach_select on public.training_logs
  for select to authenticated
  using ((select public.is_coach()));

grant select, insert, update, delete on public.training_logs to authenticated;

-- ---------------------------------------------------------------------
-- 감독용: 선수별 '다음 경기 준비' 한 줄 (마지막 경기 이후)
--   trainings  : 훈련 기록 수, minutes: 합계(분)
--   focus_set  : 마지막으로 쓴 다음 경기 내 포인트 수, focus_practiced: 그중 한 번이라도 연습한 수
--   resources  : 나에게 온 자료 수, resources_seen: 그중 본 수
-- ---------------------------------------------------------------------
create or replace function public.prep_summary()
returns table (
  player_id uuid,
  trainings integer,
  minutes integer,
  focus_set integer,
  focus_practiced integer,
  resources integer,
  resources_seen integer,
  last_trained_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  with since as (
    select coalesce(max(m.played_on), '1900-01-01'::date) as d
    from public.matches m where m.status = 'finished'
  ),
  last_note as (
    select distinct on (n.player_id) n.player_id, n.match_id
    from public.player_notes n join public.matches m on m.id = n.match_id
    where n.kind = 'next_focus'
    order by n.player_id, m.played_on desc, m.created_at desc
  )
  select
    p.id,
    (select count(*)::int from public.training_logs t, since where t.player_id = p.id and t.trained_on >= since.d),
    (select coalesce(sum(t.minutes), 0)::int from public.training_logs t, since where t.player_id = p.id and t.trained_on >= since.d),
    (select count(*)::int from public.player_notes n join last_note ln on ln.match_id = n.match_id and ln.player_id = n.player_id
      where n.player_id = p.id and n.kind = 'next_focus'),
    (select count(distinct o)::int from public.training_logs t
      join last_note ln on ln.player_id = t.player_id and ln.match_id = t.focus_match_id
      cross join unnest(t.focus_orders) as o
      where t.player_id = p.id),
    (select count(*)::int from public.resources r where not r.is_archived and (
      r.audience = 'team' or (r.audience = 'position' and r.position = p.main_position) or r.player_id = p.id)),
    (select count(*)::int from public.resources r join public.resource_views v on v.resource_id = r.id and v.player_id = p.id
      where not r.is_archived and (
      r.audience = 'team' or (r.audience = 'position' and r.position = p.main_position) or r.player_id = p.id)),
    (select max(t.trained_on) from public.training_logs t where t.player_id = p.id)
  from public.players p
  where public.is_coach() and p.is_active;
$$;

-- ---------------------------------------------------------------------
-- 내 페이지에 '다음 경기 준비'를 더한다
--   focus_match_id : my_focus가 나온 노트의 경기 (체크할 때 같이 저장)
--   focus_practiced: my_focus 중 연습 체크한 번호들 (0부터)
--   trainings_since: 마지막 경기 이후 내 훈련 기록 수
--   resources      : 나에게 온 자료 중 안 본 것 먼저, 최신 3개
--   resources_total / resources_unseen
-- ---------------------------------------------------------------------
create or replace function public.my_prep()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := public.my_player_id();
  pos text;
  my_last uuid;
  since date;
begin
  if pid is null then
    return null;
  end if;
  select p.main_position into pos from public.players p where p.id = pid;

  select n.match_id into my_last from public.player_notes n
  join public.matches m on m.id = n.match_id
  where n.player_id = pid and n.kind = 'next_focus'
  order by m.played_on desc, m.created_at desc limit 1;

  select coalesce(max(m.played_on), '1900-01-01'::date) into since
  from public.matches m where m.status = 'finished';

  return jsonb_build_object(
    'focus_match_id', my_last,
    'focus_practiced', coalesce((
      select jsonb_agg(distinct o order by o) from public.training_logs t
      cross join unnest(t.focus_orders) as o
      where t.player_id = pid and t.focus_match_id = my_last
    ), '[]'::jsonb),
    'trainings_since', (
      select count(*) from public.training_logs t where t.player_id = pid and t.trained_on >= since
    ),
    'recent_trainings', coalesce((
      select jsonb_agg(x order by x.trained_on desc, x.created_at desc) from (
        select t.id, t.trained_on, t.body, t.minutes, t.created_at from public.training_logs t
        where t.player_id = pid order by t.trained_on desc, t.created_at desc limit 3
      ) x
    ), '[]'::jsonb),
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'url', x.url, 'note', x.note, 'seen', x.seen)
                       order by x.seen, x.created_at desc)
      from (
        select r.id, r.title, r.url, r.note, r.created_at, (v.player_id is not null) as seen
        from public.resources r
        left join public.resource_views v on v.resource_id = r.id and v.player_id = pid
        where not r.is_archived and (
          r.audience = 'team' or (r.audience = 'position' and r.position = pos) or r.player_id = pid)
        order by (v.player_id is not null), r.created_at desc
        limit 3
      ) x
    ), '[]'::jsonb),
    'resources_total', (
      select count(*) from public.resources r where not r.is_archived and (
        r.audience = 'team' or (r.audience = 'position' and r.position = pos) or r.player_id = pid)
    ),
    'resources_unseen', (
      select count(*) from public.resources r
      where not r.is_archived and (
        r.audience = 'team' or (r.audience = 'position' and r.position = pos) or r.player_id = pid)
        and not exists (select 1 from public.resource_views v where v.resource_id = r.id and v.player_id = pid)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 권한
-- ---------------------------------------------------------------------
revoke all on function public.my_position() from public, anon;
revoke all on function public.resource_for_me(public.resources) from public, anon;
revoke all on function public.prep_summary() from public, anon;
revoke all on function public.my_prep() from public, anon;
grant execute on function public.my_position() to authenticated;
-- RLS 정책 안에서 불린다
grant execute on function public.resource_for_me(public.resources) to authenticated;
grant execute on function public.prep_summary() to authenticated;
grant execute on function public.my_prep() to authenticated;
