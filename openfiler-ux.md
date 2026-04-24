# openfiler.ai — UX Design

*v0.2 — 2026-04-23*

---

## 1. Design Philosophy

Three principles drive every decision:

1. **Result first.** The fastest path to a real output on a real repo wins. No marketing copy between the user and the thing they came for.
2. **Progressive complexity.** Tier 0 features (Pack, Secrets, Export) work with a URL and one click. Power options exist but are never in the way.
3. **Developer trust.** Developers are sceptical. Every output shows exactly what happened — token count, files scanned, cost, and the exact CLI command that reproduces it locally. Nothing is hidden.

---

## 2. Visual Language

### Palette

```
Background:     #09090b   (near-black — original, not GitHub dark)
Surface:        #111113   (config panel, header)
Border:         rgba(255,255,255,0.06)  (subtle separators)
Text primary:   #e4e4e7
Text secondary: #71717a
Text muted:     #52525b
Accent:         #6366f1   (indigo — active states, CTAs, badges)
Accent light:   #a5b4fc   (indigo text on dark backgrounds)
Success:        #4ade80   (green)
Warning:        #fbbf24   (amber)
Danger:         #f87171   (red)
Critical:       #f87171   (same as danger — maps to Filer CLI CRITICAL)
```

> **Why indigo, not blue:** openfiler is not GitHub. Indigo (`#6366f1`) reads as AI/developer tooling and differentiates from GitHub's `#58a6ff`. Confirmed in implementation.

### Typography

```
UI chrome:      Inter, system-ui (clean, modern)
Code / output:  JetBrains Mono, 'Fira Code', monospace
                (output panels, CLI handoff, node content)
```

### Iconography

Minimal. Lucide icons only — outline style, 16px in UI, 20px in headings. No emoji in UI chrome (only in output content where Filer CLI produces them).

### Tier badges

Small pill labels, shown next to mode tab names:

```
FREE    → green pill    rgba(34,197,94,0.12)  text: #4ade80
BYOK    → indigo pill   rgba(99,102,241,0.18) text: #818cf8
HOSTED  → purple pill   rgba(163,113,247,0.18) text: #c084fc
```

---

## 3. Page Structure

### 3.1 Overall layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  HEADER  (52px fixed)                                               │
│  ○ openfiler.ai    [Pack·FREE] [Secrets·FREE] [Scan·BYOK]          │
│                    [Export·FREE] [Query·BYOK]      [Sign in]        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  CONTENT AREA  (fills viewport)                                     │
│                                                                     │
│  ┌──────────────────────┐  ┌────────────────────────────────────┐  │
│  │  CONFIG PANEL        │  │  OUTPUT PANEL                      │  │
│  │  (340px, fixed)      │  │  (fills remaining width)           │  │
│  │                      │  │                                    │  │
│  │                      │  │                                    │  │
│  └──────────────────────┘  └────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

- Header is always visible — mode switching never requires scrolling up
- Config panel is fixed width, scrolls independently if content overflows
- Output panel fills remaining width, virtualised scroll for large outputs
- Desktop-first — not optimised for mobile. Config panel is 340px fixed; output fills remainder.

### 3.2 Header

Single 52px bar — logo, tabs, and CTA all on one line. No second row.

```
┌─────────────────────────────────────────────────────────────────────┐
│  ◈ openfiler  │  [Pack FREE] [Secrets FREE] [Scan BYOK]            │
│               │  [Export FREE] [Query BYOK]    npx @filer/cli@latest│
└─────────────────────────────────────────────────────────────────────┘
  52px fixed
```

- Logo + wordmark separated from tabs by a faint vertical rule
- Active tab: `rgba(99,102,241,0.14)` background, `#e4e4e7` text
- Inactive tab: transparent background, `#71717a` text, hover `#a1a1aa`
- `npx @filer/cli@latest` is a monospace pill link, right-aligned, links to GitHub
- No `Sign in` until Phase 8 (Hosted tier)

---

## 4. Config Panel — Shared Patterns

### 4.1 Source input (used by all modes)

```
┌──────────────────────────────────────────┐
│  Repository                              │
│  ┌────────────────────────────────────┐  │
│  │  github.com/owner/repo             │  │
│  └────────────────────────────────────┘  │
│  Branch  [main          ▼]  (optional)   │
│                                          │
│  ── or ──                                │
│  [ Upload zip ]  (max 10MB)              │
└──────────────────────────────────────────┘
```

- URL field auto-detects GitHub URL format and shows a green tick when valid
- Branch dropdown populates from GitHub API after valid URL is entered
- Upload zip is a secondary option — visually de-emphasised
- No "Analyse" button yet — source input is just step 1

### 4.2 Run button states

```
[  Run  ]           ← idle, ready
[  ●●●  ]           ← running (animated dots)
[  ✓ Done  ]        ← complete (briefly, then resets)
[  ✕ Error  ]       ← failed (shows error inline)
```

### 4.3 LLM key prompt (Tier 1/2 modes only)

Appears inline in the config panel, only when the user enables an LLM feature. Not shown on page load.

```
┌──────────────────────────────────────────┐
│  ⚡ This option uses an LLM              │
│                                          │
│  ● Use my own API key   ○ Use Hosted     │
│                                          │
│  Provider  [Anthropic  ▼]               │
│  Key       [sk-ant-•••••••••] [Clear]   │
│            ✓ Encrypted locally           │
│              Never stored server-side    │
└──────────────────────────────────────────┘
```

- Provider auto-detected from key prefix (`sk-ant-` → Anthropic, `sk-` → OpenAI)
- "Hosted" option shows estimated cost: `~$0.02 est.` and prompts sign-in if not authenticated
- Key field shows masked value once stored, with a Clear button
- The two-line security note is small, muted text — present for trust, not prominent

---

## 5. Mode Designs

### 5.1 Pack

**Tagline:** *Pack any repo into AI-ready context*

#### Config panel

```
┌──────────────────────────────────────────┐
│  Pack codebase                           │
│  Pack any repo into AI-ready context.    │
│                                          │
│  Repository URL                          │
│  [ https://github.com/owner/repo  ]      │
│  ── or ──                                │
│  [ Upload zip ]  (max 10MB)              │
│                                          │
│  Output format                           │
│  [Markdown] [XML] [JSON] [Plain]         │
│  (pill toggle — one active at a time)    │
│                                          │
│  ○ Remove comments                       │
│  ○ Remove empty lines                    │
│  ○ Line numbers                          │
│  ○ Show file summary       (default on)  │
│  ○ Show directory structure (default on) │
│  ○ Security check           (default on) │
│                                          │
│  Top N files  [ _______ ]  (blank=all)   │
│                                          │
│  ── Advanced filters ▼ (collapsed) ────  │
│     Scope    [ src/              ]       │
│     Include  [ **/*.ts           ]       │
│     Ignore   [ **/*.test.ts      ]       │
│     ☐ Include git log                   │
│     ☐ Include current diff              │
│                                          │
│  ── AI file selection ▼ (collapsed) ───  │
│     ☐  Select files by task  BYOK       │
│        [ What are you building?   ]      │
│        Token budget  [ 40000      ]      │
│        [LLM key prompt — §4.3]           │
│                                          │
│  [  Pack repository  ]                   │
│                                          │
│  CLI                                     │
│  filer pack --remote <url> \             │
│    --format markdown                     │
│  (live preview, updates as options set)  │
│                                          │
│  10 packs / IP / hr                      │
└──────────────────────────────────────────┘
```

- Format selector: 4 pill buttons, one active (indigo) at a time
- Toggles are standard toggle switches, not checkboxes
- File summary + directory structure + security check default ON; user can turn off
- Top N files: small numeric input, right of label, blank means all files
- Advanced filters collapsed by default; AI selection collapsed by default
- AI selection section shows BYOK badge; task toggle reveals task input + token budget + LLM prompt
- CLI preview block shows the exact `filer pack` command, updates live as options change
- Config panel width: 340px fixed

#### Output panel (idle)

```
┌────────────────────────────────────────────────────┐
│                                                    │
│  Enter a repository URL and click Run              │
│  to pack it into AI-ready context.                 │
│                                                    │
│  No install required. Output is identical to:      │
│  $ filer pack --format markdown                    │
│                                                    │
└────────────────────────────────────────────────────┘
```

#### Output panel (running)

```
┌────────────────────────────────────────────────────┐
│  ● Cloning repository...                  10%      │
│  ────────────────────────────────────────────────  │
│  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░            │
└────────────────────────────────────────────────────┘
```

#### Output panel (complete)

```
┌────────────────────────────────────────────────────┐
│  ✓  47 files  ·  ~12,400 tokens  ·  49,200 chars  │
│  ──────────────────────────────────────────────    │
│  [Download .md]  [Copy]                            │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │ # my-repo                                    │  │
│  │                                              │  │
│  │ Generated by Filer · 2026-04-23             │  │
│  │ 47 files · ~12,400 tokens                   │  │
│  │                                              │  │
│  │ ## Directory Structure                       │  │
│  │ ...                                          │  │
│  │                              (scrollable)    │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ── Run this locally ──────────────────────────    │
│  $ filer pack --format markdown                    │
│  [Copy command]                                    │
│                                                    │
│  ── Want annotations & smarter selection? ──────   │
│  $ npx @filer/cli@latest                           │
│  [Get started →]                                   │
└────────────────────────────────────────────────────┘
```

---

### 5.2 Secrets

**Tagline:** *Scan for hardcoded credentials — instant, no LLM*

#### Config panel

```
┌──────────────────────────────────────────┐
│  Repository                              │
│  [ github.com/owner/repo          ]  ✓  │
│                                          │
│  Scope  (optional)                       │
│  [ src/                           ]      │
│  Leave blank to scan entire repo         │
│                                          │
│  [  Run  ]                               │
└──────────────────────────────────────────┘
```

Simplest config panel of all five modes — this is intentional. Secrets scan is frictionless.

#### Output panel — no findings

```
┌────────────────────────────────────────────────────┐
│  ✓  No secrets detected                            │
│     Scanned 94 files in 1.2s                       │
│                                                    │
│  ── Run this in CI ────────────────────────────    │
│  $ filer secrets --ci                              │
│  [Copy command]                                    │
└────────────────────────────────────────────────────┘
```

#### Output panel — findings

```
┌────────────────────────────────────────────────────┐
│  ⚠  3 potential secrets detected                   │
│     Scanned 94 files in 1.1s                       │
│                                                    │
│  [Download JSON]                                   │
│                                                    │
│  src/config/database.ts                            │
│  ┌──────────────────────────────────────────────┐  │
│  │ ● CRITICAL  line 12   AWS_ACCESS_KEY_ID      │  │
│  │   Hardcoded AWS credential detected           │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  .env.example                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ ⚠ WARNING   line 4    GENERIC_API_KEY        │  │
│  │   Potential API key pattern                   │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ── Rotate leaked credentials immediately ──────   │
│  Use git filter-repo to purge from history.        │
│                                                    │
│  ── Automate this check ───────────────────────    │
│  $ filer secrets --ci                              │
│  [Copy command]                                    │
└────────────────────────────────────────────────────┘
```

---

### 5.3 Scan

**Tagline:** *Full security report — shareable HTML, CI-ready*

#### Config panel

```
┌──────────────────────────────────────────┐
│  Repository                              │
│  [ github.com/owner/repo          ]  ✓  │
│                                          │
│  LLM                                     │
│  [LLM key prompt — §4.3]                 │
│                                          │
│  ── Options ─────────────────────────── │
│  Scope    [ (entire repo)         ]      │
│  Speed    ● Standard  ○ Fast (cheaper)  │
│  Fail on  ○ Critical  ● High  ○ Medium  │
│                                          │
│  [  Run  ]                               │
└──────────────────────────────────────────┘
```

LLM key prompt is shown immediately (not behind a toggle) — Scan always requires an LLM.

#### Output panel (complete)

```
┌────────────────────────────────────────────────────┐
│  ✓  Report ready  ·  23 findings  ·  $0.03        │
│  ──────────────────────────────────────────────    │
│  [Download HTML]  [Copy share link]  [Open full]   │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  ● 2  CRITICAL   security                   │  │
│  │  ● 4  HIGH       danger                     │  │
│  │  ● 11 MEDIUM     constraint/assumption       │  │
│  │  ● 6  INFO       pattern/intent             │  │
│  │                                              │  │
│  │  [--- embedded report iframe ---]            │  │
│  │  (same HTML as local filer scan)             │  │
│  │                              (scrollable)    │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  Share link (expires 7 days):                      │
│  https://worker.openfiler.ai/reports/abc123        │
│  [Copy]                                            │
│                                                    │
│  ── Add to CI ─────────────────────────────────    │
│  $ filer scan --ci --fail-on high                  │
│  [Copy command]                                    │
└────────────────────────────────────────────────────┘
```

---

### 5.4 Export

**Tagline:** *See what Filer knows about a repo*

This mode requires the repo to have `.filer/` committed. If it doesn't, we show a helpful empty state instead of an error.

#### Config panel

```
┌──────────────────────────────────────────┐
│  Repository                              │
│  [ github.com/owner/repo          ]  ✓  │
│  ⚠  No .filer/ found — try filer layer  │
│                                          │
│  ── or with .filer/ ──────────────────── │
│  [ github.com/dkeswani/filer      ]  ✓  │
│  ✓  .filer/ detected (142 nodes)         │
│                                          │
│  Filter  (optional)                      │
│  Types  ☑ security  ☑ constraint        │
│         ☑ danger    ☑ assumption        │
│         ☑ pattern   ☑ intent  ☑ decision│
│  Scope  [ (all)                   ]      │
│  ☐ Verified only                        │
│                                          │
│  Format  ● Markdown  ○ JSON             │
│                                          │
│  [  Export  ]                            │
└──────────────────────────────────────────┘
```

"No .filer/ found" is shown inline, not as a blocking error. The user can still try a different URL.

#### Output panel (complete)

```
┌────────────────────────────────────────────────────┐
│  ✓  142 nodes exported  ·  0.1s                    │
│  ──────────────────────────────────────────────    │
│  [Download .md]  [Copy]                            │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  🔴 SECURITY (8)                             │  │
│  │  ─────────────────────────────────────────   │  │
│  │  security:no-raw-webhook-logging             │  │
│  │  src/payments/ · conf 94% · ✓ verified      │  │
│  │  Never log raw webhook payloads — PII        │  │
│  │                                              │  │
│  │  security:verify-stripe-signature            │  │
│  │  src/payments/ · conf 88%                   │  │
│  │  Always verify Stripe sig before processing  │  │
│  │                           (scrollable)       │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ── Build this for your own repo ───────────────   │
│  $ npx @filer/cli@latest                           │
│  [Get started →]                                   │
└────────────────────────────────────────────────────┘
```

---

### 5.5 Query

**Tagline:** *Ask anything about a codebase*

#### Config panel

```
┌──────────────────────────────────────────┐
│  Repository                              │
│  [ github.com/owner/repo          ]  ✓  │
│  ✓  .filer/ detected (142 nodes)         │
│                                          │
│  Question                                │
│  ┌──────────────────────────────────┐   │
│  │  How does authentication work?   │   │
│  │                                  │   │
│  └──────────────────────────────────┘   │
│                                          │
│  LLM                                     │
│  [LLM key prompt — §4.3]                 │
│                                          │
│  ── Advanced ▼ ────────────────────────  │
│     Filter types  [ all          ]       │
│     Scope         [ (all)        ]       │
│                                          │
│  [  Ask  ]                               │
└──────────────────────────────────────────┘
```

#### Output panel (complete)

```
┌────────────────────────────────────────────────────┐
│  ✓  Answer ready  ·  $0.01                         │
│  ──────────────────────────────────────────────    │
│  [Copy answer]                                     │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  Authentication is handled by the            │  │
│  │  src/auth/ module using JWT tokens.          │  │
│  │  Sessions expire after 7 days. The           │  │
│  │  refresh token flow is documented in         │  │
│  │  decision:jwt-refresh-strategy.             │  │
│  │                                              │  │
│  │  ── Supporting nodes ─────────────────────   │  │
│  │                                              │  │
│  │  [intent:auth-module-ownership]              │  │
│  │   src/auth/ owns all token issuance          │  │
│  │                                              │  │
│  │  [decision:jwt-refresh-strategy]             │  │
│  │   Why: stateless sessions required for       │  │
│  │   horizontal scaling                         │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ── Run locally ───────────────────────────────    │
│  $ filer query "How does authentication work?"     │
│  [Copy command]                                    │
└────────────────────────────────────────────────────┘
```

---

## 6. Landing Page (/)

Before the user selects a mode, the landing page is the content area. Goal: get them to click a mode tab within 10 seconds.

```
┌─────────────────────────────────────────────────────────────────────┐
│  HEADER                                                             │
│  [Pack FREE] [Secrets FREE] [Scan BYOK] [Export FREE] [Query BYOK]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                                                               │  │
│  │   The knowledge layer for codebases.                          │  │
│  │   No install. Paste a repo URL.                               │  │
│  │                                                               │  │
│  │   ┌──────────────────────────────────────┐  [  Pack it  ]    │  │
│  │   │  github.com/owner/repo               │                   │  │
│  │   └──────────────────────────────────────┘                   │  │
│  │                                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ── What would you like to do? ───────────────────────────────────  │
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐               │
│  │  📦 Pack     │ │  🔑 Secrets  │ │  🔍 Scan     │               │
│  │  FREE        │ │  FREE        │ │  BYOK        │               │
│  │              │ │              │ │              │               │
│  │  Pack repo   │ │  Find        │ │  Full LLM    │               │
│  │  into AI-    │ │  hardcoded   │ │  security    │               │
│  │  ready       │ │  credentials │ │  report      │               │
│  │  context     │ │  instantly   │ │              │               │
│  └──────────────┘ └──────────────┘ └──────────────┘               │
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐                                 │
│  │  📤 Export   │ │  💬 Query    │                                 │
│  │  FREE        │ │  BYOK        │                                 │
│  │              │ │              │                                 │
│  │  Read what   │ │  Ask natural │                                 │
│  │  Filer knows │ │  language    │                                 │
│  │  about a     │ │  questions   │                                 │
│  │  repo        │ │  about code  │                                 │
│  └──────────────┘ └──────────────┘                                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Key behaviour:** the URL input on the landing page pre-fills the Source field when the user clicks any mode card. The user types their repo URL once — it travels with them across modes.

---

## 7. Empty & Error States

### No `.filer/` detected (Export, Query)

```
ℹ  This repo doesn't have a .filer/ directory.
   Export and Query need a Filer knowledge layer to read from.

   To build one:
   $ npx @filer/cli@latest
   [Get started →]

   Or try one of these repos that already have .filer/:
   · github.com/dkeswani/filer
```

### Large repo warning (async path)

```
⏱  Large repository (~45 modules detected)
   This job will run in the background and take 2–4 minutes.
   You can leave this tab open — results stream in as they arrive.

   [Continue anyway]
```

### Rate limit hit

```
⏸  Slow down — you've hit the free tier limit (10 jobs/hour).
   Wait a few minutes, or sign in for a higher limit.
   [Sign in]
```

### Invalid / expired API key

```
✕  API key rejected by Anthropic.
   Check your key at console.anthropic.com
   [Try a different key]
```

---

## 8. CLI Handoff Block

Every output panel ends with this block. It is the most important conversion surface on the site.

```
┌──────────────────────────────────────────────────────┐
│  Run this locally                                    │
│  ──────────────────────────────────────────────────  │
│  $ filer pack --format markdown                      │
│  [Copy]                                              │
│                                                      │
│  Want knowledge annotations, smarter file            │
│  selection, and CI integration?                      │
│                                                      │
│  $ npx @filer/cli@latest                             │
│  [Copy]   [Read the docs →]                          │
└──────────────────────────────────────────────────────┘
```

The first command is the exact equivalent of what just ran on the web. The second is the onboarding CTA. Both are copyable with one click.

---

## 9. Responsive Behaviour

Desktop-first. The primary audience is developers on laptops and desktops. Mobile is not a design target for v1.

| Breakpoint | Layout |
|------------|--------|
| ≥ 1024px | Side-by-side 340px config + fluid output (standard) |
| 768–1023px | Config panel full width, output below (degraded but usable) |
| < 768px | Not supported — shows a "best viewed on desktop" notice |

---

## 10. Interaction Details

### URL pre-filling across modes

The repo URL entered in any mode (or on the landing page) persists in a React context. Switching mode tabs carries the URL across — the user never re-types it.

### Output persistence within session

Output from a completed job stays in the output panel until the user changes the source URL or options and runs again. Switching mode tabs and switching back restores the last output for that mode.

### Copy feedback

All copy buttons show a `✓ Copied` label for 1.5s, then revert. No toast notifications — inline feedback only.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `⌘ Enter` / `Ctrl Enter` | Submit (Run / Ask / Export) |
| `Esc` | Cancel running job |
| `⌘ D` / `Ctrl D` | Download output |
| `1–5` | Switch mode (Pack / Secrets / Scan / Export / Query) |

---

## 11. What Is Deliberately Left Out

- **No onboarding tour or modal.** Developers skip them. The UI teaches itself.
- **No dashboard or history.** Saved history is v2. The output panel is the session.
- **No dark/light toggle.** Dark only. The audience is developers, the aesthetic is deliberate.
- **No social login options beyond GitHub.** One less decision for the user.
- **No marketing copy in the app shell.** The landing page has one sentence. The output is the pitch.
