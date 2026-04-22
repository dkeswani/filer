// Language-aware comment + empty line stripping
// No external dependencies — regex-based, covers the languages Repomix supports

export type Language =
  | 'typescript' | 'javascript' | 'python' | 'go' | 'rust'
  | 'java' | 'c' | 'cpp' | 'csharp' | 'ruby' | 'php'
  | 'shell' | 'yaml' | 'html' | 'css' | 'unknown';

const EXT_MAP: Record<string, Language> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.html': 'html', '.htm': 'html',
  '.css': 'css', '.scss': 'css', '.sass': 'css',
};

export function detectLanguage(filePath: string): Language {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return EXT_MAP[ext] ?? 'unknown';
}

export interface CompressOptions {
  removeComments?:    boolean;
  removeEmptyLines?:  boolean;
}

export function compress(content: string, filePath: string, opts: CompressOptions): string {
  let result = content;

  if (opts.removeComments) {
    const lang = detectLanguage(filePath);
    result = stripComments(result, lang);
  }

  if (opts.removeEmptyLines) {
    result = result
      .split('\n')
      .filter(line => line.trim().length > 0)
      .join('\n');
  }

  return result;
}

function stripComments(content: string, lang: Language): string {
  switch (lang) {
    case 'typescript':
    case 'javascript':
    case 'java':
    case 'c':
    case 'cpp':
    case 'csharp':
    case 'go':
    case 'rust':
    case 'php':
      return stripCStyleComments(content);

    case 'python':
    case 'ruby':
    case 'shell':
    case 'yaml':
      return stripHashComments(content);

    case 'html':
      return stripHtmlComments(content);

    case 'css':
      return stripCssComments(content);

    default:
      return content;
  }
}

function stripCStyleComments(content: string): string {
  // Remove block comments /* ... */ (non-greedy, including multiline)
  // Remove line comments // ... (but not in strings — best-effort)
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(?<!:)\/\/.*$/gm, '');
}

function stripHashComments(content: string): string {
  // Remove # comments but preserve shebangs (#!)
  return content.replace(/^(?!#!)#.*$/gm, '');
}

function stripHtmlComments(content: string): string {
  return content.replace(/<!--[\s\S]*?-->/g, '');
}

function stripCssComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '');
}
