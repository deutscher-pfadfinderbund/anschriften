// The six top-level branches (Bereiche) of the Bund. Single source for the Postgres enum
// (src/db/schema.ts imports this file relatively), the Zod validation in the group actions,
// the PDF profiles and every label/ordering in the UI. Pure, no imports: safe everywhere,
// including drizzle-kit, which bundles the schema without the `@/` alias.

/** All sections in their canonical display/print order. */
export const SECTIONS = [
  "bund",
  "jungenbund",
  "maedchenbund",
  "orden_st_georg",
  "orden_st_christophorus",
  "bundesgilde",
] as const;

export type Section = (typeof SECTIONS)[number];

/** Human-readable German label per section. */
export const SECTION_LABELS: Record<Section, string> = {
  bund: "Bund",
  jungenbund: "Jungenbund",
  maedchenbund: "Mädchenbund",
  orden_st_georg: "Orden St. Georg",
  orden_st_christophorus: "Orden St. Christophorus",
  bundesgilde: "Bundesgilde",
};
