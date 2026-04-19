import chalk from 'chalk';
import { execSync } from 'child_process';
import { filerExists, readAllNodes } from '../store/mod.js';
import type { AnyNode } from '../schema/mod.js';

interface MeasureOptions {
  since?:       string;
  before?:      string;
  beforeAfter?: string;
  pr?:          string;
}

// ── GitHub API types ──────────────────────────────────────────────────────────

interface GHPull {
  number:     number;
  title:      string;
  user:       { login: string };
  merged_at:  string | null;
  commits:    number;
  html_url:   string;
}

interface GHComment {
  id:       number;
  body:     string;
  path:     string | null;
  user:     { login: string };
  created_at: string;
}

interface GHDiff {
  filename: string;
  patch?:   string;
}

// ── GitHub fetch helper ───────────────────────────────────────────────────────

async function ghFetch(path: string, token: string): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${path}`);
  return res.json();
}

async function fetchPRs(owner: string, repo: string, token: string, opts: {
  since?: string; before?: string; prNumber?: number;
}): Promise<GHPull[]> {
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
      const mergedAt = new Date(pr.merged_at);
      if (opts.since  && mergedAt < new Date(opts.since))  { page = 999; break; }
      if (opts.before && mergedAt > new Date(opts.before)) continue;
      pulls.push(pr);
    }
    if (batch.length < 50) break;
    page++;
  }
  return pulls;
}

async function fetchPRComments(owner: string, repo: string, prNumber: number, token: string): Promise<GHComment[]> {
  const [review, inline] = await Promise.all([
    ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/comments`, token),
    ghFetch(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, token),
  ]);
  return [...(review as GHComment[]), ...(inline as GHComment[])];
}

async function fetchPRDiff(owner: string, repo: string, prNumber: number, token: string): Promise<GHDiff[]> {
  return ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/files`, token) as Promise<GHDiff[]>;
}

// ── Metrics ───────────────────────────────────────────────────────────────────

function detectRepoInfo(root: string): { owner: string; repo: string } | null {
  try {
    const remote = execSync('git remote get-url origin', { cwd: root, stdio: 'pipe' }).toString().trim();
    const match  = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (match) return { owner: match[1], repo: match[2] };
  } catch {}
  return null;
}

function classifyReviewComment(body: string): 'convention' | 'constraint' | 'logic' | 'style' {
  const lower = body.toLowerCase();
  if (/security|auth|pii|token|encrypt|vulnerab|inject/i.test(body)) return 'constraint';
  if (/bug|incorrect|wrong|broken|null|undefined|crash|fail|throw/i.test(body)) return 'logic';
  if (/nit|style|format|naming|indent|whitespace|prefer|please use/i.test(body)) return 'style';
  return 'convention';
}

function checkDiffAgainstNodes(diff: string, nodes: AnyNode[]): number {
  let violations = 0;
  const diffLower = diff.toLowerCase();
  for (const node of nodes) {
    if (node.type !== 'constraint' && node.type !== 'security' && node.type !== 'antipattern') continue;
    for (const pattern of (node.must_not ?? [])) {
      if (diffLower.includes(pattern.toLowerCase())) violations++;
    }
  }
  return violations;
}

// ── Main command ──────────────────────────────────────────────────────────────

export async function measureCommand(options: MeasureOptions): Promise<void> {
  const root = process.cwd();

  if (!filerExists(root)) {
    console.error(chalk.red('\n  No .filer/ directory found. Run: filer init\n'));
    process.exit(1);
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error(chalk.red('\n  GITHUB_TOKEN env var is required.\n'));
    process.exit(1);
  }

  const repoInfo = detectRepoInfo(root);
  if (!repoInfo) {
    console.error(chalk.red('\n  Could not detect GitHub repo from git remote. Ensure origin points to github.com.\n'));
    process.exit(1);
  }

  const { owner, repo } = repoInfo;
  const nodes = readAllNodes(root);

  // Resolve --before-after: split into two windows around the date
  let since  = options.since;
  let before = options.before;
  const pivotDate = options.beforeAfter;

  console.log(chalk.bold('\n  Filer Measure\n'));
  console.log(chalk.dim(`  Repo:  ${owner}/${repo}`));
  if (pivotDate) console.log(chalk.dim(`  Pivot: ${pivotDate} (before vs. after)`));
  else if (since || before) console.log(chalk.dim(`  Range: ${since ?? '(start)'} → ${before ?? '(now)'}`));
  console.log(chalk.dim(`  Nodes: ${nodes.length}`));
  console.log();

  process.stdout.write(chalk.dim('  Fetching PRs...'));

  const prNumber = options.pr ? parseInt(options.pr, 10) : undefined;
  const prs = await fetchPRs(owner, repo, token, { since, before, prNumber });

  process.stdout.write(chalk.dim(` ${prs.length} found\n\n`));

  if (prs.length === 0) {
    console.log(chalk.yellow('  No merged PRs found for the given range.\n'));
    return;
  }

  // ── Gather metrics across all PRs ─────────────────────────────────────────

  let totalCommits      = 0;
  let violatingPRs      = 0;
  const commentTypes    = { convention: 0, constraint: 0, logic: 0, style: 0 };
  const authorIterations: Record<string, number[]> = {};

  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i];
    process.stdout.write(chalk.dim(`\r  Analysing PR #${pr.number} (${i + 1}/${prs.length})...`));

    // Commits (iteration count)
    totalCommits += pr.commits;
    const author = pr.user.login;
    if (!authorIterations[author]) authorIterations[author] = [];
    authorIterations[author].push(pr.commits);

    // Parallel: diff + comments
    const [diff, comments] = await Promise.all([
      fetchPRDiff(owner, repo, pr.number, token),
      fetchPRComments(owner, repo, pr.number, token),
    ]);

    // Constraint violation rate
    const fullDiff = diff.map(f => f.patch ?? '').join('\n');
    if (nodes.length > 0 && checkDiffAgainstNodes(fullDiff, nodes) > 0) {
      violatingPRs++;
    }

    // Review comment classification
    for (const comment of comments) {
      const category = classifyReviewComment(comment.body);
      commentTypes[category]++;
    }
  }

  process.stdout.write('\r' + ' '.repeat(60) + '\r');

  // ── Print results ──────────────────────────────────────────────────────────

  const violationRate  = prs.length > 0 ? Math.round((violatingPRs / prs.length) * 100) : 0;
  const avgIterations  = prs.length > 0 ? (totalCommits / prs.length).toFixed(1) : '0';
  const totalComments  = Object.values(commentTypes).reduce((a, b) => a + b, 0);

  console.log(chalk.bold('  Results\n'));
  console.log(chalk.bold('  PRs analysed:           ') + prs.length);

  console.log('\n  ' + chalk.bold('Constraint Violation Rate'));
  const violationBar = progressBar(violationRate, 20);
  console.log(`  ${violationBar} ${chalk.bold(`${violationRate}%`)} of PRs touched a must_not pattern`);
  console.log(chalk.dim(`  (${violatingPRs}/${prs.length} PRs)\n`));

  console.log('  ' + chalk.bold('PR Iteration Count'));
  console.log(`  Avg commits per PR: ${chalk.bold(avgIterations)}`);
  const topAuthors = Object.entries(authorIterations)
    .sort((a, b) => avg(b[1]) - avg(a[1]))
    .slice(0, 5);
  if (topAuthors.length > 0) {
    console.log(chalk.dim('  Top authors by avg commits/PR:'));
    for (const [author, counts] of topAuthors) {
      console.log(`    ${chalk.cyan(author.padEnd(20))} ${avg(counts).toFixed(1)} avg (${counts.length} PRs)`);
    }
  }

  console.log('\n  ' + chalk.bold('Review Comment Distribution'));
  if (totalComments === 0) {
    console.log(chalk.dim('  No review comments found.'));
  } else {
    for (const [type, count] of Object.entries(commentTypes)) {
      const pct = Math.round((count / totalComments) * 100);
      const bar = progressBar(pct, 15);
      console.log(`  ${type.padEnd(12)} ${bar} ${String(pct).padStart(3)}%  (${count})`);
    }
  }

  // --before-after comparison
  if (pivotDate) {
    console.log('\n  ' + chalk.bold('Before/After Analysis'));
    const pivot = new Date(pivotDate);
    const beforePRs = prs.filter(p => new Date(p.merged_at!) < pivot);
    const afterPRs  = prs.filter(p => new Date(p.merged_at!) >= pivot);
    const beforeAvg = beforePRs.length > 0 ? avg(beforePRs.map(p => p.commits)) : 0;
    const afterAvg  = afterPRs.length  > 0 ? avg(afterPRs.map(p => p.commits))  : 0;
    const delta = afterAvg - beforeAvg;
    const sign  = delta > 0 ? chalk.red(`+${delta.toFixed(1)}`) : chalk.green(delta.toFixed(1));
    console.log(`  Before ${pivotDate}: ${beforeAvg.toFixed(1)} avg commits/PR (${beforePRs.length} PRs)`);
    console.log(`  After  ${pivotDate}: ${afterAvg.toFixed(1)} avg commits/PR (${afterPRs.length} PRs)`);
    console.log(`  Change: ${sign} commits/PR`);
  }

  console.log();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function progressBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width);
  const empty  = width - filled;
  return chalk.cyan('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
}

function avg(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
}
