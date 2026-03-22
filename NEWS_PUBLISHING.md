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
  tags: ["Software", "Release"]
}
```

## Artikelseite

Für neue Beiträge ist die einfachste Methode:

1. Eine bestehende Datei wie `news-chargeledger.html` kopieren
2. `title`, `meta description`, Canonical, JSON-LD, Datum, Überschrift und Text anpassen
3. Relevante interne Links im rechten Seitenblock aktualisieren

## Checkliste vor dem Push

- Steht der neue Beitrag ganz oben in `news-data.js`?
- Ist die URL in `sitemap.xml` enthalten?
- Passen `datePublished` und `dateModified` im JSON-LD?
- Zeigt der Canonical auf die finale `https://www.ehiv3.de/...`-URL?
