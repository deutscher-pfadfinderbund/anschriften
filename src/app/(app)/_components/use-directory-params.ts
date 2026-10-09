"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { rememberDirectoryUrl } from "@/lib/directory-url";
import { replaceQuery, urlWith } from "@/lib/utils";

import { PARAM, SORT_DESC, parseDirectoryParams } from "./directory-filter";

const SEARCH_DEBOUNCE_MS = 300;

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

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Write the search to the URL, noting it as our own write. */
  const writeQuery = (q: string) => {
    clearTimeout(timer.current);
    setUrlQuery((s) => ({ ...s, written: q }));
    replaceQuery({ [PARAM.q]: q });
  };
  const writeQueryLater = useEffectEvent(writeQuery);
  useEffect(() => {
    const q = query.trim();
    if (q === params.q) return;
    // The cleanup cancels a pending write when typing goes on or the page unmounts.
    timer.current = setTimeout(() => writeQueryLater(q), q ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer.current);
  }, [query, params.q]);

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
    /**
     * Write a pending search to the URL now. Call it when the field loses focus: a
     * `replaceState` while a navigation is under way makes Next drop that navigation, so
     * a debounced write must never fire after a click on a person or a link.
     */
    flushQuery: () => {
      const q = query.trim();
      if (q !== params.q) writeQuery(q);
    },
    setGroupId: (id: number | null) => replaceQuery({ [PARAM.groupId]: id?.toString() ?? null }),
    setOfficeId: (id: number | null) => replaceQuery({ [PARAM.officeId]: id?.toString() ?? null }),
    setListId: (id: number | null) => replaceQuery({ [PARAM.listId]: id?.toString() ?? null }),
    setSortDesc: (desc: boolean) => replaceQuery({ [PARAM.sort]: desc ? SORT_DESC : null }),
    /** Clear search and filters (the sort order stays). */
    resetFilters: () => {
      setQuery("");
      setUrlQuery((s) => ({ ...s, written: "" }));
      replaceQuery({
        [PARAM.q]: null,
        [PARAM.groupId]: null,
        [PARAM.officeId]: null,
        [PARAM.listId]: null,
      });
    },
  };
}
