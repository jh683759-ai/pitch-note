import Link from "next/link";

/** 큰 탭 버튼. 경기 직후 엄지로 누르기 좋게 최소 48px. */
export function TapChip({
  selected,
  onClick,
  children,
  disabled,
  tone = "pitch",
  className = "",
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  tone?: "pitch" | "danger";
  className?: string;
}) {
  // 야외에서도 선택 여부가 한눈에 보이게 진한 색으로 채운다
  const on =
    tone === "danger"
      ? "border-danger bg-danger font-semibold text-white dark:text-black"
      : "border-pitch bg-pitch font-semibold text-white dark:text-black";
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-12 rounded-xl border px-3 py-2 text-center font-medium transition-colors disabled:opacity-35 ${
        selected ? on : "border-line bg-card"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
      {error}
    </p>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-10 items-center text-sm text-muted">
      ← {children}
    </Link>
  );
}

/** 화면 아래에 붙는 저장 버튼 영역 (모바일에서 스크롤해도 항상 보이게) */
export function StickyActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-xl gap-2 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{children}</div>
    </div>
  );
}

export function Jersey({ n }: { n: number | null }) {
  return <span className="text-xs text-muted tabular-nums">{n ?? ""}</span>;
}
