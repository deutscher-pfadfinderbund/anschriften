# Typst-Spike (M2, entschärft M5)

Ziel: absichern, dass Typst ein A5-Verzeichnis mit Fira Sans und ein Namensregister
mit korrekten Seitenzahlen erzeugen kann, bevor M5 startet.

**Ergebnis: funktioniert.** Getestet mit **Typst 0.15.0**. Template: `src/pdf/templates/spike.typ`,
Schriften eingecheckt unter `src/pdf/fonts/` (Fira Sans Regular/Bold/Italic, SIL OFL).

Kompilieren:

```bash
typst compile --font-path src/pdf/fonts src/pdf/templates/spike.typ /tmp/spike.pdf
```

Das Namensregister löst Seitenzahlen über Labels auf: jeder Eintrag trägt ein Label
(`#strong(name)#label(schluessel)`), und im Register liefert
`#context { query(label(k)).first().location().page() }` die reale Seite (Beispiel-PDF:
Anna → 1, Bert → 1, Cara → 2). Fira Sans wird über `--font-path` sauber eingebunden,
Umlaute (Einträge, Späherin) und Bold/Italic rendern korrekt; die eingecheckten OTFs
allein genügen (mit `--ignore-system-fonts` verifiziert – wichtig für den Container in M6).

## Stolpersteine für M5

- **`locate(loc => …)` ist Alt-API.** Ab Typst 0.11+ gilt `#context { … }` + `query(<label>)`;
  Seite über `elem.location().page()`. Genau diese aktuelle Syntax verwenden.
- **`#pagebreak()` ist innerhalb von `#columns(2)[…]` verboten** ("pagebreaks are not allowed
  inside of containers"). Für ein durchgehend paginiertes zweispaltiges Verzeichnis daher
  **Seiten-Spalten** setzen: `#set page(columns: 2)`. Ein spaltenübergreifender Kopf geht dann
  mit `place(..., scope: "parent", float: true)`.
- Fachlogik (Sortierung, Gruppierung, Register-Aufbau) gehört laut Konvention nach
  `src/pdf/build-data.ts`; das Template bleibt dumm und iteriert nur über `data.json`.
