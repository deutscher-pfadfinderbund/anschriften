"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { rememberDirectoryUrl } from "@/lib/directory-url";

import { PARAM, SORT_DESC, parseDirectoryParams } from "./directory-filter";

type ParamName = (typeof PARAM)[keyof typeof PARAM];

const SEARCH_DEBOUNCE_MS = 300;

function urlWith(pathname: string, search: string, patch: Partial<Record<ParamName, string | null>>): string {
  const params = new URLSearchParams(search);
  for (const [name, value] of Object.entries(patch)) {
    if (value) params.set(name, value);
    else params.delete(name);
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Write params into the address bar. The native History API (documented in Next's
 * "Linking and Navigating" guide) keeps useSearchParams in sync without a navigation,
 * so the ~600 persons are not fetched from the server again on every filter change.
 */
function replaceParams(pathname: string, patch: Partial<Record<ParamName, string | null>>) {
  window.history.replaceState(null, "", urlWith(pathname, window.location.search, patch));
}

/**
 * Search, filters and sort order of the directory, kept in the URL so that a reload,
 * a shared link and the way back from the person editor (`directoryUrl()`) show the
 * same list. Selects write the URL at once; the search field is local state written
 * to the URL after a short pause in typing.
 */
export function useDirectoryParams() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = parseDirectoryParams(searchParams);

  const [query, setQuery] = useState(params.q);
  // The URL's q as last seen, and as last written by us. When the URL's q changes to
  // something we did not write (the "Verzeichnis" link while filtered, browser Back),
  // the field adopts it; our own debounced write catching up leaves the field alone,
  // even if the user has typed on in the meantime. `written` only bridges that gap: once
  // the URL has caught up it is reset, so a later outside change to the same value
  // (Back to "?q=Wolf" after the link cleared it) counts as outside again.
  const [urlQuery, setUrlQuery] = useState({ seen: params.q, written: params.q });
  if (params.q !== urlQuery.seen) {
    setUrlQuery({ seen: params.q, written: params.q });
    if (params.q !== urlQuery.written) setQuery(params.q);
  }

  useEffect(() => {
    const q = query.trim();
    if (q === params.q) return;
    // The cleanup cancels a pending write when typing goes on or the page unmounts.
    const timer = setTimeout(
      () => {
        setUrlQuery((s) => ({ ...s, written: q }));
        replaceParams(pathname, { [PARAM.q]: q });
      },
      q ? SEARCH_DEBOUNCE_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [query, params.q, pathname]);

  // Remember the list as the user sees it, including a search still inside the
  // debounce pause, for the editor's way back.
  const search = searchParams.toString();
  useEffect(() => {
    rememberDirectoryUrl(urlWith(pathname, search, { [PARAM.q]: query.trim() }));
  }, [pathname, search, query]);

  return {
    ...params,
    /** The search field's text (ahead of the URL while typing). */
    query,
    setQuery,
    setGroupId: (id: number | null) => replaceParams(pathname, { [PARAM.groupId]: id?.toString() ?? null }),
    setOfficeId: (id: number | null) => replaceParams(pathname, { [PARAM.officeId]: id?.toString() ?? null }),
    setListId: (id: number | null) => replaceParams(pathname, { [PARAM.listId]: id?.toString() ?? null }),
    setSortDesc: (desc: boolean) => replaceParams(pathname, { [PARAM.sort]: desc ? SORT_DESC : null }),
    /** Clear search and filters (the sort order stays). */
    resetFilters: () => {
      setQuery("");
      setUrlQuery((s) => ({ ...s, written: "" }));
      replaceParams(pathname, {
        [PARAM.q]: null,
        [PARAM.groupId]: null,
        [PARAM.officeId]: null,
        [PARAM.listId]: null,
      });
    },
  };
}
