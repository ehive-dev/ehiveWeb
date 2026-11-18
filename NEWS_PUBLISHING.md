# News Publishing

Der News-Bereich ist so aufgebaut, dass Startseite und [news.html](./news.html) ihre Karten aus einer zentralen Datenliste ziehen.

## Für einen neuen Beitrag

1. Eine neue Artikelseite im Root anlegen, z. B. `news-mein-thema.html`
2. Die neue URL in `news-data.js` ganz oben eintragen
3. Die neue URL in `sitemap.xml` ergänzen
4. Committen und nach `main` pushen

## Aufbau der Karten

`news-data.js` verwendet dieses Schema:

```js
{
  date: "2026-03-22",
  dateLabel: "22. März 2026",
  title: "Titel des Beitrags",
  excerpt: "Kurze Zusammenfassung für Startseite und Übersicht.",
  href: "https://www.ehiv3.de/news-mein-thema.html",
  image: "img/news/mein-beitragsbild.webp",
  imageAlt: "Kurze Beschreibung des Bildinhalts",
  tags: ["Software", "Release"]
}
```

Jeder Beitrag erhält ein `image` und einen passenden `imageAlt`. Verwende bevorzugt ein Inhaltsbild oder Video-Poster aus dem Artikel, alternativ dessen hinterlegtes Social-Vorschaubild. Die Übersicht zeigt das Bild rechts neben der Überschrift. Die statischen Karten in `news.html` müssen dieselben Angaben enthalten.

## Artikelseite

Für neue Beiträge ist die einfachste Methode:

1. Eine bestehende Datei wie `news-chargeledger.html` kopieren
2. `title`, `meta description`, Canonical, JSON-LD, Datum, Überschrift und Text anpassen
3. Relevante interne Links im rechten Seitenblock aktualisieren

Hinweis:

- Unter jedem `news-*.html`-Beitrag erscheint automatisch ein Fragen-&-Antworten-Bereich über GitHub Issues.
- Die Zuordnung läuft aktuell über den Seitenpfad (`pathname`). Wenn sich die URL eines Beitrags ändert, entsteht dadurch auch ein neuer Thread.

## Checkliste vor dem Push

- Steht der neue Beitrag ganz oben in `news-data.js`?
- Ist die URL in `sitemap.xml` enthalten?
- Passen `datePublished` und `dateModified` im JSON-LD?
- Zeigt der Canonical auf die finale `https://www.ehiv3.de/...`-URL?
