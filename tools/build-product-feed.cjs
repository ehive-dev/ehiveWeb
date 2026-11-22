const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function readCatalog() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'config.js'), 'utf8'), context);
  return context.window.EHIVE_SHOP_CONFIG.catalog;
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function buildFeed(catalog = readCatalog()) {
  const product = catalog.products.find(p => p.id === 'ehive-one');
  const tag = (key, value) => `      <g:${key}>${escape(value)}</g:${key}>`;
  const items = product.variants.map(variant => {
    if (!Number.isFinite(variant.price) || variant.price <= 0) throw new Error(`Missing price: ${variant.id}`);
    const licensed = variant.id === 'ehive-one-with-license';
    const fields = {
      id: variant.id,
      title: `eHive One – evcc Hardware für die Hutschiene ${licensed ? 'mit evcc-Lizenz' : 'ohne evcc-Lizenz'}`,
      description: `Kompakte Hardwareplattform für lokales Energiemanagement auf der Hutschiene. Ethernet, RS485, Digitaleingang und USB-C; Versorgung über 12–30 V DC oder PoE. ${licensed ? 'Variante mit evcc-Lizenz.' : 'Variante ohne mitgekauften evcc-Sponsortoken.'} Kompatible Wallbox, Zähler und weitere Geräte werden passend zur Anlage eingerichtet.`,
      link: `https://www.ehiv3.de/shop.html?variant=${variant.id}`,
      image_link: 'https://www.ehiv3.de/products/ehive-one.png',
      availability: product.soldOut || variant.soldOut ? 'out_of_stock' : 'in_stock',
      price: `${variant.price.toFixed(2)} EUR`,
      condition: 'new', brand: 'eHive', mpn: variant.mpn,
      product_type: 'Elektronik > Energiemanagement > Hutschienen-Computer'
    };
    if (!variant.mpn) throw new Error(`Missing manufacturer article number: ${variant.id}`);
    // Manufacturer-assigned MPNs; no GTIN is assigned to these products.
    return `    <item>\n${Object.entries(fields).map(([k,v]) => tag(k,v)).join('\n')}\n    </item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n    <title>eHive Produkte</title>\n    <link>https://www.ehiv3.de/shop.html</link>\n    <description>eHive One – Produktdaten für Google Merchant Center</description>\n${items.join('\n')}\n  </channel>\n</rss>\n`;
}
if (require.main === module) {
  const output = path.join(root, 'google-products.xml');
  const feed = buildFeed();
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(output, 'utf8') !== feed) throw new Error('Feed outdated: run node tools/build-product-feed.cjs');
  } else fs.writeFileSync(output, feed);
}
module.exports = { buildFeed, readCatalog };
