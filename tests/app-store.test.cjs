const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("KNX Logger steht direkt nach der KNX Bridge im App-Store", () => {
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "app-store.html"), "utf8");
  const bridge = html.indexOf("<h3>KNX Bridge</h3>");
  const logger = html.indexOf("<h3>KNX Logger</h3>");
  const smartHome = html.indexOf('id="group-smart-home"');

  assert.ok(bridge > -1);
  assert.ok(logger > bridge);
  assert.ok(smartHome > logger);
  assert.match(html, /img\/app-icons\/knx-logger\.svg\?v=smarthub-default-20261117/);
  assert.match(html, /ETS-XML-Export/);
  assert.match(html, /KNX-Telegramme lokal auf/);
  assert.match(html, /Arbeitsspeicher oder dauerhaft auf einem USB-Datenträger/);
  assert.ok(fs.existsSync(path.join(root, "img", "app-icons", "knx-logger.svg")));
  assert.match(html, /href="news-knx-logger\.html"/);
  assert.match(html, /href="https:\/\/ehive-dev\.github\.io\/doc\/software\/knx-logger\/"/);
  assert.match(html, /href="https:\/\/ehive-dev\.github\.io\/doc\/software\/knx-bridge\/"/);
});

test("KNX Logger verwendet exakt das SmartHub-Standardsymbol", () => {
  const root = path.resolve(__dirname, "..");
  const icon = fs.readFileSync(path.join(root, "img", "app-icons", "knx-logger.svg"), "utf8").trim();
  assert.equal(icon, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 9h6"/><path d="M9 13h6"/><path d="M9 17h3"/></svg>');
});
