import Link from "next/link";

type Point = { id: string; label: string; diff: number };

/**
 * 경기별 득실을 0을 기준으로 위(이긴 만큼)·아래(진 만큼) 막대로.
 * 숫자는 막대마다 달지 않고, 누르면(hover/tap) 경기와 스코어가 보인다.
 */
export function GoalDiffBars({ matches, hrefBase = "/coach/matches/" }: { matches: Point[]; hrefBase?: string | null }) {
  const max = Math.max(1, ...matches.map((m) => Math.abs(m.diff)));
  const half = 36; // px, 위아래 각각
  return (
    <div>
      <div className="relative flex items-center gap-[2px]" style={{ height: half * 2 + 2 }}>
        <div aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-line" />
        {matches.map((m) => {
          const h = m.diff === 0 ? 2 : Math.max(4, Math.round((Math.abs(m.diff) / max) * half));
          const color = m.diff > 0 ? "bg-pitch" : m.diff < 0 ? "bg-danger" : "bg-muted";
          const sign = m.diff > 0 ? `+${m.diff}` : `${m.diff}`;
          const bar = (
            <span className="relative flex h-full w-full justify-center" title={`${m.label} (${sign})`}>
              <span
                className={`absolute w-full max-w-7 ${color} ${m.diff > 0 ? "rounded-t-[4px]" : m.diff < 0 ? "rounded-b-[4px]" : "rounded-[1px]"}`}
                style={
                  m.diff >= 0
                    ? { bottom: m.diff === 0 ? half : half + 1, height: h }
                    : { top: half + 1, height: h }
                }
              />
            </span>
          );
          return hrefBase ? (
            <Link key={m.id} href={`${hrefBase}${m.id}`} aria-label={`${m.label} 득실 ${sign}`} className="flex h-full flex-1 justify-center">
              {bar}
            </Link>
          ) : (
            <span key={m.id} aria-label={`${m.label} 득실 ${sign}`} className="flex h-full flex-1 justify-center">
              {bar}
            </span>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>이긴 경기는 위, 진 경기는 아래</span>
        <span>최고 ±{max}</span>
      </div>
    </div>
  );
}
