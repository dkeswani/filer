import fs   from 'fs';
import path from 'path';

const LOG_FILE = '.filer/agent-log.md';

export async function appendToAgentLog(root: string, text: string): Promise<void> {
  const logPath = path.join(root, LOG_FILE);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const entry = `\n---\n**${timestamp}**\n\n${text}\n`;
  fs.appendFileSync(logPath, entry, 'utf-8');
}
