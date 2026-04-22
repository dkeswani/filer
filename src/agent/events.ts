// Agent event types — maps git/CI events to orchestration sequences

export type AgentEvent =
  | 'commit'        // post-commit: update nodes for changed files
  | 'pr_merged'     // PR merged: mine review comments for new nodes
  | 'ci'            // CI run: security scan + fail on high
  | 'scheduled';    // nightly: staleness check + surface unverified

export interface AgentEventContext {
  event:       AgentEvent;
  prNumber?:   number;   // for pr_merged
  since?:      string;   // git ref or ISO date
  autoApply?:  boolean;
  dryRun?:     boolean;
  failOn?:     string;
}

export function parseEvent(raw: string): AgentEvent {
  switch (raw) {
    case 'push':
    case 'commit':        return 'commit';
    case 'pull_request':
    case 'pr_merged':     return 'pr_merged';
    case 'ci':            return 'ci';
    case 'schedule':
    case 'scheduled':     return 'scheduled';
    default:
      throw new Error(`Unknown agent event: "${raw}". Valid: commit | pr_merged | ci | scheduled`);
  }
}
