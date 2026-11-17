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
  assert.match(html, /img\/app-icons\/knx-logger\.svg/);
  assert.match(html, /ETS-XML-Export/);
  assert.match(html, /KNX-Telegramme lokal auf/);
  assert.match(html, /Arbeitsspeicher oder dauerhaft auf einem USB-Datenträger/);
  assert.ok(fs.existsSync(path.join(root, "img", "app-icons", "knx-logger.svg")));
});
