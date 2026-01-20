"use client";

import Image from "next/image";
import { marked } from "marked";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TurndownService from "turndown";
import katex from "katex";
import "katex/dist/katex.min.css";

type Theme = "light" | "dark";

type ToolbarState = {
  visible: boolean;
  x: number;
  y: number;
};

type ToastState = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type SelectionMeta = {
  start: number;
  end: number;
  length: number;
  percentThroughDocument: number;
  contextBefore: string;
  contextAfter: string;
};

type AiResponse = {
  replacementText: string;
};

type PickerType = {
  description?: string;
  accept?: Record<string, string[]>;
};

type OpenPickerOptions = {
  types?: PickerType[];
  excludeAcceptAllOption?: boolean;
  multiple?: boolean;
};

type SavePickerOptions = {
  suggestedName?: string;
  types?: PickerType[];
};

type AccessWindow = Window &
  Partial<{
    showOpenFilePicker: (
      options?: OpenPickerOptions,
    ) => Promise<FileSystemFileHandle[]>;
    showSaveFilePicker: (
      options?: SavePickerOptions,
    ) => Promise<FileSystemFileHandle>;
  }>;

const DRAFT_KEY = "defter-draft";
const THEME_KEY = "defter-theme";

marked.setOptions({
  gfm: true,
  breaks: true,
});

export default function Home() {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const selectionRangeRef = useRef<Range | null>(null);
  const toolbarAnchorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const aiPopoverRef = useRef<HTMLFormElement | null>(null);
  const aiUndoRef = useRef<{ html: string; markdown: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const savedMarkdownRef = useRef<string>("");

  const [markdown, setMarkdown] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [toolbar, setToolbar] = useState<ToolbarState>({
    visible: false,
    x: 0,
    y: 0,
  });
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const turndownService = useMemo(() => {
    const service = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
    service.keep(["u"]);
    return service;
  }, []);

  const placeCaretAtEnd = useCallback((element: HTMLElement) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, []);

  const renderMath = useCallback((html: string) => {
    try {
      // Block math: $$...$$
      const block = html.replace(
        /\$\$([\s\S]+?)\$\$/g,
        (_, expr) =>
          `<div class="math-block">${katex.renderToString(expr.trim(), {
            throwOnError: false,
            displayMode: true,
          })}</div>`,
      );
      // Inline math: $...$ (simple, ignores escaped \$)
      return block.replace(
        /(^|[^\\])\$([^\$\n]+?)\$/g,
        (_, prefix, expr) =>
          `${prefix}<span class="math-inline">${katex.renderToString(
            expr.trim(),
            {
              throwOnError: false,
              displayMode: false,
            },
          )}</span>`,
      );
    } catch (error) {
      console.error("Math render failed", error);
      return html;
    }
  }, []);

  const setEditorContentFromMarkdown = useCallback(
    (md: string, focus = false) => {
      if (!editorRef.current) return;
      const rawHtml = (marked.parse(md || "") as string) || "";
      const html = renderMath(rawHtml);
      editorRef.current.innerHTML = html || "<p><br></p>";
      if (focus) {
        placeCaretAtEnd(editorRef.current);
      }
      setMarkdown(md);
    },
    [placeCaretAtEnd, renderMath],
  );

  const updateMarkdownFromEditor = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const md = turndownService.turndown(html);
    setMarkdown(md);
  }, [turndownService]);

  const handleInput = () => {
    updateMarkdownFromEditor();
  };

  const setAnchorFromRange = (range: Range) => {
    const rect = range.getBoundingClientRect();
    const clientRects = range.getClientRects();
    const targetRect =
      rect.width === 0 && rect.height === 0 && clientRects.length
        ? clientRects[clientRects.length - 1]
        : rect;
    const x = targetRect.left + targetRect.width / 2 + window.scrollX;
    const y = targetRect.top + window.scrollY - 12;
    toolbarAnchorRef.current = { x, y };
  };

  const toInlineAwareHtml = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      let html = (marked.parse(trimmed) as string) || "";
      // If there's no blank line separation, treat as inline and unwrap the <p>.
      if (!trimmed.includes("\n\n")) {
        const match = html.match(/^<p>([\s\S]*)<\/p>\s*$/);
        if (match) {
          html = match[1].replace(/\n+/g, " ");
        }
      }
      return renderMath(html);
    },
    [renderMath],
  );

  const handleSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editorRef.current) {
      setToolbar((prev) => ({ ...prev, visible: false }));
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editorRef.current.contains(range.commonAncestorContainer)) {
      setToolbar((prev) => ({ ...prev, visible: false }));
      return;
    }

    selectionRangeRef.current = range.cloneRange();
    setAnchorFromRange(range);

    if (selection.isCollapsed) {
      if (aiOpen && selectionRangeRef.current) {
        // Keep the toolbar open while the AI popover is active.
        return;
      }
      setToolbar((prev) => ({ ...prev, visible: false }));
      return;
    }

    setToolbar({
      visible: true,
      x: toolbarAnchorRef.current.x,
      y: toolbarAnchorRef.current.y,
    });
  }, [aiOpen]);

  const toggleFormat = (command: "bold" | "italic" | "underline") => {
    document.execCommand(command);
    updateMarkdownFromEditor();
  };

  const openAiPrompt = () => {
    if (!selectionRangeRef.current) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        selectionRangeRef.current = range.cloneRange();
        setAnchorFromRange(range);
      }
    }
    if (!selectionRangeRef.current) {
      setToast({ message: "Place the cursor or select text to ask AI." });
      return;
    }
    setAiOpen(true);
    setToolbar((prev) => ({
      visible: true,
      x: toolbarAnchorRef.current.x || prev.x,
      y: toolbarAnchorRef.current.y || prev.y,
    }));
  };

  const getSelectionMeta = useCallback(
    (range: Range): SelectionMeta => {
      if (!editorRef.current) {
        return {
          start: 0,
          end: 0,
          length: 0,
          percentThroughDocument: 0,
          contextBefore: "",
          contextAfter: "",
        };
      }
      const plainText = editorRef.current.innerText || "";
      const beforeRange = range.cloneRange();
      beforeRange.selectNodeContents(editorRef.current);
      beforeRange.setEnd(range.startContainer, range.startOffset);
      const start = beforeRange.toString().length;
      const selected = range.toString();
      const end = start + selected.length;
      const contextBefore = plainText.slice(Math.max(0, start - 500), start);
      const contextAfter = plainText.slice(end, Math.min(plainText.length, end + 500));
      const percentThroughDocument =
        plainText.length === 0 ? 0 : Number((end / plainText.length).toFixed(3));

      return {
        start,
        end,
        length: selected.length,
        percentThroughDocument,
        contextBefore,
        contextAfter,
      };
    },
    [],
  );

  const applyAiReplacement = useCallback(
    (replacement: string) => {
      if (!editorRef.current || !selectionRangeRef.current) return;

      aiUndoRef.current = {
        html: editorRef.current.innerHTML,
        markdown,
      };

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(selectionRangeRef.current);

      const html = toInlineAwareHtml(replacement || "");
      document.execCommand("insertHTML", false, html);
      updateMarkdownFromEditor();
      setToast({
        message: "AI edit applied.",
        actionLabel: "Undo",
        onAction: () => {
          if (!editorRef.current || !aiUndoRef.current) return;
          editorRef.current.innerHTML = aiUndoRef.current.html;
          setMarkdown(aiUndoRef.current.markdown);
          aiUndoRef.current = null;
          setToast(null);
        },
      });
    },
    [markdown, updateMarkdownFromEditor, toInlineAwareHtml],
  );

  const submitAi = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!selectionRangeRef.current || !editorRef.current || !aiPrompt.trim()) {
      setAiOpen(false);
      return;
    }
    const range = selectionRangeRef.current;
    const selectedText = range.toString();
    const documentText = editorRef.current.innerText || "";
    const selectionMeta = getSelectionMeta(range);

    try {
      setAiLoading(true);
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentText,
          documentMarkdown: markdown,
          selectedText,
          userPrompt: aiPrompt,
          selection: {
            ...selectionMeta,
            selectionLength: selectedText.length,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("AI request failed");
      }

      const data = (await response.json()) as AiResponse;
      applyAiReplacement(data.replacementText);
    } catch (error) {
      console.error("AI request failed", error);
      setToast({ message: "AI request failed. Try again." });
    } finally {
      setAiLoading(false);
      setAiOpen(false);
      setAiPrompt("");
    }
  };

  const handleNew = useCallback(async () => {
    if (isDirty && !window.confirm("Discard unsaved changes?")) {
      return;
    }
    fileHandleRef.current = null;
    savedMarkdownRef.current = "";
    setIsDirty(false);
    setEditorContentFromMarkdown("", true);
  }, [isDirty, setEditorContentFromMarkdown]);

  const handleOpen = useCallback(async () => {
    const win = window as AccessWindow;
    if (win.showOpenFilePicker) {
      try {
        const [handle] = await win.showOpenFilePicker({
          types: [
            {
              description: "Markdown",
              accept: { "text/markdown": [".md"], "text/plain": [".txt"] },
            },
          ],
          excludeAcceptAllOption: false,
          multiple: false,
        });
        if (!handle) return;
        fileHandleRef.current = handle;
        const file = await handle.getFile();
        const content = await file.text();
        savedMarkdownRef.current = content;
        setIsDirty(false);
        setEditorContentFromMarkdown(content, true);
      } catch (error) {
        console.error("Open file picker failed", error);
      }
      return;
    }
    fileInputRef.current?.click();
  }, [setEditorContentFromMarkdown]);

  const handleOpenFromPicker = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    fileHandleRef.current = null;
    savedMarkdownRef.current = content;
    setIsDirty(false);
    setEditorContentFromMarkdown(content, true);
    event.target.value = "";
  };

  const handleSave = useCallback(async () => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const win = window as AccessWindow;

    if (win.showSaveFilePicker) {
      try {
        const handle =
          fileHandleRef.current ??
          (await win.showSaveFilePicker({
            suggestedName: "draft.md",
            types: [
              {
                description: "Markdown",
                accept: { "text/markdown": [".md"] },
              },
            ],
          }));

        if (!handle) return;
        fileHandleRef.current = handle;
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        savedMarkdownRef.current = markdown;
        setIsDirty(false);
        setToast({ message: "Saved to file." });
        return;
      } catch (error) {
        console.warn("Save via File System Access failed, using download", error);
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "draft.md";
    link.click();
    URL.revokeObjectURL(url);
    savedMarkdownRef.current = markdown;
    setIsDirty(false);
    setToast({ message: "Saved as download." });
  }, [markdown]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen();
  }, []);

  const toggleTheme = useCallback(
    (forced?: Theme) => {
      const nextTheme =
        forced ??
        (theme === "dark"
          ? "light"
          : "dark");
      setTheme(nextTheme);
      if (typeof window !== "undefined") {
        localStorage.setItem(THEME_KEY, nextTheme);
        document.body.dataset.theme = nextTheme;
      }
    },
    [theme],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedTheme = localStorage.getItem(THEME_KEY) as Theme | null;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme = storedTheme ?? (prefersDark ? "dark" : "light");
    setTheme(initialTheme);
    document.body.dataset.theme = initialTheme;

    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      setEditorContentFromMarkdown(draft, false);
    } else {
      setEditorContentFromMarkdown("", false);
    }
  }, [setEditorContentFromMarkdown]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (typeof window === "undefined") return;
      localStorage.setItem(DRAFT_KEY, markdown);
      savedMarkdownRef.current = markdown;
      setIsDirty(false);
    }, 800);
    return () => clearTimeout(timeout);
  }, [markdown]);

  useEffect(() => {
    setIsDirty(markdown !== savedMarkdownRef.current);
  }, [markdown]);

  useEffect(() => {
    const onSelectionChange = () => handleSelection();
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;
      if (mod && key === "s") {
        event.preventDefault();
        handleSave();
      } else if (mod && key === "o") {
        event.preventDefault();
        handleOpen();
      } else if (mod && key === "n") {
        event.preventDefault();
        handleNew();
      } else if (mod && key === "p") {
        event.preventDefault();
        handlePrint();
      } else if (mod && event.shiftKey && key === "f") {
        event.preventDefault();
        toggleFullscreen();
      } else if (mod && event.shiftKey && key === "l") {
        event.preventDefault();
        toggleTheme();
      } else if (event.key === "Escape" && aiOpen) {
        setAiOpen(false);
        setToolbar((prev) => ({ ...prev, visible: false }));
      }
    };

    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [
    aiOpen,
    handleSelection,
    handleSave,
    handleOpen,
    handleNew,
    handlePrint,
    toggleFullscreen,
    toggleTheme,
  ]);

  const toolbarClass =
    "fixed z-40 flex items-center gap-2 rounded-full bg-surface/90 px-3 py-2 shadow-lg backdrop-blur border border-ink/10 text-sm";

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => {
      setToast(null);
    }, toast.onAction ? 6000 : 4000);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!aiOpen) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!aiPopoverRef.current) return;
      if (aiPopoverRef.current.contains(event.target as Node)) return;
      setAiOpen(false);
      setToolbar((prev) => ({ ...prev, visible: false }));
    };
    document.addEventListener("mousedown", onClickOutside, true);
    return () => document.removeEventListener("mousedown", onClickOutside, true);
  }, [aiOpen]);

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-sand/40 via-void/5 to-sand/30 text-ink selection:bg-accent/30 selection:text-ink transition-colors">
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.txt,text/plain"
        className="hidden"
        onChange={handleOpenFromPicker}
      />
      <div
        className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 pb-12 pt-[18px] sm:px-10 md:px-14 lg:px-16"
        style={{
          paddingTop: "calc(18px + env(safe-area-inset-top))",
          paddingLeft: "calc(24px + env(safe-area-inset-left))",
          paddingRight: "calc(24px + env(safe-area-inset-right))",
          paddingBottom: "calc(48px + env(safe-area-inset-bottom))",
        }}
      >
        <header className="sticky top-0 z-30 -mx-2 mb-8 flex items-center justify-between gap-3 rounded-full bg-surface/80 px-3 py-3 backdrop-blur border border-ink/10 shadow-sm">
          <div className="flex items-center gap-3">
            <Image
              src={theme === "dark" ? "/dark-logo.webp" : "/light-logo.webp"}
              alt="Defter"
              width={120}
              height={32}
              className="h-8 w-auto select-none"
              priority
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              aria-label="New document"
              className="icon-button"
              onClick={handleNew}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <button
              aria-label="Open file"
              className="icon-button"
              onClick={handleOpen}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h5l2 2h9v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              aria-label="Save file"
              className="icon-button"
              onClick={handleSave}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 4h12l2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8 4v5h8V4M8 14h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              aria-label="Print to PDF"
              className="icon-button"
              onClick={handlePrint}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 7V3h10v4m0 10v4H7v-4m-3-2V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              aria-label="Toggle theme"
              className="icon-button"
              onClick={() => toggleTheme()}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              className={`icon-button ${isFullscreen ? "bg-ink text-paper" : ""}`}
              onClick={() => toggleFullscreen()}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 4H4v4m0 8v4h4m8-16h4v4m0 8v4h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-4 rounded-3xl border border-ink/10 bg-surface/80 p-6 shadow-xl backdrop-blur-lg md:p-8">
          <section
            className="relative isolate min-h-[60vh] flex-1 rounded-2xl bg-paper/80 p-5 text-lg leading-[1.8] shadow-inner ring-1 ring-ink/5 transition-colors md:p-7"
            onMouseUp={handleSelection}
            onKeyUp={handleSelection}
            onTouchEnd={() => setTimeout(handleSelection, 100)}
            onContextMenu={(event) => {
              event.preventDefault();
              const selection = window.getSelection();
              if (!selection || selection.rangeCount === 0) return;
              const range = selection.getRangeAt(0);
              selectionRangeRef.current = range.cloneRange();
              toolbarAnchorRef.current = {
                x: event.pageX,
                y: event.pageY - 8,
              };
              setToolbar({
                visible: true,
                x: event.pageX,
                y: event.pageY - 8,
              });
            }}
          >
            <div
              className={`absolute right-4 top-4 h-2.5 w-2.5 rounded-full ${isDirty ? "bg-amber-400" : "bg-ink/30"} shadow-[0_0_0_4px_rgba(0,0,0,0.02)] transition-colors`}
              aria-label={isDirty ? "Unsaved changes" : "Saved"}
            />
            <div
              ref={editorRef}
              className="editor text-[18px] leading-[1.8] text-ink outline-none"
              contentEditable
              aria-label="Document editor"
              spellCheck
              onInput={handleInput}
              data-placeholder="Begin typing. Select text to format or ask AI."
            />
          </section>
        </main>
      </div>

      {toolbar.visible && (
        <div
          className={toolbarClass}
          style={{
            left: `${toolbar.x}px`,
            top: `${Math.max(12, toolbar.y)}px`,
            transform: "translate(-50%, -100%)",
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            aria-label="Bold"
            className="icon-button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleFormat("bold")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M7 5h6a3 3 0 0 1 0 6H7zm0 6h7a3 3 0 0 1 0 6H7z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            aria-label="Italic"
            className="icon-button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleFormat("italic")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M14 5h-4m4 14h-4m3-14-4 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            aria-label="Underline"
            className="icon-button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleFormat("underline")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M7 5v5a5 5 0 0 0 10 0V5m-12 14h14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            aria-label="Ask AI"
            className="icon-button bg-accent/80 text-void hover:bg-accent"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => openAiPrompt()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 4v4m0 8v4m0-12a4 4 0 1 0 4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        </div>
      )}

      {aiOpen && selectionRangeRef.current && (
        <form
          ref={aiPopoverRef}
          className="fixed z-40 mt-2 flex max-w-md -translate-x-1/2 flex-col gap-2 rounded-2xl border border-ink/15 bg-surface/95 p-4 shadow-xl backdrop-blur"
          style={{
            left: `${toolbarAnchorRef.current.x || toolbar.x}px`,
            top: `${Math.max(24, (toolbarAnchorRef.current.y || toolbar.y) + 8)}px`,
          }}
          onSubmit={submitAi}
        >
          <div className="flex items-center justify-between">
            <label className="text-xs uppercase tracking-[0.2em] text-muted">
              Ask AI
            </label>
            {aiLoading && (
              <span className="text-[11px] uppercase tracking-[0.15em] text-muted">
                Thinking…
              </span>
            )}
          </div>
          <input
            className="w-full rounded-xl border border-ink/10 bg-paper px-3 py-2 text-sm text-ink outline-none ring-ink/10 focus:ring-2"
            placeholder="Rewrite this passage..."
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setAiOpen(false);
              }
            }}
            autoFocus
          />
          <input type="submit" className="hidden" />
        </form>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-ink/10 bg-surface/95 px-4 py-3 text-sm text-ink shadow-lg backdrop-blur">
          <span>{toast.message}</span>
          {toast.onAction && toast.actionLabel && (
            <button
              className="rounded-full bg-ink text-paper px-3 py-1 text-xs font-semibold transition hover:bg-ink/90"
              onClick={toast.onAction}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
