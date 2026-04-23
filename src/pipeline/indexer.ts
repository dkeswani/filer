import chalk from 'chalk';
import ora   from 'ora';
import pLimit from 'p-limit';
import {
  scanFiles,
  groupIntoModules,
  getChangedFiles,
  getCurrentCommit,
  type Module,
} from './scanner.js';
import { extractNodes, estimateModuleTokens } from './extractor.js';
import {
  ensureFilerDirs,
  upsertNode,
  writeIndex,
  buildIndex,
  readAllNodes,
  readConfig,
} from '../store/mod.js';
import { LLMGateway }    from '../llm/mod.js';
import type { AnyNode }  from '../schema/mod.js';
import { checkStaleness } from './staleness.js';

export interface IndexOptions {
  root:         string;
  scope?:       string;      // limit to a subdirectory
  force?:       boolean;     // re-index already-indexed files
  dryRun?:      boolean;
  silent?:      boolean;
  changedOnly?: string[];    // for incremental updates — only these file paths
  concurrency?: number;      // parallel module processing (default: 1)
  fast?:        boolean;     // use indexing_model for all tasks (faster + cheaper)
}

export interface IndexResult {
  modules_processed:  number;
  nodes_created:      number;
  nodes_updated:      number;
  nodes_rejected:     number;
  files_indexed:      number;
  estimated_usd:      number;
  errors:             string[];
}

// ── Full index pipeline ───────────────────────────────────────────────────────

export async function runIndex(opts: IndexOptions): Promise<IndexResult> {
  const { root, silent } = opts;
  const log = silent ? () => {} : console.log.bind(console);

  const config = readConfig(root);
  if (!config) {
    throw new Error('No .filer-config.json found. Run: filer init');
  }

  ensureFilerDirs(root);

  // Scan files
  const scanSpinner = silent ? null : ora('  Scanning source files...').start();
  let files = await scanFiles(root, config);

  // Filter to scope if specified
  if (opts.scope) {
    files = files.filter(f => f.path.startsWith(opts.scope!));
  }

  // Filter to changed files only if incremental
  if (opts.changedOnly && opts.changedOnly.length > 0) {
    const changed = new Set(opts.changedOnly);
    files = files.filter(f => changed.has(f.path));
  }

  scanSpinner?.succeed(`  Found ${files.length} source files`);

  if (files.length === 0) {
    log(chalk.yellow('\n  No source files found matching include patterns.\n'));
    return { modules_processed: 0, nodes_created: 0, nodes_updated: 0, nodes_rejected: 0, files_indexed: 0, estimated_usd: 0, errors: [] };
  }

  // Group into modules
  const modules = groupIntoModules(files, config);
  log(chalk.dim(`  Grouped into ${modules.length} modules`));

  // Cost estimate
  const totalTokens   = modules.reduce((s, m) => s + m.tokens, 0);
  const gateway       = new LLMGateway(config);
  const estimatedCost = totalTokens / 1000 * 0.003; // rough estimate

  if (!opts.silent) {
    log(chalk.dim(`  Estimated tokens: ~${totalTokens.toLocaleString()}`));
    log(chalk.dim(`  Estimated cost:   ~$${estimatedCost.toFixed(3)}`));
  }

  if (opts.dryRun) {
    log(chalk.yellow('\n  Dry run — no changes written.\n'));
    printModuleList(modules, log);
    return { modules_processed: 0, nodes_created: 0, nodes_updated: 0, nodes_rejected: 0, files_indexed: files.length, estimated_usd: estimatedCost, errors: [] };
  }

  // Process each module
  const result: IndexResult = {
    modules_processed: 0,
    nodes_created:     0,
    nodes_updated:     0,
    nodes_rejected:    0,
    files_indexed:     files.length,
    estimated_usd:     0,
    errors:            [],
  };

  const existingNodes = readAllNodes(root);

  // Build a lookup: module path → newest node updated_at (ms)
  // Uses the same scope-matching logic as existingIds to correctly associate nodes with modules
  const moduleIndexedAt = new Map<string, number>();
  for (const node of existingNodes) {
    const t = new Date(node.updated_at).getTime();
    // A node belongs to a module if any scope overlaps with the module path
    // We defer this per-module below, so just track per-scope for now
    for (const s of node.scope) {
      const clean = s.replace(/\/\*\*$/, '').replace(/\/\*$/, '').replace(/\/$/, '');
      const prev = moduleIndexedAt.get(clean) ?? 0;
      if (t > prev) moduleIndexedAt.set(clean, t);
    }
  }

  // Helper: get the newest indexed_at for a module based on scope overlap
  const getModuleIndexedAt = (mod: Module): number => {
    let newest = 0;
    const modClean = mod.path.replace(/\/\*\*$/, '').replace(/\/\*$/, '').replace(/\/$/, '');
    const modFiles = new Set(mod.files.map(f => f.path.replace(/\\/g, '/')));
    for (const [scope, t] of moduleIndexedAt) {
      const matches = modClean && modClean !== '.'
        ? (modClean.startsWith(scope) || scope.startsWith(modClean) || scope === modClean)
        : (modFiles.has(scope) || [...modFiles].some(f => f.startsWith(scope)));
      if (matches && t > newest) newest = t;
    }
    return newest;
  };

  // If --fast, patch gateway to route all tasks through indexing_model
  if (opts.fast) {
    const orig = (gateway as any).modelForTask.bind(gateway);
    (gateway as any).modelForTask = () => config.llm.indexing_model;
  }

  const concurrency = Math.max(1, Math.min(10, opts.concurrency ?? 1));
  const limit       = pLimit(concurrency);
  const isParallel  = concurrency > 1;

  // Shared progress state for parallel mode
  let completed = 0;
  const sharedSpinner = (!silent && isParallel)
    ? ora(`  Indexing modules... (0/${modules.length})`).start()
    : null;

  const processModule = async (mod: Module, i: number): Promise<void> => {
    const spinner = (!silent && !isParallel)
      ? ora(`  [${i + 1}/${modules.length}] ${mod.name}`).start()
      : null;

    try {
      const modFiles = new Set(mod.files.map(f => f.path.replace(/\\/g, '/')));
      const existingIds = existingNodes
        .filter(n => n.scope.some(s => {
          const sClean = s.replace(/\/\*\*$/, '').replace(/\/\*$/, '').replace(/\/$/, '');
          const mClean = mod.path.replace(/\/\*\*$/, '').replace(/\/\*$/, '').replace(/\/$/, '');
          // Direct path overlap
          if (mClean && (mClean.startsWith(sClean) || sClean.startsWith(mClean))) return true;
          // Root module (path='.') — match by file membership
          if (!mClean || mClean === '.') return modFiles.has(s) || [...modFiles].some(f => f.startsWith(sClean));
          return false;
        }))
        .map(n => n.id);

      // Skip module if already indexed and no file has been modified since
      if (!opts.force && existingIds.length > 0) {
        const indexedAt = getModuleIndexedAt(mod);
        const newestFile = Math.max(...mod.files.map(f => f.mtimeMs));
        if (newestFile <= indexedAt) {
          completed++;
          if (isParallel) sharedSpinner!.text = `  Indexing modules... (${completed}/${modules.length})`;
          else spinner?.succeed(`  [${i + 1}/${modules.length}] ${mod.name} — skipped (up to date)`);
          return;
        }
      }

      const extraction = await extractNodes(gateway, {
        modulePath:  mod.path,
        files:       mod.files.map(f => ({ path: f.path, content: f.content })),
        repoName:    config.version,
        existingIds: opts.force ? [] : existingIds,
      });

      result.nodes_rejected  += extraction.rejected.length;
      result.estimated_usd   += extraction.estimated_usd;

      for (const node of extraction.nodes) {
        const typeConfig = (config.node_types as any)?.[node.type];
        const minConf    = typeConfig?.min_confidence ?? 0.75;
        if (node.confidence < minConf) {
          result.nodes_rejected++;
          continue;
        }
        const { created } = upsertNode(root, node);
        if (created) result.nodes_created++;
        else         result.nodes_updated++;
      }

      result.modules_processed++;
      completed++;

      if (isParallel) {
        sharedSpinner!.text = `  Indexing modules... (${completed}/${modules.length})`;
      } else {
        spinner?.succeed(`  [${i + 1}/${modules.length}] ${mod.name} — ${extraction.nodes.length} nodes`);
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      completed++;
      if (isParallel) {
        sharedSpinner!.text = `  Indexing modules... (${completed}/${modules.length})`;
        if (!silent) process.stderr.write(chalk.red(`\n  ✗ ${mod.name} — ${msg}\n`));
      } else {
        spinner?.fail(`  [${i + 1}/${modules.length}] ${mod.name} — error: ${msg}`);
      }
      result.errors.push(`${mod.name}: ${msg}`);
    }
  };

  await Promise.all(modules.map((mod, i) => limit(() => processModule(mod, i))));

  if (isParallel) {
    sharedSpinner?.succeed(`  Indexed ${completed}/${modules.length} modules`);
  }

  // Rebuild index
  const commit = getCurrentCommit(root);
  const index  = buildIndex(root, {
    repo:          root.split('/').pop() ?? 'repo',
    llm:           config.llm.model,
    last_commit:   commit,
    files_indexed: files.length,
  });
  writeIndex(root, index);

  return result;
}

// ── Incremental update pipeline ───────────────────────────────────────────────

export async function runUpdate(root: string, opts: { silent?: boolean; checkStale?: boolean } = {}): Promise<IndexResult> {
  const changed = getChangedFiles(root);

  if (changed.length === 0) {
    if (!opts.silent) console.log(chalk.dim('  No changed files since last commit.'));

    // Still run staleness check even with no changed files if requested
    if (opts.checkStale) {
      await runStalenessCheck(root, opts.silent);
    }

    return { modules_processed: 0, nodes_created: 0, nodes_updated: 0, nodes_rejected: 0, files_indexed: 0, estimated_usd: 0, errors: [] };
  }

  if (!opts.silent) {
    console.log(chalk.dim(`  ${changed.length} changed file(s) — running incremental update`));
  }

  const result = await runIndex({ root, changedOnly: changed, silent: opts.silent });

  if (opts.checkStale) {
    await runStalenessCheck(root, opts.silent);
  }

  return result;
}

async function runStalenessCheck(root: string, silent?: boolean): Promise<void> {
  const config = readConfig(root);
  if (!config) return;

  const allNodes = readAllNodes(root);
  const gateway  = new LLMGateway(config);

  const staleResult = await checkStaleness(gateway, root, allNodes, {
    threshold: config.stale_threshold,
    silent,
  });

  if (!silent && staleResult.checked > 0) {
    console.log(chalk.dim(
      `  Staleness: checked ${staleResult.checked}, invalidated ${staleResult.invalidated}` +
      (staleResult.cost_usd > 0 ? ` (~$${staleResult.cost_usd.toFixed(4)})` : '')
    ));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function printModuleList(modules: Module[], log: (...args: unknown[]) => void): void {
  log('\n  Modules that would be indexed:\n');
  for (const mod of modules) {
    log(`  ${chalk.cyan(mod.path.padEnd(40))} ${mod.files.length} files  ~${mod.tokens.toLocaleString()} tokens`);
  }
  log();
}
