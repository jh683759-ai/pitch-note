"use client";

import { useActionState } from "react";
import { MEMBERSHIPS, POSITIONS, type Player } from "@/lib/players";
import type { FormState } from "./actions";

type Props = {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  player?: Player;
  submitLabel: string;
  allowSaveAndNew?: boolean;
};

export function PlayerForm({ action, player, submitLabel, allowSaveAndNew }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <label className="block">
          <span className="text-sm text-muted">이름</span>
          <input name="name" required maxLength={30} defaultValue={player?.name ?? ""} className="input mt-1" autoFocus={!player} />
        </label>
        <label className="block">
          <span className="text-sm text-muted">등번호</span>
          <input
            name="jersey_number"
            inputMode="numeric"
            pattern="\d{1,2}"
            placeholder="-"
            defaultValue={player?.jersey_number ?? ""}
            className="input mt-1 text-center"
          />
        </label>
      </div>

      <fieldset>
        <legend className="text-sm text-muted">고정 / 용병</legend>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {MEMBERSHIPS.map((m) => (
            <Chip key={m.value} name="membership" value={m.value} defaultChecked={(player?.membership ?? "regular") === m.value}>
              {m.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm text-muted">주 포지션</legend>
        <div className="mt-1 grid grid-cols-4 gap-2">
          {POSITIONS.map((p) => (
            <Chip key={p.value} name="main_position" value={p.value} defaultChecked={player?.main_position === p.value}>
              <span className="block font-semibold">{p.label}</span>
              <span className="block text-xs opacity-70">{p.hint}</span>
            </Chip>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="text-sm text-muted">감독 메모 (선택)</span>
        <textarea
          name="coach_note"
          maxLength={500}
          rows={3}
          defaultValue={player?.coach_note ?? ""}
          placeholder="예) 왼발, 전환 빠름, 수요일만 가능"
          className="input mt-1"
        />
      </label>

      {state.error && (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <button type="submit" name="intent" value="save" disabled={pending} className="btn-primary">
          {pending ? "저장 중…" : submitLabel}
        </button>
        {allowSaveAndNew && (
          <button type="submit" name="intent" value="save-and-new" disabled={pending} className="btn-ghost">
            저장하고 한 명 더
          </button>
        )}
      </div>
    </form>
  );
}

function Chip({
  name,
  value,
  defaultChecked,
  children,
}: {
  name: string;
  value: string;
  defaultChecked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="cursor-pointer">
      <input type="radio" name={name} value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="flex min-h-12 flex-col items-center justify-center rounded-xl border border-line bg-card px-2 py-2 text-center peer-checked:border-pitch peer-checked:bg-pitch-soft peer-checked:text-pitch peer-focus-visible:ring-2 peer-focus-visible:ring-pitch/40">
        {children}
      </span>
    </label>
  );
}
