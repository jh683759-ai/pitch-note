// DB 마이그레이션 테스트 (PGlite: 브라우저/Node에서 도는 진짜 PostgreSQL)
// Supabase의 auth 스키마와 역할을 흉내 낸 뒤 마이그레이션을 적용하고
// RLS·무결성 트리거·집계 뷰를 검증한다. Docker 없이 CI에서 돈다.
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const db = new PGlite();
const MIG_DIR = new URL("../supabase/migrations/", import.meta.url);

// --- Supabase 환경 흉내 ---------------------------------------------------
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  -- 기본 권한(default privileges)은 주지 않는다: 마이그레이션이 직접 GRANT 하는지 검증
`);

for (const f of (await readdir(MIG_DIR)).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(await readFile(new URL(f, MIG_DIR), "utf8"));
  console.log(`applied ${f}`);
}

const COACH = "00000000-0000-0000-0000-00000000c0ac";
const STRANGER = "00000000-0000-0000-0000-0000000057a1";
await db.exec(`
  insert into auth.users values ('${COACH}', 'coach@example.com'), ('${STRANGER}', 'x@example.com');
  insert into public.coaches values ('${COACH}', '감독');
`);

async function as(role, uid, fn) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const q = (sql, params) => db.query(sql, params).then((r) => r.rows);
async function rejects(promise, pattern, name) {
  await assert.rejects(promise, (e) => pattern.test(e.message), name);
  console.log(`  ok  ${name}`);
}
function ok(name) {
  console.log(`  ok  ${name}`);
}

// --- 1. RLS ----------------------------------------------------------------
console.log("RLS");
await as("anon", null, () => rejects(q("select * from players"), /permission denied/, "anon은 선수 테이블을 못 읽는다"));
await as("anon", null, () => rejects(q("select * from player_season_stats"), /permission denied/, "anon은 집계 뷰도 못 읽는다"));
await as("anon", null, () => rejects(q("select * from match_notes"), /permission denied/, "anon은 경기 메모를 직접 못 읽는다"));
await as("authenticated", STRANGER, async () => {
  await rejects(q("insert into players (name) values ('침입자')"), /row-level security/, "감독이 아닌 로그인 사용자는 쓸 수 없다");
  assert.equal((await q("select * from event_tags")).length, 0);
  ok("감독이 아닌 로그인 사용자는 태그도 안 보인다");
});

// --- 2. 감독 시나리오 --------------------------------------------------------
console.log("감독 입력 시나리오");
const ids = await as("authenticated", COACH, async () => {
  const [season] = await q(`insert into seasons (name, starts_on, ends_on) values ('2026', '2026-01-01', '2026-12-31') returning id`);
  const players = {};
  for (const [name, no, pos, mem] of [
    ["GK", 1, "GK", "regular"], ["A", 4, "FIXO", "regular"], ["B", 7, "ALA", "regular"],
    ["C", 11, "ALA", "regular"], ["D", 9, "PIVO", "regular"], ["E", 10, "ALA", "regular"],
    ["G", 99, "PIVO", "guest"],
  ]) {
    const [p] = await q(`insert into players (name, jersey_number, main_position, membership) values ($1,$2,$3,$4) returning id`, [name, no, pos, mem]);
    players[name] = p.id;
  }
  ok("감독은 선수를 추가할 수 있다");

  await rejects(q(`insert into players (name, jersey_number) values ('중복', 4)`), /duplicate key/, "활동 중인 고정 멤버끼리 등번호 중복 불가");
  await q(`insert into players (name, jersey_number, membership) values ('용병중복', 4, 'guest')`);
  ok("용병은 등번호가 겹쳐도 된다");

  await rejects(q(`insert into matches (season_id, played_on, opponent, status) values ($1, '2026-11-22', '스코어없음', 'finished')`, [season.id]), /check constraint/, "끝난 경기는 스코어가 필수");

  const [m] = await q(`insert into matches (season_id, played_on, opponent, our_score, their_score)
    values ($1, '2026-11-22', '청년부B', 3, 2) returning id`, [season.id]);

  for (const n of ["GK", "A", "B", "C", "D", "G"]) {
    await q(`insert into match_attendance (match_id, player_id) values ($1, $2)`, [m.id, players[n]]);
  }
  await q(`insert into match_attendance (match_id, player_id, status) values ($1, $2, 'absent')`, [m.id, players.E]);
  const [g] = await q(`select membership from match_attendance where player_id = $1`, [players.G]);
  assert.equal(g.membership, "guest");
  ok("출석 당일 신분(고정/용병)이 자동으로 채워진다");

  const tag = async (kind, code) => (await q(`select id from event_tags where kind=$1 and code=$2`, [kind, code]))[0].id;
  const addEvent = async (side, seq, scorer, assist, court) => {
    const [e] = await q(`insert into goal_events (match_id, side, seq, scorer_id, assist_id, goalkeeper_id) values ($1,$2,$3,$4,$5,$6) returning id`,
      [m.id, side, seq, scorer && players[scorer], assist && players[assist], players.GK]);
    for (const n of court) await q(`insert into goal_event_on_court values ($1, $2)`, [e.id, players[n]]);
    return e.id;
  };
  const line = ["A", "B", "C", "D"];
  const e1 = await addEvent("for", 1, "D", "B", line);
  await q(`insert into goal_event_tags values ($1, $2)`, [e1, await tag("goal_type", "counter")]);
  await q(`insert into goal_event_tags values ($1, $2)`, [e1, await tag("goal_type", "solo")]);
  ok("한 골에 태그 여러 개 (역습 + 개인 돌파)");
  await addEvent("for", 2, "B", null, line);
  await addEvent("for", 3, "G", "D", ["A", "G", "C", "D"]);
  const c1 = await addEvent("against", 4, null, null, line);
  await q(`insert into goal_event_tags values ($1, $2)`, [c1, await tag("concede_cause", "transition")]);

  await rejects(q(`insert into goal_event_tags values ($1, $2)`, [c1, await tag("goal_type", "counter")]), /태그 종류/, "실점에 득점 유형 태그는 못 붙인다");
  await rejects(q(`insert into goal_event_on_court values ($1, $2)`, [c1, players.G]), /최대 4명/, "코트 위 필드 플레이어는 최대 4명");
  await rejects(q(`insert into goal_events (match_id, side, seq, scorer_id) values ($1, 'for', 9, $2)`, [m.id, players.E]), /출전 명단/, "불참한 선수는 득점자가 될 수 없다");
  await rejects(q(`insert into goal_events (match_id, side, seq, scorer_id) values ($1, 'against', 9, $2)`, [m.id, players.A]), /check constraint/, "실점 이벤트에는 우리 득점자가 없다");

  // 경기 메모: 공개 범위
  await q(`insert into match_notes (match_id, kind, body, visibility) values
    ($1, 'good', '전방 압박으로 2골', 'team'),
    ($1, 'improve', '전환 수비 늦음', 'team'),
    ($1, 'next_focus', '공 뺏기면 3초 안에 압박', 'team'),
    ($1, 'next_focus', '킥인 약속 2개', 'team'),
    ($1, 'plan', '상대 7번 마크', 'coach')`, [m.id]);
  const [n] = await q(`insert into match_notes (match_id, kind, body) values ($1, 'improve', '감독만 볼 메모') returning visibility`, [m.id]);
  assert.equal(n.visibility, "coach");
  ok("메모 공개 범위 기본값은 감독만(coach)");
  await q(`insert into match_notes (match_id, kind, body, visibility) values ($1, 'next_focus', '세 번째 포인트', 'team')`, [m.id]);
  await rejects(q(`insert into match_notes (match_id, kind, body, visibility) values ($1, 'next_focus', '네 번째', 'team')`, [m.id]), /3개까지/, "다음 경기 포인트는 3개까지");
  await rejects(q(`insert into match_notes (match_id, kind, player_id, body, visibility) values ($1, 'player', $2, '수비 위치 좋아짐', 'team')`, [m.id, players.A]), /check constraint/, "선수 개인 코멘트는 공개할 수 없다");
  await q(`insert into match_notes (match_id, kind, player_id, body) values ($1, 'player', $2, '수비 위치 좋아짐')`, [m.id, players.A]);
  await rejects(q(`insert into match_notes (match_id, kind, body) values ($1, 'player', '선수 없음')`, [m.id]), /check constraint/, "선수 코멘트에는 선수가 있어야 한다");
  ok("선수 개인 코멘트는 감독만 보는 메모로 저장");

  await rejects(q(`delete from players where id = $1`, [players.D]), /foreign key/, "기록이 있는 선수는 삭제되지 않는다 (보관만)");
  return { season: season.id, players, match: m.id };
});

// --- 3. 집계 뷰 ---------------------------------------------------------------
console.log("집계 뷰");
await as("authenticated", COACH, async () => {
  const [ms] = await q(`select * from match_summary where match_id = $1`, [ids.match]);
  assert.equal(ms.result, "W");
  assert.equal(Number(ms.players_played), 6);
  assert.equal(Number(ms.guests_played), 1);
  assert.equal(Number(ms.events_missing), 1); // 3-2인데 실점은 1개만 적음
  ok("경기 요약: 결과 W, 출전 6명(용병 1), 덜 적힌 이벤트 1개");

  const stats = Object.fromEntries((await q(`select * from player_season_stats`)).map((r) => [r.name, r]));
  assert.equal(Number(stats.D.goals), 1);
  assert.equal(Number(stats.D.assists), 1);
  assert.equal(Number(stats.D.attack_points), 2);
  assert.equal(Number(stats.E.appearances), 0);
  assert.equal(Number(stats.E.attendance_rate), 0);
  assert.equal(Number(stats.D.attendance_rate), 1);
  assert.equal(stats.G.attendance_rate, null);
  ok("선수 통계: 골·어시스트·공격포인트·출석률(용병은 출석률 없음)");

  const lines = await q(`select * from lineup_goal_diff order by events desc`);
  assert.equal(lines.length, 2);
  assert.equal(Number(lines[0].goals_for), 2);
  assert.equal(Number(lines[0].goals_against), 1);
  ok("라인 조합 득실: A·B·C·D 조합 +2 / -1");

  const tags = await q(`select code, events from tag_counts order by code`);
  assert.deepEqual(tags.map((t) => t.code), ["counter", "solo", "transition"]);
  ok("태그 집계");
});

// --- 4. 2주차: 경기 입력 함수 -------------------------------------------------
console.log("경기 입력 함수 (2주차)");
const m2 = await as("authenticated", COACH, async () => {
  const P = ids.players;
  const rpc = (fn, args) => q(`select * from ${fn}`, args);

  // 시즌 자동 선택/생성
  const [{ ensure_season_for: s2026 }] = await q(`select ensure_season_for('2026-12-06')`);
  assert.equal(s2026, ids.season);
  const [{ ensure_season_for: s2027 }] = await q(`select ensure_season_for('2027-01-10')`);
  const [s27] = await q(`select name from seasons where id = $1`, [s2027]);
  assert.equal(s27.name, "2027 시즌");
  const [{ ensure_season_for: again }] = await q(`select ensure_season_for('2027-03-01')`);
  assert.equal(again, s2027);
  ok("경기 날짜로 시즌을 찾고, 없으면 그 해 시즌을 만든다");

  const [m] = await q(`insert into matches (season_id, played_on, opponent, our_score, their_score)
    values ($1, '2026-12-06', '장년부', 0, 0) returning id`, [ids.season]);

  // 지난 명단 복사: 직전 경기의 출석 (보관 선수 제외)
  await q(`update players set is_active = false where id = $1`, [P.C]);
  const prev = await rpc(`previous_attendance($1)`, [m.id]);
  const prevMap = Object.fromEntries(prev.map((r) => [r.player_id, r.status]));
  assert.equal(prev.length, 6); // 7명 중 보관한 C 제외
  assert.equal(prevMap[P.E], "absent");
  assert.equal(prevMap[P.C], undefined);
  assert.equal(prev[0].source_opponent, "청년부B");
  ok("지난 경기 명단 복사: 직전 경기 출석, 보관 선수는 빠짐");
  await q(`update players set is_active = true where id = $1`, [P.C]);
  assert.equal((await rpc(`previous_attendance($1)`, [ids.match])).length, 0);
  ok("첫 경기는 복사할 명단이 없다");

  // 출석 저장 (전체 교체)
  const rows = (o) => JSON.stringify(Object.entries(o).map(([n, status]) => ({ player_id: P[n], status })));
  await q(`select set_attendance($1, $2::jsonb)`, [m.id, rows({ GK: "played", A: "played", B: "played", C: "played", D: "played", E: "bench", G: "absent" })]);
  await q(`select set_attendance($1, $2::jsonb)`, [m.id, rows({ GK: "played", A: "played", B: "played", C: "played", D: "played", E: "played" })]);
  const att = await q(`select player_id, status, membership from match_attendance where match_id = $1`, [m.id]);
  assert.equal(att.length, 6);
  assert.ok(att.every((a) => a.status === "played"));
  ok("출석 저장은 전체 교체 (목록에서 빠진 용병은 명단에서 제외)");

  // 골 이벤트: 한 번에 저장 + 스코어 자동 증가
  const tagId = async (kind, code) => (await q(`select id from event_tags where kind=$1 and code=$2`, [kind, code]))[0].id;
  const save = (o) => q(`select save_goal_event(
      p_match_id => $1, p_side => $2, p_scorer_id => $3, p_assist_id => $4, p_is_own_goal => $5,
      p_goalkeeper_id => $6, p_tag_ids => $7::smallint[], p_on_court => $8::uuid[], p_note => $9, p_event_id => $10) as id`,
    [m.id, o.side, o.scorer ?? null, o.assist ?? null, o.own ?? false, o.gk ?? P.GK, o.tags ?? [], o.court ?? [], o.note ?? null, o.id ?? null])
    .then((r) => r[0].id);
  const court = [P.A, P.B, P.C, P.D];
  const g1 = await save({ side: "for", scorer: P.D, assist: P.B, tags: [await tagId("goal_type", "build_up")], court });
  const g2 = await save({ side: "for", scorer: P.B, tags: [await tagId("goal_type", "counter")], court: [P.A, P.B, P.E, P.D] });
  const c1 = await save({ side: "against", tags: [await tagId("concede_cause", "lost_marking")], court });
  const evs = await q(`select id, seq from goal_events where match_id = $1 order by seq`, [m.id]);
  assert.deepEqual(evs.map((e) => e.seq), [1, 2, 3]);
  let [score] = await q(`select our_score, their_score from matches where id = $1`, [m.id]);
  assert.deepEqual([score.our_score, score.their_score], [2, 1]);
  ok("골·실점 저장: 순서 자동, 태그·코트 위 4명 한 번에, 스코어 자동 증가");

  // 고치기: 태그·코트 위 명단 교체
  await save({ id: g1, side: "for", scorer: P.D, assist: P.A, tags: [await tagId("goal_type", "counter"), await tagId("goal_type", "solo")], court });
  const g1tags = await q(`select t.code from goal_event_tags gt join event_tags t on t.id = gt.tag_id where event_id = $1 order by code`, [g1]);
  assert.deepEqual(g1tags.map((t) => t.code), ["counter", "solo"]);
  const [g1row] = await q(`select assist_id, seq from goal_events where id = $1`, [g1]);
  assert.equal(g1row.assist_id, P.A);
  assert.equal(g1row.seq, 1);
  ok("기록 고치기: 순서는 유지, 태그는 교체");

  // 실패하면 반쪽 기록이 남지 않는다 (트랜잭션)
  const before = (await q(`select count(*)::int as n from goal_events where match_id = $1`, [m.id]))[0].n;
  await rejects(save({ side: "for", scorer: P.D, court: [P.A, P.B, P.C, P.D, P.E] }), /최대 4명/, "코트 위 5명이면 저장 거부");
  await rejects(save({ side: "against", tags: [await tagId("goal_type", "solo")], court }), /태그 종류/, "실점에 득점 유형 태그면 저장 거부");
  const after = (await q(`select count(*)::int as n from goal_events where match_id = $1`, [m.id]))[0].n;
  assert.equal(after, before);
  ok("저장이 실패하면 이벤트도 남지 않는다 (한 트랜잭션)");
  await rejects(save({ id: ids.match, side: "for" }), /찾을 수 없어요/, "다른 경기의 기록 id로는 고칠 수 없다");

  // 기록에 있는 선수는 출전에서 못 뺀다
  await rejects(q(`select set_attendance($1, $2::jsonb)`, [m.id, rows({ GK: "played", A: "played", B: "played", C: "played", D: "bench", E: "played" })]),
    /출전에서 뺄 수 없어요: D/, "골 기록에 있는 선수는 출전에서 뺄 수 없다");

  // 스코어는 기록보다 크게 직접 둘 수 있다 (다 못 적은 골)
  await q(`update matches set our_score = 4 where id = $1`, [m.id]);
  await save({ side: "for", scorer: P.E, court: [P.A, P.E, P.C, P.D] });
  [score] = await q(`select our_score from matches where id = $1`, [m.id]);
  assert.equal(score.our_score, 4);
  ok("감독이 적은 스코어가 기록 수보다 크면 그대로 둔다");

  // 경기 메모 (전체 교체, 다음 경기 포인트 3개 제한 유지)
  const notes = (arr) => JSON.stringify(arr.map(([kind, body, visibility]) => ({ kind, body, visibility })));
  await q(`select save_match_review($1, $2::jsonb)`, [m.id, notes([["good", "빌드업 2골", "team"], ["improve", "세컨볼", "coach"], ["next_focus", "킥인 약속", "team"], ["next_focus", "  ", "team"]])]);
  await q(`insert into match_notes (match_id, kind, player_id, body) values ($1, 'player', $2, '개인 코멘트')`, [m.id, P.A]);
  await q(`select save_match_review($1, $2::jsonb)`, [m.id, notes([["good", "빌드업 2골", "team"], ["next_focus", "a", "team"], ["next_focus", "b", "coach"]])]);
  const ns = await q(`select kind, body, visibility from match_notes where match_id = $1 order by kind, sort_order`, [m.id]);
  assert.deepEqual(ns.map((n) => `${n.kind}:${n.body}:${n.visibility}`), ["good:빌드업 2골:team", "next_focus:a:team", "next_focus:b:coach", "player:개인 코멘트:coach"]);
  ok("경기 메모 저장: 전체 교체, 빈 줄 무시, 선수 개인 코멘트는 유지");
  await rejects(q(`select save_match_review($1, $2::jsonb)`, [m.id, notes([["next_focus", "1"], ["next_focus", "2"], ["next_focus", "3"], ["next_focus", "4"]])]), /3개까지/, "메모 저장도 다음 경기 포인트 3개 제한");
  const [{ n: keep }] = await q(`select count(*)::int as n from match_notes where match_id = $1`, [m.id]);
  assert.equal(keep, 4);
  ok("메모 저장이 실패하면 기존 메모가 그대로 남는다");

  return { match: m.id, g1, g2, c1 };
});

// --- 5. 2주차: 집계 뷰 --------------------------------------------------------
console.log("집계 뷰 (2주차)");
await as("authenticated", COACH, async () => {
  const P = ids.players;
  const name = Object.fromEntries(Object.entries(P).map(([k, v]) => [v, k]));

  // 1경기: A·B·C·D 코트 위 for 2, against 1 / A·G·C·D for 1
  // 2경기: A·B·C·D for 1(g1), against 1(c1) / A·B·E·D for 1(g2) / A·E·C·D for 1 (스코어만 4로 올린 골은 기록 없음)
  const oc = Object.fromEntries((await q(`select * from player_on_court_stats where season_id = $1`, [ids.season])).map((r) => [name[r.player_id], r]));
  assert.equal(Number(oc.A.on_court_for), 6);
  assert.equal(Number(oc.A.on_court_against), 2);
  assert.equal(Number(oc.A.on_court_diff), 4);
  assert.equal(Number(oc.B.on_court_for), 4);
  assert.equal(Number(oc.E.on_court_for), 2);
  assert.equal(oc.GK, undefined); // GK는 필드 4명에 없다
  ok("선수별 코트 위 득실 (+/-): A +6/-2, GK는 필드 집계에서 빠짐");

  const pairs = await q(`select * from pair_goal_diff where season_id = $1`, [ids.season]);
  const pair = (x, y) => pairs.find((p) => [p.player_a, p.player_b].sort().join() === [P[x], P[y]].sort().join());
  assert.equal(Number(pair("A", "D").goals_for), 6);
  assert.equal(Number(pair("A", "D").goals_against), 2);
  assert.equal(Number(pair("B", "E").events), 1);
  assert.ok(pairs.every((p) => p.player_a < p.player_b));
  ok("두 명 조합 득실: 같은 쌍은 한 줄로 (A·D +6/-2)");

  const log = await q(`select * from player_match_log where player_id = $1 order by played_on`, [P.D]);
  assert.equal(log.length, 2);
  assert.deepEqual(log.map((l) => [Number(l.goals), Number(l.assists)]), [[1, 1], [1, 0]]);
  assert.deepEqual(log.map((l) => [Number(l.on_court_for), Number(l.on_court_against)]), [[3, 1], [3, 1]]);
  const [gk] = await q(`select conceded_as_gk from player_match_log where player_id = $1 and match_id = $2`, [P.GK, m2.match]);
  assert.equal(Number(gk.conceded_as_gk), 1);
  ok("선수 × 경기 기록 (성장 추이용): 경기별 골·어시스트·코트 위 득실·GK 실점");

  const stats = Object.fromEntries((await q(`select * from player_season_stats where season_id = $1`, [ids.season])).map((r) => [r.name, r]));
  assert.equal(Number(stats.D.goals), 2);
  assert.equal(Number(stats.E.attendance_rate), 0.5);
  ok("시즌 통계가 2경기를 합친다 (E 출석률 1/2)");
});

await as("anon", null, async () => {
  await rejects(q("select * from player_match_log"), /permission denied/, "anon은 새 집계 뷰도 못 읽는다");
  await rejects(q(`select save_goal_event($1, 'for')`, [m2.match]), /permission denied/, "anon은 입력 함수를 호출할 수 없다");
});
await as("authenticated", STRANGER, async () => {
  await rejects(q(`select save_goal_event($1, 'for')`, [m2.match]), /row-level security|찾을 수|violates/, "감독이 아니면 입력 함수로도 쓸 수 없다");
  assert.equal((await q(`select * from previous_attendance($1)`, [m2.match])).length, 0);
  ok("감독이 아니면 지난 명단도 안 보인다");
});

// --- 6. 3주차: MVP, 공유 링크 ------------------------------------------------
console.log("MVP · 공유 링크 (3주차)");
const share = await as("authenticated", COACH, async () => {
  const P = ids.players;
  // MVP는 출전 선수만, 메모 저장과 한 번에
  const notes = JSON.stringify([
    { kind: "good", body: "빌드업 2골", visibility: "team" },
    { kind: "improve", body: "감독만 보는 개선점", visibility: "coach" },
    { kind: "next_focus", body: "킥인 약속", visibility: "team" },
    { kind: "next_focus", body: "감독만 포인트", visibility: "coach" },
  ]);
  await q(`select save_match_review($1, $2::jsonb, $3)`, [m2.match, notes, P.D]);
  let [mm] = await q(`select mvp_player_id from matches where id = $1`, [m2.match]);
  assert.equal(mm.mvp_player_id, P.D);
  ok("메모 저장과 MVP를 한 번에 저장");
  await rejects(q(`update matches set mvp_player_id = $2 where id = $1`, [m2.match, P.G]), /출전한 선수만/, "출전하지 않은 선수는 MVP가 될 수 없다");

  // 출석에서 MVP를 벤치로 돌리면 MVP가 비워진다 (D는 골 기록이 있어서 못 빼므로 E로 확인)
  await q(`select save_match_review($1, $2::jsonb, $3)`, [m2.match, notes, P.E]);
  const rows = (o) => JSON.stringify(Object.entries(o).map(([n, status]) => ({ player_id: P[n], status })));
  await q(`select set_attendance($1, $2::jsonb)`, [m2.match, rows({ GK: "played", A: "played", B: "played", C: "played", D: "played", E: "played" })]);
  [mm] = await q(`select mvp_player_id from matches where id = $1`, [m2.match]);
  assert.equal(mm.mvp_player_id, P.E);
  ok("출석을 다시 저장해도 계속 출전이면 MVP 유지");
  // E는 m2에서 코트 위 기록이 있어 출전에서 못 빼므로, 직접 출석 행을 지워 트리거를 확인
  await q(`delete from goal_event_on_court where player_id = $1 and event_id in (select id from goal_events where match_id = $2)`, [P.E, m2.match]);
  await q(`update match_attendance set status = 'bench' where match_id = $1 and player_id = $2`, [m2.match, P.E]);
  [mm] = await q(`select mvp_player_id from matches where id = $1`, [m2.match]);
  assert.equal(mm.mvp_player_id, null);
  ok("MVP가 출전에서 빠지면 MVP가 비워진다");
  await q(`select save_match_review($1, $2::jsonb, $3)`, [m2.match, notes, P.D]);

  // MVP가 있는 경기도 지울 수 있다 (연쇄 삭제 중 트리거가 막지 않는다)
  const [tmp] = await q(`insert into matches (season_id, played_on, opponent, our_score, their_score) values ($1, '2026-12-01', '삭제용', 1, 0) returning id`, [ids.season]);
  await q(`select set_attendance($1, $2::jsonb)`, [tmp.id, rows({ A: "played" })]);
  await q(`update matches set mvp_player_id = $2 where id = $1`, [tmp.id, P.A]);
  await q(`delete from matches where id = $1`, [tmp.id]);
  ok("MVP가 있는 경기 삭제");

  const [link] = await q(`insert into share_links (label) values ('우리팀') returning token`);
  const [dead] = await q(`insert into share_links (label, revoked_at) values ('끊은 링크', now()) returning token`);
  return { token: link.token, dead: dead.token };
});

await as("anon", null, async () => {
  const P = ids.players;
  await rejects(q(`select * from share_links`), /permission denied/, "anon은 공유 링크 테이블을 못 읽는다");
  await rejects(q(`select share_token_ok($1)`, [share.token]), /permission denied/, "anon은 토큰 검사 함수를 직접 못 부른다");

  const [{ o }] = await q(`select shared_overview($1) as o`, [share.token]);
  assert.equal(o.label, "우리팀");
  assert.equal(o.latest_match_id, m2.match);
  assert.deepEqual(o.next_focus, ["킥인 약속"]);
  assert.equal(o.matches.length, 2);
  assert.equal(o.matches[0].mvp_name, "D");
  assert.ok(o.players.every((p) => p.name !== "G"), "용병은 선수 목록에 없다");
  assert.equal(JSON.stringify(o).includes("감독만"), false);
  ok("공유 첫 화면: 경기 목록·MVP·'팀 공개' 포인트만");

  const [{ m }] = await q(`select shared_match($1, $2) as m`, [share.token, m2.match]);
  assert.equal(m.mvp.name, "D");
  assert.deepEqual(m.notes.map((n) => `${n.kind}:${n.body}`), ["good:빌드업 2골", "next_focus:킥인 약속"]);
  assert.equal(JSON.stringify(m).includes("개인 코멘트"), false);
  const against = m.goals.filter((g) => g.side === "against");
  assert.ok(against.length > 0 && against.every((g) => g.tags.length === 0));
  assert.ok(m.goals.find((g) => g.side === "for" && g.scorer === "D").tags.length > 0);
  ok("공유 경기 리뷰: 감독만 메모·선수 코멘트·실점 원인은 안 나간다");

  const [{ p }] = await q(`select shared_player($1, $2) as p`, [share.token, P.D]);
  assert.equal(p.name, "D");
  assert.equal(p.matches.length, 2);
  assert.equal(p.matches[1].mvp, true);
  assert.equal(JSON.stringify(p).includes("against"), false);
  assert.equal(JSON.stringify(p).includes("coach_note"), false);
  ok("공유 선수 기록: 본인 경기별 골·어시스트·MVP, 실점·감독 메모 없음");

  for (const bad of [share.dead, "short", "x".repeat(64), null]) {
    const [{ o: none }] = await q(`select shared_overview($1) as o`, [bad]);
    assert.equal(none, null);
  }
  const [{ m: none2 }] = await q(`select shared_match($1, $2) as m`, [share.dead, m2.match]);
  assert.equal(none2, null);
  ok("끊은 링크·틀린 토큰은 아무것도 안 보인다");
});


// --- 7. 4주차: 기록원 (가입 신청 → 감독 승인) -------------------------------
console.log("기록원 (4주차)");
const REC = "00000000-0000-0000-0000-0000000000ec";
const OTHER = "00000000-0000-0000-0000-0000000000e2";
await db.exec(`
  insert into auth.users values
    ('${REC}', 'rec@example.com', '{"signup":"pitch-note","display_name":"주장"}'),
    ('${OTHER}', 'other@example.com', '{"signup":"pitch-note"}');
`);
{
  const rows = await q(`select user_id, display_name, status from members order by display_name`);
  assert.deepEqual(rows.map((r) => `${r.display_name}:${r.status}`), ["other:pending", "주장:pending"]);
  assert.equal((await q(`select * from members where user_id = $1`, [STRANGER])).length, 0);
  ok("앱에서 가입한 계정만 승인 대기로 올라온다 (이름 없으면 이메일 앞부분)");
}

await as("authenticated", REC, async () => {
  const [{ my_role }] = await q(`select my_role()`);
  assert.equal(my_role, "pending");
  assert.equal((await q(`select * from matches`)).length, 0);
  await rejects(q(`insert into matches (season_id, played_on, opponent, our_score, their_score) values ($1, '2026-12-20', '승인 전', 0, 0)`, [ids.season]), /row-level security/, "승인 전에는 경기를 못 만든다");
  assert.equal((await q(`update members set status = 'recorder' where user_id = $1 returning *`, [REC])).length, 0);
  ok("스스로 기록원으로 승격할 수 없다");
  const [me] = await q(`select status from members where user_id = $1`, [REC]);
  assert.equal(me.status, "pending");
  assert.equal((await q(`select * from members`)).length, 1);
  ok("승인 대기 중에는 아무것도 못 보고, 다른 신청자도 안 보인다");
  assert.equal((await q(`select * from staff_names()`)).length, 0);
  ok("승인 전에는 기록한 사람 이름 목록도 안 보인다");
});

await as("authenticated", COACH, async () => {
  assert.equal((await q(`select * from members`)).length, 2);
  await q(`update members set status = 'recorder', approved_at = now(), approved_by = $2 where user_id = $1`, [REC, COACH]);
  await q(`delete from members where user_id = $1`, [OTHER]);
  ok("감독은 신청 목록을 보고 승인·거절한다");
});

const rec = await as("authenticated", REC, async () => {
  const P = ids.players;
  const [{ my_role }] = await q(`select my_role()`);
  assert.equal(my_role, "recorder");

  // 경기 만들기 → 출석 → 골 기록 → 고치기
  const [{ ensure_season_for: sid }] = await q(`select ensure_season_for('2026-12-20')`);
  const [m] = await q(`insert into matches (season_id, played_on, opponent, our_score, their_score) values ($1, '2026-12-20', '기록원 경기', 0, 0) returning id, created_by`, [sid]);
  assert.equal(m.created_by, REC);
  const [guest] = await q(`insert into players (name, membership) values ('당일용병', 'guest') returning id`);
  await rejects(q(`insert into players (name) values ('고정멤버 추가')`), /row-level security/, "기록원은 고정 멤버를 추가할 수 없다 (용병만)");
  const rows = JSON.stringify([P.GK, P.A, P.B, P.C, P.D, guest.id].map((player_id) => ({ player_id, status: "played" })));
  await q(`select set_attendance($1, $2::jsonb)`, [m.id, rows]);
  const tagId = (await q(`select id from event_tags where kind = 'goal_type' and code = 'counter'`))[0].id;
  const [{ id: g }] = await q(`select save_goal_event(p_match_id => $1, p_side => 'for', p_scorer_id => $2, p_tag_ids => $3::smallint[], p_on_court => $4::uuid[]) as id`,
    [m.id, P.D, [tagId], [P.A, P.B, P.C, P.D]]);
  await q(`select save_goal_event(p_match_id => $1, p_side => 'for', p_scorer_id => $2, p_on_court => $3::uuid[], p_event_id => $4)`, [m.id, guest.id, [P.A, P.B, guest.id, P.D], g]);
  const [ev] = await q(`select scorer_id, created_by, updated_by from goal_events where id = $1`, [g]);
  assert.equal(ev.scorer_id, guest.id);
  assert.equal(ev.created_by, REC);
  assert.equal(ev.updated_by, REC);
  await q(`update matches set our_score = 2, their_score = 1 where id = $1`, [m.id]);
  ok("기록원: 경기 만들기·용병 추가·출석·골 기록·고치기·스코어");

  // 삭제는 못 한다 (정책이 없으니 0행 삭제)
  const delM = await q(`delete from matches where id = $1 returning id`, [m.id]);
  const delG = await q(`delete from goal_events where id = $1 returning id`, [g]);
  const delP = await q(`delete from players where id = $1 returning id`, [guest.id]);
  assert.equal(delM.length + delG.length + delP.length, 0);
  assert.equal((await q(`select id from matches where id = $1`, [m.id])).length, 1);
  assert.equal((await q(`select id from goal_events where id = $1`, [g])).length, 1);
  ok("기록원은 경기·골 기록·선수를 지울 수 없다");

  // 감독 영역
  assert.equal((await q(`update players set name = '이름바꾸기' where id = $1 returning id`, [P.A])).length, 0);
  ok("기록원은 선수 정보를 못 고친다");
  await rejects(q(`update matches set mvp_player_id = $2 where id = $1`, [m.id, P.D]), /감독만/, "기록원은 MVP를 고를 수 없다");
  await rejects(q(`insert into match_notes (match_id, kind, body, visibility) values ($1, 'good', '기록원 메모', 'team')`, [m.id]), /row-level security/, "기록원은 메모를 못 쓴다");
  assert.equal((await q(`select * from share_links`)).length, 0);
  await rejects(q(`insert into share_links (label) values ('몰래')`), /row-level security/, "기록원은 공유 링크를 못 만든다");
  const notes = await q(`select visibility from match_notes`);
  assert.ok(notes.length > 0 && notes.every((n) => n.visibility === "team"));
  ok("기록원은 '팀 공개' 메모만 보이고, 메모·MVP·공유 링크·선수 수정은 감독만");

  const names = await q(`select * from staff_names()`);
  assert.deepEqual(names.map((n) => n.display_name).sort(), ["감독", "주장"]);
  ok("기록한 사람 이름 목록 (감독·기록원)");
  return { match: m.id, event: g };
});

await as("authenticated", COACH, async () => {
  await q(`update matches set opponent = '감독이 고침' where id = $1`, [rec.match]);
  const [m] = await q(`select created_by, updated_by from matches where id = $1`, [rec.match]);
  assert.deepEqual([m.created_by, m.updated_by], [REC, COACH]);
  ok("만든 사람은 그대로, 마지막 수정자는 감독");
  assert.equal((await q(`delete from goal_events where id = $1 returning id`, [rec.event])).length, 1);
  assert.equal((await q(`delete from matches where id = $1 returning id`, [rec.match])).length, 1);
  ok("감독은 기록원이 만든 기록도 지울 수 있다");
  await q(`delete from members where user_id = $1`, [REC]);
});

await as("authenticated", REC, async () => {
  const [{ my_role }] = await q(`select my_role()`);
  assert.equal(my_role, "none");
  assert.equal((await q(`select * from matches`)).length, 0);
  ok("권한을 빼면 바로 아무것도 안 보인다");
  await rejects(q(`insert into members (user_id, display_name, status) values ($1, '주장', 'recorder')`, [REC]), /row-level security/, "다시 신청할 때 스스로 기록원이 될 수 없다");
  await q(`insert into members (user_id, display_name) values ($1, '주장')`, [REC]);
  const [{ my_role: again }] = await q(`select my_role()`);
  assert.equal(again, "pending");
  ok("권한이 빠진 사람은 다시 '승인 대기'로 신청할 수 있다");
});
await as("anon", null, () => rejects(q(`select * from members`), /permission denied/, "anon은 신청 목록을 못 본다"));

// --- 8. 선수 계정 (가입 신청 → 감독이 명단 선수와 연결) ----------------------
console.log("선수 계정");
const PL = "00000000-0000-0000-0000-0000000000d1";
const PL2 = "00000000-0000-0000-0000-0000000000d2";
await db.exec(`
  insert into auth.users values
    ('${PL}', 'd@example.com', '{"signup":"pitch-note","display_name":"디","wants":"player"}'),
    ('${PL2}', 'e@example.com', '{"signup":"pitch-note","display_name":"이","wants":"player"}');
`);
const PP = ids.players;
const pm = await as("authenticated", COACH, async () => {
  const rows = await q(`select user_id, wants, status from members where user_id in ($1, $2)`, [PL, PL2]);
  assert.ok(rows.length === 2 && rows.every((r) => r.wants === "player" && r.status === "pending"));
  ok("선수로 가입하면 '선수' 신청으로 승인 대기에 올라온다");
  await rejects(q(`update members set status = 'player' where user_id = $1`, [PL]), /members_player_linked/, "선수 승인은 명단의 선수와 연결해야 한다");
  await q(`update members set status = 'player', player_id = $2, approved_at = now(), approved_by = $3 where user_id = $1`, [PL, PP.D, COACH]);
  await rejects(q(`update members set status = 'player', player_id = $2 where user_id = $1`, [PL2, PP.D]), /duplicate key/, "선수 한 명에 계정은 하나");
  await q(`update members set status = 'player', player_id = $2 where user_id = $1`, [PL2, PP.E]);
  ok("감독이 선수 계정을 명단의 선수와 연결해 승인한다");

  const [att] = await q(`select a.match_id from match_attendance a join matches m on m.id = a.match_id
    where a.player_id = $1 and a.status = 'played' and m.status = 'finished' order by m.played_on desc limit 1`, [PP.D]);
  const [{ id: sid }] = await q(`select id from seasons limit 1`);
  const [absent] = await q(`insert into matches (season_id, played_on, opponent, our_score, their_score) values ($1, '2026-12-27', 'D 불참 경기', 1, 0) returning id`, [sid]);
  await q(`select set_attendance($1, $2::jsonb)`, [absent.id, JSON.stringify([{ player_id: PP.A, status: "played" }, { player_id: PP.D, status: "absent" }])]);
  return { played: att.match_id, absent: absent.id };
});

await as("authenticated", PL, async () => {
  const [{ my_role }] = await q(`select my_role()`);
  assert.equal(my_role, "player");
  assert.equal((await q(`select * from players`)).length, 0);
  assert.equal((await q(`select * from matches`)).length, 0);
  assert.equal((await q(`select * from match_notes`)).length, 0);
  assert.equal((await q(`select * from goal_events`)).length, 0);
  ok("선수는 테이블을 직접 못 읽는다 (감독 메모·명단 포함)");
  await rejects(q(`insert into matches (season_id, played_on, opponent, our_score, their_score) values ($1, '2026-12-28', '선수가', 0, 0)`, [ids.season]), /row-level security/, "선수는 경기를 못 만든다");
  assert.equal((await q(`delete from match_attendance where match_id = $1 returning *`, [pm.played])).length, 0);
  await rejects(q(`insert into match_attendance (match_id, player_id, status) values ($1, $2, 'played')`, [pm.absent, PP.D]), /row-level security/, "선수는 출석을 못 바꾼다");
  assert.equal((await q(`update members set player_id = $2 where user_id = $1 returning *`, [PL, PP.A])).length, 0);
  ok("선수는 연결된 선수를 스스로 바꿀 수 없다");

  const notes = JSON.stringify([
    { kind: "good", body: "  압박 타이밍 좋았음 " },
    { kind: "improve", body: "슈팅 전에 고개 들기" },
    { kind: "next_focus", body: "왼발 패스" },
    { kind: "next_focus", body: "" },
    { kind: "player", body: "무시됨" },
  ]);
  const [{ save_my_notes: n }] = await q(`select save_my_notes($1, $2::jsonb)`, [pm.played, notes]);
  assert.equal(n, 3);
  const mine = await q(`select kind, body, player_id from player_notes order by sort_order`);
  assert.deepEqual(mine.map((r) => `${r.kind}:${r.body}`), ["good:압박 타이밍 좋았음", "improve:슈팅 전에 고개 들기", "next_focus:왼발 패스"]);
  assert.ok(mine.every((r) => r.player_id === PP.D));
  ok("선수 기록 노트: 잘된 점·아쉬운 점·다음 경기 내 포인트 저장 (빈 칸은 버린다)");

  await rejects(q(`select save_my_notes($1, '[{"kind":"good","body":"안 온 경기"}]'::jsonb)`, [pm.absent]), /내가 온 경기/, "안 온 경기에는 노트를 못 쓴다");
  await rejects(q(`insert into player_notes (match_id, player_id, kind, body) values ($1, $2, 'good', '남의 노트')`, [pm.played, PP.E]), /row-level security/, "다른 선수 이름으로 노트를 못 쓴다");
  const four = JSON.stringify(["a", "b", "c", "d"].map((body) => ({ kind: "next_focus", body })));
  await rejects(q(`select save_my_notes($1, $2::jsonb)`, [pm.played, four]), /3개까지/, "다음 경기 내 포인트는 3개까지");

  const [{ p }] = await q(`select my_page() as p`);
  assert.equal(p.name, "D");
  assert.deepEqual(p.my_focus, ["왼발 패스"]);
  assert.ok(p.noted_match_ids.includes(pm.played));
  assert.ok(p.matches.every((m) => m.status !== "absent"));
  assert.equal(JSON.stringify(p).includes("against"), false);
  assert.equal(JSON.stringify(p).includes("coach_note"), false);
  ok("내 페이지: 내 기록(불참·실점·감독 메모 없음)과 내 다음 경기 포인트");

  const [{ m }] = await q(`select my_match($1) as m`, [pm.played]);
  assert.equal(m.attended, true);
  assert.ok(m.notes.every((n) => ["good", "improve", "next_focus"].includes(n.kind)));
  assert.equal(JSON.stringify(m).includes("개인 코멘트"), false);
  const [{ m: ab }] = await q(`select my_match($1) as m`, [pm.absent]);
  assert.equal(ab.attended, false);
  ok("선수 경기 화면: '팀 공개' 메모만, 내가 온 경기인지");
});

await as("authenticated", PL2, async () => {
  assert.equal((await q(`select * from player_notes`)).length, 0);
  ok("다른 선수의 노트는 안 보인다");
});
await as("authenticated", REC, async () => {
  assert.equal((await q(`select * from player_notes`)).length, 0);
  const [{ p }] = await q(`select my_page() as p`);
  assert.equal(p, null);
  ok("기록원·승인 대기는 선수 노트와 내 페이지가 안 보인다");
});
await as("authenticated", COACH, async () => {
  assert.equal((await q(`select * from player_notes where player_id = $1`, [PP.D])).length, 3);
  assert.equal((await q(`update player_notes set body = '감독이 고침' returning id`)).length, 0);
  ok("감독은 선수 노트를 읽기만 한다");
  await q(`delete from members where user_id = $1`, [PL]);
});
await as("authenticated", PL, async () => {
  const [{ p }] = await q(`select my_page() as p`);
  assert.equal(p, null);
  assert.equal((await q(`select * from player_notes`)).length, 0);
  ok("선수 연결을 끊으면 바로 아무것도 안 보인다 (노트는 남는다)");
});
await as("anon", null, async () => {
  await rejects(q(`select my_page()`), /permission denied/, "anon은 내 페이지 함수를 못 부른다");
  await rejects(q(`select * from player_notes`), /permission denied/, "anon은 선수 노트를 못 읽는다");
});

// --- 9. 선수용 자료 + 다음 경기 준비 ------------------------------------------
console.log("선수용 자료 · 다음 경기 준비");
const res = await as("authenticated", COACH, async () => {
  await q(`insert into members (user_id, display_name, wants, status, player_id) values ($1, '디', 'player', 'player', $2)`, [PL, PP.D]);
  const [team] = await q(`insert into resources (title, url, note) values ('압박 기초', 'https://youtu.be/a', '3분') returning id`);
  const [pivo] = await q(`insert into resources (title, url, audience, position) values ('피보 등지기', 'https://youtu.be/b', 'position', 'PIVO') returning id`);
  const [ala] = await q(`insert into resources (title, url, audience, position) values ('아라 돌파', 'https://youtu.be/c', 'position', 'ALA') returning id`);
  const [onlyE] = await q(`insert into resources (title, url, audience, player_id) values ('E 전용', 'https://youtu.be/d', 'player', $1) returning id`, [PP.E]);
  const [old] = await q(`insert into resources (title, url, is_archived) values ('내린 자료', 'https://youtu.be/e', true) returning id`);
  await rejects(q(`insert into resources (title, url) values ('x', 'javascript:alert(1)')`), /check constraint/, "자료 링크는 http(s)만");
  await rejects(q(`insert into resources (title, url, audience) values ('x', 'https://a.b', 'position')`), /check constraint/, "포지션 자료는 포지션이 있어야 한다");
  ok("감독은 팀·포지션·선수 한 명 대상으로 자료를 올린다");
  return { team: team.id, pivo: pivo.id, ala: ala.id, onlyE: onlyE.id, old: old.id };
});

await as("authenticated", PL, async () => {
  const mine = (await q(`select id from resources`)).map((r) => r.id).sort();
  assert.deepEqual(mine, [res.team, res.pivo].sort());
  ok("선수에게는 팀 자료와 내 포지션 자료만 보인다 (다른 포지션·다른 선수·내린 자료는 안 보인다)");
  await rejects(q(`insert into resources (title, url) values ('선수가', 'https://a.b')`), /row-level security/, "선수는 자료를 못 올린다");

  await q(`insert into resource_views (resource_id, player_id) values ($1, $2)`, [res.team, PP.D]);
  await rejects(q(`insert into resource_views (resource_id, player_id) values ($1, $2)`, [res.onlyE, PP.D]), /row-level security/, "나에게 안 온 자료는 '봤어요'를 못 누른다");
  await rejects(q(`insert into resource_views (resource_id, player_id) values ($1, $2)`, [res.pivo, PP.E]), /row-level security/, "다른 선수 이름으로 '봤어요'를 못 누른다");
  ok("선수는 나에게 온 자료에 '봤어요'를 누른다");

  const [{ p: before }] = await q(`select my_prep() as p`);
  assert.equal(before.resources_total, 2);
  assert.equal(before.resources_unseen, 1);
  assert.equal(before.resources[0].id, res.pivo);
  assert.equal(before.resources[0].seen, false);
  assert.equal(before.focus_match_id, pm.played);
  assert.deepEqual(before.focus_practiced, []);
  ok("내 준비: 안 본 자료가 먼저, 다음 경기 내 포인트가 나온 경기");

  // 테스트 경기 날짜가 미래라서 훈련 날짜는 마지막 경기 다음 날로
  const day = "2026-12-31";
  await q(`insert into training_logs (player_id, trained_on, body, minutes, focus_match_id, focus_orders) values ($1, $3, '벽 패스 100개', 30, $2, '{0}')`, [PP.D, pm.played, day]);
  await q(`insert into training_logs (player_id, trained_on, focus_match_id, focus_orders) values ($1, $3, $2, '{0}')`, [PP.D, pm.played, day]);
  await q(`insert into training_logs (player_id, trained_on, body) values ($1, '2026-01-02', '지난 시즌 훈련')`, [PP.D]);
  await rejects(q(`insert into training_logs (player_id, body) values ($1, '  ')`, [PP.D]), /check constraint/, "빈 훈련 기록은 안 된다");
  await rejects(q(`insert into training_logs (player_id, focus_orders) values ($1, '{0}')`, [PP.D]), /check constraint/, "포인트 체크는 어느 노트인지 있어야 한다");
  await rejects(q(`insert into training_logs (player_id, focus_match_id, focus_orders) values ($1, $2, '{5}')`, [PP.D, pm.played]), /check constraint/, "포인트 번호는 1~3번만");
  await rejects(q(`insert into training_logs (player_id, body) values ($1, '남의 훈련')`, [PP.E]), /row-level security/, "다른 선수 이름으로 훈련 기록을 못 쓴다");
  await rejects(q(`insert into matches (season_id, played_on, opponent, our_score, their_score) values ($1, current_date, '여전히', 0, 0)`, [ids.season]), /row-level security/, "선수는 여전히 공식 경기 기록을 못 쓴다");
  const [{ p: after }] = await q(`select my_prep() as p`);
  assert.deepEqual(after.focus_practiced, [0]);
  assert.equal(after.recent_trainings.length, 3);
  assert.equal(after.trainings_since, 2);
  ok("선수 개인 훈련 기록과 포인트 연습 체크");
});

await as("authenticated", PL2, async () => {
  const mine = (await q(`select id from resources`)).map((r) => r.id).sort();
  assert.deepEqual(mine, [res.team, res.ala, res.onlyE].sort());
  assert.equal((await q(`select * from training_logs`)).length, 0);
  assert.equal((await q(`select * from resource_views`)).length, 0);
  ok("다른 선수의 훈련 기록·'봤어요'는 안 보인다");
});
await as("authenticated", REC, async () => {
  for (const t of ["resources", "resource_views", "training_logs"]) assert.equal((await q(`select * from ${t}`)).length, 0);
  assert.equal((await q(`select * from prep_summary()`)).length, 0);
  const [{ p }] = await q(`select my_prep() as p`);
  assert.equal(p, null);
  ok("기록원·승인 대기는 자료·훈련 기록·준비 요약이 안 보인다");
});
await as("authenticated", COACH, async () => {
  assert.equal((await q(`update training_logs set body = '감독이 고침' returning id`)).length, 0);
  ok("감독은 훈련 기록을 읽기만 한다");
  const rows = await q(`select * from prep_summary()`);
  const d = rows.find((r) => r.player_id === PP.D);
  assert.deepEqual([d.trainings, d.minutes, d.focus_set, d.focus_practiced, d.resources, d.resources_seen], [2, 30, 1, 1, 2, 1]);
  const e = rows.find((r) => r.player_id === PP.E);
  assert.deepEqual([e.trainings, e.resources, e.resources_seen], [0, 3, 0]);
  ok("감독: 선수별 준비 한 줄 (훈련 수·분, 포인트 연습, 자료 본 수)");
});
await as("anon", null, async () => {
  for (const t of ["resources", "resource_views", "training_logs"]) await rejects(q(`select * from ${t}`), /permission denied/, `anon은 ${t}를 못 읽는다`);
  await rejects(q(`select my_prep()`), /permission denied/, "anon은 내 준비 함수를 못 부른다");
});

// --- 10. 다가오는 경기 준비 (계획 + 참석 응답) ---------------------------------
console.log("다가오는 경기 준비");
const nm = await as("authenticated", COACH, async () => {
  await q(`update members set status = 'recorder', approved_at = now(), approved_by = $2 where user_id = $1`, [REC, COACH]);
  const [m] = await q(`insert into matches (season_id, played_on, kickoff_time, opponent, venue, status) values ($1, '2027-01-10', '14:00', '다음상대', '교회 앞', 'scheduled') returning id`, [ids.season]);
  ok("감독은 스코어 없이 예정 경기를 만든다");
  await q(`select save_match_plan($1, $2::jsonb, $3::jsonb, $4::uuid[], $5::jsonb)`, [
    m.id,
    JSON.stringify(["킥인은 패턴 2개만", " ", "공 뺏기면 3초 압박"]),
    JSON.stringify([{ body: "왼쪽 7번 빠름", visibility: "team" }, { body: "상대 GK 킥 약함 (비밀)", visibility: "coach" }]),
    [res.ala],
    JSON.stringify([{ player_id: PP.D, position: "PIVO", squad: 1 }, { player_id: PP.E, position: "", squad: 2 }, { player_id: PP.A, position: "", squad: null }]),
  ]);
  const notes = await q(`select kind, body, visibility from match_notes where match_id = $1 order by kind, sort_order`, [m.id]);
  assert.deepEqual(notes.map((n) => `${n.kind}:${n.visibility}:${n.body}`), [
    "plan:team:킥인은 패턴 2개만", "plan:team:공 뺏기면 3초 압박", "scout:team:왼쪽 7번 빠름", "scout:coach:상대 GK 킥 약함 (비밀)",
  ]);
  assert.equal((await q(`select * from match_lineup where match_id = $1`, [m.id])).length, 2);
  ok("경기 계획 저장: 팀 포인트·상대 메모·자료·예상 포지션 (빈 칸은 버린다)");
  await rejects(q(`select save_match_plan($1, $2::jsonb, '[]'::jsonb, '{}', '[]'::jsonb)`, [m.id, JSON.stringify(["a", "b", "c", "d"])]), /3개까지/, "팀 포인트는 3개까지");
  return { id: m.id };
});

await as("authenticated", REC, async () => {
  await rejects(q(`select save_match_plan($1, '[]'::jsonb, '[]'::jsonb, '{}', '[]'::jsonb)`, [nm.id]), /감독만/, "기록원은 경기 계획을 못 쓴다");
});

await as("authenticated", PL, async () => {
  const [{ n }] = await q(`select my_next_match() as n`);
  assert.equal(n.id, nm.id);
  assert.equal(n.kickoff_time, "14:00");
  assert.deepEqual(n.points, ["킥인은 패턴 2개만", "공 뺏기면 3초 압박"]);
  assert.deepEqual(n.scout, ["왼쪽 7번 빠름"]);
  assert.equal(JSON.stringify(n).includes("비밀"), false);
  assert.deepEqual(n.my_lineup, { position: "PIVO", squad: 1 });
  assert.equal(n.my_rsvp, null);
  assert.equal(JSON.stringify(n).includes(PP.E), false);
  assert.deepEqual(n.resources.map((r) => r.id), [res.ala]);
  ok("선수 '다음 경기' 카드: 팀 공개만, 내 포지션만 (다른 선수 정보 없음)");

  await q(`insert into resource_views (resource_id, player_id) values ($1, $2)`, [res.ala, PP.D]);
  ok("경기에 붙은 자료는 포지션이 달라도 '봤어요'를 누를 수 있다");

  await q(`insert into match_rsvp (match_id, player_id, answer, note) values ($1, $2, 'yes', '10분 늦어요')`, [nm.id, PP.D]);
  await q(`update match_rsvp set answer = 'no' where match_id = $1`, [nm.id]);
  await q(`update match_rsvp set answer = 'yes' where match_id = $1`, [nm.id]);
  await rejects(q(`insert into match_rsvp (match_id, player_id, answer) values ($1, $2, 'yes')`, [nm.id, PP.E]), /row-level security/, "다른 선수 대신 응답할 수 없다");
  await rejects(q(`insert into match_rsvp (match_id, player_id, answer) values ($1, $2, 'yes')`, [pm.played, PP.D]), /row-level security/, "끝난 경기에는 응답할 수 없다");
  assert.equal((await q(`select * from match_lineup`)).length, 0);
  assert.equal((await q(`select * from match_resources`)).length, 0);
  const [{ n: after }] = await q(`select my_next_match() as n`);
  assert.equal(after.my_rsvp.answer, "yes");
  assert.equal(after.going, 1);
  ok("선수는 자기 참석만 응답·변경한다");
});

await as("authenticated", PL2, async () => {
  assert.equal((await q(`select * from match_rsvp`)).length, 0);
  const [{ n }] = await q(`select my_next_match() as n`);
  assert.deepEqual(n.my_lineup, { position: null, squad: 2 });
  ok("다른 선수의 응답은 안 보이고, 내 예상 조만 보인다");
});

await as("authenticated", COACH, async () => {
  await q(`insert into match_rsvp (match_id, player_id, answer) values ($1, $2, 'no')`, [nm.id, PP.E]);
  const rows = await q(`select player_id, answer, answered_by from match_rsvp where match_id = $1`, [nm.id]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.player_id === PP.E).answered_by, COACH);
  ok("감독은 응답을 모두 보고, 대신 눌러 줄 수 있다");
  const [before] = await q(`select count(*)::int as c from player_match_log where match_id = $1`, [nm.id]);
  assert.equal(before.c, 0);
  await q(`update matches set status = 'finished', our_score = 0, their_score = 0 where id = $1`, [nm.id]);
  ok("경기가 끝나면 같은 경기를 끝난 경기로 바꾼다");
});

await as("authenticated", REC, async () => {
  assert.equal((await q(`select * from match_rsvp where match_id = $1`, [nm.id])).length, 2);
  ok("기록원은 출석 기본값용으로 응답을 읽는다");
});

await as("authenticated", PL, async () => {
  const [{ n }] = await q(`select my_next_match() as n`);
  assert.equal(n, null);
  await rejects(q(`update match_rsvp set answer = 'no' where match_id = $1 returning *`, [nm.id]), /row-level security/, "끝난 경기의 응답은 못 바꾼다");
  ok("끝난 경기는 '다음 경기' 카드에서 빠진다");
});
await as("anon", null, async () => {
  for (const t of ["match_rsvp", "match_lineup", "match_resources"]) await rejects(q(`select * from ${t}`), /permission denied/, `anon은 ${t}를 못 읽는다`);
  await rejects(q(`select my_next_match()`), /permission denied/, "anon은 다음 경기 함수를 못 부른다");
});

console.log("\nall DB tests passed");
