import { scanFiles }      from '../pipeline/scanner.js';
import { ensureConfig }   from '../commands/utils.js';
import { scanForSecrets, SecretFinding, SecretScanResult } from '../security/secretlint.js';

export type { SecretFinding, SecretScanResult };

export interface SecretsOptions {
  scope?: string;
}

export async function scanSecrets(root: string, options: SecretsOptions = {}): Promise<SecretScanResult> {
  const config = ensureConfig(root);
  const sourceFiles = await scanFiles(root, config);
  const filtered = options.scope
    ? sourceFiles.filter(f => f.path.startsWith(options.scope!))
    : sourceFiles;

  return scanForSecrets(filtered.map(f => ({ path: f.path, content: f.content })));
}
