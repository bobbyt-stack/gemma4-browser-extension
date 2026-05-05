import {
  DynamicCache,
  TextGenerationPipeline,
  TextStreamer,
  pipeline,
} from "@huggingface/transformers";

import { MODELS, TEXT_GENERATION_ID } from "../../shared/constants.ts";
import {
  AgentMetrics,
  ChatMessage,
  ChatMessageAssistant,
} from "../../shared/types.ts";
import { logger } from "../../shared/logger.ts";
import { extractToolCalls } from "./extractToolCalls.ts";
import { ToolCallPayload } from "./types.ts";
import {
  WebMCPTool,
  executeWebMCPTool,
  webMCPToolToChatTemplateTool,
} from "./webMcp.tsx";

type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  [key: string]: any;
};

type GenerationMetrics = AgentMetrics;
export type AgentRunMetrics = AgentMetrics;

let pipe: TextGenerationPipeline | null = null;
const SYSTEM_PROMPT =
  "You are a helpful assistant with access to external tools declared in this conversation. " +
  "Never claim you do not have tools when tool declarations are present. " +
  "When asked what tools you have, list the declared tool names exactly. " +
  "IMPORTANT: After receiving tool results, respond with a FINAL answer to the user's question. " +
  "Do NOT call tools again after getting results unless absolutely necessary. " +
  "If you can answer the user's question from the tool results, do so directly without calling more tools.";
const createInitialMessages = (): Array<Message> => [
  {
    role: "system",
    content: SYSTEM_PROMPT,
  },
];
const END_OF_TEXT_TOKEN_REGEX = /<\|end_of_text\|>/g;
const END_OF_ROLE_TOKEN_REGEX = /<\|im_end\|>/g;
const sanitizeModelText = (text: string) =>
  text.replace(END_OF_TEXT_TOKEN_REGEX, "").replace(END_OF_ROLE_TOKEN_REGEX, "").trim();

const getTextGenerationPipeline = async (
  onDownloadProgress: (id: string, percentage: number) => void = () => {}
): Promise<TextGenerationPipeline> => {
  if (pipe) return pipe;

  try {
    const m = MODELS[TEXT_GENERATION_ID];
    logger.info("Agent", `Loading model: ${m.modelId} with dtype: ${m.dtype}`);
    
    pipe = (await pipeline("text-generation", m.modelId, {
      dtype: m.dtype,
      device: "webgpu",
      progress_callback: (i) => {
        if (i.status === "progress_total") {
          onDownloadProgress(m.modelId, i.progress);
        }
      },
    })) as TextGenerationPipeline;

    logger.info("Agent", `Model loaded successfully: ${m.modelId}`);
    return pipe;
  } catch (error) {
    const err = error as Error;
    logger.error("Agent", "Failed to initialize text generation pipeline", { modelId: MODELS[TEXT_GENERATION_ID].modelId }, err);
    throw error;
  }
};

class Agent {
  private pastKeyValues: DynamicCache | null = null;
  private messages: Array<Message> = createInitialMessages();
  private _chatMessages: Array<ChatMessage> = [];
  private chatMessagesListener: Array<
    (chatMessages: Array<ChatMessage>) => void
  > = [];
  private tools: Array<WebMCPTool> = [];

  constructor() {}

  get chatMessages() {
    return this._chatMessages;
  }

  set chatMessages(chatMessages: Array<ChatMessage>) {
    this._chatMessages = chatMessages;
    this.chatMessagesListener.forEach((listener) => listener(chatMessages));
  }

  public onChatMessageUpdate(callback: (messages: Array<ChatMessage>) => void) {
    this.chatMessagesListener.push(callback);
  }

  public setTool = (tool: WebMCPTool) => {
    this.tools = [...this.tools, tool];
  };

  public getTextGenerationPipeline = getTextGenerationPipeline;

  public generateText = async (
    prompt: string,
    role: "user" | "tool" = "user",
    onResponseUpdate: (response: string) => void = () => {},
    options: { appendPromptMessage?: boolean } = {}
  ): Promise<{ text: string; metrics: GenerationMetrics }> => {
    const start = performance.now();
    let firstTokenAt: number | null = null;

    try {
      if (!this.messages.some(({ role }) => role === "system")) {
        this.messages = [...createInitialMessages(), ...this.messages];
      }

      if (options.appendPromptMessage ?? true) {
        this.messages = [...this.messages, { role, content: prompt }];
      }
      
      logger.debug("Agent", `generateText called with ${this.messages.length} messages, prompt length: ${prompt.length}`);
      
      const pipe = await this.getTextGenerationPipeline();
      const conversation = [...this.messages];
      if (!this.pastKeyValues) {
        this.pastKeyValues = new DynamicCache();
      }
      let response = "";

      // Add placeholder assistant message for streaming UI updates
      this.messages.push({ role: "assistant", content: "" });

      const streamer = new TextStreamer(pipe.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: false,
        callback_function: (token: string) => {
          if (firstTokenAt === null) {
            firstTokenAt = performance.now();
          }
          response = response + token;
          this.messages = this.messages.map((message, index, all) => ({
            ...message,
            content: index === all.length - 1 ? response : message.content,
          }));
          onResponseUpdate(sanitizeModelText(response));
      },
    });

    const input = pipe.tokenizer.apply_chat_template(conversation, {
      tools: this.tools.map(webMCPToolToChatTemplateTool),
      add_generation_prompt: true,
      return_dict: true,
    }) as any;

    const output: any = await pipe(conversation, {
      tools: this.tools.map(webMCPToolToChatTemplateTool),
      add_generation_prompt: true,
      past_key_values: this.pastKeyValues,
      max_new_tokens: 1024,
      do_sample: true,
      temperature: 0.5,
      top_k: 20,
      top_p: 0.85,
      repetition_penalty: 1.0,
      streamer,
    });

    const promptLength = Number(input.input_ids.dims.at(-1) ?? 0);
    const finalGeneratedText = output?.[0]?.generated_text;

    if (Array.isArray(finalGeneratedText) && response.trim().length === 0) {
      const lastMessage = finalGeneratedText[finalGeneratedText.length - 1];
      if (typeof lastMessage === "string") {
        response = lastMessage;
      } else {
        const content =
          typeof lastMessage?.content === "string" ? lastMessage.content : "";
        const toolCalls = Array.isArray(lastMessage?.tool_calls)
          ? lastMessage.tool_calls
          : [];

        if (toolCalls.length > 0) {
          const renderedToolCalls = toolCalls
            .map((toolCall: any) => {
              const functionName = toolCall?.function?.name;
              const functionArguments = toolCall?.function?.arguments ?? {};
              if (typeof functionName !== "string" || !functionName.trim()) {
                return "";
              }

              const serializedArguments =
                typeof functionArguments === "string"
                  ? functionArguments
                  : JSON.stringify(functionArguments);

              return `<tool_call>\n{"name": "${functionName}", "arguments": ${serializedArguments}}\n</tool_call>`;
            })
            .filter(Boolean)
            .join("");

          if (renderedToolCalls) response = renderedToolCalls;
          else if (content.length > 0) response = content;
        } else if (content.length > 0) {
          response = content;
        }
      }
    }

    const generatedIds: any = pipe.tokenizer(response, {
      add_special_tokens: false,
    }).input_ids;
    const generatedTokens = Array.isArray(generatedIds?.[0])
      ? generatedIds[0].length
      : Array.isArray(generatedIds)
        ? generatedIds.length
        : 0;

    response = sanitizeModelText(response);

    this.messages = this.messages.map((message, index, all) => ({
      ...message,
      content: index === all.length - 1 ? response : message.content,
    }));

    const end = performance.now();
    const prefillMs = Math.max(0, (firstTokenAt ?? end) - start);
    const totalMs = Math.max(0, end - start);
    const decodeMs = Math.max(0, totalMs - prefillMs);

    const metrics: GenerationMetrics = {
      generatedTokens,
      prefillTokens: promptLength,
      prefillMs,
      prefillTokensPerSecond:
        prefillMs > 0 ? promptLength / (prefillMs / 1000) : 0,
      decodeMs,
      totalMs,
      tokensPerSecond: decodeMs > 0 ? generatedTokens / (decodeMs / 1000) : 0,
      msPerToken: generatedTokens > 0 ? decodeMs / generatedTokens : 0,
    };

    logger.debug("Agent", `Generated ${generatedTokens} tokens in ${totalMs}ms`);
    return { text: response, metrics };
  } catch (error) {
    const err = error as Error;
    logger.error("Agent", "generateText failed", { promptLength: prompt.length }, err);
    throw error;
  }
  };

  public runAgent = async (prompt: string): Promise<AgentRunMetrics> => {
    let roleForGeneration: "user" | "tool" = "user";
    let appendPromptMessage = true;
    const start = performance.now();
    let generatedTokens = 0;
    let prefillTokens = 0;
    let prefillMs = 0;
    let decodeMs = 0;
    const MAX_TOOL_CALLS = 3;
    let toolCallCount = 0;

    try {
      logger.info("Agent", `runAgent started with prompt: "${prompt.substring(0, 50)}..."`);

      this.chatMessages = [
        ...this.chatMessages,
        { role: "user", content: prompt },
      ];
      const prevChatMessages = this.chatMessages;
      const assistantMessage: ChatMessageAssistant = {
        role: "assistant",
        content: "",
        tools: [],
        metrics: {
          generatedTokens: 0,
          prefillTokens: 0,
          prefillMs: 0,
          prefillTokensPerSecond: 0,
          decodeMs: 0,
          totalMs: 0,
          tokensPerSecond: 0,
          msPerToken: 0,
        },
      };

      this.chatMessages = [...prevChatMessages, assistantMessage];

      let messageInThisAgentRun = "";
      const updateAssistantMessage = (response: string) => {
        const { toolCalls, message } = extractToolCalls(response);
        logger.debug("Agent", `extractToolCalls found ${toolCalls.length} tools`);

        toolCalls.map((tool) => {
          if (!Boolean(assistantMessage.tools.find(({ id }) => tool.id === id))) {
            assistantMessage.tools = [
              ...assistantMessage.tools,
              {
                name: tool.name,
                functionSignature: `${tool.name}(${JSON.stringify(
                  tool.arguments
                )})`,
                id: tool.id,
                result: "",
              },
            ];
          }
        });

      assistantMessage.content = messageInThisAgentRun + message;

      this.chatMessages = [...prevChatMessages, assistantMessage];
    };

    while (prompt !== null) {
      const generation = await this.generateText(
        prompt,
        roleForGeneration,
        updateAssistantMessage,
        { appendPromptMessage }
      );

      const finalResponse = generation.text;
      generatedTokens += generation.metrics.generatedTokens;
      prefillTokens += generation.metrics.prefillTokens;
      prefillMs += generation.metrics.prefillMs;
      decodeMs += generation.metrics.decodeMs;
      const elapsedMs = Math.max(0, performance.now() - start);
      assistantMessage.metrics = {
        generatedTokens,
        prefillTokens,
        prefillMs,
        prefillTokensPerSecond:
          prefillMs > 0 ? prefillTokens / (prefillMs / 1000) : 0,
        decodeMs,
        totalMs: elapsedMs,
        tokensPerSecond: decodeMs > 0 ? generatedTokens / (decodeMs / 1000) : 0,
        msPerToken: generatedTokens > 0 ? decodeMs / generatedTokens : 0,
      };

      const { toolCalls, message } = extractToolCalls(finalResponse);
      messageInThisAgentRun = message;
      toolCallCount++;

      if (toolCalls.length === 0 || toolCallCount >= MAX_TOOL_CALLS) {
        prompt = null;
      } else {
        const toolResponses = await Promise.all(
          toolCalls.map(this.executeToolCall)
        );

        for (let i = this.messages.length - 1; i >= 0; i -= 1) {
          if (this.messages[i].role === "assistant") {
            this.messages[i] = {
              ...this.messages[i],
              content: message,
            };
            break;
          }
        }

        for (let i = this.messages.length - 1; i >= 0; i -= 1) {
          if (this.messages[i].role === "assistant") {
            this.messages[i] = {
              ...this.messages[i],
              tool_calls: toolCalls.map((call) => ({
                id: call.id,
                type: "function",
                function: {
                  name: call.name,
                  arguments: call.arguments,
                },
              })),
            };
            break;
          }
        }

        this.messages = [
          ...this.messages,
          ...toolResponses.map(({ id, name, result }) => ({
            role: "tool" as const,
            tool_call_id: id,
            name,
            content: result,
          })),
        ];

        assistantMessage.tools = assistantMessage.tools.map((tool) => ({
          ...tool,
          result:
            toolResponses.find(({ id }) => id === tool.id)?.result ||
            tool.result,
        }));

        this.chatMessages = [...prevChatMessages, assistantMessage];
        prompt =
          "Based on the tool results above, provide your FINAL answer to the user's question. Do NOT call any more tools.";
        roleForGeneration = "user";
        appendPromptMessage = true;
      }
    }
    const totalMs = Math.max(0, performance.now() - start);
    assistantMessage.metrics = {
      generatedTokens,
      prefillTokens,
      prefillMs,
      prefillTokensPerSecond:
        prefillMs > 0 ? prefillTokens / (prefillMs / 1000) : 0,
      decodeMs,
      totalMs,
      tokensPerSecond: decodeMs > 0 ? generatedTokens / (decodeMs / 1000) : 0,
      msPerToken: generatedTokens > 0 ? decodeMs / generatedTokens : 0,
    };
    this.chatMessages = [...prevChatMessages, assistantMessage];

    return {
      generatedTokens,
      prefillTokens,
      prefillMs,
      prefillTokensPerSecond:
        prefillMs > 0 ? prefillTokens / (prefillMs / 1000) : 0,
      decodeMs,
      totalMs,
      tokensPerSecond: decodeMs > 0 ? generatedTokens / (decodeMs / 1000) : 0,
      msPerToken: generatedTokens > 0 ? decodeMs / generatedTokens : 0,
    };
  } catch (error) {
    const err = error as Error;
    logger.error("Agent", "runAgent failed", { prompt: prompt.substring(0, 100) }, err);
    throw error;
  }
  };

  private executeToolCall = async (
    toolCall: ToolCallPayload
  ): Promise<{ id: string; name: string; result: string }> => {
    const toolToUse = this.tools.find((t) => t.name === toolCall.name);
    if (!toolToUse) {
      const err = new Error(`Tool '${toolCall.name}' not found or is disabled.`);
      logger.error("Agent", "Tool not found", { toolName: toolCall.name }, err);
      throw err;
    }

    try {
      logger.info("Agent", `Executing tool: ${toolCall.name}`, toolCall.arguments);
      const result = await executeWebMCPTool(toolToUse, toolCall.arguments);
      logger.debug("Agent", `Tool result: ${result.substring(0, 100)}...`);
      return {
        id: toolCall.id,
        name: toolCall.name,
        result,
      };
    } catch (error) {
      const err = error as Error;
      logger.error("Agent", "Tool execution failed", { toolName: toolCall.name }, err);
      return {
        id: toolCall.id,
        name: toolCall.name,
        result: `Error: ${err.message}`,
      };
    }
  };

  public clear() {
    this.messages = createInitialMessages();
    void this.pastKeyValues?.dispose();
    this.pastKeyValues = null;
    this.chatMessages = [];
  }
}

export default Agent;
