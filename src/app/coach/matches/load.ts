import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Player } from "@/lib/players";
import type { AttendanceStatus, EventTag, GoalEvent, Match, MatchNote } from "@/lib/matches";

export type RosterEntry = {
  player: Pick<Player, "id" | "name" | "jersey_number" | "main_position" | "membership" | "is_active">;
  status: AttendanceStatus;
  membership: string; // 그날의 신분
};

export type EventWithDetails = GoalEvent & { tagIds: number[]; onCourt: string[] };

const PLAYER_COLS = "id, name, jersey_number, main_position, membership, is_active";

/** 경기 한 개를 입력 화면에 필요한 만큼 한 번에 읽는다. */
export async function loadMatch(id: string) {
  const supabase = await createClient();
  const [match, attendance, events, tags, notes] = await Promise.all([
    supabase.from("matches").select("*").eq("id", id).maybeSingle(),
    supabase.from("match_attendance").select(`status, membership, player:players(${PLAYER_COLS})`).eq("match_id", id),
    supabase
      .from("goal_events")
      .select("*, goal_event_tags(tag_id), goal_event_on_court(player_id)")
      .eq("match_id", id)
      .order("seq"),
    supabase.from("event_tags").select("*").order("kind").order("sort_order"),
    supabase.from("match_notes").select("*").eq("match_id", id).order("sort_order"),
  ]);
  if (match.error) throw match.error;
  if (!match.data) notFound();
  for (const r of [attendance, events, tags, notes]) if (r.error) throw r.error;

  const roster: RosterEntry[] = (attendance.data ?? [])
    .filter((a) => a.player)
    .map((a) => ({ player: a.player!, status: a.status as AttendanceStatus, membership: a.membership }))
    .sort(byJersey);

  const eventList: EventWithDetails[] = (events.data ?? []).map(({ goal_event_tags, goal_event_on_court, ...e }) => ({
    ...e,
    tagIds: goal_event_tags.map((t) => t.tag_id),
    onCourt: goal_event_on_court.map((o) => o.player_id),
  }));

  return {
    match: match.data as Match,
    roster,
    events: eventList,
    tags: (tags.data ?? []) as EventTag[],
    notes: (notes.data ?? []) as MatchNote[],
  };
}

/** 이 경기 바로 전 경기 (지난 경기 포인트를 보여줄 때) */
export async function loadPreviousMatch(match: Match) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("matches")
    .select("id, played_on, opponent, match_notes(kind, body, sort_order)")
    .eq("status", "finished")
    .neq("id", match.id)
    .or(`played_on.lt.${match.played_on},and(played_on.eq.${match.played_on},created_at.lt.${match.created_at})`)
    .order("played_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const focus = data.match_notes
    .filter((n) => n.kind === "next_focus")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((n) => n.body);
  return { id: data.id, played_on: data.played_on, opponent: data.opponent, focus };
}

export async function loadActivePlayers() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("players").select(PLAYER_COLS).eq("is_active", true);
  if (error) throw error;
  return (data ?? []).sort(byJersey);
}

type Sortable = { jersey_number: number | null; name: string };

function comparePlayers(a: Sortable, b: Sortable) {
  return (a.jersey_number ?? 999) - (b.jersey_number ?? 999) || a.name.localeCompare(b.name, "ko");
}

function byJersey(a: Sortable | { player: Sortable }, b: Sortable | { player: Sortable }) {
  const pa = "player" in a ? a.player : a;
  const pb = "player" in b ? b.player : b;
  return comparePlayers(pa, pb);
}

/** 선수 id → 짧은 이름표 */
export function nameMap(players: { id: string; name: string }[]) {
  return new Map(players.map((p) => [p.id, p.name]));
}
