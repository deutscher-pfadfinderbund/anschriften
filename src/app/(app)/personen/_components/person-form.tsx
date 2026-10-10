"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deletePerson, savePerson } from "@/actions/persons";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { ActiveOfficeHolder, AuditEntry, GroupRow, OfficeRow, PersonEditData, RankRow } from "@/db/queries";
import { callAction } from "@/lib/call-action";
import { directoryUrl } from "@/lib/directory-url";
import type { PersonCandidate } from "@/lib/duplicate-persons";
import { formatDateTime, formatFullName, formatNameWithScout } from "@/lib/format";
import type { FieldErrors } from "@/lib/person-schema";
import { cn } from "@/lib/utils";

import { AssignmentsPanel } from "./assignments-panel";
import { ChangeLogPanel } from "./change-log-panel";
import { ContactPanel } from "./contact-panel";
import { keyRowErrors, snapshot, toFormValues, toPayload, type FormValues, type SetValue } from "./form-values";
import { useActiveHolders } from "./holder-warning";
import { ListsPanel, PrintPanel } from "./lists-panel";
import { PersonPanel } from "./person-panel";
import { useUnsavedGuard } from "./use-unsaved-guard";

const noSubscribe = () => () => {};

/** One conflict toast at a time; it belongs to this form and goes when the form does. */
const CONFLICT_TOAST = "person-conflict";

/** The person editor: create (no `person`) or edit. Everything is buffered until Speichern. */
export function PersonForm({
  person,
  groups,
  offices,
  ranks,
  distributionLists,
  activeHolders,
  existingPersons,
  changeLog,
}: {
  person?: PersonEditData;
  groups: GroupRow[];
  offices: OfficeRow[];
  ranks: RankRow[];
  distributionLists: { id: number; name: string }[];
  /** Every active office tenure (preloaded) — drives the holder warning. */
  activeHolders: ActiveOfficeHolder[];
  /** Create mode only: existing names for the duplicate hint. */
  existingPersons?: PersonCandidate[];
  /** Edit mode only: the person's change log, newest first. */
  changeLog?: AuditEntry[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);

  // The baseline follows the props: after a history action the page re-renders with the
  // stored state, so `dirty` only ever means "edits that Speichern would write".
  const baseline = useMemo(() => toFormValues(person), [person]);
  const [values, setValues] = useState<FormValues>(baseline);
  // Concurrency token (see toPayload): replaced only by what a history action returns.
  const [version, setVersion] = useState(person?.updatedAt ?? "");
  const otherHolders = useActiveHolders(activeHolders, person?.id);
  // Only holder-warning orders whose warning is still shown: one for a row the user
  // changed or removed afterwards is stale, must not fire silently and is no edit.
  const orders = values.endPrevious.filter((o) =>
    values.assignments.some((a) => otherHolders(a).some((h) => h.assignmentId === o.assignmentId)),
  );
  const dirty = snapshot({ ...values, endPrevious: orders }) !== snapshot(baseline);
  const { confirmLeave, release } = useUnsavedGuard(dirty);

  // The last filtered directory (sessionStorage) — "/" on the server and during hydration.
  const backHref = useSyncExternalStore(noSubscribe, directoryUrl, () => "/");

  const [errors, setErrors] = useState<FieldErrors>({});
  // Set when a failed save rendered new errors: move focus to the first marked field.
  const focusInvalid = useRef(false);
  useEffect(() => {
    if (!focusInvalid.current) return;
    focusInvalid.current = false;
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    first?.focus({ preventScroll: true });
    first?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [errors]);

  const set: SetValue = (key, value, clear = [key]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (clear.some((k) => k in errors))
      setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !clear.includes(k))));
  };

  useEffect(() => () => void toast.dismiss(CONFLICT_TOAST), []);

  function save() {
    if (isSaving) return;
    const rows = values.assignments;
    startSave(async () => {
      const payload = toPayload(values, person && { id: person.id, updatedAt: version }, orders);
      const res = await callAction(() => savePerson(payload));
      if (!res.ok) {
        const fieldErrors = keyRowErrors(res.errors ?? {}, rows);
        setErrors(fieldErrors);
        // Field errors show at their fields and in the save bar; a toast there would
        // only cover the bar on a phone.
        if (Object.keys(fieldErrors).length > 0) {
          focusInvalid.current = true;
          return;
        }
        if (res.reload)
          toast.error(res.message, {
            id: CONFLICT_TOAST,
            description: "Deine Änderungen hier gehen dabei verloren.",
            duration: Infinity,
            closeButton: true,
            action: {
              label: "Neu laden",
              onClick: () => {
                release();
                window.location.reload();
              },
            },
          });
        else toast.error(res.message);
        return;
      }
      toast.success(person ? "Person gespeichert." : "Person angelegt.");
      router.push(backHref);
    });
  }

  function remove() {
    if (!person) return;
    startDelete(async () => {
      const res = await callAction(() => deletePerson(person.id));
      if (!res.ok) return void toast.error(res.message);
      toast.success("Person gelöscht.");
      router.push(backHref);
    });
  }

  // Field errors are marked inline; the bar names the single one or asks to check them.
  const errorCount = Object.keys(errors).length;
  const status =
    errorCount === 1
      ? Object.values(errors)[0]
      : errorCount > 1
        ? "Bitte prüfe die markierten Felder."
        : dirty
          ? "Nicht gespeichert"
          : null;

  const subtitle = person
    ? `Zuletzt geändert am ${formatDateTime(person.updatedAt)}${person.updatedBy ? ` von ${person.updatedBy}` : ""}`
    : undefined;

  return (
    <>
      <PageHeader
        title={person ? formatNameWithScout(person) : "Neue Person"}
        subtitle={subtitle}
        backHref={backHref}
        backLabel="Zurück zum Verzeichnis"
      />
      <PageBody className="pb-0">
        {/* While the form is on the page, the page's scroll padding keeps a field that gets
            keyboard focus clear of the sticky save bar (two rows on a phone). */}
        <form
          ref={formRef}
          noValidate
          className="[html:has(&)]:scroll-pb-24"
          aria-label={person ? "Person bearbeiten" : "Neue Person"}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid grid-cols-1 items-start gap-gutter lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex min-w-0 flex-col gap-gutter">
              <PersonPanel
                values={values}
                errors={errors}
                set={set}
                ranks={ranks}
                existingPersons={person ? undefined : existingPersons}
              />
              <ContactPanel values={values} errors={errors} set={set} />
              <AssignmentsPanel
                values={values}
                errors={errors}
                set={set}
                groups={groups}
                offices={offices}
                otherHolders={otherHolders}
                history={
                  person
                    ? {
                        personId: person.id,
                        historical: person.historicalAssignments,
                        version,
                        onVersion: setVersion,
                      }
                    : null
                }
              />
            </div>
            <div className="flex min-w-0 flex-col gap-gutter">
              <ListsPanel
                values={values}
                set={set}
                lists={distributionLists}
                ruleMemberships={person?.ruleMemberships ?? []}
              />
              <PrintPanel values={values} errors={errors} set={set} />
            </div>
          </div>
          {changeLog ? <ChangeLogPanel entries={changeLog} className="mt-gutter" /> : null}

          {/* Sticky: Speichern stays in reach on a long form and on a phone. The status
              line takes its own row on a phone and sits between the buttons from sm up. */}
          <div className="sticky bottom-0 z-10 -mx-4 mt-gutter flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-line bg-paper px-4 py-3 sm:-mx-6 sm:px-6">
            <Button type="submit" aria-disabled={isSaving}>
              {isSaving ? "Speichern …" : "Speichern"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (confirmLeave()) router.push(backHref);
              }}
            >
              Abbrechen
            </Button>
            {status ? (
              <p
                className={cn(
                  "order-first w-full text-caption sm:order-1 sm:w-auto sm:min-w-0 sm:flex-1",
                  errorCount > 0 ? "text-crit" : "text-ink-faint",
                )}
              >
                {status}
              </p>
            ) : null}
            {person ? (
              <Button
                type="button"
                variant="ghost"
                className="order-2 ml-auto text-ink-soft hover:text-crit"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 aria-hidden />
                Löschen
              </Button>
            ) : null}
          </div>
        </form>
      </PageBody>

      {person ? (
        <ConfirmDeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Person löschen?"
          description={
            <>
              {formatFullName(person)} wird mit allen Ämtern endgültig aus dem Verzeichnis entfernt. Das
              lässt sich nicht rückgängig machen.
            </>
          }
          confirmLabel="Endgültig löschen"
          pending={isDeleting}
          onConfirm={remove}
        />
      ) : null}
    </>
  );
}
