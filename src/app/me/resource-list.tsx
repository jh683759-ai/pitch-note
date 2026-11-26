import type { MyResource } from "@/lib/prep";
import { toggleSeen } from "./actions";

/** 선수에게 온 자료. 링크는 새 탭으로, '봤어요'는 감독에게 보인다. */
export function ResourceList({ items }: { items: MyResource[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((r) => (
        <li key={r.id} className="flex items-center gap-3 py-3">
          <a href={r.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
            <span className={`block truncate font-medium ${r.seen ? "text-muted" : ""}`}>{r.title} ↗</span>
            {r.note && <span className="block truncate text-xs text-muted">{r.note}</span>}
          </a>
          <form action={toggleSeen.bind(null, r.id, r.seen)}>
            <button
              className={`min-h-10 shrink-0 rounded-lg border px-3 text-sm ${
                r.seen ? "border-line text-muted" : "border-pitch font-semibold text-pitch"
              }`}
            >
              {r.seen ? "봤어요 ✓" : "봤어요"}
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
