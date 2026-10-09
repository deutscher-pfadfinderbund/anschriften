/** Largest Postgres `integer`: an id beyond it cannot exist. */
const INT4_MAX = 2_147_483_647;

/** A row id from a URL, a form value or a request: a positive `integer`, else null. */
export function parseId(raw: string | number | null | undefined): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 && id <= INT4_MAX ? id : null;
}
