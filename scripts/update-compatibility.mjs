#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "..");
const pagePath = path.join(rootDir, "kompatibilitaet.html");
const sitemapPath = path.join(rootDir, "sitemap.xml");
const statePath = path.join(rootDir, "data", "compatibility-state.json");
const startMarker = "<!-- COMPATIBILITY:START -->";
const endMarker = "<!-- COMPATIBILITY:END -->";
const indexUrl = "https://docs.evcc.io/llms-devices.txt";
const collator = new Intl.Collator("de", { numeric: true, sensitivity: "base" });

const categoryDefinitions = [
  {
    key: "chargers",
    title: "Wallboxen",
    icon: "charger.svg",
    aria: "Unterstützte Wallbox-Hersteller",
    description: "evcc steuert kompatible Wallboxen anhand von PV-Überschuss, Stromtarifen, Ladeplänen und Netzvorgaben. Der Funktionsumfang hängt vom Modell und seiner Schnittstelle ab.",
  },
  {
    key: "inverters",
    title: "Wechselrichter und Batteriespeicher",
    icon: "inverter.svg",
    aria: "Unterstützte Hersteller von Wechselrichtern und Batteriespeichern",
    description: "Wechselrichter, Energiezähler und Batteriespeicher liefern Messwerte für Erzeugung, Netzbezug und Speicherzustand. Bei ausgewählten Systemen kann evcc zusätzlich Lade- und Entladevorgänge beeinflussen.",
  },
  {
    key: "heating",
    title: "Wärmepumpen und Heizstäbe",
    icon: "heating.svg",
    aria: "Unterstützte Hersteller von Wärmepumpen und Heizstäben",
    description: "Wärmepumpen und Heizstäbe können abhängig vom Gerät über SG Ready, EEBUS, Relais, Modbus oder weitere Schnittstellen eingebunden werden. Die Nennung eines Herstellers gilt nicht pauschal für jedes Modell.",
  },
  {
    key: "meters",
    title: "Energiezähler und Messtechnik",
    icon: "meter.svg",
    aria: "Unterstützte Hersteller von Energiezählern und Messtechnik",
    description: "Verlässliche Messwerte am Netzanschluss, an der PV-Anlage, am Speicher und am Ladepunkt bilden die Grundlage für eine korrekte Energieregelung.",
  },
  {
    key: "vehicles",
    title: "Fahrzeuge",
    icon: "vehicle.svg",
    aria: "Unterstützte Fahrzeughersteller",
    description: "Unterstützte Fahrzeuganbindungen können Ladestand, Reichweite und Ladestatus bereitstellen. Qualität und Verfügbarkeit der Hersteller-Schnittstellen können sich ändern.",
  },
  {
    key: "switches",
    title: "Smarte Schalter und Steckdosen",
    icon: "smartswitch.svg",
    aria: "Unterstützte Hersteller smarter Schalter und Steckdosen",
    description: "Schaltbare Steckdosen und Relais ermöglichen die Einbindung zusätzlicher Verbraucher und können abhängig vom Gerät auch Messwerte bereitstellen.",
  },
];

const minimumCounts = {
  chargers: 300,
  inverters: 250,
  heating: 45,
  meters: 250,
  vehicles: 50,
  switches: 12,
};

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) fail(`Unbekanntes Argument: ${value}`);
    const key = value.slice(2);
    if (["check-due", "validate"].includes(key)) {
      args[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) fail(`Wert für --${key} fehlt.`);
    args[key] = next;
    index += 1;
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseDate(value, label = "Datum") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) fail(`${label} muss YYYY-MM-DD entsprechen.`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail(`${label} ist ungültig: ${value}`);
  return date;
}

export function isDue(today, state, intervalDays = 14) {
  const current = parseDate(today, "Prüfdatum");
  if (!state?.lastSuccessfulUpdate) return true;
  const previous = parseDate(state.lastSuccessfulUpdate, "Letzte erfolgreiche Aktualisierung");
  return Math.floor((current - previous) / 86_400_000) >= intervalDays;
}

function parseYamlScalar(raw) {
  const value = raw.trim();
  if (value.startsWith("\"") && value.endsWith("\"")) return JSON.parse(value).trim();
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  return value;
}

export function parseTemplate(content, sourceType, filePath = "fixture.yaml") {
  const lines = content.split(/\r?\n/);
  const productIndex = lines.findIndex((line) => line === "product:");
  if (productIndex < 0) fail(`${filePath}: product-Block fehlt.`);

  const product = {};
  for (let index = productIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line && !line.startsWith("  ")) break;
    const match = line.match(/^  (identifier|brand|description|group):\s*(.+)$/);
    if (match) product[match[1]] = parseYamlScalar(match[2]);
  }

  if (!product.identifier || (!product.brand && !product.description)) fail(`${filePath}: identifier sowie brand oder description fehlen.`);
  const usages = [...new Set(lines.map((line) => line.match(/^  - usage:\s*(.+)$/)?.[1]).filter(Boolean).map(parseYamlScalar))];

  return {
    sourceType,
    identifier: product.identifier.trim(),
    brand: product.brand?.trim() || "",
    description: product.description?.trim() || "",
    group: product.group?.trim() || "",
    usages,
    filePath,
  };
}

function walkYamlFiles(directory) {
  if (!fs.existsSync(directory)) fail(`Quellverzeichnis fehlt: ${directory}`);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkYamlFiles(target);
    return entry.isFile() && entry.name.endsWith(".yaml") ? [target] : [];
  });
}

export function loadTemplates(sourceDir) {
  const records = new Map();
  for (const sourceType of ["charger", "meter", "vehicle"]) {
    const directory = path.join(sourceDir, sourceType);
    const files = walkYamlFiles(directory);
    if (!files.length) fail(`Keine ${sourceType}-Templates gefunden.`);
    for (const filePath of files) {
      const record = parseTemplate(fs.readFileSync(filePath, "utf8"), sourceType, path.relative(sourceDir, filePath));
      const key = `${sourceType}:${record.identifier}`;
      if (records.has(key)) fail(`Doppelte Template-ID: ${key}`);
      records.set(key, record);
    }
  }
  return records;
}

const sectionRoutes = {
  Chargers: "chargers",
  "Meters (grid, solar, battery)": "meters",
  Vehicles: "vehicles",
  "Smart switches": "smartswitches",
  "Heating devices": "heating",
};

export function parseDeviceIndex(content) {
  if (content.length < 50_000) fail("Die offizielle evcc-Gerätedatei ist unerwartet klein.");
  const entries = [];
  let section = "";
  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      section = heading[1];
      continue;
    }
    const route = sectionRoutes[section];
    if (!route) continue;
    const match = line.match(/^- \[([^\]]+)\]\(https:\/\/docs\.evcc\.io\/en\/([^/]+)\/([^/)]+)\.md\)$/);
    if (!match) continue;
    if (match[2] !== route) fail(`Unerwartete Route im Abschnitt ${section}: ${match[2]}`);
    entries.push({ section, route, label: match[1], identifier: match[3] });
  }

  const routeCounts = Object.fromEntries(Object.values(sectionRoutes).map((route) => [route, entries.filter((entry) => entry.route === route).length]));
  const routeMinimums = { chargers: 300, meters: 300, vehicles: 50, smartswitches: 12, heating: 45 };
  for (const [route, minimum] of Object.entries(routeMinimums)) {
    if ((routeCounts[route] || 0) < minimum) fail(`Zu wenige Einträge in ${route}: ${routeCounts[route] || 0} < ${minimum}`);
  }

  const duplicate = entries.find((entry, index) => entries.findIndex((other) => other.route === entry.route && other.identifier === entry.identifier) !== index);
  if (duplicate) fail(`Doppelter Eintrag im evcc-Index: ${duplicate.route}/${duplicate.identifier}`);
  return entries;
}

function normalize(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("de").replace(/[^a-z0-9+]/g, "");
}

function templateTypeForRoute(route) {
  if (["chargers", "heating", "smartswitches"].includes(route)) return "charger";
  if (route === "meters") return "meter";
  if (route === "vehicles") return "vehicle";
  fail(`Unbekannte Route: ${route}`);
}

function mapIndexToTemplates(entries, templates) {
  return entries.map((entry) => {
    const sourceType = templateTypeForRoute(entry.route);
    const record = templates.get(`${sourceType}:${entry.identifier}`);
    if (!record) fail(`Kein Release-Template für ${entry.route}/${entry.identifier} gefunden.`);
    const description = record.description || entry.label;
    if (record.brand && !normalize(entry.label).includes(normalize(record.brand))) {
      fail(`Index und Template widersprechen sich bei ${entry.identifier}: "${entry.label}" / Hersteller "${record.brand}".`);
    }
    return { ...record, description, route: entry.route, indexLabel: entry.label };
  });
}

function makeCategory(key, records) {
  const uniqueRecords = new Map();
  for (const record of records) uniqueRecords.set(`${record.sourceType}:${record.identifier}`, record);
  const brands = new Map();
  for (const record of uniqueRecords.values()) {
    const displayBrand = record.brand || record.description;
    const brandKey = normalize(displayBrand);
    if (!brands.has(brandKey)) brands.set(brandKey, { name: displayBrand, models: [] });
    brands.get(brandKey).models.push({
      identifier: record.identifier,
      name: record.description,
      sourceType: record.sourceType,
    });
  }

  const sortedBrands = [...brands.values()].sort((left, right) => collator.compare(left.name, right.name));
  for (const brand of sortedBrands) {
    brand.models.sort((left, right) => collator.compare(left.name, right.name));
  }
  return { key, brands: sortedBrands, integrations: uniqueRecords.size };
}

export function buildCategories(entries, templates) {
  const records = mapIndexToTemplates(entries, templates);
  const meters = records.filter((record) => record.route === "meters");
  const categories = [
    makeCategory("chargers", records.filter((record) => record.route === "chargers")),
    makeCategory("inverters", meters.filter((record) => record.usages.some((usage) => ["pv", "battery"].includes(usage)))),
    makeCategory("heating", records.filter((record) => record.route === "heating")),
    makeCategory("meters", meters.filter((record) => record.usages.some((usage) => ["grid", "charge", "aux"].includes(usage)))),
    makeCategory("vehicles", records.filter((record) => record.route === "vehicles")),
    makeCategory("switches", records.filter((record) => record.route === "smartswitches")),
  ];

  for (const category of categories) {
    if (category.integrations < minimumCounts[category.key]) {
      fail(`Kategorie ${category.key} unterschreitet die Sicherheitsgrenze: ${category.integrations} < ${minimumCounts[category.key]}`);
    }
    if (!category.brands.length) fail(`Kategorie ${category.key} enthält keine Hersteller.`);
  }
  return categories;
}

export function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function pluralIntegrations(count) {
  return `${count} ${count === 1 ? "Integration" : "Integrationen"}`;
}

function renderCategory(definition, category) {
  const items = category.brands.map((brand) => {
    const models = brand.models.map((model) => model.name);
    const search = [brand.name, ...models].join(" ");
    const modelItems = models.map((model) => `                  <li data-model>${escapeHtml(model)}</li>`).join("\n");
    return `            <li data-manufacturer data-brand="${escapeHtml(brand.name)}" data-models="${escapeHtml(search)}">
              <details class="compat-manufacturer">
                <summary><span>${escapeHtml(brand.name)}</span><span class="compat-integration-count">${pluralIntegrations(models.length)}</span></summary>
                <ul class="compat-model-list" aria-label="Modelle von ${escapeHtml(brand.name)}">
${modelItems}
                </ul>
              </details>
            </li>`;
  }).join("\n");

  return `        <section class="compat-category" aria-labelledby="compat-${definition.key}-title" data-compat-category data-category="${definition.key}">
          <div class="compat-category-heading">
            <img src="img/evcc-assets/icons/${definition.icon}" alt="" width="140" height="140" aria-hidden="true">
            <h2 id="compat-${definition.key}-title">${definition.title}</h2>
            <p class="compat-category-count">${category.brands.length} Hersteller · ${category.integrations} Integrationen</p>
            <p>${definition.description}</p>
          </div>
          <ul class="compat-manufacturer-list" aria-label="${definition.aria}">
${items}
          </ul>
        </section>`;
}

function formatGermanDate(value) {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(parseDate(value));
}

export function renderCompatibilityBlock(categories, date, uniqueIntegrations) {
  const sections = categoryDefinitions.map((definition) => {
    const category = categories.find((candidate) => candidate.key === definition.key);
    if (!category) fail(`Kategorie fehlt beim Rendern: ${definition.key}`);
    return renderCategory(definition, category);
  }).join("\n\n");
  return `${startMarker}
        <p class="compat-data-status">Stand ${formatGermanDate(date)} · ${uniqueIntegrations} Geräteintegrationen · automatisch alle 14 Tage aktualisiert</p>
${sections}
${endMarker}`;
}

function replaceGeneratedBlock(html, block) {
  const starts = html.split(startMarker).length - 1;
  const ends = html.split(endMarker).length - 1;
  if (starts !== 1 || ends !== 1) fail(`Kompatibilitätsmarker müssen jeweils genau einmal vorkommen (START=${starts}, END=${ends}).`);
  const pattern = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`);
  return html.replace(pattern, block);
}

function updateSitemap(xml, date) {
  const pattern = /(<loc>https:\/\/www\.ehiv3\.de\/kompatibilitaet\.html<\/loc><lastmod>)\d{4}-\d{2}-\d{2}(<\/lastmod>)/;
  if (!pattern.test(xml)) fail("Kompatibilitäts-Eintrag in sitemap.xml nicht eindeutig gefunden.");
  return xml.replace(pattern, `$1${date}$2`);
}

function validateAgainstPrevious(categories, previousState) {
  if (!previousState?.categories) return;
  for (const category of categories) {
    const previous = previousState.categories[category.key];
    if (!previous?.integrations) continue;
    const lowerBound = Math.floor(previous.integrations * 0.75);
    const upperBound = Math.ceil(previous.integrations * 1.5);
    if (category.integrations < lowerBound || category.integrations > upperBound) {
      fail(`Unplausible Änderung in ${category.key}: ${previous.integrations} -> ${category.integrations}. Manuelle Prüfung erforderlich.`);
    }
  }
}

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, filePath);
}

function stateFrom(categories, date, upstreamSha, indexContent, uniqueIntegrations) {
  return {
    schemaVersion: 1,
    lastSuccessfulUpdate: date,
    source: {
      repository: "https://github.com/evcc-io/docs",
      branch: "main",
      directory: "templates/release/de",
      commit: upstreamSha,
      deviceIndex: indexUrl,
      deviceIndexSha256: crypto.createHash("sha256").update(indexContent).digest("hex"),
    },
    uniqueIntegrations,
    categories: Object.fromEntries(categories.map((category) => [category.key, {
      manufacturers: category.brands.length,
      integrations: category.integrations,
    }])),
  };
}

export function validateGeneratedFiles() {
  const html = fs.readFileSync(pagePath, "utf8");
  const state = readJson(statePath);
  if ((html.split(startMarker).length - 1) !== 1 || (html.split(endMarker).length - 1) !== 1) fail("Generierter HTML-Block ist nicht eindeutig markiert.");
  const categoryCount = (html.match(/data-compat-category/g) || []).length;
  const manufacturerCount = (html.match(/data-manufacturer/g) || []).length;
  const modelCount = (html.match(/data-model(?:\s|>)/g) || []).length;
  const expectedManufacturers = Object.values(state.categories).reduce((sum, category) => sum + category.manufacturers, 0);
  const expectedModels = Object.values(state.categories).reduce((sum, category) => sum + category.integrations, 0);
  if (categoryCount !== categoryDefinitions.length) fail(`Falsche Kategorieanzahl im HTML: ${categoryCount}`);
  if (manufacturerCount !== expectedManufacturers) fail(`Herstelleranzahl stimmt nicht: HTML=${manufacturerCount}, State=${expectedManufacturers}`);
  if (modelCount !== expectedModels) fail(`Modellanzahl stimmt nicht: HTML=${modelCount}, State=${expectedModels}`);
  if (!html.includes(`Stand ${formatGermanDate(state.lastSuccessfulUpdate)} · ${state.uniqueIntegrations} Geräteintegrationen · automatisch alle 14 Tage aktualisiert`)) fail("Stand, Gesamtzahl oder Aktualisierungsintervall fehlen im HTML.");
  if ((html.match(/<h1\b/g) || []).length !== 1) fail("Die Seite muss genau eine H1 enthalten.");
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(match[1]);
  return { categoryCount, manufacturerCount, modelCount, state };
}

async function loadDeviceIndex(indexFile) {
  if (indexFile) return fs.readFileSync(path.resolve(indexFile), "utf8");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(indexUrl, { signal: controller.signal, headers: { "user-agent": "eHive compatibility updater" } });
    if (!response.ok) fail(`evcc-Geräteindex nicht erreichbar: HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function update(args) {
  const sourceDir = path.resolve(args.source || "");
  const date = args.date || new Date().toISOString().slice(0, 10);
  parseDate(date);
  if (!args["upstream-sha"] || !/^[0-9a-f]{40}$/i.test(args["upstream-sha"])) fail("--upstream-sha muss ein vollständiger Git-Commit sein.");

  const previousState = fs.existsSync(statePath) ? readJson(statePath) : null;
  const templates = loadTemplates(sourceDir);
  const indexContent = await loadDeviceIndex(args["index-file"]);
  const indexEntries = parseDeviceIndex(indexContent);
  const categories = buildCategories(indexEntries, templates);
  validateAgainstPrevious(categories, previousState);

  const relevantEntries = indexEntries.filter((entry) => Object.values(sectionRoutes).includes(entry.route));
  const uniqueIntegrations = new Set(relevantEntries.map((entry) => `${entry.route}:${entry.identifier}`)).size;
  if (uniqueIntegrations < 800) fail(`Gesamtzahl der Geräteintegrationen ist unplausibel niedrig: ${uniqueIntegrations}`);

  const block = renderCompatibilityBlock(categories, date, uniqueIntegrations);
  const oldHtml = fs.readFileSync(pagePath, "utf8");
  const newHtml = replaceGeneratedBlock(oldHtml, block);
  const newSitemap = updateSitemap(fs.readFileSync(sitemapPath, "utf8"), date);
  const state = stateFrom(categories, date, args["upstream-sha"].toLowerCase(), indexContent, uniqueIntegrations);

  atomicWrite(pagePath, newHtml);
  atomicWrite(sitemapPath, newSitemap);
  atomicWrite(statePath, `${JSON.stringify(state, null, 2)}\n`);
  const validation = validateGeneratedFiles();
  console.log(JSON.stringify({ updated: true, ...validation }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["check-due"]) {
    const today = args.date || new Date().toISOString().slice(0, 10);
    const state = fs.existsSync(statePath) ? readJson(statePath) : null;
    process.stdout.write(isDue(today, state) ? "true" : "false");
    return;
  }
  if (args.validate) {
    console.log(JSON.stringify(validateGeneratedFiles(), null, 2));
    return;
  }
  await update(args);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(`Kompatibilitätsupdate abgebrochen: ${error.stack || error.message}`);
    process.exit(1);
  });
}
