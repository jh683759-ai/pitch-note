-- =====================================================================
-- 3주차: 경기 MVP, 선수용 공유 링크(로그인 없이 읽기 전용)
--
-- 공유 링크는 anon이 테이블을 직접 읽지 않는다. 토큰을 검사하는
-- security definer 함수 세 개만 열어 두고, 함수가 돌려주는 것만 보인다.
--   - '팀 공개' 메모만 (감독만 메모, 선수 개인 코멘트, 감독 선수 메모는 안 나감)
--   - 실점 원인 태그는 안 나감 (개인 실수 같은 태그가 누구 탓처럼 읽히지 않게)
--   - 선수 기록에는 불참·순위·코트 위 실점이 없다 (본인 성장만)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 경기 MVP: 감독이 직접 고른다. 골 수로 자동으로 정하면 수비가 빠진다.
-- ---------------------------------------------------------------------
alter table public.matches
  add column mvp_player_id uuid references public.players (id) on delete restrict;

comment on column public.matches.mvp_player_id is '감독이 고른 경기 MVP. 그 경기 출전 선수만. 비워두면 공유 미리보기에 안 나온다.';

create index matches_mvp_idx on public.matches (mvp_player_id) where mvp_player_id is not null;

-- MVP는 그 경기에 출전(played)한 선수여야 한다
create or replace function public.check_match_mvp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.mvp_player_id is not null and not exists (
    select 1 from public.match_attendance a
    where a.match_id = new.id and a.player_id = new.mvp_player_id and a.status = 'played'
  ) then
    raise exception 'MVP는 그 경기에 출전한 선수만 고를 수 있어요'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger matches_check_mvp
  before insert or update of mvp_player_id on public.matches
  for each row execute function public.check_match_mvp();

-- 출석을 고쳐서 MVP가 출전에서 빠지면 MVP를 비운다 (출석 저장을 막지는 않는다)
create or replace function public.clear_mvp_if_not_played()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or new.status <> 'played' then
    update public.matches m
    set mvp_player_id = null
    where m.id = old.match_id and m.mvp_player_id = old.player_id;
  end if;
  return null;
end;
$$;

create trigger match_attendance_clear_mvp
  after update of status or delete on public.match_attendance
  for each row execute function public.clear_mvp_if_not_played();

-- ---------------------------------------------------------------------
-- 경기 메모 저장에 MVP를 함께 (한 번 호출 = 한 트랜잭션)
-- ---------------------------------------------------------------------
drop function public.save_match_review(uuid, jsonb);

create or replace function public.save_match_review(p_match_id uuid, p_notes jsonb, p_mvp_player_id uuid default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
begin
  if jsonb_typeof(p_notes) <> 'array' then
    raise exception '메모 데이터 형식이 잘못됐습니다' using errcode = 'invalid_parameter_value';
  end if;

  update public.matches set mvp_player_id = p_mvp_player_id
  where id = p_match_id and mvp_player_id is distinct from p_mvp_player_id;

  delete from public.match_notes
  where match_id = p_match_id and kind in ('good', 'improve', 'next_focus');

  insert into public.match_notes (match_id, kind, body, visibility, sort_order)
  select p_match_id, r.kind, trim(r.body), coalesce(r.visibility, 'coach'), (r.ord - 1)::smallint
  from rows from (jsonb_to_recordset(p_notes) as (kind text, body text, visibility text))
       with ordinality as r (kind, body, visibility, ord)
  where r.kind in ('good', 'improve', 'next_focus')
    and length(trim(coalesce(r.body, ''))) > 0
  order by r.ord;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.save_match_review(uuid, jsonb, uuid) from public, anon;
grant execute on function public.save_match_review(uuid, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 공유 링크: 토큰이 살아 있는지
-- ---------------------------------------------------------------------
create or replace function public.share_token_ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_token is not null and length(p_token) >= 32 and exists (
    select 1 from public.share_links s where s.token = p_token and s.revoked_at is null
  );
$$;

-- ---------------------------------------------------------------------
-- 공유 첫 화면: 최근 경기들, 마지막 경기의 '팀 공개' 다음 경기 포인트, 선수 이름
-- 토큰이 틀리거나 끊긴 링크면 null.
-- ---------------------------------------------------------------------
create or replace function public.shared_overview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  latest uuid;
begin
  if not public.share_token_ok(p_token) then
    return null;
  end if;

  select m.id into latest
  from public.matches m
  where m.status = 'finished'
  order by m.played_on desc, m.created_at desc
  limit 1;

  return jsonb_build_object(
    'label', (select s.label from public.share_links s where s.token = p_token),
    'matches', coalesce((
      select jsonb_agg(x order by x.played_on desc, x.created_at desc)
      from (
        select m.id, m.played_on, m.created_at, m.opponent, m.match_type, m.our_score, m.their_score,
               m.season_id, p.name as mvp_name
        from public.matches m
        left join public.players p on p.id = m.mvp_player_id
        where m.status = 'finished'
        order by m.played_on desc, m.created_at desc
        limit 40
      ) x
    ), '[]'::jsonb),
    'latest_match_id', latest,
    'next_focus', coalesce((
      select jsonb_agg(n.body order by n.sort_order)
      from public.match_notes n
      where n.match_id = latest and n.kind = 'next_focus' and n.visibility = 'team'
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'jersey_number', p.jersey_number)
                       order by p.jersey_number nulls last, p.name)
      from public.players p
      where p.is_active and p.membership = 'regular'
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 공유 경기 리뷰: 스코어, MVP, 골 목록(득점 유형만), '팀 공개' 메모
-- ---------------------------------------------------------------------
create or replace function public.shared_match(p_token text, p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.matches;
begin
  if not public.share_token_ok(p_token) then
    return null;
  end if;
  select * into m from public.matches where id = p_match_id and status = 'finished';
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', m.id,
    'played_on', m.played_on,
    'opponent', m.opponent,
    'match_type', m.match_type,
    'venue', m.venue,
    'our_score', m.our_score,
    'their_score', m.their_score,
    'mvp', (select jsonb_build_object('id', p.id, 'name', p.name) from public.players p where p.id = m.mvp_player_id),
    'players_played', (select count(*) from public.match_attendance a where a.match_id = m.id and a.status = 'played'),
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'seq', e.seq,
               'side', e.side,
               'own_goal', e.is_own_goal,
               'scorer', sc.name,
               'assist', ast.name,
               -- 실점 원인은 내보내지 않는다
               'tags', case when e.side = 'for' then coalesce((
                         select jsonb_agg(t.label order by t.sort_order)
                         from public.goal_event_tags gt join public.event_tags t on t.id = gt.tag_id
                         where gt.event_id = e.id), '[]'::jsonb) else '[]'::jsonb end
             ) order by e.seq)
      from public.goal_events e
      left join public.players sc on sc.id = e.scorer_id
      left join public.players ast on ast.id = e.assist_id
      where e.match_id = m.id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('kind', n.kind, 'body', n.body) order by n.kind, n.sort_order)
      from public.match_notes n
      where n.match_id = m.id and n.visibility = 'team' and n.kind in ('good', 'improve', 'next_focus')
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 공유 선수 기록: 본인이 온 경기만 (출전·벤치), 골·어시스트·코트에 있을 때 우리 골·MVP
-- 불참, 순위, 코트 위 실점, 감독 메모는 없다.
-- ---------------------------------------------------------------------
create or replace function public.shared_player(p_token text, p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.players;
begin
  if not public.share_token_ok(p_token) then
    return null;
  end if;
  select * into p from public.players where id = p_player_id;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'jersey_number', p.jersey_number,
    'main_position', p.main_position,
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'match_id', l.match_id,
               'played_on', l.played_on,
               'opponent', l.opponent,
               'status', l.status,
               'goals', l.goals,
               'assists', l.assists,
               'on_court_for', l.on_court_for,
               'mvp', m.mvp_player_id = p.id
             ) order by l.played_on, m.created_at)
      from public.player_match_log l
      join public.matches m on m.id = l.match_id
      where l.player_id = p.id and l.status in ('played', 'bench')
    ), '[]'::jsonb)
  );
end;
$$;

-- 공유 함수만 anon에게 연다. 토큰 검사 함수는 내부용.
revoke all on function public.share_token_ok(text) from public, anon, authenticated;
revoke all on function public.shared_overview(text) from public;
revoke all on function public.shared_match(text, uuid) from public;
revoke all on function public.shared_player(text, uuid) from public;
grant execute on function public.shared_overview(text) to anon, authenticated;
grant execute on function public.shared_match(text, uuid) to anon, authenticated;
grant execute on function public.shared_player(text, uuid) to anon, authenticated;

-- 트리거 함수는 직접 호출할 일이 없다
revoke all on function public.check_match_mvp() from public, anon;
revoke all on function public.clear_mvp_if_not_played() from public, anon;
