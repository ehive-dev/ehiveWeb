# News Publishing

Der News-Bereich ist so aufgebaut, dass Startseite und [news.html](./news.html) ihre Karten aus einer zentralen Datenliste ziehen.

## Für einen neuen Beitrag

1. Eine neue Artikelseite im Root anlegen, z. B. `news-mein-thema.html`
2. Die neue URL in `news-data.js` ganz oben eintragen
3. Die neue URL in `sitemap.xml` ergänzen
4. `linkedinText` (vollständiger Beitrag mit Link und Hashtags) und `linkedinImage` (öffentliche PNG-/JPEG-URL) ergänzen
5. `node tools/build-news-feed.cjs` ausführen und `node --test tests/*.test.cjs` prüfen
6. Committen und nach `main` pushen

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
  linkedinText: "Titel\n\nEigener Kurztext.\n\nMehr erfahren: https://www.ehiv3.de/news-mein-thema.html\n\n#eHive #evcc",
  linkedinImage: "https://www.ehiv3.de/img/news/mein-beitragsbild.png",
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


## LinkedIn und Make

Öffentliche RSS-2.0-Datei: `https://www.ehiv3.de/news-feed.xml`.
`description` enthält den vollständigen vorbereiteten LinkedIn-Beitrag aus `linkedinText`, inklusive Artikel-Link und Hashtags. `title` ist die Artikelüberschrift; nicht nochmals vor `description` setzen.
`enclosure.url` liefert das PNG-/JPEG-Bild, `enclosure.type` den MIME-Typ und `enclosure.length` die Dateigröße.
`link` und der unveränderliche `guid` zeigen auf den Artikel. `pubDate` verwendet das ursprüngliche Artikeldatum mit 00:00 UTC als technische Zeitkonvention; beim Bearbeiten alter Artikel nicht auf das heutige Datum setzen.

### Einrichtung in Make

1. RSS-Quelle `https://www.ehiv3.de/news-feed.xml` verwenden.
2. Beim ersten Aktivieren nur ab dem Einrichtungszeitpunkt starten; vorhandene Meldungen nicht automatisch nachträglich veröffentlichen. Der Feed enthält auch historische Beiträge.
3. Den Text aus `description`, den Artikel-Link aus `link` und bei Bildbeiträgen das Bild aus `enclosure.url` übernehmen. Ein Bildbeitrag benötigt gegebenenfalls einen zusätzlichen Download-Schritt für die Bilddatei.
4. Eine ausdrückliche manuelle Freigabe und eine Ablage bereits veröffentlichter GUIDs einrichten, bevor das LinkedIn-Veröffentlichungsmodul aktiviert wird. Freigabe und Doppelpostschutz sind nicht durch die RSS-Datei selbst umgesetzt.
5. Ausschließlich die eHive-Unternehmensseite auswählen und zuerst mit einem einzeln freigegebenen Beitrag testen.

Der Feed allein veröffentlicht nichts. Eine Make-/LinkedIn-Verbindung oder Automatik ist damit nicht eingerichtet.
Ein erster Abruf darf auch nicht unbemerkt die 22 bestehenden Meldungen als neue Posts veröffentlichen.
Die Website-Karten verwenden weiterhin `excerpt` und `image`; Änderungen an LinkedIn-Texten oder PNG-/JPEG-Varianten verändern das Seitenlayout nicht.

Bei Änderungen an Texten/Bildern die RSS-Datei mit `node tools/build-news-feed.cjs` neu generieren. `--check` prüft die Übereinstimmung, die Tests verhindern die Veröffentlichung einer veralteten Datei.
