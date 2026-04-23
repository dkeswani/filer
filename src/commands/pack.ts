import path   from 'path';
import fs     from 'fs';
import chalk  from 'chalk';
import ora    from 'ora';
import { execSync } from 'child_process';

import { scanFiles, estimateTokens, type PackedFile } from '../pack/scanner.js';
import { compress }                   from '../pack/compressor.js';
import { annotateFile, buildKnowledgePreamble, type AnnotationDepth } from '../pack/annotator.js';
import { formatOutput, type OutputFormat } from '../pack/formatter.js';
import { selectRelevantFiles, applyTokenBudget } from '../pack/selector.js';
import { buildTree, renderTree }      from '../pack/tree.js';
import { cloneRemote }                from '../pack/remote.js';
import { readConfig, filerExists }    from '../store/mod.js';
import { LLMGateway }                 from '../llm/mod.js';
import { scanForSecrets, formatSecretWarnings } from '../security/secretlint.js';

export interface PackOptions {
  scope?:             string;
  include?:           string;
  ignore?:            string;
  output?:            string;
  format?:            string;
  task?:              string;
  tokens?:            string;
  annotate?:          string | boolean;
  noAnnotate?:        boolean;
  compress?:          boolean;
  removeComments?:    boolean;
  removeEmptyLines?:  boolean;
  lineNumbers?:       boolean;
  sortByChanges?:     boolean;
  includeGitLog?:     boolean;
  includeGitLogCount?: string;
  includeGitDiff?:    boolean;
  remote?:            string;
  branch?:            string;
  split?:             string;
  topFiles?:          string;
  maxFileSize?:       string;
  noGitignore?:       boolean;
  noInstructions?:    boolean;
  instructions?:      string | boolean;
  headerText?:        string;
  stats?:             boolean;
  copy?:              boolean;
  stdout?:            boolean;
  quiet?:             boolean;
  noSecurityCheck?:   boolean;  // --no-security-check: skip secretlint scan
}

export async function packCommand(options: PackOptions): Promise<void> {
  const isTTY  = process.stdout.isTTY;
  const toFile = !!options.output;
  const log    = (options.quiet || (!isTTY && !toFile))
    ? () => {}
    : (msg: string) => process.stderr.write(msg + '\n');

  // ── Remote repo ───────────────────────────────────────────────────────────
  let remoteClone: { root: string; cleanup: () => void } | null = null;
  let root = process.cwd();

  if (options.remote) {
    const spinner = isTTY ? ora('  Cloning remote repo...').start() : null;
    try {
      remoteClone = await cloneRemote(options.remote, options.branch);
      root = remoteClone.root;
      spinner?.succeed(`  Cloned ${options.remote}`);
    } catch (err) {
      spinner?.fail();
      console.error(chalk.red(`\n  Error: ${err instanceof Error ? err.message : String(err)}\n`));
      process.exit(1);
    }
  }

  try {
    await run(root, options, log, isTTY, toFile);
  } finally {
    remoteClone?.cleanup();
  }
}

async function run(
  root:    string,
  options: PackOptions,
  log:     (msg: string) => void,
  isTTY:   boolean,
  toFile:  boolean,
): Promise<void> {

  const format      = (options.format ?? 'markdown') as OutputFormat;
  const annotate    = (options.annotate === false || options.noAnnotate) ? 'none'
    : (typeof options.annotate === 'string' ? options.annotate : 'summary') as AnnotationDepth;
  const tokenBudget = options.tokens ? parseInt(options.tokens, 10) : 0;
  const topFiles    = options.topFiles ? parseInt(options.topFiles, 10) : 5;
  const maxFileSize = options.maxFileSize ? parseInt(options.maxFileSize, 10) : 500;

  const include = options.include ? options.include.split(',').map(s => s.trim()) : ['**/*'];
  const ignore  = options.ignore  ? options.ignore.split(',').map(s => s.trim())  : [];

  if (options.scope) include.length = 0, include.push(`${options.scope}/**`);

  // ── Scan files ────────────────────────────────────────────────────────────
  const scanSpinner = isTTY ? ora('  Scanning files...').start() : null;
  let files = await scanFiles({
    root,
    include,
    ignore,
    useGitignore:  !options.noGitignore,
    maxFileSizeKb: maxFileSize,
    sortByChanges: options.sortByChanges,
  });
  scanSpinner?.succeed(`  Found ${files.length} files`);

  if (files.length === 0) {
    log(chalk.yellow('  No files found matching filters.'));
    return;
  }

  // ── Secret scan (pre-LLM safety check) ───────────────────────────────────
  if (!options.noSecurityCheck) {
    const secSpinner = isTTY ? ora('  Scanning for secrets...').start() : null;
    try {
      const { findings } = await scanForSecrets(
        files.map(f => ({ path: f.path, content: f.content }))
      );
      if (findings.length > 0) {
        secSpinner?.warn(`  ${findings.length} potential secret(s) detected`);
        process.stderr.write(chalk.yellow('\n' + formatSecretWarnings(findings)));
        process.stderr.write(chalk.dim('  Use --no-security-check to suppress. Remove secrets before sharing.\n\n'));
      } else {
        secSpinner?.succeed('  No secrets detected');
      }
    } catch {
      secSpinner?.stop();  // best-effort — never block pack on scan failure
    }
  }

  // ── Task-based selection ──────────────────────────────────────────────────
  if (options.task) {
    const selSpinner = isTTY ? ora(`  Selecting files for task: "${options.task}"...`).start() : null;
    const config = filerExists(root) ? readConfig(root) : null;
    if (config) {
      const gateway = new LLMGateway(config);
      files = await selectRelevantFiles(gateway, files, options.task, tokenBudget);
    } else {
      files = applyTokenBudget(files, tokenBudget);
    }
    selSpinner?.succeed(`  Selected ${files.length} relevant files`);
  } else if (tokenBudget > 0) {
    files = applyTokenBudget(files, tokenBudget);
    log(chalk.dim(`  Applied token budget: ${files.length} files within ${tokenBudget.toLocaleString()} tokens`));
  }

  // ── Compress ──────────────────────────────────────────────────────────────
  if (options.compress || options.removeComments || options.removeEmptyLines) {
    files = files.map(f => ({
      ...f,
      content: compress(f.content, f.path, {
        removeComments:   options.compress || options.removeComments,
        removeEmptyLines: options.compress || options.removeEmptyLines,
      }),
      tokens: estimateTokens(f.content),
    }));
    log(chalk.dim('  Compression applied'));
  }

  // ── Annotate with knowledge nodes ─────────────────────────────────────────
  const hasFiler = filerExists(root);
  if (annotate !== 'none' && hasFiler) {
    const { readAllNodes } = await import('../store/mod.js');
    const allNodes = readAllNodes(root);
    if (allNodes.length === 0) {
      log(chalk.yellow('  ⚠ .filer/ exists but has no nodes — run `filer index` to extract knowledge'));
    } else {
      files = files.map(f => ({
        ...f,
        content: annotateFile(f, allNodes, annotate),
        tokens:  estimateTokens(annotateFile(f, allNodes, annotate)),
      }));
      log(chalk.dim(`  Knowledge annotations added (${annotate})`));
    }
  } else if (annotate !== 'none' && !hasFiler) {
    log(chalk.yellow('  ⚠ No .filer/ found — run `filer index` to add knowledge annotations'));
  }

  const totalTokens = files.reduce((s, f) => s + f.tokens, 0);

  // ── Stats-only mode ───────────────────────────────────────────────────────
  if (options.stats) {
    printStats(files, totalTokens, topFiles);
    return;
  }

  // ── Knowledge preamble ────────────────────────────────────────────────────
  const preamble = (annotate !== 'none' && hasFiler)
    ? buildKnowledgePreamble(root, files)
    : undefined;

  // ── Directory tree ────────────────────────────────────────────────────────
  const treeRoot = buildTree(root, root, { showSize: true, maxDepth: 4 });
  const tree     = renderTree(treeRoot);

  // ── Instructions ─────────────────────────────────────────────────────────
  let instructions: string | undefined;
  if (options.instructions !== false) {
    const instrPath = typeof options.instructions === 'string'
      ? path.resolve(root, options.instructions)
      : path.join(root, 'filer.md');
    if (fs.existsSync(instrPath)) {
      instructions = fs.readFileSync(instrPath, 'utf-8');
    }
  }

  // ── Git log ───────────────────────────────────────────────────────────────
  let gitLog = '';
  if (options.includeGitLog) {
    const count = options.includeGitLogCount ? parseInt(options.includeGitLogCount, 10) : 20;
    try {
      gitLog = execSync(`git log --oneline -n ${count}`, { cwd: root, stdio: 'pipe' }).toString();
    } catch { /* not a git repo */ }
  }

  let gitDiff = '';
  if (options.includeGitDiff) {
    try {
      gitDiff = execSync('git diff HEAD', { cwd: root, stdio: 'pipe', maxBuffer: 1024 * 1024 }).toString();
    } catch { /* not a git repo */ }
  }

  const headerParts = [options.headerText];
  if (gitLog)  headerParts.push('## Recent Commits\n```\n' + gitLog + '\n```');
  if (gitDiff) headerParts.push('## Current Diff\n```diff\n' + gitDiff.slice(0, 8000) + '\n```');
  const headerText = headerParts.filter(Boolean).join('\n\n') || undefined;

  // ── Format ────────────────────────────────────────────────────────────────
  const repoName = path.basename(root);
  const output = formatOutput({
    format,
    files,
    tree,
    preamble,
    instructions,
    headerText,
    showLineNumbers: options.lineNumbers,
    repoName,
    generatedAt:  new Date().toISOString().slice(0, 19).replace('T', ' '),
    totalTokens,
    totalFiles:   files.length,
    topFilesLen:  topFiles,
  });

  // ── Split output ──────────────────────────────────────────────────────────
  const parts = options.split ? splitOutput(output, options.split) : [output];

  // ── Write ─────────────────────────────────────────────────────────────────
  if (options.output) {
    if (parts.length === 1) {
      const abs = path.resolve(process.cwd(), options.output);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, parts[0], 'utf-8');
      log(chalk.green(`\n  Written to ${options.output}`));
    } else {
      const ext  = path.extname(options.output);
      const base = options.output.slice(0, -ext.length);
      parts.forEach((part, i) => {
        const p = `${base}.part${i + 1}${ext}`;
        fs.writeFileSync(path.resolve(process.cwd(), p), part, 'utf-8');
      });
      log(chalk.green(`\n  Written ${parts.length} parts`));
    }
  } else {
    process.stdout.write(parts[0]);
  }

  if (options.copy) {
    try {
      // Dynamic import — clipboardy is optional
      const clipboardy = await import('clipboardy' as string) as any;
      await (clipboardy.default ?? clipboardy).write(parts[0]);
      log(chalk.dim('  Copied to clipboard ✓'));
    } catch {
      log(chalk.yellow('  clipboard copy unavailable (install clipboardy)'));
    }
  }

  if (!options.quiet && (isTTY || toFile)) {
    process.stderr.write(
      chalk.dim(`\n  ${files.length} files · ~${totalTokens.toLocaleString()} tokens`) +
      (hasFiler && annotate !== 'none' ? chalk.dim(' · knowledge annotated') : '') +
      '\n'
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function printStats(files: PackedFile[], totalTokens: number, topN: number): void {
  console.log(chalk.bold('\n  Filer Pack — Stats\n'));
  console.log(`  Files:  ${files.length}`);
  console.log(`  Tokens: ~${totalTokens.toLocaleString()}`);
  console.log();
  console.log(chalk.bold(`  Top ${topN} by token count:`));
  const top = [...files].sort((a, b) => b.tokens - a.tokens).slice(0, topN);
  for (const f of top) {
    console.log(`  ${chalk.cyan(f.path.padEnd(50))} ~${f.tokens.toLocaleString()} tokens`);
  }
  console.log();
}

function splitOutput(content: string, sizeArg: string): string[] {
  const bytes = parseSize(sizeArg);
  if (!bytes) return [content];

  const parts: string[] = [];
  let offset = 0;
  while (offset < content.length) {
    parts.push(content.slice(offset, offset + bytes));
    offset += bytes;
  }
  return parts;
}

function parseSize(s: string): number {
  const match = s.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(kb|mb|b)?$/);
  if (!match) return 0;
  const n = parseFloat(match[1]);
  switch (match[2]) {
    case 'mb': return Math.round(n * 1024 * 1024);
    case 'kb': return Math.round(n * 1024);
    default:   return Math.round(n);
  }
}
