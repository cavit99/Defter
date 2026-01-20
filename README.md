# Defter — Minimalist writing room

**Defter** (Turkish for "notebook") is a focused, single-page writing application designed for distraction-free markdown composition with intelligent AI assistance. Built with Next.js and React, it provides a clean, native-feeling writing experience directly in the browser.

## What it does

Defter combines the simplicity of a text editor with modern conveniences:

- **Rich markdown editing**: Write in a WYSIWYG-style editor with live markdown rendering using `marked` and inline formatting (bold, italic, underline). Your content is stored as markdown under the hood, converted seamlessly via `turndown`.
- **Contextual AI edits**: Highlight any text and ask AI to rewrite, expand, or refine it. The app sends your selection along with surrounding context to OpenAI's Responses API, which returns structured replacement text that preserves your document's flow.
- **Math support**: Write LaTeX expressions inline (`$...$`) or as display blocks (`$$...$$`), rendered instantly with KaTeX.
- **Native file handling**: Uses the File System Access API (where supported) to open, edit, and save `.md` files directly to disk—no downloads required. Falls back gracefully on other browsers.
- **Autosave & safety**: Drafts are continuously saved to localStorage. Manual save writes to a file handle or triggers a download.
- **Print-ready output**: One-click PDF export via browser print with clean A4 formatting.
- **Adaptive UI**: System-aware dark/light theme with manual override, fullscreen mode, and mobile-safe spacing.

## How it works

The editor is a `contentEditable` div that renders markdown as HTML on every keystroke. User input is immediately parsed with `marked`, math expressions are processed with `katex`, and the result is displayed inline. When you save, the HTML is converted back to clean markdown via `turndown`.

AI edits leverage OpenAI's Responses API with structured output (JSON schema). When you select text and provide a prompt, the app sends:
- The full document (plain text and markdown)
- The selected text
- 500 characters of context before and after the selection
- Position metadata (start/end offsets, percentage through document)

The server-side route (`/api/ai`) calls the Responses API with strict schema validation and returns only the replacement text, which is inserted at the selection point. An undo toast appears immediately, allowing you to revert via a button or native `Ctrl/Cmd+Z`.

File operations prefer the File System Access API for a native feel: opening a file establishes a handle that subsequent saves write to directly, avoiding repeated save dialogs. On unsupported browsers, the app falls back to traditional file pickers and downloads.

## Quick start

```bash
npm install
cp .env.example .env.local   # set your API key inside
npm run dev
# open http://localhost:3000
```

Production build:

```bash
npm run build
npm run start
```

## Environment

- `OPENAI_API_KEY` (required) – server-side key for the AI endpoint.
- `OPENAI_MODEL` (optional) – Responses API model name. Defaults to `gpt-5.2`.

## Controls & shortcuts

- Persistent buttons (icons only): New, Open, Save, Print PDF, Theme, Fullscreen.
- Selection toolbar (appears only on highlight): Bold, Italic, Underline, Ask AI.
- Keyboard: `⌘/Ctrl+S` save, `⌘/Ctrl+O` open, `⌘/Ctrl+N` new, `⌘/Ctrl+P` print, `⌘/Ctrl+Shift+F` fullscreen (Esc exits), `⌘/Ctrl+Shift+L` toggle theme, `⌘/Ctrl+Z` undo.
- Autosave: markdown draft stored locally as a safety net (does not mark the file as saved—use Save to clear the dirty state).
- Dark/light: follows system by default, persists preference in `localStorage`.
- Fullscreen: uses the Fullscreen API where available; Esc exits.

## File handling

- `New`: clears the editor; confirmation appears when unsaved changes exist.
- `Open`: prefers the File System Access API for `.md`/`.txt`; falls back to a file picker where unsupported.
- `Save`: writes back to the same handle when supported; otherwise downloads a `.md` file.
- `Print PDF`: uses `window.print()` with A4-friendly print styles.

## AI edits

- Selection toolbar → Ask AI opens an anchored prompt.
- Sends document text, selected text, user prompt, offsets/length/percent, and 500-char prefix/suffix context to `/api/ai`.
- Server-side route calls OpenAI Responses API (structured output) and returns replacement text only; selection is replaced and an "AI edit applied. Undo" toast appears (button + native undo, auto-dismisses).

## Math rendering

- Inline math: wrap LaTeX expressions with single dollar signs: `$E = mc^2$`
- Block math: wrap with double dollar signs on separate lines:
  ```
  $$
  \int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
  $$
  ```
- Uses KaTeX for fast, client-side rendering.

## Browser notes

- File System Access works best in Chromium-based desktop browsers; Safari/Firefox fall back to download/upload.
- Fullscreen may be limited on some mobile browsers; Esc (or browser UI) exits when supported.
- Uses safe-area insets for iOS padding.

## Deploy

Deploy to Vercel (or any Node-capable host):

1. Set `OPENAI_API_KEY` (and optional `OPENAI_MODEL`) in project environment variables.
2. `npm run build` during CI.
3. Serve with `npm run start` (Vercel handles this automatically).
