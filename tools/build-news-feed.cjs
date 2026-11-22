const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const origin = 'https://www.ehiv3.de';
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
function readNews() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'news-data.js'), 'utf8'), context);
  return context.window.EHIVE_NEWS;
}
function buildNewsFeed(news = readNews()) {
  const seen = new Set();
  const items = [...news].sort((a, b) => b.date.localeCompare(a.date)).map(item => {
    for (const field of ['title', 'date', 'href', 'linkedinText', 'linkedinImage']) {
      if (typeof item[field] !== 'string' || !item[field].trim()) throw new Error(`Missing ${field}: ${item.href}`);
    }
    const link = new URL(item.href);
    const image = new URL(item.linkedinImage);
    if (link.origin !== origin || image.origin !== origin) throw new Error('News and images must use the canonical website');
    if (seen.has(item.href)) throw new Error(`Duplicate article: ${item.href}`);
    seen.add(item.href);
    if (item.linkedinText.length > 3000) throw new Error(`LinkedIn text too long: ${item.href}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) throw new Error(`Invalid date: ${item.date}`);
    const date = new Date(item.date + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== item.date) throw new Error(`Invalid date: ${item.date}`);
    if (!fs.existsSync(path.join(root, link.pathname.slice(1)))) throw new Error(`Missing article: ${item.href}`);
    const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }[path.extname(image.pathname).toLowerCase()];
    if (!mime) throw new Error(`Use PNG or JPEG for LinkedIn: ${item.linkedinImage}`);
    const imageFile = path.join(root, image.pathname.slice(1));
    const size = fs.statSync(imageFile).size;
    return `    <item>\n      <title>${escape(item.title)}</title>\n      <link>${escape(item.href)}</link>\n      <guid isPermaLink="true">${escape(item.href)}</guid>\n      <pubDate>${date.toUTCString()}</pubDate>\n      <description>${escape(item.linkedinText)}</description>\n      <enclosure url="${escape(item.linkedinImage)}" length="${size}" type="${mime}"/>\n${(item.tags || []).map(tag => `      <category>${escape(tag)}</category>`).join('\n')}\n    </item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>eHive News – vorbereitete LinkedIn-Beiträge</title>\n    <link>${origin}/news.html</link>\n    <description>Redaktionell vorbereitete Texte, Bilder und Links zu eHive News. Veröffentlichung erst nach Freigabe im angebundenen Workflow.</description>\n    <language>de-DE</language>\n    <atom:link href="${origin}/news-feed.xml" rel="self" type="application/rss+xml"/>\n${items.join('\n')}\n  </channel>\n</rss>\n`;
}
if (require.main === module) {
  const output = path.join(root, 'news-feed.xml');
  const feed = buildNewsFeed();
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(output, 'utf8') !== feed) throw new Error('News feed outdated: run node tools/build-news-feed.cjs');
  } else fs.writeFileSync(output, feed);
}
module.exports = { readNews, buildNewsFeed };
