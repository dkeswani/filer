#!/usr/bin/env node
import { Server }           from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { execFile }  from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import path from 'path';

const exec    = promisify(execFile);
const require = createRequire(import.meta.url);
const filerCli = path.join(path.dirname(require.resolve('@filer/cli/package.json')), 'dist', 'cli.js');

const server = new Server(
  { name: 'filer', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

// ── Tool definitions ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'pack',
      description: 'Pack a GitHub repository into AI-ready context (markdown, xml, json, or plain). Returns the packed output and stats.',
      inputSchema: {
        type: 'object',
        properties: {
          repo: {
            type: 'string',
            description: 'GitHub repo URL or owner/repo shorthand (e.g. "expressjs/express")',
          },
          format: {
            type: 'string',
            enum: ['markdown', 'xml', 'json', 'plain'],
            description: 'Output format (default: markdown)',
          },
          remove_comments: { type: 'boolean', description: 'Strip comments from source files' },
          remove_empty_lines: { type: 'boolean', description: 'Strip empty lines' },
          line_numbers: { type: 'boolean', description: 'Prefix each line with its line number' },
          no_file_summary: { type: 'boolean', description: 'Omit the file summary section' },
          no_directory_structure: { type: 'boolean', description: 'Omit the directory tree section' },
          top_files: { type: 'number', description: 'Show N largest files in summary' },
          scope: { type: 'string', description: 'Limit to a subdirectory (e.g. "src/")' },
          include: { type: 'string', description: 'Include glob pattern (e.g. "**/*.ts")' },
          ignore: { type: 'string', description: 'Ignore glob pattern (e.g. "**/*.test.ts")' },
          branch: { type: 'string', description: 'Branch, tag, or commit to pack' },
        },
        required: ['repo'],
      },
    },
    {
      name: 'secrets',
      description: 'Scan a GitHub repository for hardcoded secrets and credentials using static analysis. Returns findings grouped by file.',
      inputSchema: {
        type: 'object',
        properties: {
          repo: {
            type: 'string',
            description: 'GitHub repo URL or owner/repo shorthand',
          },
          scope: {
            type: 'string',
            description: 'Limit scan to a subdirectory (e.g. "src/")',
          },
        },
        required: ['repo'],
      },
    },
  ],
}));

// ── Tool handlers ─────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === 'pack') {
    return await handlePack(args as unknown as PackArgs);
  }
  if (name === 'secrets') {
    return await handleSecrets(args as unknown as SecretsArgs);
  }
  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
});

// ── Pack ──────────────────────────────────────────────────────────────────────

interface PackArgs {
  repo: string;
  format?: string;
  remove_comments?: boolean;
  remove_empty_lines?: boolean;
  line_numbers?: boolean;
  no_file_summary?: boolean;
  no_directory_structure?: boolean;
  top_files?: number;
  scope?: string;
  include?: string;
  ignore?: string;
  branch?: string;
}

async function handlePack(args: PackArgs) {
  const remote = normaliseRepo(args.repo);
  const cliArgs: string[] = [
    filerCli, 'pack',
    '--remote', remote,
    '--format', args.format ?? 'markdown',
    '--quiet', '--no-security-check',
  ];

  if (args.remove_comments)       cliArgs.push('--remove-comments');
  if (args.remove_empty_lines)    cliArgs.push('--remove-empty-lines');
  if (args.line_numbers)          cliArgs.push('--line-numbers');
  if (args.no_file_summary)       cliArgs.push('--no-file-summary');
  if (args.no_directory_structure) cliArgs.push('--no-directory-structure');
  if (args.top_files)             cliArgs.push('--top-files', String(args.top_files));
  if (args.scope)                 cliArgs.push('--scope', args.scope);
  if (args.include)               cliArgs.push('--include', args.include);
  if (args.ignore)                cliArgs.push('--ignore', args.ignore);
  if (args.branch)                cliArgs.push('--branch', args.branch);

  try {
    const { stdout } = await exec(process.execPath, cliArgs, {
      timeout:   120_000,
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: '1' },
    });

    const fileMatch  = stdout.match(/·\s*(\d+)\s+files?/);
    const tokenMatch = stdout.match(/~([\d,]+)\s+tokens?/);
    const fileCount  = fileMatch  ? parseInt(fileMatch[1])                    : '?';
    const tokenCount = tokenMatch ? tokenMatch[1] : '?';

    return {
      content: [{
        type:  'text',
        text:  `<!-- filer pack: ${fileCount} files, ~${tokenCount} tokens -->\n\n${stdout}`,
      }],
    };
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    return { content: [{ type: 'text', text: `Error: ${e.stderr ?? e.message}` }], isError: true };
  }
}

// ── Secrets ───────────────────────────────────────────────────────────────────

interface SecretsArgs {
  repo: string;
  scope?: string;
}

async function handleSecrets(args: SecretsArgs) {
  const remote = normaliseRepo(args.repo);
  const cliArgs: string[] = [filerCli, 'secrets', '--remote', remote, '--quiet'];
  if (args.scope) cliArgs.push('--scope', args.scope);

  try {
    const { stdout } = await exec(process.execPath, cliArgs, {
      timeout:   120_000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: '1' },
    });
    return { content: [{ type: 'text', text: stdout || 'No secrets detected.' }] };
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    return { content: [{ type: 'text', text: `Error: ${e.stderr ?? e.message}` }], isError: true };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseRepo(repo: string): string {
  if (repo.startsWith('https://')) return repo;
  // owner/repo shorthand → full URL
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) {
    return `https://github.com/${repo}`;
  }
  return repo;
}

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
