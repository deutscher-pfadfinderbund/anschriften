import { Award, Briefcase, Layers, type LucideIcon } from "lucide-react";

import type { RuleKind } from "@/lib/rule-kinds";

/**
 * One icon per rule kind. The rule rows and the members' origin chips use the same
 * icons, so a chip on a member visibly points back to the rule that put them there.
 */
export const RULE_ICONS: Record<RuleKind, LucideIcon> = {
  office: Briefcase,
  rank: Award,
  group: Layers,
};
