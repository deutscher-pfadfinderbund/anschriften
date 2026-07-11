// Sentinel rank for "amtlos" / offices without a defined order. Used as the schema
// default for `offices.rank`, as the sort fallback in the PDF builder, and as the
// "unknown office" marker in the Access import. Shared so the value stays in one place.
export const RANK_UNRANKED = 999;
