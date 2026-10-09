"use client";

import { useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { addListRule, removeListRule } from "@/actions/lists";
import { Combobox } from "@/components/combobox";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import type { DistributionListWithMembers, GroupRow, OfficeRow, RankRow } from "@/db/queries";
import { RULE_KIND_LABELS, RULE_KINDS, type RuleKind } from "@/lib/rule-kinds";

import { RULE_ICONS } from "./rule-icons";

/** Row labels of the rule grid. */
const RULE_ROW_LABELS: Record<RuleKind, string> = {
  office: "Ämter",
  rank: "Stände",
  group: "Gliederungen",
};

type Target = { id: number; name: string };
type PendingRemoval = { kind: RuleKind } & Target;

/**
 * "Automatisch enthalten": the list's rules in one compact grid — a row per kind with
 * its rules as removable chips and a small inline picker to add one.
 */
export function RulesPanel({
  list,
  offices,
  ranks,
  groups,
}: {
  list: DistributionListWithMembers;
  offices: OfficeRow[];
  ranks: RankRow[];
  groups: GroupRow[];
}) {
  const [isPending, startTransition] = useTransition();
  // Removing a rule can drop many people at once, so it is confirmed first.
  const [removal, setRemoval] = useState<PendingRemoval | null>(null);

  // Per kind: the targets that are not yet a rule on this list.
  const options = useMemo(() => {
    const targets: Record<RuleKind, Target[]> = { office: offices, rank: ranks, group: groups };
    const out = {} as Record<RuleKind, { value: string; label: string }[]>;
    for (const kind of RULE_KINDS) {
      const taken = new Set(list.rules[kind].map((r) => r.id));
      out[kind] = targets[kind]
        .filter((t) => !taken.has(t.id))
        .map((t) => ({ value: String(t.id), label: t.name }));
    }
    return out;
  }, [list.rules, offices, ranks, groups]);

  // Members that only this rule keeps on the list — they leave when it goes.
  const leaving = removal
    ? list.members.filter(
        (m) => !m.manual && m.via.every((v) => v.kind === removal.kind && v.id === removal.id),
      ).length
    : 0;

  function add(kind: RuleKind, value: string) {
    const name = options[kind].find((o) => o.value === value)?.label ?? RULE_KIND_LABELS[kind];
    startTransition(async () => {
      const res = await addListRule(list.id, kind, Number(value));
      if (!res.ok) return void toast.error(res.message);
      toast.success(`Regel „${name}“ hinzugefügt.`);
    });
  }

  function confirmRemoval() {
    if (!removal) return;
    const { kind, id, name } = removal;
    startTransition(async () => {
      const res = await removeListRule(list.id, kind, id);
      if (!res.ok) return void toast.error(res.message);
      toast.success(`Regel „${name}“ entfernt.`);
      setRemoval(null);
    });
  }

  return (
    <Panel
      title="Automatisch enthalten"
      description="Wer ein hier genanntes Amt innehat, den Stand trägt oder der Gliederung angehört, ist automatisch Mitglied."
    >
      <dl className="flex flex-col gap-3">
        {RULE_KINDS.map((kind) => {
          const Icon = RULE_ICONS[kind];
          return (
            <div key={kind} className="grid gap-1.5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
              <dt className="flex items-center gap-1.5 text-ui text-ink-soft sm:h-8">
                <Icon aria-hidden className="size-3.5 shrink-0 text-ink-faint" />
                {RULE_ROW_LABELS[kind]}
              </dt>
              <dd className="flex min-w-0 flex-wrap items-center gap-1.5">
                {list.rules[kind].map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex h-7 max-w-full items-center gap-0.5 rounded-md border border-line bg-surface-2 pl-2 text-ui text-ink"
                  >
                    <span className="truncate">{r.name}</span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Regel „${r.name}“ entfernen`}
                      className="mr-0.5 text-ink-faint hover:text-crit"
                      disabled={isPending}
                      onClick={() => setRemoval({ kind, ...r })}
                    >
                      <X />
                    </Button>
                  </span>
                ))}
                <div className="w-full sm:w-56">
                  <Combobox
                    aria-label={`${RULE_KIND_LABELS[kind]} als Regel hinzufügen`}
                    options={options[kind]}
                    value={null}
                    onChange={(v) => add(kind, v)}
                    placeholder={`${RULE_KIND_LABELS[kind]} hinzufügen …`}
                    searchPlaceholder={`${RULE_KIND_LABELS[kind]} suchen …`}
                  />
                </div>
                {kind === "group" ? (
                  <p className="w-full text-caption text-ink-faint">
                    Nur Personen, die der Gliederung selbst zugeordnet sind – Untergliederungen zählen
                    nicht mit.
                  </p>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>

      <ConfirmDeleteDialog
        open={removal != null}
        onOpenChange={(o) => !o && setRemoval(null)}
        title="Regel entfernen?"
        description={
          removal ? (
            <>
              {RULE_KIND_LABELS[removal.kind]} „{removal.name}“ gehört dann nicht mehr automatisch zu
              diesem Verteiler.{" "}
              {leaving === 0
                ? "Niemand fällt dadurch aus dem Verteiler."
                : `${leaving} ${leaving === 1 ? "Person fällt" : "Personen fallen"} dadurch aus dem Verteiler.`}
            </>
          ) : null
        }
        confirmLabel="Regel entfernen"
        pending={isPending}
        onConfirm={confirmRemoval}
      />
    </Panel>
  );
}
