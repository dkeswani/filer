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
  loadNodesForScope,
  filerExists,
} from '../store/mod.js';
import { AnyNode } from '../schema/mod.js';

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

    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
