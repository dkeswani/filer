import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  readIndex,
  readAllNodes,
  readNode,
  readConfig,
  loadNodesForScope,
  filerExists,
} from '../store/mod.js';
import { LLMGateway } from '../llm/mod.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { AnyNode } from '../schema/mod.js';
import { readBundle, applyDecisions, ApplyDecision } from '../review/bundle.js';
import { scanFiles, estimateTokens } from '../pack/scanner.js';
import { annotateFile, buildKnowledgePreamble } from '../pack/annotator.js';
import { formatOutput } from '../pack/formatter.js';
import { selectRelevantFiles, applyTokenBudget } from '../pack/selector.js';
import { compress } from '../pack/compressor.js';
import { buildTree, renderTree } from '../pack/tree.js';

// ── Keyword relevance scoring (mirrors query command logic) ───────────────────

function scoreNodes(nodes: AnyNode[], question: string): AnyNode[] {
  const terms = question.toLowerCase().split(/\W+/).filter(t => t.length > 2);
  if (terms.length === 0) return nodes;

  const scored = nodes.map(node => {
    const text = JSON.stringify(node).toLowerCase();
    const score = terms.reduce((acc, t) => acc + (text.includes(t) ? 1 : 0), 0);
    return { node, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.node);
}

// ── filer_check: match code against constraints/patterns for a scope ──────────

function checkCode(nodes: AnyNode[], code: string): Array<{ id: string; type: string; violation: string }> {
  const violations: Array<{ id: string; type: string; violation: string }> = [];
  const codeLower = code.toLowerCase();

  for (const node of nodes) {
    if (node.type !== 'constraint' && node.type !== 'security' && node.type !== 'antipattern') continue;

    const mustNot: string[] = node.must_not ?? [];
    for (const pattern of mustNot) {
      if (codeLower.includes(pattern.toLowerCase())) {
        violations.push({
          id: node.id,
          type: node.type,
          violation: `Code matches forbidden pattern "${pattern}" from node ${node.id}`,
        });
      }
    }
  }

  return violations;
}

// ── MCP Server ────────────────────────────────────────────────────────────────

export async function startMcpServer(): Promise<void> {
  const root = process.cwd();
  const server = new Server(
    { name: 'filer', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'filer_scope',
        description: 'Load all knowledge nodes relevant to the given file paths, priority-sorted (security first).',
        inputSchema: {
          type: 'object',
          properties: {
            paths: { type: 'array', items: { type: 'string' }, description: 'File paths to scope' },
          },
          required: ['paths'],
        },
      },
      {
        name: 'filer_query',
        description: 'Keyword-match knowledge nodes relevant to a question and return as a structured list.',
        inputSchema: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'Natural language question' },
          },
          required: ['question'],
        },
      },
      {
        name: 'filer_node',
        description: 'Fetch a specific knowledge node by ID (e.g. "constraint:no-refresh-in-auth").',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Node ID in type:slug format' },
          },
          required: ['id'],
        },
      },
      {
        name: 'filer_stats',
        description: 'Return coverage and freshness stats for the knowledge layer.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'filer_check',
        description: 'Check a code snippet against constraints and patterns for a given scope, returning violations.',
        inputSchema: {
          type: 'object',
          properties: {
            code:  { type: 'string', description: 'Code snippet to check' },
            scope: { type: 'string', description: 'File path or directory scope to load rules from' },
          },
          required: ['code', 'scope'],
        },
      },
      {
        name: 'filer_pack',
        description: 'Pack codebase files into AI-ready context with Filer knowledge annotations. Replaces repomix. Use task param for smart file selection.',
        inputSchema: {
          type: 'object',
          properties: {
            scope:      { type: 'string',  description: 'Limit to a subdirectory' },
            task:       { type: 'string',  description: 'Select only files relevant to this task description' },
            tokens:     { type: 'number',  description: 'Token budget — return at most this many tokens' },
            annotate:   { type: 'string',  description: 'Annotation depth: summary|full|none (default: summary)' },
            compress:   { type: 'boolean', description: 'Strip comments and empty lines' },
            format:     { type: 'string',  description: 'Output format: markdown|xml|json|plain (default: markdown)' },
            include:    { type: 'string',  description: 'Comma-separated glob include patterns' },
            ignore:     { type: 'string',  description: 'Comma-separated glob ignore patterns' },
          },
        },
      },
      {
        name: 'filer_review_pending',
        description: 'Return the current pending review bundle (pending.json). Use this to load all nodes awaiting approval, then call filer_review_apply with your decisions.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'filer_review_apply',
        description: 'Apply review decisions to the knowledge layer. Pass an array of {id, status, review_comment} objects where status is approved|rejected|amended.',
        inputSchema: {
          type: 'object',
          properties: {
            decisions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id:             { type: 'string' },
                  status:         { type: 'string', enum: ['approved', 'rejected', 'amended', 'pending'] },
                  review_comment: { type: 'string' },
                },
                required: ['id', 'status'],
              },
            },
          },
          required: ['decisions'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;

    if (!filerExists(root)) {
      return {
        content: [{ type: 'text', text: 'No .filer/ directory found. Run: filer init && filer index' }],
        isError: true,
      };
    }

    if (name === 'filer_scope') {
      const paths = (args as { paths: string[] }).paths;
      const nodes = loadNodesForScope(root, paths);
      return {
        content: [{ type: 'text', text: JSON.stringify(nodes, null, 2) }],
      };
    }

    if (name === 'filer_query') {
      const question = (args as { question: string }).question;
      const all = readAllNodes(root);
      const matched = scoreNodes(all, question);
      return {
        content: [{ type: 'text', text: JSON.stringify(matched.slice(0, 20), null, 2) }],
      };
    }

    if (name === 'filer_node') {
      const id = (args as { id: string }).id;
      const node = readNode(root, id);
      if (!node) {
        return {
          content: [{ type: 'text', text: `Node not found: ${id}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(node, null, 2) }],
      };
    }

    if (name === 'filer_stats') {
      const index = readIndex(root);
      if (!index) {
        return {
          content: [{ type: 'text', text: 'No index found. Run: filer index' }],
          isError: true,
        };
      }
      const nodes = readAllNodes(root);
      const stale = nodes.filter(n => n.stale_risk >= 0.5).length;
      const verified = nodes.filter(n => n.verified).length;
      const unverifiedSecurity = nodes.filter(n => n.type === 'security' && !n.verified).length;
      const result = {
        repo: index.repo,
        indexed_at: index.indexed_at,
        last_commit: index.last_commit,
        llm: index.llm,
        stats: {
          ...index.stats,
          stale_nodes: stale,
          verified_nodes: verified,
          unverified_security: unverifiedSecurity,
        },
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    if (name === 'filer_check') {
      const { code, scope } = args as { code: string; scope: string };
      const nodes = loadNodesForScope(root, [scope]);
      const violations = checkCode(nodes, code);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ violations, checked_nodes: nodes.length }, null, 2),
        }],
      };
    }

    if (name === 'filer_pack') {
      const {
        scope, task, tokens, annotate = 'summary', compress: doCompress = false,
        format = 'markdown', include, ignore,
      } = args as {
        scope?: string; task?: string; tokens?: number; annotate?: string;
        compress?: boolean; format?: string; include?: string; ignore?: string;
      };

      const includePatterns = include ? include.split(',').map(s => s.trim())
        : scope ? [`${scope}/**`] : ['**/*'];
      const ignorePatterns  = ignore ? ignore.split(',').map(s => s.trim()) : [];

      let files = await scanFiles({
        root, include: includePatterns, ignore: ignorePatterns,
        useGitignore: true, maxFileSizeKb: 500,
      });

      const config = readConfig(root);

      if (task && config) {
        const gw = new LLMGateway(config);
        files = await selectRelevantFiles(gw, files, task, tokens ?? 0);
      } else if (tokens) {
        files = applyTokenBudget(files, tokens);
      }

      if (doCompress) {
        files = files.map(f => ({
          ...f,
          content: compress(f.content, f.path, { removeComments: true, removeEmptyLines: true }),
          tokens: estimateTokens(f.content),
        }));
      }

      const allNodes  = readAllNodes(root);
      const annotated = annotate !== 'none'
        ? files.map(f => ({ ...f, content: annotateFile(f, allNodes, annotate as any) }))
        : files;

      const preamble  = annotate !== 'none' ? buildKnowledgePreamble(root, files) : undefined;
      const treeNode  = buildTree(root, root, { maxDepth: 3 });
      const tree      = renderTree(treeNode);
      const totalTokens = annotated.reduce((s, f) => s + estimateTokens(f.content), 0);

      const output = formatOutput({
        format: format as any, files: annotated, tree, preamble,
        repoName: require('path').basename(root),
        generatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
        totalTokens, totalFiles: annotated.length, topFilesLen: 0,
      });

      return { content: [{ type: 'text', text: output }] };
    }

    if (name === 'filer_review_pending') {
      const bundle = readBundle(root);
      if (!bundle) {
        return {
          content: [{ type: 'text', text: 'No pending review bundle found. Run: filer review' }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(bundle, null, 2) }],
      };
    }

    if (name === 'filer_review_apply') {
      const { decisions } = args as { decisions: ApplyDecision[] };
      const result = applyDecisions(root, decisions);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
