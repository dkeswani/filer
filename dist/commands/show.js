import chalk from 'chalk';
import { readNode, readAllNodes, filerExists, } from '../store/mod.js';
import { NODE_PRIORITY } from '../schema/mod.js';
export async function showCommand(id, options) {
    const root = process.cwd();
    if (!filerExists(root)) {
        console.error(chalk.red('\n  No .filer/ directory found. Run: filer init\n'));
        process.exit(1);
    }
    // Show single node by ID
    if (id) {
        const node = readNode(root, id);
        if (!node) {
            console.error(chalk.red(`\n  Node not found: ${id}\n`));
            process.exit(1);
        }
        if (options.json) {
            console.log(JSON.stringify(node, null, 2));
        }
        else {
            printNode(node);
        }
        return;
    }
    // Show multiple nodes with filters
    let nodes = readAllNodes(root);
    if (options.type) {
        const types = options.type.split(',').map(t => t.trim());
        nodes = nodes.filter(n => types.includes(n.type));
    }
    if (options.scope) {
        const scope = options.scope;
        nodes = nodes.filter(n => n.scope.some(s => s.includes(scope) || scope.includes(s.replace('/**', '').replace('/*', ''))));
    }
    if (options.verified !== undefined) {
        nodes = nodes.filter(n => n.verified === options.verified);
    }
    if (nodes.length === 0) {
        console.log(chalk.yellow('\n  No nodes match the given filters.\n'));
        return;
    }
    // Sort by priority
    nodes.sort((a, b) => (NODE_PRIORITY[a.type] ?? 9) - (NODE_PRIORITY[b.type] ?? 9));
    if (options.json) {
        console.log(JSON.stringify(nodes, null, 2));
        return;
    }
    console.log(chalk.bold(`\n  Showing ${nodes.length} node(s)\n`));
    for (const node of nodes) {
        printNode(node);
        console.log();
    }
}
// ── Node printer ──────────────────────────────────────────────────────────────
function printNode(node) {
    const typeColor = getTypeColor(node.type);
    const verifiedBadge = node.verified ? chalk.green(' ✓ verified') : chalk.dim(' (unverified)');
    const staleBadge = node.stale_risk >= 0.5 ? chalk.yellow(' ⚠ stale') : '';
    console.log(typeColor(`  [${node.type.toUpperCase()}] `) + chalk.bold(node.id) + verifiedBadge + staleBadge);
    console.log(chalk.dim(`  scope: `) + node.scope.join(', '));
    console.log(chalk.dim(`  confidence: `) + formatConfidence(node.confidence) + chalk.dim(`  version: ${node.version}`));
    if (node.tags.length > 0) {
        console.log(chalk.dim(`  tags: `) + node.tags.map(t => chalk.cyan(t)).join(', '));
    }
    console.log();
    // Type-specific fields
    switch (node.type) {
        case 'intent':
            console.log('  ' + chalk.bold('Purpose:') + ' ' + node.purpose);
            if (node.owns.length)
                printList('Owns:', node.owns);
            if (node.does_not_own.length)
                printList('Does NOT own:', node.does_not_own, chalk.dim);
            break;
        case 'constraint':
            console.log('  ' + chalk.bold('Statement:') + ' ' + node.statement);
            console.log('  ' + chalk.bold('Because:') + ' ' + node.because);
            console.log('  ' + chalk.red('If violated:') + ' ' + node.if_violated);
            if (node.instead)
                console.log('  ' + chalk.green('Instead:') + ' ' + node.instead);
            break;
        case 'assumption':
            console.log('  ' + chalk.bold('Statement:') + ' ' + node.statement);
            console.log('  ' + chalk.red('Breaks when:') + ' ' + node.breaks_when);
            if (node.boundary)
                console.log('  ' + chalk.green('Boundary:') + ' ' + node.boundary);
            if (node.relied_on_by.length)
                printList('Relied on by:', node.relied_on_by);
            break;
        case 'danger':
            console.log('  ' + chalk.bold('Statement:') + ' ' + node.statement);
            console.log('  ' + chalk.bold('Condition:') + ' ' + node.condition);
            console.log('  ' + chalk.green('Safe pattern:') + ' ' + node.safe_pattern);
            if (node.current_mitigation)
                console.log('  ' + chalk.dim('Mitigation: ') + node.current_mitigation);
            if (node.history)
                console.log('  ' + chalk.dim('History: ') + node.history);
            break;
        case 'pattern':
            console.log('  ' + chalk.bold('Statement:') + ' ' + node.statement);
            console.log('  ' + chalk.bold('Why:') + ' ' + node.why);
            if (node.structure)
                console.log('  ' + chalk.dim('Structure: ') + node.structure);
            if (node.anti_pattern)
                console.log('  ' + chalk.red('Anti-pattern: ') + node.anti_pattern);
            if (node.deviations.length > 0) {
                console.log('  ' + chalk.yellow('Deviations:'));
                for (const d of node.deviations) {
                    console.log('    ' + chalk.dim(d.scope + ':') + ' ' + d.reason);
                }
            }
            break;
        case 'decision':
            console.log('  ' + chalk.bold('Statement:') + ' ' + node.statement);
            console.log('  ' + chalk.bold('Reason:') + ' ' + node.reason);
            if (node.revisit_if)
                console.log('  ' + chalk.dim('Revisit if: ') + node.revisit_if);
            if (node.alternatives_rejected.length > 0) {
                console.log('  ' + chalk.bold('Alternatives rejected:'));
                for (const alt of node.alternatives_rejected) {
                    console.log('    ' + chalk.dim(alt.option + ':') + ' ' + alt.why_rejected);
                }
            }
            break;
        case 'security':
            const sevColor = node.severity === 'critical' ? chalk.bgRed.white
                : node.severity === 'high' ? chalk.red : chalk.yellow;
            console.log('  ' + sevColor(` ${node.severity.toUpperCase()} `) + ' ' + chalk.dim(node.category));
            console.log('  ' + chalk.bold('Statement:') + ' ' + node.statement);
            console.log('  ' + chalk.bold('Because:') + ' ' + node.because);
            console.log('  ' + chalk.red('If violated:') + ' ' + node.if_violated);
            console.log('  ' + chalk.green('Safe pattern:') + ' ' + node.safe_pattern);
            if (node.audit_required) {
                console.log('  ' + chalk.yellow('⚑ Audit required'));
                if (node.audit_format)
                    console.log('  ' + chalk.dim('Format: ') + node.audit_format);
            }
            break;
        case 'antipattern':
            console.log('  ' + chalk.bold('Statement:') + ' ' + node.statement);
            console.log('  ' + chalk.dim('Looks right because:') + ' ' + node.why_it_looks_right);
            console.log('  ' + chalk.red('Wrong here because:') + ' ' + node.why_its_wrong_here);
            console.log('  ' + chalk.green('Correct pattern:') + ' ' + node.correct_pattern);
            if (node.history)
                console.log('  ' + chalk.dim('History: ') + node.history);
            break;
    }
    if (node.must_not.length > 0) {
        printList('Must NOT:', node.must_not, chalk.red);
    }
    if (node.related.length > 0) {
        console.log('  ' + chalk.dim('Related: ') + node.related.join(', '));
    }
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function getTypeColor(type) {
    const colors = {
        security: chalk.red,
        constraint: chalk.yellow,
        danger: chalk.magenta,
        assumption: chalk.blue,
        antipattern: chalk.cyan,
        pattern: chalk.green,
        intent: chalk.white,
        decision: chalk.gray,
    };
    return colors[type] ?? chalk.white;
}
function formatConfidence(c) {
    const pct = Math.round(c * 100);
    if (pct >= 95)
        return chalk.green(`${pct}%`);
    if (pct >= 80)
        return chalk.yellow(`${pct}%`);
    return chalk.red(`${pct}%`);
}
function printList(label, items, colorFn) {
    console.log('  ' + chalk.bold(label));
    for (const item of items) {
        const text = colorFn ? colorFn(item) : item;
        console.log('    · ' + text);
    }
}
//# sourceMappingURL=show.js.map