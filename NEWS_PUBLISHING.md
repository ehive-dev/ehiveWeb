# News Publishing

Der News-Bereich ist so aufgebaut, dass Startseite und [news.html](./news.html) ihre Karten aus einer zentralen Datenliste ziehen.

## Für einen neuen Beitrag

1. Eine neue Artikelseite im Root anlegen, z. B. `news-mein-thema.html`
2. Die neue URL in `news-data.js` ganz oben eintragen
3. Die neue URL in `sitemap.xml` ergänzen
4. `linkedinText` (vollständiger Beitrag mit Link und Hashtags) und `linkedinImage` (öffentliche PNG-/JPEG-URL) ergänzen
5. Änderungen prüfen, committen und nach `main` pushen. GitHub Pages erzeugt den Newsfeed vor den Tests und dem Deployment automatisch neu. Die XML-Datei muss dafür nicht manuell gepflegt werden.

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
  linkedinApproved: false,
  linkedinApprovedAt: null,
  linkedinApprovalHash: null,
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


## LinkedIn-Freigabe im Newsbeitrag

Die Redaktion pflegt weiterhin `news-data.js`. Zusätzliche Make-Datenbanken sind für die Freigabe nicht erforderlich.
Jede News beginnt mit:

```js
linkedinApproved: false,
linkedinApprovedAt: null,
linkedinApprovalHash: null,
```

Der öffentliche Newsfeed `https://www.ehiv3.de/news-feed.xml` enthält weiterhin alle News. Seine Kategorie mit Domain `https://www.ehiv3.de/linkedin-approval` kennzeichnet Einträge als `pending` oder `approved`. Er darf nicht als direkte Veröffentlichungsquelle verwendet werden.

Für Make ist ausschließlich `https://www.ehiv3.de/linkedin-feed.xml` vorgesehen. Dieser Feed enthält nur Beiträge mit expliziter boolescher Freigabe, gültigem Freigabezeitpunkt und passender Prüfsumme der freigegebenen Fassung. Ohne freigegebene Beiträge ist er gültiges RSS mit null Einträgen.

### Einen Beitrag freigeben

Nach Prüfung von Text, Bild und Link:

```bash
node tools/set-linkedin-approval.cjs news-mein-thema.html --approve
```

Das Hilfsprogramm setzt `linkedinApproved: true`, hinterlegt beim ersten Mal den UTC-Freigabezeitpunkt in `linkedinApprovedAt` und speichert die Prüfsumme von URL, Titel, LinkedIn-Text und LinkedIn-Bild in `linkedinApprovalHash`. Es verändert nur den ausgewählten Datensatz. Ein wiederholter Aufruf ohne Inhaltsänderung verändert die Freigabe nicht.
Anschließend die Änderung committen und veröffentlichen. Die Freigabe ist erst nach erfolgreichem Deployment öffentlich wirksam. Der Benutzer kann den gewünschten Beitrag hier im Chat zur Freigabe benennen; er muss dafür in Make keinen Datensatz anlegen.

Wenn Titel, Artikel-URL, LinkedIn-Text oder LinkedIn-Bild geändert werden, passt die gespeicherte Prüfsumme nicht mehr. Der Eintrag verschwindet automatisch aus dem LinkedIn-Feed, bis die geänderte Fassung ausdrücklich erneut freigegeben wird. Eine reine Bearbeitung ist keine neue Veröffentlichung: erster Freigabezeitpunkt und Artikel-GUID bleiben bestehen.

Freigabe zurückziehen:

```bash
node tools/set-linkedin-approval.cjs news-mein-thema.html --revoke
```

Das verhindert zukünftige Abrufe aus dem freigegebenen Feed nach dem Deployment. Bereits veröffentlichte oder von Make bereits abgerufene Beiträge werden dadurch nicht zurückgerufen oder gelöscht.

### RSS-Felder und Make-Einrichtung

1. Scenario während der Umstellung deaktivieren. Im RSS-Modul die URL einmalig auf `https://www.ehiv3.de/linkedin-feed.xml` ändern.
2. Bei der Umstellung den Startpunkt vor der ersten gewünschten Freigabe setzen. Aktuell sind alle vorhandenen Meldungen gesperrt, sodass keine historische Meldung ungefragt nachveröffentlicht wird. Ein leerer Feed liefert zunächst keine neuen Daten für die Mapping-Vorschau.
3. `description` enthält den vollständigen vorbereiteten LinkedIn-Beitrag inklusive Link und Hashtags. Den Titel nicht zusätzlich voranstellen. `enclosure.url` liefert das PNG-/JPEG-Bild, `enclosure.type` den MIME-Typ und `enclosure.length` die Dateigröße.
4. Nur die eHive-Unternehmensseite auswählen und den ersten ausdrücklich freigegebenen Beitrag kontrolliert testen. Der Feed allein veröffentlicht nichts. Die Make-/LinkedIn-Verbindung und deren Zeitplan werden separat eingerichtet.
5. Make nutzt die Artikel-URL als stabile GUID. Diese und den RSS-Startpunkt im laufenden Betrieb nicht zum Wiederholen eines Beitrags ändern. Eine erste späte Freigabe verwendet im LinkedIn-Feed das Freigabedatum als `pubDate`, damit ältere News bei ihrer ersten Freigabe erkannt werden können. Der öffentliche Newsfeed behält das ursprüngliche Artikeldatum.

Der Feed ist kein Versandprotokoll und erhält keine LinkedIn-Erfolgsmeldungen. Make kann bei manuellen Wiederholungen, Zurücksetzen des Startpunkts oder bestimmten Fehlerwiederholungen trotzdem erneut veröffentlichen. Strikte Einmalzustellung benötigt zusätzlich eine dauerhafte Ablage von veröffentlichten GUIDs und eine passende Fehlerbehandlung. Ohne diese keine automatische Wiederholung nach unklarem Veröffentlichungsergebnis starten.

Website-Karten verwenden weiterhin `excerpt` und `image`; Freigabefelder verändern deren Darstellung nicht. Datum und Uhrzeit sind technisch UTC, nicht die lokale Anzeigezeit.

Bei jeder Veröffentlichung erzeugt „Build news RSS feed“ in `.github/workflows/pages.yml` beide Feeds neu. Danach prüfen die Tests die erzeugten Dateien; nur erfolgreiche Tests erlauben das Deployment. Die generierten Dateien werden nicht automatisch in das Git-Repository zurückgeschrieben.
Lokal: `node tools/build-news-feed.cjs`, danach `node --test tests/*.test.cjs`. Mit `node tools/build-news-feed.cjs --check` lässt sich die Übereinstimmung beider XML-Dateien prüfen.
