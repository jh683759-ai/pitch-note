"use client";

import { useState, useTransition } from "react";
import { createShareLink, revokeShareLinks } from "./actions";

/** 링크 복사 버튼. 단톡방에 바로 붙여넣을 수 있게. */
export function CopyButton({ text, label = "링크 복사", className = "btn-primary" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          window.prompt("아래 주소를 복사하세요", text);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "복사했어요" : label}
    </button>
  );
}

export function ShareLinkControls({ url }: { url: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (!url) {
    return (
      <div>
        <button
          type="button"
          disabled={pending}
          className="btn-primary w-full"
          onClick={() => start(async () => setError((await createShareLink()).error))}
        >
          {pending ? "만드는 중…" : "선수용 공유 링크 만들기"}
        </button>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <p className="truncate rounded-xl bg-background px-3 py-2 text-xs text-muted">{url}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <CopyButton text={url} />
        <a href={url} target="_blank" rel="noreferrer" className="btn-ghost">
          선수 화면 보기
        </a>
      </div>
      {confirming ? (
        <div className="mt-3 rounded-xl border border-danger/40 p-3 text-sm">
          <p>새 링크를 만들면 지금 링크는 더 이상 열리지 않아요. 단톡방에 다시 보내야 해요.</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <button type="button" className="btn-ghost px-2 text-sm" onClick={() => setConfirming(false)}>
              취소
            </button>
            <button
              type="button"
              disabled={pending}
              className="btn-ghost px-2 text-sm"
              onClick={() => start(async () => setError((await createShareLink()).error))}
            >
              새로 만들기
            </button>
            <button
              type="button"
              disabled={pending}
              className="btn-ghost border-danger/40 px-2 text-sm text-danger"
              onClick={() => start(async () => setError((await revokeShareLinks()).error))}
            >
              끊기만
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="mt-2 min-h-10 text-xs text-muted" onClick={() => setConfirming(true)}>
          링크가 밖으로 퍼졌나요? 링크 바꾸기
        </button>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
