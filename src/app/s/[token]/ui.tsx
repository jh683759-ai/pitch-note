import Link from "next/link";
import { resultLabel } from "@/lib/share";

export function ResultBadge({ our, their, small }: { our: number; their: number; small?: boolean }) {
  const r = resultLabel(our, their);
  return (
    <span
      className={`shrink-0 rounded-full font-semibold ${small ? "px-1.5 text-xs" : "px-2 py-0.5 text-sm"} ${
        r === "승" ? "bg-pitch-soft text-pitch" : r === "패" ? "bg-danger/10 text-danger" : "bg-line"
      }`}
    >
      {r}
    </span>
  );
}

export function ShareBack({ token }: { token: string }) {
  return (
    <Link href={`/s/${token}`} className="inline-flex min-h-10 items-center text-sm text-muted">
      ← 우리 팀 기록
    </Link>
  );
}
