// Bundesanschriftenverzeichnis — print template (issue #5).
//
// This template is intentionally "dumb": all filtering, sorting, grouping and register
// building happens in TypeScript (src/pdf/build-data.ts) and is handed over as `data.json`.
// The template only iterates over that structure and renders it. String values are always
// rendered via `#value` content interpolation — never `eval` — so `#`, `@`, `\` in the data
// are treated as plain text.
//
// Compile (see src/pdf/compile.ts for the production call):
//   typst compile --root <dir> --font-path src/pdf/fonts main.typ out.pdf

#let data = json("data.json")

#set document(title: data.title, author: "Deutscher Pfadfinderbund")
#set text(font: "Fira Sans", size: 8.5pt, lang: "de", hyphenate: true)
#set par(justify: false, leading: 0.5em)

// --- heading styles: bold sections, subsections and (bold-italic) sub-subsections ---
#show heading.where(level: 1): it => block(above: 0pt, below: 6pt)[
  #text(size: 14pt, weight: "bold")[#it.body]
]
#show heading.where(level: 2): it => block(above: 8pt, below: 2pt)[
  #text(size: 11pt, weight: "bold")[#it.body]
]
#show heading.where(level: 3): it => block(above: 5pt, below: 1pt)[
  #text(size: 9pt, weight: "bold")[#it.body]
]

// --- one person entry: optional office label + two-column data grid --------------------
#let render-entry(e) = {
  if e.office != none {
    text(size: 8pt, style: "italic", weight: "bold")[#e.office]
    linebreak()
  }
  let namecell = if e.label != none [#strong(e.name)#label(e.label)] else [#strong(e.name)]

  // Phone numbers as compact "Label: number" strings (issue #8): every number keeps its label
  // so mobil/privat/dienstlich are distinguishable. The first two sit beside the street/PLZ
  // rows as before; any further numbers follow on their own full-width rows — none is dropped.
  let fmt-phone(p) = if p.label != none [#p.label: #p.number] else [#p.number]
  let phones = e.phones.map(fmt-phone)
  let phone0 = if phones.len() > 0 { phones.at(0) } else { [] }
  let phone1 = if phones.len() > 1 { phones.at(1) } else { [] }

  let rows = ()
  rows.push((namecell, [#e.detail]))
  if e.extra != none { rows.push((grid.cell(colspan: 2)[#e.extra],)) }
  rows.push(([#e.street], phone0))
  rows.push(([#e.city], phone1))
  if phones.len() > 2 {
    for p in phones.slice(2) { rows.push((grid.cell(colspan: 2)[#p],)) }
  }
  if e.email != none { rows.push((grid.cell(colspan: 2)[#e.email],)) }
  if e.birth != none { rows.push((grid.cell(colspan: 2)[#emph[(\* #e.birth)]],)) }

  block(breakable: false, grid(
    columns: (57%, 43%),
    row-gutter: 2.6pt,
    column-gutter: 3pt,
    ..rows.flatten(),
  ))
  v(6pt, weak: true)
}

// --- subtree rendered inside the balanced two columns (subgroup headings stay in-column) --
#let render-subtree(g) = {
  heading(level: g.level)[#g.name]
  for e in g.entries { render-entry(e) }
  for c in g.children { render-subtree(c) }
}

// --- one top-level section: fresh page, full-width heading, then a balanced 2-column body --
#let render-section(sec) = {
  pagebreak(weak: true)
  heading(level: 1)[#sec.name]
  columns(2, {
    for e in sec.entries { render-entry(e) }
    for c in sec.children { render-subtree(c) }
  })
}

// ========================================================================================
//  FRONT MATTER — single column, no running header/footer
// ========================================================================================
#set page(
  paper: "a5",
  margin: (inside: 1.7cm, outside: 1.1cm, top: 1.4cm, bottom: 1.4cm),
  columns: 1,
  header: none,
  footer: none,
)

// Title page (vertically centred)
#v(1fr)
#align(center)[
  #text(size: 26pt, weight: "bold")[#data.title]
  #if data.subtitle != none {
    linebreak()
    text(size: 15pt)[#data.subtitle]
  }
  #linebreak()
  #v(0.4em)
  #text(size: 11pt)[Stand #data.date]
]
#v(1fr)
#pagebreak()

// Confidentiality notice (text taken 1:1 from the original LaTeX template) + letterhead
#text(weight: "bold")[Hinweise zur Nutzung des Anschriftenverzeichnisses]
#parbreak()
In diesem Anschriftenverzeichnis sind vertrauliche Informationen enthalten, die
ausschließlich für den Gebrauch innerhalb des Deutschen Pfadfinderbundes bestimmt sind.
Dementsprechend sind — im Sinne des persönlichen Schutzes der einzelnen im DPB engagierten
Personen — weder die Weitergabe an Dritte noch die Vervielfältigung und Veröffentlichung
gestattet. Jede Nutzung der Inhalte durch Dritte, die nicht zum intendierten Adressatenkreis
des Anschriftenverzeichnisses gehören, ist untersagt.
#parbreak()
Im Hinblick auf eine fortlaufende Aktualisierung sollten Veränderungen unmittelbar der
Kanzlerin des Bundes mitgeteilt werden. Dabei ist es hilfreich, wenn die geänderten Adressen
oder Adressbestandteile gekennzeichnet sind.
#parbreak()
Der Aufbau des Bundes und seiner Gliederungen spiegelt sich in der Struktur des
Inhaltsverzeichnisses wider. Am Ende des Heftes befindet sich ein nach Fahrten- bzw.
Vornamen sortiertes Register aller hier aufgeführten Personen. Im Übrigen bedeutet die
Nennung von Führerinnen und Führern der Gliederungen nicht unbedingt, dass diese bereits
bestätigt sind. Dies gilt sinngemäß auch für die Ordensgruppen.

#v(1fr)
#image("assets/DPB_Briefkopf.png", width: 100%)
#v(0.6em)
#for k in data.kanzlei { render-entry(k) }
#pagebreak()

// ========================================================================================
//  TABLE OF CONTENTS + BODY — full-width section headings over balanced 2-column bodies
// ========================================================================================
#set page(
  header-ascent: 40%,
  footer-descent: 40%,
  header: context {
    // running section = last level-1 heading located on or before the current page
    let pg = here().page()
    let cur = none
    for h in query(heading.where(level: 1)) {
      if h.location().page() <= pg { cur = h }
    }
    let name = if cur != none { upper(cur.body) }
    let odd = calc.odd(pg)
    stack(
      spacing: 3pt,
      if odd { align(right)[#name] } else { align(left)[#name] },
      line(length: 100%, stroke: 1pt),
    )
  },
  footer: context {
    let odd = calc.odd(here().page())
    let n = counter(page).display()
    stack(
      spacing: 3pt,
      line(length: 100%, stroke: 1pt),
      grid(
        columns: (1fr, auto, 1fr),
        align: (left + horizon, center + horizon, right + horizon),
        if odd [] else [#strong(n)],
        text(size: 8pt)[— Anschriftenverzeichnis · Stand #data.date —],
        if odd [#strong(n)] else [],
      ),
    )
  },
)

#heading(level: 1, outlined: false)[Inhalt]
#show outline.entry.where(level: 1): it => { v(2pt, weak: true); strong(it) }
#columns(2, outline(title: none, depth: 3))

// --- the directory itself ---
#for sec in data.sections { render-section(sec) }

// --- memorial (optional) ---
#if data.options.withMemorial and data.memorial.len() > 0 {
  pagebreak(weak: true)
  heading(level: 1)[Verstorbene Schwestern und Brüder]
  align(center, {
    for m in data.memorial [#m \ ]
  })
}

// --- name register: page numbers resolved via per-person labels -----------------------
#pagebreak(weak: true)
#heading(level: 1)[Namensregister]
#set text(size: 7.5pt)
#set par(hanging-indent: 7pt, leading: 0.4em)
#columns(2, context {
  for r in data.register {
    let hits = query(label(r.label))
    let name = [#strong(r.lead)#r.rest]
    if hits.len() > 0 {
      [#name #h(1fr) #hits.first().location().page() \ ]
    } else {
      // fallback: register without page number (issue #5 acceptance criterion)
      [#name \ ]
    }
  }
})
