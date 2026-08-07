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

// --- heading styles: bold sections, subsections and sub-subsections -------------------
// `bottom-edge: "descender"` is essential: with Typst's default bottom edge (the baseline) the
// block ends at the baseline, so the descenders of a heading like "Jungenschaft Hohenstaufen"
// hang into the `below` gap and collide with the name of the first entry underneath.
// `sticky` keeps a sub-group heading with the first entry of that group instead of stranding it
// at the foot of a column — it only works because `render-entry` puts the office label AND the
// data grid into one block, so the heading cannot stick to a lone office label.
#show heading.where(level: 1): it => block(above: 0pt, below: 4pt)[
  #text(size: 14pt, weight: "bold", bottom-edge: "descender")[#it.body]
]
#show heading.where(level: 2): it => block(above: 8pt, below: 3pt, sticky: true)[
  #text(size: 11pt, weight: "bold", bottom-edge: "descender")[#it.body]
]
#show heading.where(level: 3): it => block(above: 5pt, below: 2.5pt, sticky: true)[
  #text(size: 9pt, weight: "bold", bottom-edge: "descender")[#it.body]
]

// Gap between the stacked lines of an entry — identical for grid rows and for the lines inside
// the address / phone stacks, so the entry reads as one evenly set block.
#let line-gap = 2.6pt
// Share of the entry grid taken by the right-hand phone column: 46% of a body column is 26.5mm,
// just enough for a labelled number of the usual shape ("Mobil: 0160 98765432" = area code plus
// 6–8 digits) on a single line. The address column takes the REST via `1fr` — with the former
// `(57%, 43%)` both tracks were measured against the full width, so the column gutter pushed the
// grid ~1mm past the column edge and long e-mails bled into the outside margin.
#let phone-col = 46%

// Long e-mail addresses have no natural break opportunity, so they used to run past the outside
// margin. Insert a zero-width space after the "@" — the only place where a broken address still
// reads unambiguously; hyphens and German hyphenation cover the domain part.
#let wrappable-email(s) = s.replace("@", "@\u{200B}")

// Keep the house number attached to the last word of the street name: the final two tokens go
// into an unbreakable box, so a street that has to wrap breaks inside the name ("Äußere
// Bayreuther / Straße 71") instead of orphaning the number — or hyphenating right before it —
// on a line of its own. Streets of only two tokens are left untouched: there the single long
// word must stay hyphenatable, otherwise it could not be broken at all.
#let street-line(s) = {
  let parts = s.split(" ").filter(p => p != "")
  if parts.len() >= 3 {
    parts.slice(0, parts.len() - 2).join(" ") + " "
    box[#parts.slice(parts.len() - 2).join(" ")]
  } else {
    s
  }
}

// --- one person entry: optional office label + two-column data grid --------------------
// Office label and grid live in ONE unbreakable block so an entry is never split and a sticky
// heading above it drags the whole entry along.
#let render-entry(e) = {
  let officeline = if e.office != none [
    #text(size: 8pt, style: "italic", weight: "bold")[#e.office]#linebreak()
  ]
  let namecell = if e.label != none [#strong(e.name)#label(e.label)] else [#strong(e.name)]

  // Phone numbers as compact "Label: number" strings (issue #8): every number keeps its label
  // so mobil/privat/dienstlich are distinguishable, and no number is dropped. Set one step
  // below the body size so the labelled number fits the narrow column without wrapping.
  let fmt-phone(p) = if p.label != none [#p.label: #p.number] else [#p.number]

  // Address lines and phone numbers form two INDEPENDENT stacks side by side. Aligning them
  // row by row meant a wrapped phone number pushed a blank line between the street and the PLZ
  // line, and a third number had to escape into a full-width row below the address, where an
  // unlabelled number reads like part of the address.
  let stacked(items) = stack(dir: ttb, spacing: line-gap, ..items)
  let addr = ()
  if e.street != none { addr.push([#street-line(e.street)]) }
  if e.city != none { addr.push([#e.city]) }
  let phones = e.phones.map(fmt-phone)

  let rows = ()
  rows.push((namecell, [#e.detail]))
  if e.extra != none { rows.push((grid.cell(colspan: 2)[#e.extra],)) }
  if addr.len() > 0 or phones.len() > 0 {
    rows.push((
      stacked(addr),
      if phones.len() > 0 { text(size: 8pt, stacked(phones)) } else { [] },
    ))
  }
  if e.email != none { rows.push((grid.cell(colspan: 2)[#wrappable-email(e.email)],)) }
  if e.birth != none { rows.push((grid.cell(colspan: 2)[#emph[(\* #e.birth)]],)) }

  block(breakable: false, {
    officeline
    grid(
      columns: (1fr, phone-col),
      row-gutter: line-gap,
      column-gutter: 3pt,
      ..rows.flatten(),
    )
  })
  v(6pt, weak: true)
}

// --- subtree rendered inside the two body columns (subgroup headings stay in-column) ----
#let render-subtree(g) = {
  heading(level: g.level)[#g.name]
  for e in g.entries { render-entry(e) }
  for c in g.children { render-subtree(c) }
}

// --- one top-level section: fresh page, full-width heading, then a 2-column body --------
// Every Gliederung deliberately starts on a fresh page. Typst's `columns()` fills the left
// column before the right one and does not balance them, so a short section legitimately
// leaves its right column empty; that is the intended look for a printed directory.
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
//  TABLE OF CONTENTS + BODY — full-width section headings over 2-column (unbalanced) bodies
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
// One grid instead of one paragraph with `#h(1fr)`: a fractional space collapses at the end of
// a full line, which let the page number wrap onto a line of its own. In its own grid column
// the number can never be separated from its entry; `bottom` alignment keeps it beside the last
// line of a multi-line entry. Row gutter matches the paragraph leading so the register stays as
// dense as before.
#columns(2, context {
  let rows = ()
  for r in data.register {
    let hits = query(label(r.label))
    let name = [#strong(r.lead)#r.rest]
    if hits.len() > 0 {
      rows.push((name, [#hits.first().location().page()]))
    } else {
      // fallback: register without page number (issue #5 acceptance criterion)
      rows.push((grid.cell(colspan: 2)[#name],))
    }
  }
  grid(
    columns: (1fr, auto),
    column-gutter: 2pt,
    row-gutter: 0.4em,
    align: (left + bottom, right + bottom),
    ..rows.flatten(),
  )
})
