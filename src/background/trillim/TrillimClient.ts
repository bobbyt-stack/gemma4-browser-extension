import { TRILLIM_BASE_URL } from "../../shared/constants.ts";
import type { AgentMetrics } from "../../shared/types.ts";

export interface TrillimMessage {
  role: "system" | "user" | "assistant" | "search";
  content: string;
}

interface CompletionResult {
  text: string;
  metrics: AgentMetrics;
}

export class TrillimClient {
  constructor(private baseUrl = TRILLIM_BASE_URL) {}

  async healthCheck(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/healthz`);
    if (!response.ok) {
      throw new Error(`Trillim backend returned HTTP ${response.status}`);
    }
  }

  async complete(
    messages: Array<TrillimMessage>,
    onToken: (text: string) => void = () => {}
  ): Promise<CompletionResult> {
    const started = performance.now();
    let firstTokenAt: number | null = null;
    let text = "";

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages,
        stream: true,
        max_tokens: 512,
        temperature: 0.5,
        top_k: 20,
        top_p: 0.85,
        repetition_penalty: 1.0,
      }),
    });

    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Trillim completion failed with HTTP ${response.status}: ${body}`
      );
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice("data: ".length).trim();
          if (data === "[DONE]") continue;
          const chunk = JSON.parse(data);
          const error = chunk.error?.message;
          if (error) throw new Error(error);
          const token = chunk.choices?.[0]?.delta?.content;
          if (typeof token !== "string" || token.length === 0) continue;
          if (firstTokenAt === null) firstTokenAt = performance.now();
          text += token;
          onToken(text);
        }
      }
    }

    const ended = performance.now();
    const generatedTokens = estimateTokens(text);
    const prefillTokens = messages.reduce(
      (total, message) => total + estimateTokens(message.content),
      0
    );
    const prefillMs = Math.max(0, (firstTokenAt ?? ended) - started);
    const totalMs = Math.max(0, ended - started);
    const decodeMs = Math.max(0, totalMs - prefillMs);

    return {
      text,
      metrics: {
        generatedTokens,
        prefillTokens,
        prefillMs,
        prefillTokensPerSecond:
          prefillMs > 0 ? prefillTokens / (prefillMs / 1000) : 0,
        decodeMs,
        totalMs,
        tokensPerSecond: decodeMs > 0 ? generatedTokens / (decodeMs / 1000) : 0,
        msPerToken: generatedTokens > 0 ? decodeMs / generatedTokens : 0,
      },
    };
  }
}

const estimateTokens = (text: string): number =>
  Math.max(0, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.3));
