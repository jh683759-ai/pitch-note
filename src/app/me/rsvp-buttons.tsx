"use client";

import { useOptimistic, useTransition, useState } from "react";
import { RSVP, type RsvpAnswer } from "@/lib/matches";
import { setMyRsvp } from "./actions";

/** 갈게요 / 못 가요. 누르면 바로 저장. */
export function RsvpButtons({ matchId, answer }: { matchId: string; answer: RsvpAnswer | null }) {
  const [shown, setShown] = useOptimistic(answer);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const press = (v: RsvpAnswer) =>
    start(async () => {
      const next = shown === v ? null : v;
      setShown(next);
      setError((await setMyRsvp(matchId, next)).error);
    });

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {RSVP.map((o) => {
          const on = shown === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => press(o.value)}
              className={`min-h-12 rounded-xl border font-semibold ${
                on
                  ? o.value === "yes"
                    ? "border-pitch bg-pitch text-white dark:text-black"
                    : "border-danger bg-danger text-white dark:text-black"
                  : "border-line bg-card text-foreground"
              }`}
            >
              {on ? "✓ " : ""}
              {o.label}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
