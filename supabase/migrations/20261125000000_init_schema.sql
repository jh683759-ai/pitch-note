-- =====================================================================
-- pitch-note: 풋살팀 감독용 기록 사이트 — 전체 데이터 모델 (4주 MVP)
--
-- 설계 원칙
--   1. 저장은 풍부하게, 화면은 최소한으로. 나중에 묻고 싶은 질문에 답할 수
--      있도록 원천 데이터(누가 출석했고, 골 순간 코트에 누가 있었는지)를 남긴다.
--   2. 숫자는 원천 테이블에서만 계산한다. 집계값을 따로 저장하지 않고
--      뷰(security_invoker)로 계산해서 데이터가 서로 어긋날 일을 없앤다.
--   3. 태그는 코드가 아니라 테이블이다. 실경기 3경기 후 태그를 바꿀 수 있게
--      lookup 테이블 + 연결 테이블로 둔다.
--   4. 기록은 지우지 않는다. 선수는 보관(is_active=false)하고, 경기 기록이
--      있는 선수는 FK가 삭제를 막는다.
--   5. 쓰기는 감독만(RLS). 선수용 공유 페이지는 3주차에 토큰을 검사하는
--      함수로만 읽게 한다. anon 역할은 테이블을 직접 읽지 못한다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 공통: updated_at 자동 갱신
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 감독 (관리자). Supabase Auth 사용자 중 이 테이블에 있는 사람만 쓸 수 있다.
-- 회원가입 화면은 없다. 감독 계정은 대시보드에서 만들고 여기에 한 줄 넣는다.
-- ---------------------------------------------------------------------
create table public.coaches (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  created_at   timestamptz not null default now()
);

comment on table public.coaches is '쓰기 권한이 있는 감독 계정. auth.users 중 이 테이블에 있는 사용자만 기록을 쓸 수 있다.';

-- RLS 정책에서 쓰는 권한 확인 함수.
-- security definer: coaches 테이블 자체의 RLS를 거치지 않고 확인한다(무한 재귀 방지).
create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.coaches c where c.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_coach() from public;
grant execute on function public.is_coach() to authenticated;

-- ---------------------------------------------------------------------
-- 선수
-- ---------------------------------------------------------------------
create table public.players (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(trim(name)) between 1 and 30),
  jersey_number  smallint check (jersey_number between 0 and 99),
  -- 풋살 포지션: GK(골레이로) / FIXO(픽소, 수비) / ALA(아라, 측면) / PIVO(피보, 최전방)
  main_position  text check (main_position in ('GK', 'FIXO', 'ALA', 'PIVO')),
  -- 고정 멤버 / 용병. 출석률은 고정 멤버 기준으로만 의미가 있다.
  membership     text not null default 'regular' check (membership in ('regular', 'guest')),
  is_active      boolean not null default true,
  joined_on      date,
  coach_note     text check (length(coach_note) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on column public.players.membership is 'regular=고정 멤버, guest=용병';
comment on column public.players.is_active is 'false=보관. 기록은 유지되고 명단·입력 화면에서만 빠진다.';

-- 활동 중인 고정 멤버끼리는 등번호가 겹치지 않게. 용병·보관 선수는 예외.
create unique index players_active_regular_jersey_uniq
  on public.players (jersey_number)
  where is_active and membership = 'regular' and jersey_number is not null;

create index players_active_idx on public.players (is_active, membership, name);

create trigger players_set_updated_at
  before update on public.players
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 시즌 (월 단위·시즌 단위로 숫자를 본다)
-- ---------------------------------------------------------------------
create table public.seasons (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(trim(name)) between 1 and 30),
  starts_on  date not null,
  ends_on    date not null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

-- ---------------------------------------------------------------------
-- 경기
-- 스코어는 직접 저장한다(이벤트를 다 못 적어도 결과는 남도록).
-- 이벤트 수와 스코어가 다르면 뷰가 "태그 덜 된 골 수"로 알려준다.
-- ---------------------------------------------------------------------
create table public.matches (
  id                 uuid primary key default gen_random_uuid(),
  season_id          uuid not null references public.seasons (id) on delete restrict,
  played_on          date not null,
  kickoff_time       time,
  opponent           text not null check (length(trim(opponent)) between 1 and 40),
  venue              text check (length(venue) <= 60),
  match_type         text not null default 'friendly'
                       check (match_type in ('friendly', 'league', 'tournament', 'internal')),
  status             text not null default 'finished'
                       check (status in ('scheduled', 'finished', 'cancelled')),
  our_score          smallint check (our_score >= 0),
  their_score        smallint check (their_score >= 0),
  -- 경기 전 계획 vs 실제 (경기 리뷰 화면에서 나란히 본다)
  pre_match_plan     text check (length(pre_match_plan) <= 1000),
  -- 감독 메모: 결과보다 과정. 유튜브 복기 소재.
  memo_good          text check (length(memo_good) <= 2000),
  memo_improve       text check (length(memo_improve) <= 2000),
  -- 다음 훈련에서 할 것 (다음 행동)
  next_training_memo text check (length(next_training_memo) <= 1000),
  -- 영상·사진은 저장하지 않고 링크만
  media_url          text check (media_url ~ '^https?://'),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- 끝난 경기는 스코어가 있어야 한다
  check (status <> 'finished' or (our_score is not null and their_score is not null))
);

create index matches_season_played_idx on public.matches (season_id, played_on desc);
create index matches_played_idx on public.matches (played_on desc);

create trigger matches_set_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 출석·출전
-- 고정 멤버는 불참도 기록해야 출석률이 나온다. "지난 명단 복사"는
-- 직전 경기의 이 테이블을 복사하는 것.
-- ---------------------------------------------------------------------
create table public.match_attendance (
  match_id   uuid not null references public.matches (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete restrict,
  -- played=출전, bench=왔지만 안 뜀, absent=불참
  status     text not null default 'played' check (status in ('played', 'bench', 'absent')),
  -- 당일의 신분(용병이 나중에 고정이 돼도 그날 기록은 용병으로 남는다)
  membership text not null check (membership in ('regular', 'guest')),
  note       text check (length(note) <= 200),
  created_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

create index match_attendance_player_idx on public.match_attendance (player_id);

-- 당일 신분을 비워두면 선수의 현재 신분을 복사한다.
create or replace function public.fill_attendance_membership()
returns trigger
language plpgsql
as $$
begin
  if new.membership is null then
    select p.membership into new.membership from public.players p where p.id = new.player_id;
  end if;
  return new;
end;
$$;

create trigger match_attendance_fill_membership
  before insert on public.match_attendance
  for each row execute function public.fill_attendance_membership();

-- ---------------------------------------------------------------------
-- 태그 (득점 유형 / 실점 원인). 바꿀 수 있게 테이블로 둔다.
-- 태그를 지우는 대신 is_active=false로 숨기면 과거 기록이 유지된다.
-- ---------------------------------------------------------------------
create table public.event_tags (
  id         smallint generated always as identity primary key,
  kind       text not null check (kind in ('goal_type', 'concede_cause')),
  code       text not null check (code ~ '^[a-z_]{2,30}$'),
  label      text not null check (length(trim(label)) between 1 and 20),
  sort_order smallint not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (kind, code)
);

insert into public.event_tags (kind, code, label, sort_order) values
  ('goal_type',     'build_up',        '빌드업',      10),
  ('goal_type',     'counter',         '역습',        20),
  ('goal_type',     'set_piece',       '킥인/코너',   30),
  ('goal_type',     'solo',            '개인 돌파',   40),
  ('goal_type',     'gk_link',         'GK 연계',     50),
  ('concede_cause', 'transition',      '전환 실수',   10),
  ('concede_cause', 'lost_marking',    '마크 놓침',   20),
  ('concede_cause', 'outnumbered',     '수적 열세',   30),
  ('concede_cause', 'individual_error','개인 실수',   40),
  ('concede_cause', 'set_piece',       '세트피스',    50);

-- ---------------------------------------------------------------------
-- 골 / 실점 이벤트
-- side='for'는 우리 골, 'against'는 실점.
-- ---------------------------------------------------------------------
create table public.goal_events (
  id             uuid primary key default gen_random_uuid(),
  match_id       uuid not null references public.matches (id) on delete cascade,
  side           text not null check (side in ('for', 'against')),
  -- 입력 순서 (분을 모르는 경우가 많아서 순서는 따로 둔다)
  seq            smallint not null check (seq >= 1),
  period         smallint check (period between 1 and 10),
  minute         smallint check (minute between 0 and 60),
  scorer_id      uuid references public.players (id) on delete restrict,
  assist_id      uuid references public.players (id) on delete restrict,
  is_own_goal    boolean not null default false,
  -- 그 순간 우리 골키퍼 (코트 위 필드 4명과 따로)
  goalkeeper_id  uuid references public.players (id) on delete restrict,
  note           text check (length(note) <= 200),
  created_at     timestamptz not null default now(),
  unique (match_id, seq),
  -- 실점에는 우리 득점자·어시스트가 없다
  check (side = 'for' or (scorer_id is null and assist_id is null)),
  check (scorer_id is null or assist_id is null or scorer_id <> assist_id)
);

comment on column public.goal_events.is_own_goal is 'side=for: 상대 자책골, side=against: 우리 자책골';

create index goal_events_match_idx on public.goal_events (match_id, side);
create index goal_events_scorer_idx on public.goal_events (scorer_id) where scorer_id is not null;
create index goal_events_assist_idx on public.goal_events (assist_id) where assist_id is not null;

-- 이벤트 ↔ 태그 (한 골에 태그 여러 개 가능: 예) 역습 + 개인 돌파)
create table public.goal_event_tags (
  event_id uuid not null references public.goal_events (id) on delete cascade,
  tag_id   smallint not null references public.event_tags (id) on delete restrict,
  primary key (event_id, tag_id)
);

create index goal_event_tags_tag_idx on public.goal_event_tags (tag_id);

-- 골/실점 순간 코트 위 필드 플레이어 (최대 4명). 라인 조합 득실의 원천 데이터.
create table public.goal_event_on_court (
  event_id  uuid not null references public.goal_events (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  primary key (event_id, player_id)
);

create index goal_event_on_court_player_idx on public.goal_event_on_court (player_id);

-- ---------------------------------------------------------------------
-- 무결성 트리거: 화면 버그가 있어도 데이터가 틀어지지 않게 DB가 막는다.
-- ---------------------------------------------------------------------

-- 득점자·어시스트·GK는 그 경기에 출전(played)한 선수여야 한다.
create or replace function public.check_goal_event_players()
returns trigger
language plpgsql
as $$
declare
  pid uuid;
begin
  foreach pid in array array[new.scorer_id, new.assist_id, new.goalkeeper_id] loop
    if pid is not null and not exists (
      select 1 from public.match_attendance a
      where a.match_id = new.match_id and a.player_id = pid and a.status = 'played'
    ) then
      raise exception '출전 명단에 없는 선수입니다 (player_id=%)', pid
        using errcode = 'check_violation';
    end if;
  end loop;
  -- 자책골에는 득점자·어시스트를 적지 않는다
  if new.is_own_goal and (new.scorer_id is not null or new.assist_id is not null) then
    raise exception '자책골에는 득점자·어시스트를 넣지 않습니다'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger goal_events_check_players
  before insert or update on public.goal_events
  for each row execute function public.check_goal_event_players();

-- 태그 종류가 이벤트 방향과 맞아야 한다 (우리 골 ↔ 득점 유형, 실점 ↔ 실점 원인).
create or replace function public.check_goal_event_tag_kind()
returns trigger
language plpgsql
as $$
declare
  ev_side  text;
  tag_kind text;
begin
  select side into ev_side from public.goal_events where id = new.event_id;
  select kind into tag_kind from public.event_tags where id = new.tag_id;
  if (ev_side = 'for' and tag_kind <> 'goal_type')
     or (ev_side = 'against' and tag_kind <> 'concede_cause') then
    raise exception '태그 종류(%)가 이벤트(%)와 맞지 않습니다', tag_kind, ev_side
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger goal_event_tags_check_kind
  before insert or update on public.goal_event_tags
  for each row execute function public.check_goal_event_tag_kind();

-- 코트 위 필드 플레이어: 최대 4명, 출전 선수만, GK와 겹치지 않게.
create or replace function public.check_goal_event_on_court()
returns trigger
language plpgsql
as $$
declare
  ev public.goal_events%rowtype;
begin
  select * into ev from public.goal_events where id = new.event_id;

  if (select count(*) from public.goal_event_on_court o
      where o.event_id = new.event_id and o.player_id <> new.player_id) >= 4 then
    raise exception '코트 위 필드 플레이어는 최대 4명입니다'
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.match_attendance a
    where a.match_id = ev.match_id and a.player_id = new.player_id and a.status = 'played'
  ) then
    raise exception '출전 명단에 없는 선수입니다 (player_id=%)', new.player_id
      using errcode = 'check_violation';
  end if;

  if ev.goalkeeper_id = new.player_id then
    raise exception '골키퍼는 필드 플레이어 4명에 넣지 않습니다'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger goal_event_on_court_check
  before insert or update on public.goal_event_on_court
  for each row execute function public.check_goal_event_on_court();

-- ---------------------------------------------------------------------
-- 공유 링크 (3주차에 토큰 검사 함수로 읽기 전용 페이지 제공)
-- ---------------------------------------------------------------------
create table public.share_links (
  id         uuid primary key default gen_random_uuid(),
  token      text not null unique
               default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  label      text check (length(label) <= 40),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- =====================================================================
-- 집계 뷰 (2~3주차 화면이 읽는다). security_invoker라서 RLS가 그대로 적용된다.
-- 화면에 무엇을 보여줄지(표본이 작으면 숨김 등)는 화면이 정한다.
-- =====================================================================

-- 경기 요약: 결과, 출전 인원, 태그 덜 된 골 수
create view public.match_summary
with (security_invoker = true)
as
select
  m.id as match_id,
  m.season_id,
  m.played_on,
  m.opponent,
  m.status,
  m.our_score,
  m.their_score,
  case
    when m.status <> 'finished' then null
    when m.our_score > m.their_score then 'W'
    when m.our_score < m.their_score then 'L'
    else 'D'
  end as result,
  (select count(*) from public.match_attendance a
    where a.match_id = m.id and a.status = 'played')                     as players_played,
  (select count(*) from public.match_attendance a
    where a.match_id = m.id and a.status = 'played' and a.membership = 'guest') as guests_played,
  (select count(*) from public.goal_events e
    where e.match_id = m.id and e.side = 'for')                          as goals_logged,
  (select count(*) from public.goal_events e
    where e.match_id = m.id and e.side = 'against')                      as concedes_logged,
  -- 스코어보다 적게 적힌 이벤트 수 (입력이 덜 됐다는 신호)
  greatest(coalesce(m.our_score, 0) - (select count(*) from public.goal_events e
    where e.match_id = m.id and e.side = 'for'), 0)
  + greatest(coalesce(m.their_score, 0) - (select count(*) from public.goal_events e
    where e.match_id = m.id and e.side = 'against'), 0)                  as events_missing
from public.matches m;

-- 선수 × 시즌 통계: 출전, 골, 어시스트, 공격포인트, 출석률(고정 멤버로 참가한 경기 기준)
create view public.player_season_stats
with (security_invoker = true)
as
with finished as (
  select id, season_id from public.matches where status = 'finished'
),
att as (
  select f.season_id, a.player_id,
         count(*) filter (where a.status = 'played')                         as appearances,
         count(*) filter (where a.status in ('played', 'bench'))             as attended,
         count(*) filter (where a.membership = 'regular')                    as regular_matches,
         count(*) filter (where a.membership = 'regular'
                            and a.status in ('played', 'bench'))             as regular_attended
  from public.match_attendance a
  join finished f on f.id = a.match_id
  group by f.season_id, a.player_id
),
g as (
  select f.season_id, e.scorer_id as player_id, count(*) as goals
  from public.goal_events e join finished f on f.id = e.match_id
  where e.side = 'for' and e.scorer_id is not null
  group by f.season_id, e.scorer_id
),
s as (
  select f.season_id, e.assist_id as player_id, count(*) as assists
  from public.goal_events e join finished f on f.id = e.match_id
  where e.side = 'for' and e.assist_id is not null
  group by f.season_id, e.assist_id
)
select
  att.season_id,
  att.player_id,
  p.name,
  p.membership,
  att.appearances,
  att.attended,
  coalesce(g.goals, 0)   as goals,
  coalesce(s.assists, 0) as assists,
  coalesce(g.goals, 0) + coalesce(s.assists, 0) as attack_points,
  att.regular_matches,
  case when att.regular_matches > 0
       then round(att.regular_attended::numeric / att.regular_matches, 3)
  end as attendance_rate
from att
join public.players p on p.id = att.player_id
left join g on g.season_id = att.season_id and g.player_id = att.player_id
left join s on s.season_id = att.season_id and s.player_id = att.player_id;

-- 라인 조합 득실: 골/실점 순간 코트 위 필드 4명 조합별.
-- 화면은 표본 3회 이상인 조합만 보여준다(데이터 철학: 작은 표본은 숨김).
create view public.lineup_goal_diff
with (security_invoker = true)
as
with lineups as (
  select e.id as event_id, m.season_id, e.side,
         array_agg(o.player_id order by o.player_id) as player_ids
  from public.goal_events e
  join public.matches m on m.id = e.match_id
  join public.goal_event_on_court o on o.event_id = e.id
  group by e.id, m.season_id, e.side
  having count(*) = 4
)
select
  season_id,
  player_ids,
  count(*) filter (where side = 'for')     as goals_for,
  count(*) filter (where side = 'against') as goals_against,
  count(*) filter (where side = 'for') - count(*) filter (where side = 'against') as goal_diff,
  count(*) as events
from lineups
group by season_id, player_ids;

-- 태그별 집계 (득점 유형 분포, 실점 원인 추이용)
create view public.tag_counts
with (security_invoker = true)
as
select
  m.season_id,
  m.id as match_id,
  m.played_on,
  t.kind,
  t.code,
  t.label,
  count(*) as events
from public.goal_event_tags gt
join public.event_tags t on t.id = gt.tag_id
join public.goal_events e on e.id = gt.event_id
join public.matches m on m.id = e.match_id
group by m.season_id, m.id, m.played_on, t.kind, t.code, t.label;

-- =====================================================================
-- RLS: 감독만 읽고 쓴다. anon(로그인 안 한 사람)은 테이블에 직접 접근 불가.
-- =====================================================================
alter table public.coaches             enable row level security;
alter table public.players             enable row level security;
alter table public.seasons             enable row level security;
alter table public.matches             enable row level security;
alter table public.match_attendance    enable row level security;
alter table public.event_tags          enable row level security;
alter table public.goal_events         enable row level security;
alter table public.goal_event_tags     enable row level security;
alter table public.goal_event_on_court enable row level security;
alter table public.share_links         enable row level security;

-- 감독은 자기 행만 볼 수 있다. 감독 추가는 SQL(대시보드)로만.
create policy coaches_select_self on public.coaches
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy players_coach_all on public.players
  for all to authenticated using ((select public.is_coach())) with check ((select public.is_coach()));
create policy seasons_coach_all on public.seasons
  for all to authenticated using ((select public.is_coach())) with check ((select public.is_coach()));
create policy matches_coach_all on public.matches
  for all to authenticated using ((select public.is_coach())) with check ((select public.is_coach()));
create policy match_attendance_coach_all on public.match_attendance
  for all to authenticated using ((select public.is_coach())) with check ((select public.is_coach()));
create policy event_tags_coach_all on public.event_tags
  for all to authenticated using ((select public.is_coach())) with check ((select public.is_coach()));
create policy goal_events_coach_all on public.goal_events
  for all to authenticated using ((select public.is_coach())) with check ((select public.is_coach()));
create policy goal_event_tags_coach_all on public.goal_event_tags
  for all to authenticated using ((select public.is_coach())) with check ((select public.is_coach()));
create policy goal_event_on_court_coach_all on public.goal_event_on_court
  for all to authenticated using ((select public.is_coach())) with check ((select public.is_coach()));
create policy share_links_coach_all on public.share_links
  for all to authenticated using ((select public.is_coach())) with check ((select public.is_coach()));

-- anon은 아무 권한 없음 (공유 페이지는 3주차에 security definer 함수로만)
revoke all on all tables in schema public from anon;
