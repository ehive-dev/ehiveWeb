const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readNews, buildNewsFeed } = require('../tools/build-news-feed.cjs');
const root = path.resolve(__dirname, '..');
test('News feed contains all prepared posts, original dates and stable GUIDs as valid XML', () => {
  const news = readNews();
  const xml = buildNewsFeed(news);
  assert.equal(fs.readFileSync(path.join(root, 'news-feed.xml'), 'utf8'), xml);
  const parsed = spawnSync('python3', ['-c', 'import json,sys,xml.etree.ElementTree as E;r=E.fromstring(sys.stdin.read());print(json.dumps([{ "title":i.findtext("title"),"text":i.findtext("description"),"guid":i.findtext("guid"),"date":i.findtext("pubDate"),"image":i.find("enclosure").attrib} for i in r.findall("./channel/item")]))'], { input: xml, encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  const items = JSON.parse(parsed.stdout);
  assert.equal(items.length, news.length);
  for (const item of news) {
    const entry = items.find(x => x.guid === item.href);
    assert(entry);
    assert.equal(entry.text, item.linkedinText);
    assert.equal(entry.title, item.title);
    assert.equal(new Date(entry.date).toISOString().slice(0, 10), item.date);
    assert.equal(entry.image.url, item.linkedinImage);
    const bytes = fs.readFileSync(path.join(root, new URL(item.linkedinImage).pathname.slice(1)));
    assert.equal(Number(entry.image.length), bytes.length);
    assert(['image/png', 'image/jpeg'].includes(entry.image.type));
    assert(entry.image.type === 'image/png' ? bytes.subarray(1,4).toString() === 'PNG' : bytes.readUInt16BE() === 0xffd8);
    assert(item.linkedinText.includes(item.href));
  }
});
test('Feed rejects duplicates, missing text and unsuitable image formats', () => {
  const news = readNews();
  assert.throws(() => buildNewsFeed([news[0], news[0]]), /Duplicate article/);
  assert.throws(() => buildNewsFeed([{ ...news[0], linkedinText: '' }]), /Missing linkedinText/);
  assert.throws(() => buildNewsFeed([{ ...news[0], linkedinImage: 'https://www.ehiv3.de/img/test.svg' }]), /PNG or JPEG/);
  assert.throws(() => buildNewsFeed([{ ...news[0], linkedinText: 'x'.repeat(3001) }]), /too long/);
  const escaped = buildNewsFeed([{ ...news[0], title: 'A & B <C>', linkedinText: 'Text & <Test>' }]);
  assert(escaped.includes('A &amp; B &lt;C&gt;'));
  assert(escaped.includes('Text &amp; &lt;Test&gt;'));
});

const { buildLinkedinFeed, approvalFingerprint, isLinkedinApproved } = require('../tools/build-news-feed.cjs');
const { updateApprovalSource } = require('../tools/set-linkedin-approval.cjs');
const vm = require('node:vm');
const parseSource = source => { const c = { window: {} }; vm.runInNewContext(source, c); return c.window.EHIVE_NEWS; };
const approve = (item, at = '2026-11-22T15:30:00Z') => ({ ...item, linkedinApproved: true, linkedinApprovedAt: at, linkedinApprovalHash: approvalFingerprint(item) });

test('LinkedIn feed excludes unapproved items and is a valid empty RSS feed initially', () => {
  const xml = buildLinkedinFeed();
  assert.equal(fs.readFileSync(path.join(root, 'linkedin-feed.xml'), 'utf8'), xml);
  assert.equal((xml.match(/<item>/g) || []).length, readNews().filter(isLinkedinApproved).length);
  const empty = buildLinkedinFeed(readNews().map(item => ({ ...item, linkedinApproved: false })));
  const parsed = spawnSync('python3', ['-c', 'import sys,xml.etree.ElementTree as E;r=E.fromstring(sys.stdin.read());assert r.find("channel") is not None;assert r.findall("./channel/item")==[]'], { input: empty, encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  const item = readNews()[0];
  for (const flag of [undefined, false, 'true', 1]) assert(!buildLinkedinFeed([{ ...approve(item), linkedinApproved: flag }]).includes('<item>'));
});
test('Later approval uses approval time while retaining article URL and GUID', () => {
  const item = readNews()[readNews().length - 1];
  const approved = approve(item);
  const xml = buildLinkedinFeed([approved]);
  assert(xml.includes(`<guid isPermaLink="true">${item.href}</guid>`));
  assert(xml.includes('<pubDate>Sun, 22 Nov 2026 15:30:00 GMT</pubDate>'));
  assert(buildNewsFeed([approved]).includes(new Date(item.date + 'T00:00:00Z').toUTCString()));
});
test('Changed approved content, invalid date or missing fingerprint fails closed', () => {
  const item = approve(readNews()[0]);
  assert(isLinkedinApproved(item));
  for (const change of [{ title: 'Changed title' }, { linkedinText: 'Changed text' }, { linkedinImage: 'https://www.ehiv3.de/products/ehive-one.png' }, { linkedinApprovedAt: null }, { linkedinApprovedAt: 'invalid' }, { linkedinApprovalHash: null }]) {
    assert(!buildLinkedinFeed([{ ...item, ...change }]).includes('<item>'), JSON.stringify(change));
  }
});
test('Approval helper changes only requested record and preserves first approval timestamp', () => {
  const original = readNews().slice(0, 2).map(item => ({ ...item, linkedinApproved: false, linkedinApprovedAt: null, linkedinApprovalHash: null }));
  const source = 'window.EHIVE_NEWS = [\n' + original.map(item => '{\n' + Object.entries(item).map(([key, value]) => '    ' + key + ': ' + JSON.stringify(value) + ',').join('\n') + '\n}').join(',\n') + '\n];';
  const article = new URL(original[0].href).pathname.slice(1);
  const changed = updateApprovalSource(source, article, true, '2026-11-22T15:30:00Z');
  const items = parseSource(changed);
  assert(isLinkedinApproved(items[0]));
  assert.equal(JSON.stringify(items.slice(1)), JSON.stringify(original.slice(1)));
  assert.equal(updateApprovalSource(changed, article, true, '2026-11-23T15:30:00Z'), changed);
  const revoked = updateApprovalSource(changed, article, false);
  assert(!buildLinkedinFeed(parseSource(revoked)).includes('<item>'));
  const reapproved = updateApprovalSource(revoked, article, true, '2026-11-23T15:30:00Z');
  assert.equal(parseSource(reapproved)[0].linkedinApprovedAt, '2026-11-22T15:30:00Z');
  assert.throws(() => updateApprovalSource(source, 'not-a-news.html', true), /Unknown article/);
});
