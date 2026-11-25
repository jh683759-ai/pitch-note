"use client";

import { useMemo, useState, useTransition } from "react";
import { ATTENDANCE, type AttendanceStatus } from "@/lib/matches";
import { addGuest, saveAttendance } from "../../actions";
import { ErrorBox, Jersey, StickyActions } from "../../ui";

type P = { id: string; name: string; jersey: number | null; membership: string };
type State = Record<string, AttendanceStatus | undefined>;

export function AttendanceForm({
  matchId,
  players: initialPlayers,
  initial,
  previous,
  locked,
  suggestCopy,
}: {
  matchId: string;
  players: P[];
  initial: State;
  previous: { label: string; rows: State } | null;
  locked: string[];
  suggestCopy: boolean;
}) {
  const [players, setPlayers] = useState(initialPlayers);
  const [state, setState] = useState<State>(initial);
  const [error, setError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [pending, start] = useTransition();
  const lockedSet = useMemo(() => new Set(locked), [locked]);

  const regulars = players.filter((p) => p.membership === "regular");
  const guests = players.filter((p) => p.membership === "guest");

  // 저장할 때: 고정 멤버는 고르지 않으면 불참으로 남긴다(출석률 계산). 용병은 안 왔으면 명단에서 뺀다.
  const effective = (p: P): AttendanceStatus | undefined => state[p.id] ?? (p.membership === "regular" ? "absent" : undefined);
  const count = (s: AttendanceStatus) => players.filter((p) => effective(p) === s).length;

  const set = (id: string, s: AttendanceStatus | undefined) => {
    if (lockedSet.has(id) && s !== "played") {
      setError("골·실점 기록에 있는 선수라 출전에서 뺄 수 없어요. 그 기록을 먼저 고치세요.");
      return;
    }
    setError(null);
    setState((prev) => ({ ...prev, [id]: s }));
  };

  const copyPrevious = () => {
    if (!previous) return;
    // 지난 명단에 없는 선수는 비워두고(고정=불참, 용병=제외), 기록 때문에 잠긴 선수는 출전 유지
    const next: State = { ...previous.rows };
    for (const id of lockedSet) next[id] = "played";
    setState(next);
    setError(null);
  };

  const onAddGuest = () =>
    start(async () => {
      const res = await addGuest(guestName);
      if (res.error || !res.id) return setError(res.error);
      setPlayers((prev) => [...prev, { id: res.id!, name: guestName.trim(), jersey: null, membership: "guest" }]);
      setState((prev) => ({ ...prev, [res.id!]: "played" }));
      setGuestName("");
      setError(null);
    });

  const onSave = () =>
    start(async () => {
      const rows = players.flatMap((p) => {
        const s = effective(p);
        return s ? [{ player_id: p.id, status: s }] : [];
      });
      const res = await saveAttendance(matchId, rows);
      setError(res.error);
    });

  return (
    <>
      {previous && (
        <button
          type="button"
          onClick={copyPrevious}
          className={`mt-5 w-full rounded-xl border px-4 py-3 text-left ${suggestCopy ? "border-pitch bg-pitch-soft" : "border-line bg-card"}`}
        >
          <span className="block font-semibold text-pitch">지난 경기 명단 복사</span>
          <span className="block text-xs text-muted">{previous.label} 명단을 그대로 채우고, 바뀐 사람만 고치세요</span>
        </button>
      )}

      <Section title={`고정 멤버 ${regulars.length}명`} hint="고르지 않으면 불참으로 저장돼요">
        {regulars.map((p) => (
          <Row key={p.id} p={p} value={state[p.id]} locked={lockedSet.has(p.id)} onChange={(s) => set(p.id, s)} />
        ))}
      </Section>

      <Section title="용병" hint="안 온 용병은 비워두면 명단에서 빠져요">
        {guests.map((p) => (
          <Row key={p.id} p={p} value={state[p.id]} locked={lockedSet.has(p.id)} onChange={(s) => set(p.id, s)} guest />
        ))}
        <li className="flex gap-2 p-3">
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), guestName.trim() && onAddGuest())}
            maxLength={30}
            placeholder="오늘 온 용병 이름"
            className="input"
          />
          <button type="button" disabled={pending || !guestName.trim()} onClick={onAddGuest} className="btn-ghost shrink-0 px-4">
            추가
          </button>
        </li>
      </Section>

      <div className="mt-4 mb-24">
        <ErrorBox error={error} />
      </div>

      <StickyActions>
        <div className="flex flex-1 flex-col justify-center text-sm">
          <span className="font-semibold">출전 {count("played")}명</span>
          <span className="text-xs text-muted">
            벤치 {count("bench")} · 불참 {count("absent")}
          </span>
        </div>
        <button type="button" disabled={pending} onClick={onSave} className="btn-primary flex-1">
          {pending ? "저장 중…" : "저장"}
        </button>
      </StickyActions>
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted">{hint}</span>
      </div>
      <ul className="card divide-y divide-line">{children}</ul>
    </section>
  );
}

function Row({
  p,
  value,
  locked,
  onChange,
  guest,
}: {
  p: P;
  value: AttendanceStatus | undefined;
  locked: boolean;
  onChange: (s: AttendanceStatus | undefined) => void;
  guest?: boolean;
}) {
  const options = guest ? ATTENDANCE.filter((a) => a.value !== "absent") : ATTENDANCE;
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {p.name} <Jersey n={p.jersey} />
        </span>
        {locked && <span className="block text-xs text-muted">골·실점 기록 있음</span>}
      </span>
      <div className="grid shrink-0 grid-flow-col gap-1" role="radiogroup" aria-label={`${p.name} 출석`}>
        {options.map((o) => {
          const selected = value === o.value;
          const tone = o.value === "played" ? "bg-pitch text-white dark:text-black" : o.value === "bench" ? "bg-foreground/80 text-background" : "bg-danger/15 text-danger";
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              // 다시 누르면 선택 해제 (고정=불참, 용병=제외로 돌아감)
              onClick={() => onChange(selected ? undefined : o.value)}
              className={`h-11 w-14 rounded-lg text-sm font-medium ${selected ? tone : "bg-line/50 text-muted"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </li>
  );
}
