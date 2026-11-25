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
  create table auth.users (id uuid primary key, email text);
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

console.log("\nall DB tests passed");
