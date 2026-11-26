"use client";

import { useEffect, useState } from "react";

/** 로그인 안 한 선수가 아이콘으로 열면 돌아갈 마지막 공유 링크 */
export const LAST_SHARE_KEY = "pn:lastShare";
const DISMISS_KEY = "pn:installDismissedAt";
const DISMISS_DAYS = 14;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __pnInstall?: BeforeInstallPromptEvent | null;
  }
}

/**
 * hidden: 이미 설치됨 또는 설치를 못 하는 브라우저(파이어폭스 등)
 * prompt: 크롬·엣지·삼성 인터넷 (설치 창을 바로 띄움)
 * ios: 아이폰·아이패드 (공유 → 홈 화면에 추가 안내)
 * mac-safari: 맥 사파리 (파일 → Dock에 추가 안내)
 * kakao: 카톡 안 브라우저 (바깥 브라우저로 열기)
 * inapp: 인스타·네이버 등 다른 앱 안 브라우저
 */
type Mode = "hidden" | "prompt" | "ios" | "mac-safari" | "kakao" | "inapp";

function detect(): Mode {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (window.matchMedia("(display-mode: standalone)").matches || nav.standalone) return "hidden";

  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) return "kakao";
  if (/Instagram|FBAN|FBAV|NAVER\(inapp|Line\/|DaumApps|everytimeApp|; wv\)/i.test(ua)) return "inapp";

  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return "ios";
  if (window.__pnInstall) return "prompt";
  const macSafari = /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua);
  if (macSafari) return "mac-safari";
  return "hidden";
}

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/** 다른 앱 안 브라우저에서 바깥 브라우저로 여는 주소. 없으면 null (메뉴 안내) */
function externalUrl(mode: Mode): string | null {
  const here = location.href;
  if (mode === "kakao") return `kakaotalk://web/openExternal?url=${encodeURIComponent(here)}`;
  if (mode === "inapp" && /Android/i.test(navigator.userAgent)) {
    return `intent://${here.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`;
  }
  return null;
}

/**
 * 홈 화면에 앱 아이콘 설치.
 * - variant="button": 홈 화면용 큰 버튼 (닫기 없음)
 * - variant="banner": 감독·선수·공유 화면 위쪽 한 줄 (닫으면 2주 동안 안 보임)
 */
export function InstallApp({ variant = "banner" }: { variant?: "button" | "banner" }) {
  const [mode, setMode] = useState<Mode>("hidden");
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (location.pathname.startsWith("/s/")) {
      try {
        localStorage.setItem(LAST_SHARE_KEY, location.pathname.split("/").slice(0, 3).join("/"));
      } catch {}
    }
    setDismissed(variant === "banner" && dismissedRecently());
    setMode(detect());
    const update = () => setMode(detect());
    const installed = () => {
      window.__pnInstall = null;
      setMode("hidden");
    };
    window.addEventListener("pn-installable", update);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("pn-installable", update);
      window.removeEventListener("appinstalled", installed);
    };
  }, [variant]);

  if (mode === "hidden" || dismissed) return null;

  async function onClick() {
    if (mode === "prompt" && window.__pnInstall) {
      const ev = window.__pnInstall;
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      // 한 번 쓴 설치 이벤트는 다시 못 쓴다. 취소했으면 브라우저가 나중에 다시 보내준다.
      window.__pnInstall = null;
      if (outcome === "accepted") setMode("hidden");
      else setMode(detect());
      return;
    }
    const ext = externalUrl(mode);
    if (ext) {
      location.href = ext;
      // 열리지 않는 경우를 위해 메뉴 안내도 같이 펼친다.
      setOpen(true);
      return;
    }
    setOpen((v) => !v);
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setDismissed(true);
  }

  const label = mode === "kakao" || (mode === "inapp" && externalUrl(mode)) ? "브라우저로 열어서 설치" : "앱 설치";
  const guide = open && <Guide mode={mode} />;

  if (variant === "button") {
    return (
      <div className="mt-3">
        <button type="button" onClick={onClick} className="btn-ghost w-full gap-2">
          <PhoneIcon />
          {label}
        </button>
        <p className="mt-2 text-center text-xs text-muted">{hint(mode)}</p>
        {guide}
      </div>
    );
  }

  return (
    <div className="card mt-4 p-3">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={36} height={36} className="shrink-0 rounded-lg" />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">홈 화면에 pitch-note 추가</span>
          <span className="block text-xs text-muted">{hint(mode)}</span>
        </p>
        <button
          type="button"
          onClick={onClick}
          className="shrink-0 rounded-lg bg-pitch px-3 py-2 text-sm font-semibold text-white dark:text-black"
        >
          {mode === "kakao" || (mode === "inapp" && externalUrl(mode)) ? "열기" : "설치"}
        </button>
        <button type="button" onClick={dismiss} aria-label="닫기" className="-mr-1 shrink-0 p-1 text-muted">
          ✕
        </button>
      </div>
      {guide}
    </div>
  );
}

function hint(mode: Mode) {
  switch (mode) {
    case "kakao":
      return "카톡 안에서는 설치가 안 돼요. 크롬·사파리로 연 뒤 설치하세요.";
    case "inapp":
      return "이 앱 안에서는 설치가 안 돼요. 크롬·사파리로 열어 주세요.";
    case "ios":
      return "공유 버튼에서 '홈 화면에 추가'를 누르면 돼요.";
    case "mac-safari":
      return "메뉴의 '파일 → Dock에 추가'로 설치해요.";
    default:
      return "아이콘을 눌러 바로 열 수 있어요.";
  }
}

function Guide({ mode }: { mode: Mode }) {
  const steps =
    mode === "ios"
      ? [
          <>
            화면 아래(크롬은 주소창 오른쪽)의 공유 버튼 <ShareIcon /> 을 눌러요.
          </>,
          <>목록을 아래로 내려 &lsquo;홈 화면에 추가&rsquo;를 눌러요.</>,
          <>오른쪽 위 &lsquo;추가&rsquo;를 누르면 홈 화면에 아이콘이 생겨요.</>,
          <>로그인해서 쓰는 경우, 아이콘으로 처음 열 때 한 번 더 로그인해요. (아이폰은 앱과 사파리 로그인이 따로예요)</>,
        ]
      : mode === "mac-safari"
        ? [<>위쪽 메뉴 막대에서 &lsquo;파일&rsquo;을 눌러요.</>, <>&lsquo;Dock에 추가&rsquo;를 누르면 Dock과 Launchpad에 생겨요.</>]
        : [
            <>오른쪽 위 ⋮ 또는 ⋯ 메뉴를 눌러요.</>,
            <>&lsquo;다른 브라우저로 열기&rsquo;(또는 &lsquo;Safari로 열기&rsquo;)를 눌러요.</>,
            <>열린 화면에서 다시 &lsquo;앱 설치&rsquo;를 눌러요.</>,
          ];
  return (
    <ol className="mt-3 list-decimal space-y-1.5 rounded-xl bg-pitch-soft p-3 pl-8 text-sm">
      {steps.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ol>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      className="inline -mt-1"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-label="공유"
    >
      <path d="M12 3v12M7 8l5-5 5 5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M11 18h2" strokeLinecap="round" />
    </svg>
  );
}
