import type { AnyNode } from '../schema/mod.js';

// ── Severity mapping ──────────────────────────────────────────────────────────

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';

export interface SeverityMeta {
  label:  Severity;
  color:  string;
  bg:     string;
  border: string;
}

export const SEVERITY_MAP: Record<AnyNode['type'], SeverityMeta> = {
  security:    { label: 'CRITICAL', color: '#dc2626', bg: '#fef2f2', border: '#dc2626' },
  danger:      { label: 'HIGH',     color: '#ea580c', bg: '#fff7ed', border: '#ea580c' },
  constraint:  { label: 'MEDIUM',   color: '#d97706', bg: '#fffbeb', border: '#d97706' },
  assumption:  { label: 'MEDIUM',   color: '#d97706', bg: '#fffbeb', border: '#d97706' },
  antipattern: { label: 'MEDIUM',   color: '#d97706', bg: '#fffbeb', border: '#d97706' },
  pattern:     { label: 'INFO',     color: '#2563eb', bg: '#eff6ff', border: '#2563eb' },
  intent:      { label: 'INFO',     color: '#2563eb', bg: '#eff6ff', border: '#2563eb' },
  decision:    { label: 'INFO',     color: '#2563eb', bg: '#eff6ff', border: '#2563eb' },
};

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'INFO'];

export function severityRank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

// ── Report options ────────────────────────────────────────────────────────────

export interface ReportOptions {
  nodes:        AnyNode[];
  repoName:     string;
  scannedAt:    string;
  filesIndexed: number;
  estimatedUsd: number;
  model:        string;
  rejected:     number;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function generateReport(opts: ReportOptions): string {
  const sorted = [...opts.nodes].sort((a, b) => {
    const sa = severityRank(SEVERITY_MAP[a.type].label);
    const sb = severityRank(SEVERITY_MAP[b.type].label);
    if (sa !== sb) return sa - sb;
    return b.confidence - a.confidence;
  });

  const counts = {
    CRITICAL: opts.nodes.filter(n => SEVERITY_MAP[n.type].label === 'CRITICAL').length,
    HIGH:     opts.nodes.filter(n => SEVERITY_MAP[n.type].label === 'HIGH').length,
    MEDIUM:   opts.nodes.filter(n => SEVERITY_MAP[n.type].label === 'MEDIUM').length,
    INFO:     opts.nodes.filter(n => SEVERITY_MAP[n.type].label === 'INFO').length,
  };

  const byType: Record<string, number> = {};
  for (const node of opts.nodes) {
    byType[node.type] = (byType[node.type] ?? 0) + 1;
  }

  const topScopes = computeTopScopes(opts.nodes);

  const dataJson = JSON.stringify({
    repo:         opts.repoName,
    scannedAt:    opts.scannedAt,
    model:        opts.model,
    filesIndexed: opts.filesIndexed,
    estimatedUsd: opts.estimatedUsd,
    rejected:     opts.rejected,
    nodes:        sorted,
  });

  const date = new Date(opts.scannedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Filer Scan — ${esc(opts.repoName)}</title>
<style>
${CSS}
</style>
</head>
<body>

<header class="header">
  <div class="header-inner">
    <div class="header-left">
      <span class="header-logo">🔍 Filer Scan</span>
      <span class="header-meta">${esc(opts.repoName)} · ${date} · ${opts.filesIndexed} files</span>
    </div>
    <button class="btn-export" onclick="exportJSON()">Export JSON</button>
  </div>
</header>

<main class="main">

  <!-- Summary cards -->
  <div class="summary-cards">
    <div class="summary-card critical">
      <div class="summary-count">${counts.CRITICAL}</div>
      <div class="summary-label">CRITICAL</div>
      <div class="summary-type">security</div>
    </div>
    <div class="summary-card high">
      <div class="summary-count">${counts.HIGH}</div>
      <div class="summary-label">HIGH</div>
      <div class="summary-type">danger</div>
    </div>
    <div class="summary-card medium">
      <div class="summary-count">${counts.MEDIUM}</div>
      <div class="summary-label">MEDIUM</div>
      <div class="summary-type">constraint · assumption</div>
    </div>
    <div class="summary-card info">
      <div class="summary-count">${counts.INFO}</div>
      <div class="summary-label">INFO</div>
      <div class="summary-type">pattern · intent</div>
    </div>
  </div>

  <!-- Progress -->
  <div class="progress-section">
    <div class="progress-row">
      <span class="progress-label">Reviewed</span>
      <div class="progress-bar-wrap">
        <div class="progress-bar" id="progressBar" style="width:0%"></div>
      </div>
      <span class="progress-text" id="progressText">0 / ${opts.nodes.length} (0%)</span>
    </div>
    <div class="progress-row" id="securityProgressRow" style="${counts.CRITICAL === 0 ? 'display:none' : ''}">
      <span class="progress-label" style="color:#dc2626">Security</span>
      <div class="progress-bar-wrap">
        <div class="progress-bar critical-bar" id="securityProgressBar" style="width:0%"></div>
      </div>
      <span class="progress-text" id="securityProgressText">0 / ${counts.CRITICAL}</span>
    </div>
  </div>

  <!-- Details box -->
  <details class="scan-details">
    <summary>Scan details</summary>
    <div class="scan-details-grid">
      <div><span class="detail-label">Model</span><span class="detail-val">${esc(opts.model)}</span></div>
      <div><span class="detail-label">Files scanned</span><span class="detail-val">${opts.filesIndexed}</span></div>
      <div><span class="detail-label">Nodes extracted</span><span class="detail-val">${opts.nodes.length}</span></div>
      <div><span class="detail-label">Rejected</span><span class="detail-val">${opts.rejected} (below confidence threshold)</span></div>
      <div><span class="detail-label">Estimated cost</span><span class="detail-val">$${opts.estimatedUsd.toFixed(4)}</span></div>
      ${topScopes.map(([scope, count]) =>
        `<div><span class="detail-label mono">${esc(scope)}</span><span class="detail-val">${count} findings</span></div>`
      ).join('\n      ')}
    </div>
  </details>

  <!-- Filters -->
  <div class="toolbar">
    <div class="type-tabs" id="typeTabs">
      <button class="tab active" data-type="all" onclick="setTypeFilter('all')">All <span class="tab-count">${opts.nodes.length}</span></button>
      ${Object.entries(byType).sort((a, b) => {
        const order = ['security','danger','constraint','assumption','antipattern','pattern','intent','decision'];
        return order.indexOf(a[0]) - order.indexOf(b[0]);
      }).map(([type, count]) =>
        `<button class="tab" data-type="${type}" onclick="setTypeFilter('${type}')">${cap(type)} <span class="tab-count">${count}</span></button>`
      ).join('\n      ')}
    </div>
    <div class="toolbar-right">
      <select class="select-filter" id="statusFilter" onchange="applyFilters()">
        <option value="all">All statuses</option>
        <option value="unverified">Unverified</option>
        <option value="verified">Verified</option>
        <option value="dismissed">Dismissed</option>
      </select>
      <select class="select-filter" id="sortFilter" onchange="applyFilters()">
        <option value="severity">Sort: Severity</option>
        <option value="confidence">Sort: Confidence</option>
        <option value="scope">Sort: Scope</option>
      </select>
      <input class="search-input" id="searchInput" type="text" placeholder="Search findings..." oninput="applyFilters()">
      <span class="result-count" id="resultCount"></span>
    </div>
  </div>

  <!-- Findings list -->
  <div id="findingsList"></div>

</main>

<script>
window.FILER_DATA = ${dataJson};
</script>
<script>
${JS}
</script>

</body>
</html>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function computeTopScopes(nodes: AnyNode[]): [string, number][] {
  const counts: Record<string, number> = {};
  for (const node of nodes) {
    for (const scope of node.scope) {
      const dir = scope.includes('/') ? scope.split('/').slice(0, 3).join('/') : scope;
      counts[dir] = (counts[dir] ?? 0) + 1;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  background: #f8fafc;
  color: #1e293b;
  line-height: 1.5;
}

.header {
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 12px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-logo {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
  margin-right: 16px;
}

.header-meta {
  font-size: 13px;
  color: #64748b;
}

.btn-export {
  background: #0f172a;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-export:hover { background: #1e293b; }

.main {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 24px 64px;
}

/* Summary cards */
.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

@media (max-width: 700px) {
  .summary-cards { grid-template-columns: repeat(2, 1fr); }
}

.summary-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  border-top: 4px solid transparent;
}
.summary-card.critical { border-top-color: #dc2626; }
.summary-card.high     { border-top-color: #ea580c; }
.summary-card.medium   { border-top-color: #d97706; }
.summary-card.info     { border-top-color: #2563eb; }

.summary-count {
  font-size: 36px;
  font-weight: 700;
  line-height: 1;
  margin-bottom: 4px;
}
.summary-card.critical .summary-count { color: #dc2626; }
.summary-card.high     .summary-count { color: #ea580c; }
.summary-card.medium   .summary-count { color: #d97706; }
.summary-card.info     .summary-count { color: #2563eb; }

.summary-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #64748b;
  margin-bottom: 2px;
}

.summary-type {
  font-size: 11px;
  color: #94a3b8;
}

/* Progress */
.progress-section {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 14px 18px;
  margin-bottom: 16px;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.progress-row:last-child { margin-bottom: 0; }

.progress-label {
  font-size: 12px;
  font-weight: 500;
  color: #475569;
  width: 70px;
  flex-shrink: 0;
}

.progress-bar-wrap {
  flex: 1;
  height: 8px;
  background: #f1f5f9;
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: #22c55e;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-bar.critical-bar { background: #dc2626; }

.progress-text {
  font-size: 12px;
  color: #64748b;
  width: 120px;
  flex-shrink: 0;
  text-align: right;
}

/* Scan details */
.scan-details {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 18px;
  margin-bottom: 16px;
}

.scan-details summary {
  font-size: 13px;
  font-weight: 500;
  color: #475569;
  cursor: pointer;
  user-select: none;
}

.scan-details-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 6px 24px;
}

.detail-label {
  font-size: 12px;
  color: #94a3b8;
  margin-right: 8px;
}

.detail-val {
  font-size: 12px;
  color: #475569;
}

/* Toolbar */
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.type-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1;
}

.tab {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 500;
  color: #475569;
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;
}
.tab:hover { border-color: #94a3b8; color: #1e293b; }
.tab.active { background: #0f172a; color: #ffffff; border-color: #0f172a; }

.tab-count {
  font-weight: 400;
  opacity: 0.7;
  margin-left: 3px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.select-filter {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 12px;
  color: #475569;
  background: #ffffff;
  cursor: pointer;
}

.search-input {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 13px;
  color: #1e293b;
  width: 200px;
  outline: none;
  transition: border-color 0.12s;
}
.search-input:focus { border-color: #6366f1; }

.result-count {
  font-size: 12px;
  color: #94a3b8;
  white-space: nowrap;
}

/* Finding cards */
.finding-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  border-left: 4px solid transparent;
  margin-bottom: 8px;
  overflow: hidden;
  transition: box-shadow 0.15s;
}
.finding-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }

.finding-card.verified-card  { border-left-color: #22c55e !important; }
.finding-card.dismissed-card { border-left-color: #94a3b8 !important; opacity: 0.55; }

.finding-header {
  padding: 12px 16px;
  cursor: pointer;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  user-select: none;
}

.finding-toggle {
  margin-top: 3px;
  color: #94a3b8;
  font-size: 11px;
  flex-shrink: 0;
  transition: transform 0.15s;
}
.finding-card.open .finding-toggle { transform: rotate(90deg); }

.finding-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
  padding: 2px 7px;
  border-radius: 4px;
  margin-top: 2px;
}

.finding-main {
  flex: 1;
  min-width: 0;
}

.finding-id {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  word-break: break-all;
}

.finding-summary {
  font-size: 12px;
  color: #475569;
  margin-top: 2px;
}

.finding-meta {
  display: flex;
  gap: 10px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.finding-scope {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 11px;
  color: #94a3b8;
}

.finding-confidence {
  font-size: 11px;
  color: #94a3b8;
}

.finding-status-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
}
.status-unverified { background: #f1f5f9; color: #64748b; }
.status-verified   { background: #dcfce7; color: #16a34a; }
.status-dismissed  { background: #f1f5f9; color: #94a3b8; }

.finding-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  margin-top: 2px;
}

.action-btn {
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  padding: 4px 9px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  background: #ffffff;
  transition: all 0.12s;
}
.action-btn:hover { background: #f8fafc; }
.btn-verify   { color: #16a34a; border-color: #bbf7d0; }
.btn-verify:hover   { background: #f0fdf4; border-color: #86efac; }
.btn-dismiss  { color: #94a3b8; border-color: #e2e8f0; }
.btn-dismiss:hover  { background: #f1f5f9; }

/* Finding body (expanded) */
.finding-body {
  display: none;
  padding: 0 16px 16px 40px;
  border-top: 1px solid #f1f5f9;
}
.finding-card.open .finding-body { display: block; }

.field-group {
  margin-top: 12px;
}

.field-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: #94a3b8;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.field-value {
  font-size: 13px;
  color: #334155;
  line-height: 1.6;
  white-space: pre-wrap;
}

.must-not-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.must-not-list li {
  font-size: 13px;
  color: #dc2626;
  padding: 2px 0;
}
.must-not-list li::before {
  content: '· ';
  color: #dc2626;
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.tag-chip {
  background: #f1f5f9;
  color: #475569;
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #94a3b8;
}
.empty-state h3 { font-size: 16px; margin-bottom: 8px; }

.mono { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace; }
`;

// ── Client-side JavaScript ────────────────────────────────────────────────────

const JS = `
(function () {
  const d = window.FILER_DATA;
  const repoKey = d.repo.replace(/[^a-z0-9]/gi, '_');

  // ── State ──────────────────────────────────────────────────────────────────

  let typeFilter   = 'all';
  let statusFilter = 'all';
  let sortBy       = 'severity';
  let searchQuery  = '';

  const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'INFO'];
  const SEVERITY_MAP = {
    security:    { label: 'CRITICAL', color: '#dc2626', bg: '#fef2f2' },
    danger:      { label: 'HIGH',     color: '#ea580c', bg: '#fff7ed' },
    constraint:  { label: 'MEDIUM',   color: '#d97706', bg: '#fffbeb' },
    assumption:  { label: 'MEDIUM',   color: '#d97706', bg: '#fffbeb' },
    antipattern: { label: 'MEDIUM',   color: '#d97706', bg: '#fffbeb' },
    pattern:     { label: 'INFO',     color: '#2563eb', bg: '#eff6ff' },
    intent:      { label: 'INFO',     color: '#2563eb', bg: '#eff6ff' },
    decision:    { label: 'INFO',     color: '#2563eb', bg: '#eff6ff' },
  };

  // ── localStorage helpers ───────────────────────────────────────────────────

  function getStatus(nodeId) {
    return localStorage.getItem('filer:' + repoKey + ':' + nodeId) || 'unverified';
  }

  function setStatus(nodeId, status) {
    localStorage.setItem('filer:' + repoKey + ':' + nodeId, status);
    updateProgress();
    applyFilters();
  }

  // ── Progress ───────────────────────────────────────────────────────────────

  function updateProgress() {
    const total      = d.nodes.length;
    const reviewed   = d.nodes.filter(n => getStatus(n.id) !== 'unverified').length;
    const pct        = total > 0 ? Math.round(reviewed / total * 100) : 0;
    document.getElementById('progressBar').style.width    = pct + '%';
    document.getElementById('progressText').textContent  = reviewed + ' / ' + total + ' (' + pct + '%)';

    const secNodes   = d.nodes.filter(n => n.type === 'security');
    const secDone    = secNodes.filter(n => getStatus(n.id) !== 'unverified').length;
    const secPct     = secNodes.length > 0 ? Math.round(secDone / secNodes.length * 100) : 0;
    const secBar     = document.getElementById('securityProgressBar');
    const secText    = document.getElementById('securityProgressText');
    if (secBar) secBar.style.width = secPct + '%';
    if (secText) secText.textContent = secDone + ' / ' + secNodes.length + (secDone === secNodes.length && secNodes.length > 0 ? ' ✓' : '');
  }

  // ── Filtering & sorting ────────────────────────────────────────────────────

  function severityRank(label) {
    return SEVERITY_ORDER.indexOf(label);
  }

  window.setTypeFilter = function(type) {
    typeFilter = type;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
    applyFilters();
  };

  window.applyFilters = function() {
    statusFilter = document.getElementById('statusFilter').value;
    sortBy       = document.getElementById('sortFilter').value;
    searchQuery  = document.getElementById('searchInput').value.toLowerCase().trim();
    renderList();
  };

  function matchesFilters(node) {
    if (typeFilter !== 'all' && node.type !== typeFilter) return false;
    const status = getStatus(node.id);
    if (statusFilter !== 'all' && status !== statusFilter) return false;
    if (statusFilter === 'all' && status === 'dismissed') return false; // hide dismissed by default
    if (searchQuery) {
      const haystack = [
        node.id, node.type,
        ...(node.scope || []),
        ...(node.tags || []),
        node.statement || '',
        node.because || '',
        node.if_violated || '',
        node.safe_pattern || '',
        node.condition || '',
        node.purpose || '',
        node.why || '',
        node.breaks_when || '',
      ].join(' ').toLowerCase();
      if (!haystack.includes(searchQuery)) return false;
    }
    return true;
  }

  function sortNodes(nodes) {
    return [...nodes].sort((a, b) => {
      const sa = SEVERITY_MAP[a.type]?.label || 'INFO';
      const sb = SEVERITY_MAP[b.type]?.label || 'INFO';
      if (sortBy === 'severity') {
        const r = severityRank(sa) - severityRank(sb);
        return r !== 0 ? r : b.confidence - a.confidence;
      }
      if (sortBy === 'confidence') return b.confidence - a.confidence;
      if (sortBy === 'scope') return (a.scope[0] || '').localeCompare(b.scope[0] || '');
      return 0;
    });
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function renderList() {
    const container = document.getElementById('findingsList');
    const filtered  = sortNodes(d.nodes.filter(matchesFilters));
    document.getElementById('resultCount').textContent = filtered.length + ' of ' + d.nodes.length;

    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state"><h3>No findings match</h3><p>Try adjusting your filters or search query.</p></div>';
      return;
    }

    container.innerHTML = filtered.map(renderCard).join('');
  }

  function renderCard(node) {
    const meta    = SEVERITY_MAP[node.type] || SEVERITY_MAP.pattern;
    const status  = getStatus(node.id);
    const cardCls = 'finding-card' +
      (status === 'verified'  ? ' verified-card'  : '') +
      (status === 'dismissed' ? ' dismissed-card' : '');

    const badgeStyle = 'background:' + meta.bg + ';color:' + meta.color;
    const statusBadge = status === 'verified'
      ? '<span class="finding-status-badge status-verified">✓ verified</span>'
      : status === 'dismissed'
      ? '<span class="finding-status-badge status-dismissed">✗ dismissed</span>'
      : '<span class="finding-status-badge status-unverified">unverified</span>';

    const scopes   = (node.scope || []).slice(0, 2).join(', ');
    const summary  = getSummaryText(node);

    return '<div class="' + cardCls + '" id="card-' + esc(node.id) + '" style="border-left-color:' + meta.color + '">' +
      '<div class="finding-header" onclick="toggleCard(\\'' + esc(node.id) + '\\')">' +
        '<span class="finding-toggle">▶</span>' +
        '<span class="finding-badge" style="' + badgeStyle + '">' + meta.label + '</span>' +
        '<div class="finding-main">' +
          '<div class="finding-id">' + esc(node.id) + '</div>' +
          '<div class="finding-summary">' + esc(summary) + '</div>' +
          '<div class="finding-meta">' +
            '<span class="finding-scope mono">' + esc(scopes) + '</span>' +
            '<span class="finding-confidence">confidence ' + Math.round(node.confidence * 100) + '%</span>' +
            statusBadge +
          '</div>' +
        '</div>' +
        '<div class="finding-actions" onclick="event.stopPropagation()">' +
          '<button class="action-btn btn-verify"  onclick="markVerified(\\'' + esc(node.id) + '\\')">✓ Verify</button>' +
          '<button class="action-btn btn-dismiss" onclick="markDismissed(\\'' + esc(node.id) + '\\')">✗</button>' +
        '</div>' +
      '</div>' +
      '<div class="finding-body">' + renderBody(node) + '</div>' +
    '</div>';
  }

  function renderBody(node) {
    const sections = [];
    const t = node.type;

    if (t === 'security') {
      sections.push(field('Statement', node.statement));
      sections.push(field('Because', node.because));
      sections.push(field('If Violated', node.if_violated));
      sections.push(field('Safe Pattern', node.safe_pattern));
    } else if (t === 'danger') {
      sections.push(field('Statement', node.statement));
      sections.push(field('Condition', node.condition));
      if (node.safe_pattern) sections.push(field('Safe Pattern', node.safe_pattern));
      if (node.current_mitigation) sections.push(field('Current Mitigation', node.current_mitigation));
    } else if (t === 'constraint') {
      sections.push(field('Statement', node.statement));
      sections.push(field('Because', node.because));
      sections.push(field('If Violated', node.if_violated));
      if (node.instead) sections.push(field('Instead', node.instead));
    } else if (t === 'assumption') {
      sections.push(field('Statement', node.statement));
      sections.push(field('Breaks When', node.breaks_when));
      if (node.boundary) sections.push(field('Boundary', node.boundary));
    } else if (t === 'pattern') {
      sections.push(field('Statement', node.statement));
      sections.push(field('Why', node.why));
      if (node.anti_pattern) sections.push(field('Anti-pattern', node.anti_pattern));
    } else if (t === 'antipattern') {
      sections.push(field('Statement', node.statement));
      sections.push(field('Why It Looks Right', node.why_it_looks_right));
      sections.push(field('Why It\\'s Wrong Here', node.why_its_wrong_here));
      sections.push(field('Correct Pattern', node.correct_pattern));
    } else if (t === 'intent') {
      sections.push(field('Purpose', node.purpose));
    } else if (t === 'decision') {
      sections.push(field('Statement', node.statement));
      sections.push(field('Reason', node.reason));
      if (node.revisit_if) sections.push(field('Revisit If', node.revisit_if));
    }

    if (node.must_not && node.must_not.length > 0) {
      sections.push(
        '<div class="field-group">' +
          '<div class="field-label">Must NOT</div>' +
          '<ul class="must-not-list">' +
          node.must_not.map(m => '<li>' + esc(m) + '</li>').join('') +
          '</ul>' +
        '</div>'
      );
    }

    if (node.tags && node.tags.length > 0) {
      sections.push(
        '<div class="field-group">' +
          '<div class="field-label">Tags</div>' +
          '<div class="tags-row">' +
          node.tags.map(t => '<span class="tag-chip">' + esc(t) + '</span>').join('') +
          '</div>' +
        '</div>'
      );
    }

    if (node.scope && node.scope.length > 1) {
      sections.push(
        '<div class="field-group">' +
          '<div class="field-label">Scope</div>' +
          '<div class="field-value mono" style="font-size:11px;color:#94a3b8">' +
          esc(node.scope.join('\\n')) +
          '</div>' +
        '</div>'
      );
    }

    return sections.join('');
  }

  function field(label, value) {
    if (!value) return '';
    return '<div class="field-group">' +
      '<div class="field-label">' + esc(label) + '</div>' +
      '<div class="field-value">' + esc(value) + '</div>' +
      '</div>';
  }

  function getSummaryText(node) {
    return node.statement || node.purpose || node.reason || '';
  }

  // ── Interactions ───────────────────────────────────────────────────────────

  window.toggleCard = function(id) {
    const card = document.getElementById('card-' + id);
    if (card) card.classList.toggle('open');
  };

  window.markVerified = function(id) {
    const current = getStatus(id);
    setStatus(id, current === 'verified' ? 'unverified' : 'verified');
  };

  window.markDismissed = function(id) {
    const current = getStatus(id);
    setStatus(id, current === 'dismissed' ? 'unverified' : 'dismissed');
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  window.exportJSON = function() {
    const statusFilter = document.getElementById('statusFilter').value;
    const searchQuery  = document.getElementById('searchInput').value.toLowerCase().trim();

    const findings = d.nodes
      .filter(n => {
        const status = getStatus(n.id);
        if (statusFilter !== 'all' && status !== statusFilter) return false;
        return true;
      })
      .map(n => ({
        ...n,
        severity: (SEVERITY_MAP[n.type] || SEVERITY_MAP.pattern).label,
        status:   getStatus(n.id),
      }));

    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, INFO: 0 };
    for (const f of findings) counts[f.severity]++;

    const payload = {
      repo:       d.repo,
      scanned_at: d.scannedAt,
      model:      d.model,
      summary:    counts,
      findings,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'filer-scan-' + d.repo.replace(/[^a-z0-9]/gi, '-') + '.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Escape helper ──────────────────────────────────────────────────────────

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  updateProgress();
  renderList();

})();
`;
