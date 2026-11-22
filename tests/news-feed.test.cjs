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
