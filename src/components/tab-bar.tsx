"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type Tab = { href: string; label: string; icon: keyof typeof ICONS; primary?: boolean };

/**
 * 화면 아래 탭. 엄지가 닿는 자리라서 경기 직후 한 손 입력이 빨라진다 (Strava·나이키 런클럽의 가운데 '기록' 버튼).
 * 탭 첫 화면에서만 보이고, 입력·상세 화면에서는 숨겨서 저장 버튼과 겹치지 않게 한다.
 */
export function TabBar({ tabs, showOn }: { tabs: Tab[]; showOn: string[] }) {
  const pathname = usePathname();
  if (!showOn.includes(pathname)) return null;
  const root = tabs[0].href;
  return (
    <nav aria-label="주 메뉴" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur">
      <ul className="mx-auto flex max-w-xl px-2 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((t) => {
          const active = t.href === root ? pathname === root : pathname.startsWith(t.href);
          if (t.primary) {
            return (
              <li key={t.href} className="flex-1">
                <Link href={t.href} className="flex h-16 flex-col items-center justify-end pb-1.5 text-[11px] font-semibold text-pitch">
                  <span className="-mt-5 mb-0.5 flex h-12 w-12 items-center justify-center rounded-full bg-pitch text-white shadow-lg shadow-pitch/30 dark:text-black">
                    <Icon name={t.icon} className="h-6 w-6" />
                  </span>
                  {t.label}
                </Link>
              </li>
            );
          }
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "font-semibold text-pitch" : "text-muted"}`}
              >
                <Icon name={t.icon} className="h-6 w-6" />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const ICONS = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.5 3.5 5.2" />
    </>
  ),
  doc: <path d="M6 3h9l4 4v14H6zM14 3v5h5" />,
};

function Icon({ name, className }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      {ICONS[name]}
    </svg>
  );
}
