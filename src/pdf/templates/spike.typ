// Typst spike for the Bundesanschriftenverzeichnis PDF (issue #2, de-risks issue #5).
// Proves: A5 page, two columns, bundled Fira Sans, entry layout via grid, and a name
// register whose page numbers are resolved through labels. All data below is fictitious.
//
// Compile:
//   typst compile --font-path src/pdf/fonts src/pdf/templates/spike.typ /tmp/spike.pdf
// The bundled fonts alone are sufficient (verify with --ignore-system-fonts).
//
// Note: page-level `columns: 2` is used instead of the `#columns(2)` function because
// `#pagebreak()` is not allowed inside the `#columns` container. A full-width masthead
// spans both columns via `place(scope: "parent")`.

#set page(paper: "a5", columns: 2, margin: 1.4cm, numbering: "1")
#set text(font: "Fira Sans", size: 10pt, lang: "de")
#show heading: set text(font: "Fira Sans", weight: "bold")

#place(top + center, scope: "parent", float: true)[
  #text(size: 15pt, weight: "bold")[Anschriftenverzeichnis]
  #linebreak()
  #text(size: 9pt, style: "italic")[Typst-Spike · fiktive Daten]
  #line(length: 100%, stroke: 0.5pt)
]

// One person entry: bold name (carrying a label) plus a two-column data grid.
#let eintrag(schluessel, name, stand, ort, mail) = {
  [#strong(name)#label(schluessel)]
  grid(
    columns: (100pt, 100pt),
    row-gutter: 2pt,
    [Stand], [#stand],
    [Ort], [#ort],
    [E-Mail], [#emph(mail)],
  )
  v(8pt)
}

== Einträge

#eintrag("p1", "Anna Beispiel", "Späherin", "Musterstadt", "anna@example.org")
#eintrag("p2", "Bert Muster", "Knappe", "Beispieldorf", "bert@example.org")

#pagebreak()

#eintrag("p3", "Cara Probe", "Gildin", "Testhausen", "cara@example.org")

== Namensregister

#context {
  let register = (
    ("p1", "Beispiel, Anna"),
    ("p2", "Muster, Bert"),
    ("p3", "Probe, Cara"),
  )
  for (schluessel, name) in register {
    let treffer = query(label(schluessel))
    if treffer.len() > 0 {
      let seite = treffer.first().location().page()
      [#name #h(1fr) #seite \ ]
    }
  }
}
