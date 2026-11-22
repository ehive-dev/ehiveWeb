const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { approvalFingerprint } = require('./build-news-feed.cjs');
function updateApprovalSource(source, article, approved, now = new Date().toISOString()) {
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const news = context.window.EHIVE_NEWS;
  const item = news.find(entry => entry.href === article || new URL(entry.href).pathname.slice(1) === article);
  if (!item) throw new Error(`Unknown article: ${article}`);
  if (typeof approved !== 'boolean') throw new Error('Approval must be a boolean');
  if (!Number.isFinite(Date.parse(now))) throw new Error('Invalid approval timestamp');
  const oldBlock = `    href: ${JSON.stringify(item.href)},\n    linkedinApproved: ${JSON.stringify(item.linkedinApproved)},\n    linkedinApprovedAt: ${JSON.stringify(item.linkedinApprovedAt)},\n    linkedinApprovalHash: ${JSON.stringify(item.linkedinApprovalHash)},`;
  if (!source.includes(oldBlock)) throw new Error('Approval fields missing or unexpectedly formatted');
  // Keep the first approval date on later edits/reapprovals; editing is not a new post.
  const approvedAt = approved ? (item.linkedinApprovedAt || now) : item.linkedinApprovedAt;
  const newBlock = `    href: ${JSON.stringify(item.href)},\n    linkedinApproved: ${approved},\n    linkedinApprovedAt: ${JSON.stringify(approvedAt)},\n    linkedinApprovalHash: ${JSON.stringify(approved ? approvalFingerprint(item) : null)},`;
  return source.replace(oldBlock, newBlock);
}
if (require.main === module) {
  const args = process.argv.slice(2);
  const approve = args.includes('--approve');
  const revoke = args.includes('--revoke');
  const article = args.find(value => !value.startsWith('--'));
  if (approve === revoke || !article) throw new Error('Usage: node tools/set-linkedin-approval.cjs ARTICLE.html --approve|--revoke');
  const file = path.resolve(__dirname, '..', 'news-data.js');
  fs.writeFileSync(file, updateApprovalSource(fs.readFileSync(file, 'utf8'), article, approve));
  console.log(`${approve ? 'Approved' : 'Revoked'}: ${article}. Commit and deploy to update the public feed.`);
}
module.exports = { updateApprovalSource };
