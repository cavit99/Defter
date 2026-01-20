import OpenAI from "openai";
import { NextResponse } from "next/server";

type RequestBody = {
  documentText?: string;
  documentMarkdown?: string;
  selectedText?: string;
  userPrompt?: string;
  selection?: {
    start?: number;
    end?: number;
    length?: number;
    percentThroughDocument?: number;
    contextBefore?: string;
    contextAfter?: string;
    selectionLength?: number;
  };
};

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const {
    documentText,
    documentMarkdown,
    selectedText,
    userPrompt,
    selection,
  } = body ?? {};

  if (
    typeof documentText !== "string" ||
    typeof selectedText !== "string" ||
    typeof userPrompt !== "string"
  ) {
    return NextResponse.json(
      { error: "documentText, selectedText, and userPrompt are required." },
      { status: 400 },
    );
  }

  const start = Number(selection?.start ?? 0);
  const end = Number(selection?.end ?? start + selectedText.length);
  const length = Number(selection?.length ?? selectedText.length);
  const percent =
    typeof selection?.percentThroughDocument === "number"
      ? selection.percentThroughDocument
      : 0;
  const contextBefore =
    typeof selection?.contextBefore === "string" ? selection.contextBefore : "";
  const contextAfter =
    typeof selection?.contextAfter === "string" ? selection.contextAfter : "";

  const prompt = [
    "You are editing a markdown document. Replace the selected span with the best possible rewrite.",
    "Return only the replacement text. Do not wrap it in code fences or add commentary.",
    "",
    `User prompt: ${userPrompt}`,
    "",
    "Selected text:",
    selectedText,
    "",
    "Position metadata:",
    `start: ${start}, end: ${end}, length: ${length}, percentThroughDocument: ${percent}`,
    "",
    "Prefix context:",
    contextBefore,
    "",
    "Suffix context:",
    contextAfter,
    "",
    "Document markdown (for context only):",
    documentMarkdown ?? "",
    "",
    "Document plain text (for context only, do not echo back):",
    documentText,
    "",
    "Preserve inline markdown styles such as **bold**, _italic_, and <u>underline</u> when relevant.",
  ].join("\n");

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.responses.parse({
      model: process.env.OPENAI_MODEL || "gpt-5.2",
      instructions:
    "You are a precise writing assistant. Replace the user's selected markdown span. If the selection is empty, insert your output at the cursor without deleting surrounding text. Output only the replacement text with no extra narration.",
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "ai_edit",
          strict: true,
          schema: {
            type: "object",
            properties: {
              replacementText: {
                type: "string",
                description: "Replacement markdown/plain text for the selected range.",
              },
            },
            required: ["replacementText"],
            additionalProperties: false,
          },
        },
      },
    });

    if (response.status === "incomplete") {
      throw new Error(
        `AI response incomplete: ${response.incomplete_details?.reason ?? "unknown reason"}`,
      );
    }

    const parsed = response.output_parsed as { replacementText?: string } | null;

    if (!parsed?.replacementText) {
      throw new Error("No replacement text returned");
    }

    return NextResponse.json({ replacementText: parsed.replacementText.trim() });
  } catch (error) {
    console.error("AI route error", error);
    return NextResponse.json(
      { error: "AI request failed. Please try again." },
      { status: 500 },
    );
  }
}
