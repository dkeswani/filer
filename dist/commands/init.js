import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import { ensureFilerDirs, writeConfig, filerExists, writeIndex, } from '../store/mod.js';
import { FILER_VERSION } from '../schema/mod.js';
export async function initCommand(options) {
    const root = process.cwd();
    const repoName = path.basename(root);
    console.log(chalk.bold('\n  filer — the knowledge layer for codebases\n'));
    // Guard against re-init
    if (filerExists(root) && !options.force) {
        console.log(chalk.yellow('  .filer/ already exists in this directory.'));
        console.log(chalk.dim('  Run with --force to reinitialize.\n'));
        return;
    }
    const provider = (options.provider ?? 'anthropic');
    // Validate provider
    if (!['anthropic', 'openai', 'ollama'].includes(provider)) {
        console.error(chalk.red(`  Unknown provider: ${provider}`));
        console.error(chalk.dim('  Supported: anthropic, openai, ollama\n'));
        process.exit(1);
    }
    // Derive model defaults per provider
    const modelDefaults = {
        anthropic: {
            model: 'claude-sonnet-4-6',
            indexing: 'claude-haiku-4-5-20251001',
            deep: 'claude-sonnet-4-6',
        },
        openai: {
            model: 'gpt-4o',
            indexing: 'gpt-4o-mini',
            deep: 'gpt-4o',
        },
        ollama: {
            model: options.model ?? 'llama3.3',
            indexing: options.model ?? 'llama3.3',
            deep: options.model ?? 'llama3.3',
        },
    };
    const defaults = modelDefaults[provider];
    const model = options.model ?? defaults.model;
    // Detect current git commit
    let lastCommit;
    try {
        lastCommit = execSync('git rev-parse --short HEAD', { cwd: root, stdio: 'pipe' })
            .toString().trim();
    }
    catch {
        // Not a git repo or no commits yet — that's fine
    }
    const spinner = ora('  Creating .filer/ directory structure...').start();
    // Create directories
    ensureFilerDirs(root);
    spinner.succeed('  Created .filer/ directory structure');
    // Write config
    const config = {
        version: '1.0',
        llm: {
            provider,
            model,
            indexing_model: defaults.indexing,
            deep_model: defaults.deep,
            ...(provider === 'ollama' ? { base_url: 'http://localhost:11434' } : {}),
        },
        include: detectIncludePaths(root),
        exclude: [
            '**/*.test.ts', '**/*.test.js',
            '**/*.spec.ts', '**/*.spec.js',
            '**/node_modules/**', '**/dist/**',
            '**/build/**', '**/__generated__/**',
            '**/.filer/**',
        ],
        module_boundaries: {
            strategy: 'directory',
            max_depth: 3,
            manifests: ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml'],
        },
        node_types: {},
        auto_update: true,
        stale_threshold: 0.7,
    };
    writeConfig(root, config);
    console.log(chalk.green('  ✓') + chalk.dim('  Wrote .filer/.filer-config.json'));
    // Write empty index
    writeIndex(root, {
        filer_version: FILER_VERSION,
        repo: repoName,
        indexed_at: new Date().toISOString(),
        last_commit: lastCommit,
        llm: model,
        stats: {
            files_indexed: 0,
            nodes_total: 0,
            by_type: {
                intent: 0, constraint: 0, assumption: 0, danger: 0,
                pattern: 0, decision: 0, security: 0, antipattern: 0,
            },
            coverage_pct: 0,
            verified_pct: 0,
            stale_count: 0,
        },
        nodes: [],
    });
    console.log(chalk.green('  ✓') + chalk.dim('  Wrote .filer/index.json'));
    // Write filer.md agent instructions
    writeFilerMd(root);
    console.log(chalk.green('  ✓') + chalk.dim('  Wrote filer.md (agent instructions)'));
    // Install git hook
    if (!options.noHook) {
        const hookInstalled = installGitHook(root);
        if (hookInstalled) {
            console.log(chalk.green('  ✓') + chalk.dim('  Installed git post-commit hook'));
        }
        else {
            console.log(chalk.yellow('  ⚠') + chalk.dim('  Skipped git hook (not a git repo)'));
        }
    }
    // Add .filer to .gitignore exceptions
    updateGitignore(root);
    // Print next steps
    console.log('\n  ' + chalk.bold('Ready. Next step:'));
    console.log('\n  ' + chalk.cyan(`filer index`) + chalk.dim('  — build the knowledge layer from your codebase'));
    console.log('  ' + chalk.dim(`This will analyze your code and extract constraints, patterns,`));
    console.log('  ' + chalk.dim(`dangers, security rules, and more into .filer/\n`));
    if (provider === 'anthropic') {
        if (!process.env.ANTHROPIC_API_KEY) {
            console.log('  ' + chalk.yellow('⚠  ANTHROPIC_API_KEY not set.'));
            console.log('  ' + chalk.dim('   Export it before running filer index:\n'));
            console.log('  ' + chalk.cyan('   export ANTHROPIC_API_KEY=sk-ant-...\n'));
        }
    }
    else if (provider === 'openai') {
        if (!process.env.OPENAI_API_KEY) {
            console.log('  ' + chalk.yellow('⚠  OPENAI_API_KEY not set.'));
            console.log('  ' + chalk.dim('   Export it before running filer index.\n'));
        }
    }
    else if (provider === 'ollama') {
        console.log('  ' + chalk.dim('   Using Ollama at http://localhost:11434'));
        console.log('  ' + chalk.dim(`   Make sure ${model} is pulled: ollama pull ${model}\n`));
    }
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function detectIncludePaths(root) {
    const candidates = ['src', 'lib', 'app', 'packages', 'server', 'client', 'api'];
    const found = candidates.filter(d => fs.existsSync(path.join(root, d)));
    return found.length > 0 ? found.map(d => `${d}/**`) : ['**/*.ts', '**/*.js', '**/*.py', '**/*.go'];
}
function installGitHook(root) {
    const hooksDir = path.join(root, '.git', 'hooks');
    if (!fs.existsSync(hooksDir))
        return false;
    const hookPath = path.join(hooksDir, 'post-commit');
    const hookContent = `#!/bin/sh
# Filer: update knowledge nodes after each commit
if command -v filer >/dev/null 2>&1; then
  filer update --silent
fi
`;
    fs.writeFileSync(hookPath, hookContent, { mode: 0o755 });
    return true;
}
function updateGitignore(root) {
    const gitignorePath = path.join(root, '.gitignore');
    const marker = '# filer — knowledge layer (commit this directory)';
    const entry = '.filer/.filer-config.json.bak';
    if (!fs.existsSync(gitignorePath))
        return;
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (content.includes(marker))
        return; // already done
    // Note: .filer/ itself should be committed — only add patterns for generated artifacts
    fs.appendFileSync(gitignorePath, `\n${marker}\n${entry}\n`);
}
function writeFilerMd(root) {
    const content = `# Filer Knowledge Layer

This repository uses [Filer](https://github.com/dkeswani/filer) to maintain a structured
knowledge layer for AI agents. The \`.filer/\` directory contains extracted knowledge about
this codebase — constraints, patterns, dangers, security rules, and decisions.

## For AI Agents

Before writing any code in this repository:

1. Read \`.filer/index.json\` to orient yourself — it lists all knowledge nodes with scope and summary
2. For files you will touch, filter nodes where \`scope\` matches your working paths
3. Load **ALL** \`security\` nodes in scope — these are absolute rules, never violate them
4. Load **ALL** \`constraint\` nodes in scope — these are hard architectural boundaries
5. Load \`danger\` nodes — these are known failure modes in this codebase
6. Load \`assumption\` nodes for modules you will call or import from
7. Load \`pattern\` nodes to understand the local coding dialect
8. Load \`antipattern\` nodes — these are approaches that look right but are wrong here

## Node Priority

| Priority | Type | Description |
|----------|------|-------------|
| CRITICAL | \`security\` | Never violate — regulatory, auth, data exposure rules |
| CRITICAL | \`constraint\` | Hard architectural boundaries enforced by convention |
| HIGH | \`danger\` | Known non-obvious failure modes |
| HIGH | \`assumption\` | Implicit dependencies that are not in the type system |
| HIGH | \`antipattern\` | Approaches that look correct but are wrong here |
| MEDIUM | \`pattern\` | The local dialect — how this codebase does things |
| MEDIUM | \`intent\` | What modules own and explicitly do not own |
| LOWER | \`decision\` | Why non-obvious choices were made |

## Rules for Agents

- **Never violate a \`security\` node** without stopping and explaining to the developer
- **Never violate a \`constraint\` node** without explicit justification
- **Always follow \`pattern\` nodes** — deviations require a stated reason
- If a node seems wrong or outdated, note it but do not ignore it
- Unverified nodes (\`verified: false\`) are LLM hypotheses — treat with appropriate skepticism

## Updating Filer

\`\`\`bash
filer update    # incremental update from last commit
filer verify    # human verification workflow
filer stats     # coverage and freshness report
\`\`\`
`;
    fs.writeFileSync(path.join(root, 'filer.md'), content, 'utf-8');
}
//# sourceMappingURL=init.js.map