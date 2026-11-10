<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

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
- better-auth **exakt gepinnt** (Upgrades nur mit Login-Test gegen den Dev-Keycloak) + `genericOAuth`-Plugin gegen Keycloak (OIDC discovery). Der in Keycloak registrierte Callback `/api/auth/oauth2/callback/keycloak` wird im Auth-Catch-all auf den 1.7-Pfad gebrückt (`LEGACY_CALLBACK_PATH`). Keine eigenen Accounts, kein Auth.js
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
- Änderungsprotokoll: jede Mutation an einer Person (eigene Felder, Ämter, manuelle Verteiler-Mitgliedschaften) schreibt in **derselben Transaktion** `audit_log` über die Helfer in `src/db/audit.ts`; Diff und Feld-Labels (anzeigefertig beim Schreiben) in `src/lib/audit.ts`. Stammdaten und Regel-Mitgliedschaften werden nicht protokolliert; der Verlauf einer gelöschten Person kaskadiert mit ihr

## Design (UI)

Referenz-Mockup (nur Struktur übernehmen): https://claude.ai/code/artifact/f1874284-ef26-4484-b1da-83ed5a63a597
**Theme „Satzspiegel“: die Seite ist ein gesetztes Blatt.** Keine Kästen um Abschnitte — große Serifen-Titel über einer Tintenlinie, Haarlinien und Weißraum tragen die Struktur. Fast-schwarze Tinte auf Weiß, kühle Neutralgraus, kein zweiter Farbton. Tokens sind in `src/app/globals.css` definiert — verwenden, nicht neu erfinden:

- Marke: nur die `Lilie` aus dem DPB-Briefkopf (`src/components/brand`; Seitenleiste, Top-Bar, Login, Favicon), als Maske in Tintenfarbe (folgt hell/dunkel). Der Schriftzug „Deutscher Pfadfinderbund“ ist für Briefköpfe, nicht für die App. Keine eigenen Logos erfinden
- Papier weiß, auch Seitenleiste und Top-Bar; Dark ist gedimmtes Graphit (#161618). Grau für Nebentext (`ink-soft`/`ink-faint`), als Fläche nur für Hover/Auswahl (`hover`/`active`) und leise Füllungen (`surface-2`: Chips, Dialog-Fuß)
- Abschnitte = `Panel` (Titel `text-section` + `border-ink`-Linie, kein Rahmen). Listenzeilen in Abschnitten ohne eigenen Seitenabstand, damit Text und Linien bündig mit dem Titel stehen. Seitentitel `text-display` (bis 40px), ohne Linie darunter
- `--color-brand` ist Tinte (Links unterstrichen, Fokus); Primär-Button tintengefüllt (im Dark hell mit dunkler Schrift). Aktiv/ausgewählt = `active`-Fläche + mittleres Gewicht (Navigation, Tabs). Rot (`--color-crit`) nur für Fehler und Löschen
- Bedienelemente gerundet (`--radius: 0.5rem`); Buttons und Schwebendes mit weicher Kante (`line-strong`), Formularfelder und Checkboxen in `--control` (grau, ≥ 3:1 — nie darunter). Schatten nur `shadow-xs` (Outline-Button) und `shadow-md`/`shadow-lg` auf Schwebendem (Popover, Select, Dialog, Drawer, Auswahlleiste). Fokus: 2px Tinte, 2px Abstand; Felder: Tintenrand + 1px Ring
- Schrift: Fira Sans (UI/Daten, wie das gedruckte Verzeichnis), Source Serif 4 (eingecheckt in `src/app/fonts`, überall gleich) nur für Seitentitel, Wortmarke und Abschnitts-/Dialogtitel. Feldbeschriftungen `field-label` (normale Schreibung); `eyebrow` (kleine Versalien) nur für Tabellenköpfe und Seitenleisten-Gruppen
- Dicht aber ruhig: 13.5–14px Tabellentext, `tabular-nums` für Zahlenspalten
- Beide Themes pflegen; immer umschaltbar: `ThemeToggle` (`src/components/theme-toggle.tsx`) setzt das Cookie `theme`, das Root-Layout rendert es als `<html data-theme>`; ohne Cookie folgt die Seite dem System

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
