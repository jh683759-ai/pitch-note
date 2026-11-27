"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const SAVED = "pitch-note:saved";

/** 페이지를 옮기지 않고 저장하는 화면(선수 노트 등)은 저장 성공 뒤 이걸 부른다 */
export function markSaved() {
  window.dispatchEvent(new Event(SAVED));
}

/**
 * 입력·수정 화면에서 저장하지 않고 떠나려 할 때 한 번 묻는다.
 * 화면 본문(main)에 무언가 입력하면 '고친 것 있음'이 되고, 저장(submit·이동·markSaved)하면 풀린다.
 * 로고·뒤로·아래 탭 등 모든 링크와 새로고침·창 닫기에 적용된다.
 * 입력해도 경고가 필요 없는 곳(삭제 확인 칸, 팀원 승인 등)은 data-no-guard를 붙인다.
 */
export function UnsavedGuard() {
  const pathname = usePathname();
  const query = useSearchParams().toString();

  useEffect(() => {
    let dirty = false;
    const tracked = (t: EventTarget | null) => t instanceof Element && !!t.closest("main") && !t.closest("[data-no-guard]");
    const onInput = (e: Event) => {
      if (tracked(e.target)) dirty = true;
    };
    const onSubmit = () => {
      dirty = false;
    };
    const onClick = (e: MouseEvent) => {
      if (!dirty || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank") return;
      if (a.href.split("#")[0] === location.href.split("#")[0]) return;
      if (!window.confirm("저장하지 않은 내용이 있어요. 나가면 사라져요. 나갈까요?")) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        dirty = false;
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };

    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener(SAVED, onSubmit);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener(SAVED, onSubmit);
    };
  }, [pathname, query]);

  return null;
}
