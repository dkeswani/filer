import path from 'path';

// ── Filer-native types (nothing outside this file imports from secretlint) ─────

export interface SecretFinding {
  filePath:  string;
  ruleId:    string;
  message:   string;
  line:      number;
  severity:  'error' | 'warning';
}

export interface SecretScanResult {
  findings:  SecretFinding[];
  fileCount: number;
}

// ── Lazy-loaded secretlint config (singleton, loaded once per process) ─────────

let _config: unknown = null;

async function getConfig(): Promise<unknown> {
  if (_config) return _config;
  const [{ loadPackagesFromConfigDescriptor }, { creator }] = await Promise.all([
    import('@secretlint/config-loader'),
    import('@secretlint/secretlint-rule-preset-recommend'),
  ]);
  const loaded = await loadPackagesFromConfigDescriptor({
    configDescriptor: {
      rules: [{ id: '@secretlint/secretlint-rule-preset-recommend', preset: creator } as any],
    },
  });
  if (!loaded.ok) throw new Error('Failed to load secretlint config');
  _config = loaded.config;
  return _config;
}

// ── Core scan: lint one file's content ────────────────────────────────────────

async function lintContent(
  filePath: string,
  content:  string
): Promise<SecretFinding[]> {
  const [{ lintSource }, config] = await Promise.all([
    import('@secretlint/core'),
    getConfig(),
  ]);

  const ext = path.extname(filePath);

  const result = await lintSource({
    source: { filePath, content, contentType: 'text', ext },
    options: { config },
  } as any);

  return (result.messages ?? []).map((m: any) => ({
    filePath,
    ruleId:   m.ruleId,
    message:  m.message,
    line:     m.loc?.start?.line ?? 1,
    severity: m.severity === 'error' ? 'error' : 'warning',
  }));
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Scan an array of { path, content } file objects for hardcoded secrets.
 * Used by filer pack (pre-LLM warning) and filer scan (inject as security nodes).
 */
export async function scanForSecrets(
  files: Array<{ path: string; content: string }>
): Promise<SecretScanResult> {
  const findings: SecretFinding[] = [];

  for (const file of files) {
    try {
      const fileFindings = await lintContent(file.path, file.content);
      findings.push(...fileFindings);
    } catch {
      // Best-effort — never let a scan failure block the caller
    }
  }

  return { findings, fileCount: files.length };
}

/**
 * Convert SecretFindings into Filer security nodes for filer scan injection.
 * Each finding becomes a CRITICAL security node — deterministic, no LLM cost.
 */
export function findingsToSecurityNodes(
  findings:  SecretFinding[],
  now:       string = new Date().toISOString()
): Array<{
  id: string; type: 'security'; version: number; created_at: string; updated_at: string;
  indexed_by: string; scope: string[]; tags: string[]; confidence: number;
  verified: boolean; stale_risk: number; related: string[]; supersedes: string[]; must_not: string[];
  severity: 'CRITICAL'; category: string; statement: string; because: string;
  if_violated: string; safe_pattern: string;
}> {
  // Deduplicate: one node per (ruleId, filePath) pair
  const seen = new Set<string>();
  const nodes = [];

  for (const f of findings) {
    const key = `${f.ruleId}::${f.filePath}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const ruleLabel = f.ruleId.replace('@secretlint/secretlint-rule-', '').replace(/-/g, '_').toUpperCase();
    const id = `security:leaked-secret-${ruleLabel.toLowerCase()}-${path.basename(f.filePath).replace(/\W+/g, '-')}`;

    nodes.push({
      id,
      type:        'security' as const,
      version:     1,
      created_at:  now,
      updated_at:  now,
      indexed_by:  'secretlint',
      scope:       [f.filePath],
      tags:        ['secret', 'credential', ruleLabel.toLowerCase()],
      confidence:  1.0,
      verified:    false,
      stale_risk:  0,
      related:     [],
      supersedes:  [],
      must_not:    [],
      severity:    'CRITICAL' as const,
      category:    'credential-exposure',
      statement:   `Hardcoded ${ruleLabel} credential detected in ${f.filePath}`,
      because:     `Committed secrets leak credentials and can be exploited immediately if the repo is public or compromised`,
      if_violated: `Immediate credential rotation required; revoke the leaked secret and audit access logs`,
      safe_pattern: `Use environment variables or a secrets manager; never commit credentials to source control`,
    });
  }

  return nodes;
}

/**
 * Format findings as a compact warning block for filer pack output.
 */
export function formatSecretWarnings(findings: SecretFinding[]): string {
  if (findings.length === 0) return '';
  const lines = [
    `⚠  ${findings.length} potential secret(s) detected — review before sharing:`,
    ...findings.map(f => `   ${f.filePath}:${f.line}  ${f.ruleId}  ${f.message.slice(0, 80)}`),
    '',
  ];
  return lines.join('\n');
}
