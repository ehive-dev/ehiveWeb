import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCategories,
  escapeHtml,
  isDue,
  parseDeviceIndex,
  parseTemplate,
  renderCompatibilityBlock,
} from "./update-compatibility.mjs";

test("liest Produktdaten und Nutzungen aus generiertem evcc-YAML", () => {
  const record = parseTemplate(`template: demo
product:
  identifier: demo-hybrid
  brand: Demo Energy
  description: "Hybrid 10\\n"
render:
  - usage: grid
  - usage: pv
  - usage: battery
`, "meter");
  assert.equal(record.identifier, "demo-hybrid");
  assert.equal(record.description, "Hybrid 10");
  assert.deepEqual(record.usages, ["grid", "pv", "battery"]);
});

test("entscheidet reproduzierbar über den 14-Tage-Abstand", () => {
  assert.equal(isDue("2026-11-23", { lastSuccessfulUpdate: "2026-11-10" }), false);
  assert.equal(isDue("2026-11-24", { lastSuccessfulUpdate: "2026-11-10" }), true);
  assert.equal(isDue("2026-11-25", null), true);
});

test("maskiert dynamische Inhalte für HTML und Attribute", () => {
  assert.equal(escapeHtml(`A&B <Test> "Plus"`), "A&amp;B &lt;Test&gt; &quot;Plus&quot;");
});

test("bricht bei einem zu kleinen oder unvollständigen Geräteindex ab", () => {
  assert.throws(() => parseDeviceIndex("## Chargers\n- [Demo](https://docs.evcc.io/en/chargers/demo.md)\n"), /unerwartet klein/);
});

test("ordnet Meter anhand ihrer Nutzungen beiden passenden Kategorien zu", () => {
  const entries = [
    { route: "chargers", identifier: "charger", label: "Brand Charger" },
    { route: "meters", identifier: "hybrid", label: "Brand Hybrid" },
    { route: "vehicles", identifier: "vehicle", label: "Brand Vehicle" },
    { route: "heating", identifier: "heating", label: "Brand Heating" },
    { route: "smartswitches", identifier: "switch", label: "Brand Switch" },
  ];
  const templates = new Map([
    ["charger:charger", { sourceType: "charger", identifier: "charger", brand: "Brand", description: "Charger", usages: [] }],
    ["meter:hybrid", { sourceType: "meter", identifier: "hybrid", brand: "Brand", description: "Hybrid", usages: ["grid", "pv", "battery"] }],
    ["vehicle:vehicle", { sourceType: "vehicle", identifier: "vehicle", brand: "Brand", description: "Vehicle", usages: [] }],
    ["charger:heating", { sourceType: "charger", identifier: "heating", brand: "Brand", description: "Heating", usages: [] }],
    ["charger:switch", { sourceType: "charger", identifier: "switch", brand: "Brand", description: "Switch", usages: [] }],
  ]);

  assert.throws(() => buildCategories(entries, templates), /Sicherheitsgrenze/);
});

test("rendert Modelle als statischen, semantischen HTML-Inhalt", () => {
  const categories = ["chargers", "inverters", "heating", "meters", "vehicles", "switches"].map((key) => ({
    key,
    integrations: 1,
    brands: [{ name: "Demo & Co", models: [{ identifier: `${key}-1`, name: "Modell <One>" }] }],
  }));
  const html = renderCompatibilityBlock(categories, "2026-11-10", 900);
  assert.match(html, /data-manufacturer/);
  assert.match(html, /data-model/);
  assert.match(html, /Demo &amp; Co/);
  assert.match(html, /Modell &lt;One&gt;/);
});
