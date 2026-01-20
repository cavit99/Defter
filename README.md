# Defter — Minimalist writing room

Single-page, distraction-free writing app with rich text, contextual AI edits, and clean PDF output.

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
- Autosave: markdown draft stored locally as a safety net.
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
