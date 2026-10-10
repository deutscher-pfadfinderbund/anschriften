<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Bundesanschriftenverzeichnis (anschriften)

Webanwendung für das Anschriftenverzeichnis des Deutschen Pfadfinderbundes (DPB). Ersetzt eine MS-Access-Datenbank. Nutzerkreis: kleiner Kreis Kanzler\*innen — **muss ohne Schulung bedienbar sein. Simplicity matters: im Zweifel die einfachere Lösung.**

Zentrale Referenz: Roadmap-Issue #7 im Repo (`gh issue view 7`). Jeder Meilenstein ist ein Issue (#1–#6) mit Checkliste und Abnahmekriterien.

## Sprache

- UI-Texte, Labels, Fehlermeldungen: **Deutsch** (korrekte Umlaute, „Anschrift", nicht "Adresse" mischen — konsistent bleiben)
- Code, Bezeichner, Kommentare, Commits: Englisch

## Stack (fix, nicht diskutieren)

- Next.js 16 (App Router, TypeScript, Turbopack), `output: "standalone"`
- **Achtung Next 16:** `proxy.ts` statt `middleware.ts`; Docs in `node_modules/next/dist/docs/` lesen
- better-auth **1.6.23 (gepinnt)** + `genericOAuth`-Plugin gegen Keycloak (OIDC discovery). Keine eigenen Accounts, kein Auth.js
- Postgres 17 + Drizzle ORM. Schema: `src/db/schema.ts`, Migrationen eingecheckt in `drizzle/`
- Tailwind 4 (Tokens via `@theme` in `globals.css`), shadcn/ui
- PDF: Typst (Issue #5) — Fachlogik in TS (`src/pdf/build-data.ts`), Template dumm halten
- Tests: vitest, nur für reine Logik ohne React/DB (`src/lib`, die reinen Dateien neben Komponenten wie `directory-filter.ts`/`form-values.ts`, `src/pdf/build-data.ts`, `scripts/import-parse.ts`). Keine Test-Pyramide

## Architektur-Konventionen

- Alle Mutationen als **Server Actions** in `src/actions/*.ts` (`"use server"`), Rumpf in `return mutation(async (by) => { … })` aus `src/lib/action-helpers.ts`: prüft die Session, liefert `by` für `updated_by` und ruft nach Erfolg `revalidateApp()` auf. Kein `router.refresh()` im Client
- Route Handler NUR für: Auth-Catch-all (`src/app/api/auth/[...all]/route.ts`), PDF-/CSV-Export (brauchen `Content-Disposition`)
- Geschützter Bereich: Route-Group `src/app/(app)/`. **Jede Seite** ruft als Erstes `requirePageSession()` (`src/lib/auth-helpers.ts`) auf — das ist das Gate. `layout.tsx` ist KEINE Sicherheitsgrenze (Layouts werden bei RSC-Navigationen übersprungen). `proxy.ts` leitet nur Seitennavigationen ohne Cookie optimistisch nach `/login` um — keine Server Actions, kein `/api` (die Export-Routen antworten selbst mit 401)
- Abgelaufene Session in Server Actions: `mutation()` gibt `SESSION_EXPIRED` zurück (ohne `mutation()`: `getActionSession()` + `return SESSION_EXPIRED`). Nie werfen — ein Throw ersetzt die Seite durch die Fehlerseite und vernichtet Formulareingaben
- Fachregeln an genau einer Stelle: „heute" = `todayIso()` aus `src/lib/format.ts` (Europe/Berlin, nie `toISOString()`); aktive Amtszeit = `end_date IS NULL` (Bis-Daten in der Zukunft werden abgelehnt); Bereiche = `SECTIONS` aus `src/lib/sections.ts`; E-Mail-Gültigkeit = `EMAIL_RE`/`collectEmails` aus `src/lib/export.ts`; Downloads = `downloadFile` aus `src/lib/download.ts`
- DB-Zugriff: zentraler Client `src/db/index.ts`; niemals SQL-Strings in Komponenten. Zwei dokumentierte Ausnahmen greifen direkt auf `db` zu: `src/pdf/build-data.ts` (isolierte Full-Table-Reads fürs PDF) und `src/lib/mail.ts` (`mail_log`-Schreiben atomar zum SMTP-Versand)
- Personentabelle: alle Datensätze serverseitig laden (~600, schon in Verzeichnis-Reihenfolge `sortByDirectoryName`), clientseitig filtern, sortieren und auswählen mit schlichtem React-State (keine Tabellen-Bibliothek). Keine Pagination
- `updated_by` = Name/E-Mail aus der Session bei jeder Mutation setzen
- Änderungsprotokoll: jede Mutation an einer Person (eigene Felder, Ämter aktiv und früher, manuelle Verteiler-Mitgliedschaften) schreibt in **derselben Transaktion** `audit_log` über `src/db/audit.ts` (`personSnapshot` vorher + `logPersonChange` nachher bzw. `audited(tx, personId, by, work)`, `logMemberships`, `logDeletion`). Werte werden beim Schreiben anzeigefertig formatiert (Diff + Feld-Labels in `src/lib/audit.ts`), die UI zeigt sie nur an. Stammdaten und Regel-Mitgliedschaften werden nicht protokolliert; der Verlauf einer gelöschten Person kaskadiert mit ihr

## Design (UI)

Referenz-Mockup (Struktur übernehmen): https://claude.ai/code/artifact/f1874284-ef26-4484-b1da-83ed5a63a597
**Wichtig: dezenter als das Mockup — Grün NUR als Akzent** (Primär-Buttons, Links, aktive Markierung), Flächen/Chips/Hover neutral. Tokens sind in `src/app/globals.css` definiert — verwenden, nicht neu erfinden:

- Grundton Papierweiß/Anthrazit (light/dark), Tinte fast schwarz
- Akzent Tannengrün `--color-fir` (#2E5C46) sparsam; Messing `--color-brass` nur für kleine Kennzeichnungen (Verteiler-Chips)
- Schrift: Fira Sans (UI/Daten, wie das gedruckte Verzeichnis), Display-Serif (Iowan Old Style/Palatino-Stack) nur für Seitentitel, Wortmarke und Panel-Überschriften
- Dicht aber ruhig: 13.5–14px Tabellentext, `tabular-nums` für Zahlenspalten
- Beide Themes pflegen (`prefers-color-scheme` + `data-theme`-Override)

## Befehle

**Package-Manager ist bun** (`bun.lock`; kein npm/npx verwenden, kein package-lock.json erzeugen).

```bash
bun install                        # Dependencies
bun run dev                        # Dev-Server (braucht laufende Dev-DB)
docker compose -f compose.dev.yml up -d   # lokale Postgres (Port 5544)
bunx drizzle-kit generate          # Migration aus Schema-Änderung erzeugen (SQL einchecken!)
bunx drizzle-kit migrate           # Migrationen anwenden
bun run test                       # vitest
bun run build                      # Prod-Build (standalone)
bun scripts/import-mdb.ts <mdb> --dry-run   # Access-Import (bun führt TS direkt aus)
```

Env-Variablen: siehe `.env.example`. Lokal `.env.local` anlegen.

## Git/PR-Workflow

- Feature-Branch pro Issue (`m1-auth`, `m2-schema-import`, …), PR gegen `main`, Issue im PR-Text mit `Closes #n` verknüpfen
- Commits klein und thematisch; Migrationen (`drizzle/*.sql`) immer mit einchecken
- Vor PR: `bun run build` und `bun run test` müssen grün sein
