"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/coach", label: "홈" },
  { href: "/coach/matches", label: "경기" },
  { href: "/coach/players", label: "선수", coachOnly: true },
];

/** 기록원은 선수 명단 관리 탭이 없다 */
export function CoachNav({ isCoach }: { isCoach: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 text-sm">
      {TABS.filter((t) => isCoach || !t.coachOnly).map((t) => {
        const active = t.href === "/coach" ? pathname === "/coach" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-2 ${active ? "bg-pitch-soft font-semibold text-pitch" : "text-muted"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
