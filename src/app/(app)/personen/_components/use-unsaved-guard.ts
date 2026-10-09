"use client";

import { useEffect, useRef } from "react";

const QUESTION = "Ungespeicherte Änderungen verwerfen?";

/**
 * Asks before unsaved changes are lost: on a reload or tab close (beforeunload) and on a
 * click on any internal link of the page — sidebar, mobile drawer, back link — caught in
 * the capture phase before Next's <Link> navigates. Returns helpers for the form's own
 * exits: `confirmLeave()` for Abbrechen, `release()` before an intended reload.
 */
export function useUnsavedGuard(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    }

    function onClick(e: MouseEvent) {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab/window
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // in-page (#inhalt)
      if (window.confirm(QUESTION)) return;
      // Stop the click before React sees it: no navigation, and the drawer stays open.
      e.preventDefault();
      e.stopPropagation();
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("click", onClick, true);
    };
  }, []);

  return {
    confirmLeave: () => !dirtyRef.current || window.confirm(QUESTION),
    release: () => {
      dirtyRef.current = false;
    },
  };
}
