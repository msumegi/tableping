import { normalizeTableCode } from "./tableCode";

export const JOIN_PARAM_KEYS = ["join", "t", "code", "table"] as const;

export function tableJoinUrl(pageHref: string, code: string): string {
  const url = new URL(pageHref, "https://msumegi.github.io/tableping/");
  url.hash = "";
  for (const key of JOIN_PARAM_KEYS) url.searchParams.delete(key);
  url.searchParams.set("join", normalizeTableCode(code));
  return url.toString();
}

export function pageJoinUrl(code: string, location: Pick<Location, "origin" | "pathname">): string {
  const path = location.pathname.endsWith("/") || location.pathname.endsWith(".html")
    ? location.pathname
    : `${location.pathname}/`;
  return tableJoinUrl(`${location.origin}${path}`, code);
}

function codeIfValid(raw: string | null | undefined): string | null {
  const code = normalizeTableCode(raw || "");
  return code.length >= 4 ? code : null;
}

export function readJoinCodeFromUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    try {
      url = new URL(href, "https://msumegi.github.io/tableping/");
    } catch {
      return null;
    }
  }

  for (const key of JOIN_PARAM_KEYS) {
    const code = codeIfValid(url.searchParams.get(key));
    if (code) return code;
  }

  const hash = url.hash.replace(/^#/, "");
  if (!hash) return null;

  const hashQuery = hash.startsWith("?") ? hash.slice(1) : hash;
  try {
    const fromHash = new URLSearchParams(hashQuery);
    for (const key of JOIN_PARAM_KEYS) {
      const code = codeIfValid(fromHash.get(key));
      if (code) return code;
    }
  } catch {
    /* ignore */
  }

  const match = hash.match(/(?:join|table|code)[=/]([a-zA-Z0-9]{4,6})/i);
  return match ? codeIfValid(match[1]) : null;
}

export function stripJoinParams(href: string): string {
  const url = new URL(href);
  for (const key of JOIN_PARAM_KEYS) url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}
