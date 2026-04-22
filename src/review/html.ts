import type { ReviewBundle, ReviewItem } from './bundle.js';
import { SEVERITY_MAP } from '../report/generator.js';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function nodeDetail(item: ReviewItem): string {
  const n = item.node;
  const lines: string[] = [];
  switch (n.type) {
    case 'constraint':
    case 'security':
      lines.push(`<strong>Statement:</strong> ${esc(n.statement)}`);
      lines.push(`<strong>If violated:</strong> ${esc(n.if_violated)}`);
      break;
    case 'danger':
      lines.push(`<strong>Statement:</strong> ${esc(n.statement)}`);
      lines.push(`<strong>Condition:</strong> ${esc(n.condition)}`);
      break;
    case 'assumption':
      lines.push(`<strong>Statement:</strong> ${esc(n.statement)}`);
      lines.push(`<strong>Breaks when:</strong> ${esc(n.breaks_when)}`);
      break;
    case 'antipattern':
      lines.push(`<strong>Statement:</strong> ${esc(n.statement)}`);
      lines.push(`<strong>Correct pattern:</strong> ${esc(n.correct_pattern)}`);
      break;
    case 'pattern':
      lines.push(`<strong>Statement:</strong> ${esc(n.statement)}`);
      lines.push(`<strong>Why:</strong> ${esc(n.why)}`);
      break;
    case 'intent':
      lines.push(`<strong>Purpose:</strong> ${esc(n.purpose)}`);
      break;
    case 'decision':
      lines.push(`<strong>Statement:</strong> ${esc(n.statement)}`);
      lines.push(`<strong>Reason:</strong> ${esc(n.reason)}`);
      break;
  }
  return lines.join('<br>');
}

function statusBadge(status: ReviewItem['status']): string {
  const map: Record<string, string> = {
    pending:  'badge-pending',
    approved: 'badge-approved',
    rejected: 'badge-rejected',
    amended:  'badge-amended',
  };
  return `<span class="badge ${map[status] ?? 'badge-pending'}">${status.toUpperCase()}</span>`;
}

export function generateReviewHtml(bundle: ReviewBundle): string {
  const counts = {
    pending:  bundle.review_items.filter(i => i.status === 'pending').length,
    approved: bundle.review_items.filter(i => i.status === 'approved').length,
    rejected: bundle.review_items.filter(i => i.status === 'rejected').length,
    amended:  bundle.review_items.filter(i => i.status === 'amended').length,
  };

  const date = new Date(bundle.generated_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const itemsHtml = bundle.review_items.map(item => {
    const sev = SEVERITY_MAP[item.type];
    return `
<div class="review-item" id="item-${esc(item.id)}" data-id="${esc(item.id)}" data-status="${item.status}">
  <div class="item-header" style="border-left: 4px solid ${sev.color}; background: ${sev.bg}">
    <div class="item-header-left">
      <span class="sev-badge" style="color:${sev.color}">${sev.label}</span>
      <span class="item-type">${esc(item.type.toUpperCase())}</span>
      <span class="item-id">${esc(item.id)}</span>
      ${item.requires_human ? '<span class="human-badge">⚠ requires human</span>' : ''}
    </div>
    <div class="item-header-right">
      <span class="confidence">conf: ${Math.round(item.confidence * 100)}%</span>
      ${statusBadge(item.status)}
    </div>
  </div>
  <div class="item-body">
    <div class="item-scope">📁 ${esc(item.node.scope.join(', '))}</div>
    <div class="item-detail">${nodeDetail(item)}</div>
    ${item.review_comment ? `<div class="item-comment">💬 ${esc(item.review_comment)}</div>` : ''}
    <div class="item-actions">
      <button class="btn-approve" onclick="decide('${esc(item.id)}','approved')">✓ Approve</button>
      <button class="btn-reject"  onclick="decide('${esc(item.id)}','rejected')">✗ Reject</button>
      <button class="btn-amend"   onclick="amend('${esc(item.id)}')">✎ Amend</button>
    </div>
    <div class="amend-area" id="amend-${esc(item.id)}" style="display:none">
      <textarea id="comment-${esc(item.id)}" placeholder="Describe the amendment..." rows="2"></textarea>
      <button class="btn-approve" onclick="submitAmend('${esc(item.id)}')">Submit amendment</button>
    </div>
  </div>
</div>`;
  }).join('\n');

  const bundleJson = JSON.stringify(bundle);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Filer Review — ${esc(bundle.repo)}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; font-size: 14px; }
.header { background: #0f172a; color: #f8fafc; padding: 14px 24px; position: sticky; top: 0; z-index: 10; }
.header-inner { max-width: 960px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
.header-logo { font-weight: 700; font-size: 16px; margin-right: 12px; }
.header-meta { color: #94a3b8; font-size: 13px; }
.header-actions { display: flex; gap: 8px; }
.main { max-width: 960px; margin: 24px auto; padding: 0 16px; }
.summary-bar { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.summary-pill { padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; }
.pill-pending  { background: #f1f5f9; color: #475569; }
.pill-approved { background: #dcfce7; color: #166534; }
.pill-rejected { background: #fee2e2; color: #991b1b; }
.pill-amended  { background: #fef3c7; color: #92400e; }
.filter-bar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.filter-btn { padding: 5px 12px; border-radius: 6px; border: 1px solid #e2e8f0; background: white; cursor: pointer; font-size: 12px; }
.filter-btn.active { background: #0f172a; color: white; border-color: #0f172a; }
.review-item { background: white; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 12px; overflow: hidden; }
.review-item[data-status="approved"] { opacity: 0.6; }
.review-item[data-status="rejected"] { opacity: 0.5; }
.item-header { padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; }
.item-header-left { display: flex; align-items: center; gap: 10px; }
.sev-badge { font-weight: 700; font-size: 12px; }
.item-type { font-size: 11px; background: #f1f5f9; padding: 2px 7px; border-radius: 4px; font-weight: 600; color: #475569; }
.item-id { font-family: monospace; font-size: 12px; color: #64748b; }
.human-badge { font-size: 11px; color: #b45309; background: #fef3c7; padding: 2px 7px; border-radius: 4px; }
.confidence { font-size: 12px; color: #94a3b8; margin-right: 8px; }
.badge { font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
.badge-pending  { background: #f1f5f9; color: #64748b; }
.badge-approved { background: #dcfce7; color: #166534; }
.badge-rejected { background: #fee2e2; color: #991b1b; }
.badge-amended  { background: #fef3c7; color: #92400e; }
.item-body { padding: 12px 16px; border-top: 1px solid #f1f5f9; }
.item-scope { font-size: 12px; color: #94a3b8; margin-bottom: 8px; }
.item-detail { font-size: 13px; line-height: 1.6; margin-bottom: 12px; }
.item-comment { font-size: 12px; color: #92400e; background: #fef3c7; padding: 6px 10px; border-radius: 4px; margin-bottom: 10px; }
.item-actions { display: flex; gap: 8px; }
.btn-approve { background: #16a34a; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; }
.btn-approve:hover { background: #15803d; }
.btn-reject { background: #dc2626; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; }
.btn-reject:hover { background: #b91c1c; }
.btn-amend { background: #d97706; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; }
.btn-amend:hover { background: #b45309; }
.btn-export { background: #334155; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; }
.btn-export:hover { background: #1e293b; }
.btn-batch { background: #0f172a; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; }
.amend-area { margin-top: 10px; }
.amend-area textarea { width: 100%; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; resize: vertical; margin-bottom: 6px; }
.toast { position: fixed; bottom: 20px; right: 20px; background: #0f172a; color: white; padding: 10px 18px; border-radius: 8px; font-size: 13px; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
.toast.show { opacity: 1; }
</style>
</head>
<body>

<header class="header">
  <div class="header-inner">
    <div>
      <span class="header-logo">📋 Filer Review</span>
      <span class="header-meta">${esc(bundle.repo)} · ${date} · ${bundle.review_items.length} items</span>
    </div>
    <div class="header-actions">
      <button class="btn-export" onclick="exportPending()">Export pending.json</button>
      <button class="btn-batch"  onclick="batchApproveVisible()">Batch approve visible</button>
    </div>
  </div>
</header>

<main class="main">
  <div class="summary-bar">
    <span class="summary-pill pill-pending">${counts.pending} pending</span>
    <span class="summary-pill pill-approved">${counts.approved} approved</span>
    <span class="summary-pill pill-rejected">${counts.rejected} rejected</span>
    <span class="summary-pill pill-amended">${counts.amended} amended</span>
  </div>

  <div class="filter-bar">
    <button class="filter-btn active" onclick="filter('all', this)">All</button>
    <button class="filter-btn" onclick="filter('pending', this)">Pending</button>
    <button class="filter-btn" onclick="filter('approved', this)">Approved</button>
    <button class="filter-btn" onclick="filter('rejected', this)">Rejected</button>
    <button class="filter-btn" onclick="filter('security', this)">Security only</button>
    <button class="filter-btn" onclick="filter('unverified', this)">Unverified</button>
  </div>

  <div id="items-container">
${itemsHtml}
  </div>
</main>

<div class="toast" id="toast"></div>

<script>
const bundleData = ${bundleJson};

function decide(id, status) {
  const item = bundleData.review_items.find(i => i.id === id);
  if (!item) return;
  item.status = status;
  const el = document.getElementById('item-' + id);
  el.dataset.status = status;
  el.querySelector('.badge').className = 'badge badge-' + status;
  el.querySelector('.badge').textContent = status.toUpperCase();
  toast(status === 'approved' ? '✓ Approved' : '✗ Rejected');
}

function amend(id) {
  document.getElementById('amend-' + id).style.display = 'block';
}

function submitAmend(id) {
  const comment = document.getElementById('comment-' + id).value.trim();
  const item = bundleData.review_items.find(i => i.id === id);
  if (!item) return;
  item.status = 'amended';
  item.review_comment = comment || null;
  document.getElementById('amend-' + id).style.display = 'none';
  const el = document.getElementById('item-' + id);
  el.dataset.status = 'amended';
  el.querySelector('.badge').className = 'badge badge-amended';
  el.querySelector('.badge').textContent = 'AMENDED';
  toast('✎ Amended');
}

function filter(type, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.review-item').forEach(el => {
    if (type === 'all') { el.style.display = ''; return; }
    if (type === 'security') { el.style.display = el.dataset.id.startsWith('security:') ? '' : 'none'; return; }
    if (type === 'unverified') { el.style.display = el.dataset.status === 'pending' ? '' : 'none'; return; }
    el.style.display = el.dataset.status === type ? '' : 'none';
  });
}

function batchApproveVisible() {
  document.querySelectorAll('.review-item').forEach(el => {
    if (el.style.display === 'none') return;
    if (el.dataset.status !== 'pending') return;
    decide(el.dataset.id, 'approved');
  });
  toast('Batch approved all visible pending items');
}

function exportPending() {
  const blob = new Blob([JSON.stringify(bundleData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pending.json';
  a.click();
  toast('Exported pending.json');
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}
</script>
</body>
</html>`;
}
