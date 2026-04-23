import fs    from 'fs';
import chalk from 'chalk';
import * as readline from 'readline';
import { execSync } from 'child_process';
import { getGitHubToken } from '../lib/github-auth.js';
import {
  filerExists,
  readAllNodes,
  readNode,
  upsertNode,
  readConfig,
} from '../store/mod.js';
import {
  LLMGateway,
  LEARN_CLASSIFY_SYSTEM,
  LEARN_PROPOSE_SYSTEM,
  buildLearnProposePrompt,
} from '../llm/mod.js';
import { AnyNodeSchema } from '../schema/mod.js';
import type { AnyNode } from '../schema/mod.js';

interface LearnOptions {
  since?:      string;
  pr?:         string;
  autoApply?:  boolean;
  dryRun?:     boolean;
  fromFile?:   string;   // path to a text file of raw review comments
}

// ── GitHub types ──────────────────────────────────────────────────────────────

interface GHPull {
  number:    number;
  title:     string;
  merged_at: string | null;
}

interface GHComment {
  id:         number;
  body:       string;
  path:       string | null;
  user:       { login: string };
  created_at: string;
}

// ── Signal type from classifier ───────────────────────────────────────────────

interface ClassifyResult {
  is_signal:   boolean;
  signal_type: string | null;
  confidence:  number;
  reasoning:   string;
}

interface Signal {
  pr:          number;
  author:      string;
  text:        string;
  file:        string;
  signal_type: string;
  confidence:  number;
}

// ── Cluster ───────────────────────────────────────────────────────────────────

interface Cluster {
  signal_type:   string;
  signals:       Signal[];
  keywords:      string[];
  existingNode:  AnyNode | null;
}

// ── File-based comment parser ─────────────────────────────────────────────────

export function parseCommentsFile(
  content: string
): Array<{ pr: number; author: string; text: string; file: string }> {
  // Split on blank lines to get paragraphs; treat each non-empty paragraph as a comment
  const paragraphs = content.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length >= 10);
  return paragraphs.map(text => ({ pr: 0, author: 'file', text, file: '' }));
}

// ── GitHub helpers ────────────────────────────────────────────────────────────

async function ghFetch(path: string, token: string): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${path}`);
  return res.json();
}

function detectRepoInfo(root: string): { owner: string; repo: string } | null {
  try {
    const remote = execSync('git remote get-url origin', { cwd: root, stdio: 'pipe' }).toString().trim();
    const match  = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (match) return { owner: match[1], repo: match[2] };
  } catch {}
  return null;
}

async function fetchMergedPRs(
  owner: string, repo: string, token: string,
  opts: { since?: string; prNumber?: number }
): Promise<GHPull[]> {
  if (opts.prNumber) {
    const pr = await ghFetch(`/repos/${owner}/${repo}/pulls/${opts.prNumber}`, token) as GHPull;
    return pr.merged_at ? [pr] : [];
  }

  const pulls: GHPull[] = [];
  let page = 1;
  while (true) {
    const batch = await ghFetch(
      `/repos/${owner}/${repo}/pulls?state=closed&per_page=50&page=${page}`,
      token
    ) as GHPull[];
    if (batch.length === 0) break;

    for (const pr of batch) {
      if (!pr.merged_at) continue;
      if (opts.since && new Date(pr.merged_at) < new Date(opts.since)) {
        return pulls;
      }
      pulls.push(pr);
    }
    if (batch.length < 50) break;
    page++;
  }
  return pulls;
}

async function fetchPRComments(
  owner: string, repo: string, prNumber: number, token: string
): Promise<GHComment[]> {
  const [review, issue] = await Promise.all([
    ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/comments`, token),
    ghFetch(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, token),
  ]);
  return [...(review as GHComment[]), ...(issue as GHComment[])];
}

// ── Step 1: Classify comments ─────────────────────────────────────────────────

async function classifyComments(
  comments: Array<{ pr: number; author: string; text: string; file: string }>,
  gateway: LLMGateway
): Promise<Signal[]> {
  const signals: Signal[] = [];

  for (const comment of comments) {
    const result = await gateway.completeJSON<ClassifyResult>(
      'learn.classify',
      [{ role: 'user', content: comment.text }],
      { system: LEARN_CLASSIFY_SYSTEM, max_tokens: 256 }
    );

    if (result?.is_signal && result.signal_type && result.confidence >= 0.65) {
      signals.push({
        ...comment,
        signal_type: result.signal_type,
        confidence:  result.confidence,
      });
    }
  }

  return signals;
}

// ── Step 2: Cluster by keyword similarity ────────────────────────────────────

function extractKeywords(text: string): string[] {
  return text.toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 3)
    .filter(w => !STOPWORDS.has(w));
}

const STOPWORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'will', 'should', 'would', 'could',
  'here', 'there', 'when', 'where', 'what', 'which', 'they', 'them', 'their',
  'been', 'being', 'also', 'into', 'more', 'some', 'such', 'than', 'then',
  'just', 'like', 'make', 'need', 'dont', 'does', 'used', 'very', 'need',
]);

function keywordOverlap(a: string[], b: string[]): number {
  const setA = new Set(a);
  const common = b.filter(w => setA.has(w)).length;
  return common / Math.max(a.length, b.length, 1);
}

export function clusterSignals(signals: Signal[]): Cluster[] {
  const clusters: Cluster[] = [];

  for (const signal of signals) {
    const kw = extractKeywords(signal.text);
    let placed = false;

    for (const cluster of clusters) {
      if (cluster.signal_type !== signal.signal_type) continue;
      if (keywordOverlap(cluster.keywords, kw) >= 0.25) {
        cluster.signals.push(signal);
        // Merge keywords
        for (const w of kw) {
          if (!cluster.keywords.includes(w)) cluster.keywords.push(w);
        }
        placed = true;
        break;
      }
    }

    if (!placed) {
      clusters.push({ signal_type: signal.signal_type, signals: [signal], keywords: kw, existingNode: null });
    }
  }

  return clusters.filter(c => c.signals.length >= 1);
}

// ── Step 3: Cross-reference with existing nodes ───────────────────────────────

export function crossReferenceNodes(clusters: Cluster[], nodes: AnyNode[]): Cluster[] {
  for (const cluster of clusters) {
    const kw = cluster.keywords;
    let bestMatch: AnyNode | null = null;
    let bestScore = 0;

    for (const node of nodes) {
      if (node.type !== cluster.signal_type) continue;
      const nodeText = JSON.stringify(node).toLowerCase();
      const score = kw.filter(w => nodeText.includes(w)).length / Math.max(kw.length, 1);
      if (score > bestScore && score >= 0.3) {
        bestScore = score;
        bestMatch = node;
      }
    }

    cluster.existingNode = bestMatch;
  }

  return clusters;
}

// ── Step 4: Propose nodes ─────────────────────────────────────────────────────

async function proposeNode(cluster: Cluster, gateway: LLMGateway): Promise<AnyNode | null> {
  const prompt = buildLearnProposePrompt({
    comments:     cluster.signals.map(s => ({ pr: s.pr, author: s.author, text: s.text, file: s.file })),
    signalType:   cluster.signal_type,
    existingNode: cluster.existingNode,
  });

  const raw = await gateway.completeJSON<unknown>(
    'learn.propose',
    [{ role: 'user', content: prompt }],
    { system: LEARN_PROPOSE_SYSTEM, max_tokens: 1024 }
  );

  if (!raw) return null;

  const parsed = AnyNodeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ── Interactive apply workflow ────────────────────────────────────────────────

async function interactiveApply(
  proposals: Array<{ cluster: Cluster; node: AnyNode }>,
  root: string,
  dryRun: boolean
): Promise<{ applied: number; skipped: number }> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt: string): Promise<string> =>
    new Promise(resolve => rl.question(prompt, resolve));

  let applied = 0;
  let skipped = 0;

  for (let i = 0; i < proposals.length; i++) {
    const { cluster, node } = proposals[i];
    const isUpdate = cluster.existingNode !== null;

    console.log(`\n  [${i + 1}/${proposals.length}] ${isUpdate ? chalk.yellow('UPDATE') : chalk.green('NEW')} proposal`);
    console.log(chalk.dim(`  Signal type: ${cluster.signal_type}  |  Evidence: ${cluster.signals.length} comment(s)`));
    console.log(chalk.dim(`  Sources: ${[...new Set(cluster.signals.map(s => `PR #${s.pr}`))].join(', ')}\n`));

    const typeColor = getTypeColor(node.type);
    console.log(typeColor(`  [${node.type.toUpperCase()}] `) + chalk.bold(node.id));
    console.log(chalk.dim(`  scope: `) + node.scope.join(', '));
    console.log(chalk.dim(`  confidence: `) + `${Math.round(node.confidence * 100)}%`);
    console.log();

    const summary = getNodeSummary(node);
    for (const line of summary.split('\n')) {
      console.log('  ' + line);
    }

    if (isUpdate) {
      console.log(chalk.dim(`\n  Replaces: ${cluster.existingNode!.id}`));
    }

    console.log(chalk.dim('\n  Evidence comments:'));
    for (const s of cluster.signals.slice(0, 3)) {
      console.log(chalk.dim(`    PR #${s.pr} (${s.author}): "${s.text.slice(0, 100)}${s.text.length > 100 ? '…' : ''}"`));
    }
    if (cluster.signals.length > 3) {
      console.log(chalk.dim(`    ... and ${cluster.signals.length - 3} more`));
    }

    if (dryRun) {
      console.log(chalk.dim('\n  [dry-run] Would apply this node.'));
      applied++;
      continue;
    }

    const answer = await ask(chalk.bold('\n  Apply? [y] yes  [s] skip  [q] quit: '));
    const key = answer.trim().toLowerCase();

    if (key === 'q') {
      console.log(chalk.dim('\n  Quit.\n'));
      break;
    } else if (key === 'y') {
      upsertNode(root, node);
      console.log(chalk.green(`  ✓ Applied: ${node.id}`));
      applied++;
    } else {
      console.log(chalk.dim('  Skipped.'));
      skipped++;
    }
  }

  rl.close();
  return { applied, skipped };
}

// ── Main command ──────────────────────────────────────────────────────────────

export async function learnCommand(options: LearnOptions): Promise<void> {
  const root = process.cwd();

  if (!filerExists(root)) {
    console.error(chalk.red('\n  No .filer/ directory found. Run: filer init\n'));
    process.exit(1);
  }

  const config = readConfig(root);
  if (!config) {
    console.error(chalk.red('\n  No .filer-config.json found.\n'));
    process.exit(1);
  }

  const gateway = new LLMGateway(config);
  const existingNodes = readAllNodes(root);

  // ── --from-file path: skip GitHub entirely ─────────────────────────────────
  if (options.fromFile) {
    let fileContent: string;
    try {
      fileContent = fs.readFileSync(options.fromFile, 'utf-8');
    } catch {
      console.error(chalk.red(`\n  Cannot read file: ${options.fromFile}\n`));
      process.exit(1);
    }

    const allComments = parseCommentsFile(fileContent);

    console.log(chalk.bold('\n  Filer Learn — From File\n'));
    console.log(chalk.dim(`  File:     ${options.fromFile}`));
    console.log(chalk.dim(`  Comments: ${allComments.length}`));
    if (options.dryRun)    console.log(chalk.yellow('  Mode:     dry-run'));
    if (options.autoApply) console.log(chalk.cyan('  Mode:     auto-apply (confidence ≥ 0.85)'));
    console.log();

    if (allComments.length === 0) {
      console.log(chalk.yellow('  No comments found in file (need blank-line separated paragraphs ≥ 10 chars).\n'));
      return;
    }

    process.stdout.write(chalk.dim('  Classifying signals...'));
    const signals = await classifyComments(allComments, gateway);
    process.stdout.write(chalk.dim(` ${signals.length} signals found\n`));

    if (signals.length === 0) {
      console.log(chalk.yellow('\n  No institutional knowledge signals found.\n'));
      return;
    }

    let clusters = clusterSignals(signals);
    clusters = crossReferenceNodes(clusters, existingNodes);
    console.log(chalk.dim(`  Clusters formed: ${clusters.length}\n`));

    const proposals: Array<{ cluster: Cluster; node: AnyNode }> = [];
    for (let i = 0; i < clusters.length; i++) {
      process.stdout.write(chalk.dim(`\r  Proposing node ${i + 1}/${clusters.length}...`));
      const node = await proposeNode(clusters[i], gateway);
      if (node) proposals.push({ cluster: clusters[i], node });
    }
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
    console.log(chalk.dim(`  Proposals generated: ${proposals.length}\n`));

    if (proposals.length === 0) {
      console.log(chalk.yellow('  No quality proposals generated.\n'));
      return;
    }

    if (options.autoApply && !options.dryRun) {
      let applied = 0;
      for (const { node } of proposals) {
        if (node.confidence >= 0.85) {
          upsertNode(root, node);
          console.log(chalk.green(`  ✓ Auto-applied: ${node.id} (${Math.round(node.confidence * 100)}%)`));
          applied++;
        }
      }
      console.log(chalk.bold(`\n  Applied ${applied}/${proposals.length} proposals.\n`));
      return;
    }

    const { applied, skipped } = await interactiveApply(proposals, root, options.dryRun ?? false);
    console.log(chalk.bold('\n  Summary:'));
    console.log(`  ${chalk.green(String(applied))} applied  ${chalk.dim(String(skipped))} skipped\n`);
    return;
  }

  // ── GitHub path ────────────────────────────────────────────────────────────

  const token = await getGitHubToken();

  const repoInfo = detectRepoInfo(root);
  if (!repoInfo) {
    console.error(chalk.red('\n  Could not detect GitHub repo from git remote.\n'));
    process.exit(1);
  }

  const { owner, repo } = repoInfo;

  console.log(chalk.bold('\n  Filer Learn\n'));
  console.log(chalk.dim(`  Repo:  ${owner}/${repo}`));
  if (options.since) console.log(chalk.dim(`  Since: ${options.since}`));
  if (options.pr)    console.log(chalk.dim(`  PR:    #${options.pr}`));
  if (options.dryRun)    console.log(chalk.yellow('  Mode:  dry-run'));
  if (options.autoApply) console.log(chalk.cyan('  Mode:  auto-apply (confidence ≥ 0.85)'));
  console.log();

  // ── Step 1: Fetch PRs ──────────────────────────────────────────────────────

  process.stdout.write(chalk.dim('  Fetching PRs...'));
  const prNumber = options.pr ? parseInt(options.pr, 10) : undefined;
  const prs = await fetchMergedPRs(owner, repo, token, { since: options.since, prNumber });
  process.stdout.write(chalk.dim(` ${prs.length} found\n`));

  if (prs.length === 0) {
    console.log(chalk.yellow('\n  No merged PRs found.\n'));
    return;
  }

  // ── Step 2: Fetch + classify all comments ─────────────────────────────────

  const allComments: Array<{ pr: number; author: string; text: string; file: string }> = [];

  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i];
    process.stdout.write(chalk.dim(`\r  Fetching comments PR #${pr.number} (${i + 1}/${prs.length})...`));
    const comments = await fetchPRComments(owner, repo, pr.number, token);
    for (const c of comments) {
      if (c.body.trim().length < 10) continue;
      allComments.push({
        pr:     pr.number,
        author: c.user.login,
        text:   c.body.trim(),
        file:   c.path ?? '',
      });
    }
  }
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
  console.log(chalk.dim(`  Comments fetched: ${allComments.length}\n`));

  if (allComments.length === 0) {
    console.log(chalk.yellow('  No review comments found.\n'));
    return;
  }

  process.stdout.write(chalk.dim('  Classifying signals...'));
  const signals = await classifyComments(allComments, gateway);
  process.stdout.write(chalk.dim(` ${signals.length} signals found\n`));

  if (signals.length === 0) {
    console.log(chalk.yellow('\n  No institutional knowledge signals found in these PRs.\n'));
    return;
  }

  // ── Step 3: Cluster ────────────────────────────────────────────────────────

  let clusters = clusterSignals(signals);
  clusters = crossReferenceNodes(clusters, existingNodes);

  console.log(chalk.dim(`  Clusters formed: ${clusters.length}`));
  console.log(chalk.dim(`    ${clusters.filter(c => c.existingNode).length} updates  ${clusters.filter(c => !c.existingNode).length} new nodes\n`));

  // ── Step 4: Propose nodes ──────────────────────────────────────────────────

  const proposals: Array<{ cluster: Cluster; node: AnyNode }> = [];

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    process.stdout.write(chalk.dim(`\r  Proposing node ${i + 1}/${clusters.length}...`));
    const node = await proposeNode(cluster, gateway);
    if (node) proposals.push({ cluster, node });
  }
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
  console.log(chalk.dim(`  Proposals generated: ${proposals.length}\n`));

  if (proposals.length === 0) {
    console.log(chalk.yellow('  No quality proposals generated (confidence bar not met).\n'));
    return;
  }

  // ── Step 5: Auto-apply or interactive ─────────────────────────────────────

  if (options.autoApply && !options.dryRun) {
    let applied = 0;
    for (const { cluster, node } of proposals) {
      if (node.confidence >= 0.85) {
        upsertNode(root, node);
        console.log(chalk.green(`  ✓ Auto-applied: ${node.id} (${Math.round(node.confidence * 100)}%)`));
        applied++;
      } else {
        console.log(chalk.dim(`  Skipped (confidence ${Math.round(node.confidence * 100)}% < 85%): ${node.id}`));
      }
    }
    console.log(chalk.bold(`\n  Applied ${applied}/${proposals.length} proposals.\n`));
    return;
  }

  const { applied, skipped } = await interactiveApply(proposals, root, options.dryRun ?? false);

  console.log(chalk.bold('\n  Summary:'));
  console.log(`  ${chalk.green(String(applied))} applied  ${chalk.dim(String(skipped))} skipped\n`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTypeColor(type: string): (s: string) => string {
  const colors: Record<string, (s: string) => string> = {
    security:    chalk.red,
    constraint:  chalk.yellow,
    danger:      chalk.magenta,
    assumption:  chalk.blue,
    antipattern: chalk.cyan,
    pattern:     chalk.green,
    intent:      chalk.white,
    decision:    chalk.gray,
  };
  return colors[type] ?? chalk.white;
}

function getNodeSummary(node: AnyNode): string {
  switch (node.type) {
    case 'constraint':  return `Statement: ${node.statement}\nBecause:   ${node.because}\nViolated:  ${node.if_violated}`;
    case 'danger':      return `Statement: ${node.statement}\nCondition: ${node.condition}`;
    case 'assumption':  return `Statement: ${node.statement}\nBreaks:    ${node.breaks_when}`;
    case 'pattern':     return `Statement: ${node.statement}\nWhy:       ${node.why}`;
    case 'intent':      return `Purpose:   ${node.purpose}`;
    case 'decision':    return `Statement: ${node.statement}\nReason:    ${node.reason}`;
    case 'security':    return `Statement: ${node.statement}\nViolated:  ${node.if_violated}`;
    case 'antipattern': return `Statement: ${node.statement}\nCorrect:   ${node.correct_pattern}`;
  }
}
