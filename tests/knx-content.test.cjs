const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("KNX-Logger-Beitrag enthält SEO- und Sicherheitsgrundlagen", () => {
  const html = fs.readFileSync(path.join(root, "news-knx-logger.html"), "utf8");
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.ehiv3\.de\/news-knx-logger\.html"/);
  assert.match(html, /"@type":"BlogPosting"/);
  assert.match(html, /Gruppenadressen-XML-Export/);
  assert.match(html, /Cloud ist für das Erfassen und Auswerten/);
  assert.match(html, /qualifizierten Fachkraft/);
  assert.match(html, /ehive-dev\.github\.io\/doc\/software\/knx-logger\//);
  assert.match(html, /img\/news\/knx-logger-trends\.webp/);
  assert.match(html, /img\/news\/knx-logger-datenpunkte\.webp/);
  assert.match(html, /img\/news\/knx-logger-einstellungen\.webp/);
  assert.match(html, /Originaloberfläche des KNX Logger/);
  assert.match(html, /simulierten Beispieldaten/);
  for (const image of ["knx-logger-trends.webp", "knx-logger-datenpunkte.webp", "knx-logger-einstellungen.webp"]) {
    assert.ok(fs.existsSync(path.join(root, "img", "news", image)), `${image} fehlt`);
  }
});

test("News-Liste und Sitemap führen den KNX-Logger-Beitrag", () => {
  const news = fs.readFileSync(path.join(root, "news-data.js"), "utf8");
  const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
  assert.match(news, /news-knx-logger\.html/);
  assert.match(sitemap, /<loc>https:\/\/www\.ehiv3\.de\/news-knx-logger\.html<\/loc>/);
});
