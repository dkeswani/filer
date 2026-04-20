import fs   from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

// Register at github.com/settings/developers → OAuth Apps → New OAuth App
// Device Flow does not use client_secret — client_id is safe to hardcode.
const GITHUB_CLIENT_ID = process.env.FILER_GITHUB_CLIENT_ID ?? 'Ov23liPZeluRKyo0jt28';

// ── Token resolution ──────────────────────────────────────────────────────────

export async function getGitHubToken(): Promise<string> {
  // 1. env var
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;

  // 2. .env file in cwd
  const fromDotEnv = readFromDotEnv('GITHUB_TOKEN');
  if (fromDotEnv) return fromDotEnv;

  // 3. gh CLI
  const fromGhCli = tryGhCli();
  if (fromGhCli) return fromGhCli;

  // 4. OAuth Device Flow
  return runDeviceFlow();
}

function readFromDotEnv(key: string): string | null {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return null;
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(new RegExp(`^${key}=(.+)$`));
      if (match) return match[1].trim().replace(/^["']|["']$/g, '');
    }
    return null;
  } catch {
    return null;
  }
}

function tryGhCli(): string | null {
  try {
    const token = execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return token || null;
  } catch {
    return null;
  }
}

// ── GitHub Device Flow ────────────────────────────────────────────────────────

interface DeviceCodeResponse {
  device_code:      string;
  user_code:        string;
  verification_uri: string;
  expires_in:       number;
  interval:         number;
}

interface AccessTokenResponse {
  access_token?: string;
  error?:        string;
  error_description?: string;
}

async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const res = await fetch('https://github.com/login/device/code', {
    method:  'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body:    JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: 'repo' }),
  });
  if (!res.ok) throw new Error(`GitHub device code request failed: ${res.status}`);
  return res.json() as Promise<DeviceCodeResponse>;
}

async function pollForToken(
  deviceCode: string,
  intervalSecs: number,
  signal: AbortSignal
): Promise<string> {
  const delay = (ms: number) => new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
  });

  while (true) {
    await delay(intervalSecs * 1000);

    const res = await fetch('https://github.com/login/oauth/access_token', {
      method:  'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        client_id:   GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type:  'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const data = await res.json() as AccessTokenResponse;

    if (data.access_token) return data.access_token;

    if (data.error === 'slow_down') {
      intervalSecs += 5;
      continue;
    }
    if (data.error === 'authorization_pending') continue;
    if (data.error === 'expired_token') throw new Error('Device code expired. Run the command again.');
    if (data.error === 'access_denied')  throw new Error('Authorization denied.');
    if (data.error) throw new Error(`OAuth error: ${data.error}`);
  }
}

function saveTokenToDotEnv(token: string): void {
  const root    = process.cwd();
  const envPath = path.join(root, '.env');

  // Append or update GITHUB_TOKEN line
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    if (/^GITHUB_TOKEN=/m.test(content)) {
      fs.writeFileSync(envPath, content.replace(/^GITHUB_TOKEN=.*$/m, `GITHUB_TOKEN=${token}`));
    } else {
      fs.appendFileSync(envPath, `\nGITHUB_TOKEN=${token}\n`);
    }
  } else {
    fs.writeFileSync(envPath, `GITHUB_TOKEN=${token}\n`);
  }

  // Ensure .env is in .gitignore
  const gitignorePath = path.join(root, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gi = fs.readFileSync(gitignorePath, 'utf8');
    if (!/^\.env$/m.test(gi)) {
      fs.appendFileSync(gitignorePath, '\n.env\n');
    }
  } else {
    fs.writeFileSync(gitignorePath, '.env\n');
  }
}

async function runDeviceFlow(): Promise<string> {
  console.log(chalk.yellow('\n  No GitHub token found.'));
  console.log(chalk.dim('  Filer needs read access to your PR review comments.'));
  console.log();

  const device = await requestDeviceCode();

  console.log(chalk.bold('  Authorize Filer on GitHub:'));
  console.log();
  console.log(`    Open:       ${chalk.cyan(device.verification_uri)}`);
  console.log(`    Enter code: ${chalk.bold(device.user_code)}`);
  console.log();

  // Try to open browser
  try {
    const { default: open } = await import('open');
    await open(device.verification_uri);
    console.log(chalk.dim('  (Browser opened — enter the code above)'));
  } catch {
    console.log(chalk.dim('  Open the URL above in your browser and enter the code.'));
  }

  console.log();
  process.stdout.write(chalk.dim('  Waiting for authorization... (Ctrl+C to cancel)\n\n'));

  const ac = new AbortController();
  const onSigint = () => { ac.abort(); process.exit(1); };
  process.once('SIGINT', onSigint);

  let token: string;
  try {
    token = await pollForToken(device.device_code, device.interval, ac.signal);
  } finally {
    process.removeListener('SIGINT', onSigint);
  }

  saveTokenToDotEnv(token);
  console.log(chalk.green('  ✓ Authorized. Token saved to .env\n'));

  return token;
}
