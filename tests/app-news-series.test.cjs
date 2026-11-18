const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const appNews = [
  ["SmartHub", "news-smarthub-1-1-55.html"],
  ["evcc", "news-evcc-community-treffen-2026.html"],
  ["HiveScope", "news-hivescope-netzwerkscanner.html"],
  ["HiveBus", "news-hivebus-modbus-diagnose.html"],
  ["wattRadar", "news-wattradar-energiefluesse.html"],
  ["chargeLedger", "news-chargeledger-update-juli-2026.html"],
  ["tenantLedger", "news-tenantledger-mieterstrom.html"],
  ["ioManager", "news-iomanager-signale.html"],
  ["TunnelManager", "news-tunnelmanager-fernzugriff.html"],
  ["KNX Bridge", "news-knx-integration-beta.html"],
  ["KNX Logger", "news-knx-logger.html"],
  ["Node-RED", "news-node-red-automatisierung.html"],
  ["ioBroker", "news-iobroker-smarthome.html"]
];

const newArticles = [
  ["news-hivebus-modbus-diagnose.html", "img/news/hivebus-original.png", "2026-09-10"],
  ["news-wattradar-energiefluesse.html", "img/news/wattradar-original.png", "2025-10-19"],
  ["news-tenantledger-mieterstrom.html", "img/news/tenantledger-original.png", "2026-05-06"],
  ["news-iomanager-signale.html", "img/news/iomanager-original.png", "2025-09-05"],
  ["news-tunnelmanager-fernzugriff.html", "img/news/tunnelmanager-original.png", "2025-09-08"],
  ["news-node-red-automatisierung.html", "img/news/node-red-editor-official.png", "2026-11-12"],
  ["news-iobroker-smarthome.html", "img/news/iobroker-admin-official.png", "2026-11-13"]
];

test("jede sichtbare App ist im App-Store mit einem News-Beitrag verknüpft", () => {
  const appStore = read("app-store.html");
  for (const [app, href] of appNews) {
    assert.match(appStore, new RegExp(`href="${href.replaceAll(".", "\\.")}"`), `${app} ohne News-Link`);
  }
});

test("neue App-News verwenden echte Oberflächenaufnahmen und verteilte Daten", () => {
  const dates = new Set();
  for (const [article, image, date] of newArticles) {
    const html = read(article);
    dates.add(date);
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `${article}: H1`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.ehiv3\\.de/${article.replaceAll(".", "\\.")}"`));
    assert.match(html, new RegExp(image.replaceAll("/", "\\/").replaceAll(".", "\\.")));
    assert.match(html, /Originalaufnahme|Offizielle Originalaufnahme/);
    assert.doesNotMatch(html, /KI-generiert/i);
    assert.ok(fs.existsSync(path.join(root, image)), `${image} fehlt`);
  }
  assert.equal(dates.size, newArticles.length, "Veröffentlichungsdaten müssen verteilt sein");
});

test("News-Liste und Sitemap enthalten die vollständige App-Serie", () => {
  const news = read("news-data.js");
  const sitemap = read("sitemap.xml");
  for (const [, href] of appNews) {
    assert.match(news, new RegExp(href.replaceAll(".", "\\.")), `${href} fehlt in News-Liste`);
    assert.match(sitemap, new RegExp(href.replaceAll(".", "\\.")), `${href} fehlt in Sitemap`);
  }
  assert.doesNotMatch(news, /news-evcc-community-treffen-2026\.html[\s\S]{0,160}hidden:\s*true/);
});

test("KNX-Bridge-News verwendet nur die echte App-Oberfläche", () => {
  const html = read("news-knx-integration-beta.html");
  assert.match(html, /img\/news\/knx-bridge-beta\.webp/);
  assert.doesNotMatch(html, /knx-energy-building|KI-generierte Illustration/);
});

test("tenantLedger-News erklärt den Ablauf ausführlich und trägt den gewünschten Titel", () => {
  const html = read("news-tenantledger-mieterstrom.html");
  const news = read("news-data.js");
  assert.match(html, /<h1>tenantLedger: Mietstrom endlich einfach<\/h1>/);
  assert.match(news, /title: "tenantLedger: Mietstrom endlich einfach"/);
  assert.match(html, /Wohnungen und Mieter/);
  assert.match(html, /PV-Strom und Netzbezug getrennt betrachten/);
  assert.match(html, /Betreiberübersicht/);
  assert.match(html, /rechtliche, steuerliche, mess- oder abrechnungstechnische Bewertung/);
});

test("ioBroker trägt in News-Liste und Artikel den kurzen Titel", () => {
  const html = read("news-iobroker-smarthome.html");
  const news = read("news-data.js");
  assert.match(html, /<h1>ioBroker auf eHive One<\/h1>/);
  assert.match(news, /title: "ioBroker auf eHive One"/);
  assert.doesNotMatch(html, /<h1>ioBroker auf eHive One:/);
});

test("Node-RED trägt den gewünschten Flow-Titel", () => {
  const html = read("news-node-red-automatisierung.html");
  const news = read("news-data.js");
  assert.match(html, /<h1>Node-RED auf eHive One: Baue deine eigenen Flows<\/h1>/);
  assert.match(news, /title: "Node-RED auf eHive One: Baue deine eigenen Flows"/);
});
