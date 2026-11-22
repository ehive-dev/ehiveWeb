const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildFeed, readCatalog } = require('../tools/build-product-feed.cjs');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const data = name => JSON.parse(read(name).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
test('Published feed matches catalog prices, availability and assigned identifiers', () => {
  const feed = buildFeed();
  assert.equal(read('google-products.xml'), feed);
  const variants = readCatalog().products.find(p => p.id === 'ehive-one').variants;
  assert.equal((feed.match(/<item>/g)||[]).length, variants.length);
  for (const v of variants) {
    assert(feed.includes(`<g:mpn>${v.mpn}</g:mpn>`));
    assert(feed.includes(`<g:price>${v.price.toFixed(2)} EUR</g:price>`));
    assert(feed.includes(`?variant=${v.id}</g:link>`));
  }
  assert(!feed.includes('<g:gtin>'));
});
test('Stock changes and XML escaping survive feed generation', () => {
  const catalog = readCatalog();
  catalog.products[0].variants[0].soldOut = true;
  catalog.products[0].variants[0].mpn = 'A&B';
  const feed = buildFeed(catalog);
  assert(feed.includes('<g:availability>out_of_stock</g:availability>'));
  assert(feed.includes('<g:mpn>A&amp;B</g:mpn>'));
  catalog.products[0].variants[0].price = undefined;
  assert.throws(() => buildFeed(catalog), /Missing price/);
});
test('Shop and product offers match catalog and variant landing links', () => {
  const offers = data('shop.html').offers;
  const products = data('ehive-one.html')['@graph'].find(x=>x['@type']==='ProductGroup').hasVariant;
  for (const v of readCatalog().products[0].variants) {
    const offer = offers.find(o=>o.sku===v.id);
    const product = products.find(p=>p.mpn===v.mpn);
    assert.equal(Number(offer.price), v.price);
    assert.equal(Number(product.offers.price), v.price);
    assert.equal(offer.url, `https://www.ehiv3.de/shop.html?variant=${v.id}`);
    assert.equal(product.offers.url, offer.url);
  }
});
