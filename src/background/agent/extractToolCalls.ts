import { ToolCallPayload } from "./types.ts";

export const extractToolCalls = (
  text: string
): { toolCalls: ToolCallPayload[]; message: string } => {
  const cleanedText = text.replace(/<\|end_of_text\|>/g, "");
  const matches = Array.from(
    cleanedText.matchAll(/<tool_call>([\s\S]*?)<\/tool_call>/g)
  );
  const toolCalls: ToolCallPayload[] = [];

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed && typeof parsed.name === "string") {
        toolCalls.push({
          name: parsed.name,
          arguments: parsed.arguments ?? {},
          id: JSON.stringify({
            name: parsed.name,
            arguments: parsed.arguments ?? {},
          }),
        });
      }
    } catch {
      // ignore malformed tool call payloads
    }
  }

  // Remove both complete and incomplete tool calls
  // Complete: <tool_call>...</tool_call>
  // Incomplete: <tool_call>... (no closing tag yet)
  const message = text
    .replace(/<\|end_of_text\|>/g, "")
    .replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/g, "")
    .trim();

  return { toolCalls, message };
};
