import { ToolCallPayload } from "./types.ts";

export const extractToolCalls = (
  text: string
): { toolCalls: ToolCallPayload[]; message: string } => {
  const cleanedText = text.replace(/<\|end_of_text\|>/g, "");
  
  const toolCalls: ToolCallPayload[] = [];

  const jsonMatches = Array.from(
    cleanedText.matchAll(/<tool_call>([\s\S]*?)<\/tool_call>/g)
  );

  for (const match of jsonMatches) {
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
      console.warn("[extractToolCalls] malformed JSON tool call", match[1]);
    }
  }

  if (toolCalls.length === 0) {
    const directJsonMatches = Array.from(
      cleanedText.matchAll(/\{[^{]*"name"\s*:\s*"([^"]+)"[^{]*"arguments"\s*:\s*(\{[^{}]*\})[^{}]*\}/g)
    );
    for (const match of directJsonMatches) {
      const name = match[1];
      try {
        const args = JSON.parse(match[2] || "{}");
        toolCalls.push({
          name,
          arguments: args,
          id: JSON.stringify({ name, arguments: args }),
        });
      } catch {
        toolCalls.push({
          name,
          arguments: {},
          id: JSON.stringify({ name, arguments: {} }),
        });
      }
    }
  }

  const message = cleanedText
    .replace(/<\|end_of_text\|>/g, "")
    .replace(/<\|im_start\|>/g, "")
    .replace(/<\|im_end\|>/g, "")
    .replace(/<tool_response>[\s\S]*?<\/tool_response>/g, "")
    .replace(/<tool_response>|<\/tool_response>/g, "")
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
    .replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/g, "")
    .replace(/<\|tool_call\>[\s\S]*?(?:<tool_call\|>|$)/g, "")
    .trim();

  return { toolCalls, message };
};