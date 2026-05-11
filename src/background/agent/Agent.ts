import { logger } from "../../shared/logger.ts";
import {
  AgentMetrics,
  ChatMessage,
  ChatMessageAssistant,
} from "../../shared/types.ts";
import { TrillimClient, TrillimMessage } from "../trillim/TrillimClient.ts";
import { extractToolCalls } from "./extractToolCalls.ts";
import { ToolCallPayload } from "./types.ts";
import { WebMCPTool, executeWebMCPTool } from "./webMcp.tsx";

type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GenerationMetrics = AgentMetrics;
export type AgentRunMetrics = AgentMetrics;

const SYSTEM_PROMPT =
  "You are a concise browser assistant. Use tools only when needed. " +
  "Do not call tools for greetings or questions you can answer directly.";
const createInitialMessages = (): Array<Message> => [
  {
    role: "system",
    content: SYSTEM_PROMPT,
  },
];
const END_OF_TEXT_TOKEN_REGEX = /<\|end_of_text\|>/g;
const END_OF_ROLE_TOKEN_REGEX = /<\|im_end\|>/g;
const sanitizeModelText = (text: string) =>
  text
    .replace(END_OF_TEXT_TOKEN_REGEX, "")
    .replace(END_OF_ROLE_TOKEN_REGEX, "")
    .trim();

class Agent {
  private trillim = new TrillimClient();
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

  public getTextGenerationPipeline = async (
    onDownloadProgress: (id: string, percentage: number) => void = () => {}
  ): Promise<TrillimClient> => {
    await this.trillim.healthCheck();
    onDownloadProgress("trillim-backend", 100);
    return this.trillim;
  };

  public generateText = async (
    prompt: string,
    role: "user" | "tool" = "user",
    onResponseUpdate: (response: string) => void = () => {},
    options: { appendPromptMessage?: boolean } = {}
  ): Promise<{ text: string; metrics: GenerationMetrics }> => {
    try {
      if (!this.messages.some(({ role }) => role === "system")) {
        this.messages = [...createInitialMessages(), ...this.messages];
      }

      if (options.appendPromptMessage ?? true) {
        this.messages = [
          ...this.messages,
          {
            role: "user",
            content:
              role === "tool"
                ? `Tool result:\n${prompt}\n\nUse this result to answer the user's request.`
                : prompt,
          },
        ];
      }

      logger.debug(
        "Agent",
        `generateText called with ${this.messages.length} messages, prompt length: ${prompt.length}`
      );

      // Add placeholder assistant message for streaming UI updates
      this.messages.push({ role: "assistant", content: "" });

      const completion = await this.trillim.complete(
        this.messagesForTrillim(),
        (partialResponse) => {
          this.messages = this.messages.map((message, index, all) => ({
            ...message,
            content:
              index === all.length - 1
                ? sanitizeModelText(partialResponse)
                : message.content,
          }));
          onResponseUpdate(sanitizeModelText(partialResponse));
        }
      );

      const response = sanitizeModelText(completion.text);

      this.messages = this.messages.map((message, index, all) => ({
        ...message,
        content: index === all.length - 1 ? response : message.content,
      }));

      logger.debug(
        "Agent",
        `Generated ${completion.metrics.generatedTokens} estimated tokens in ${completion.metrics.totalMs}ms`
      );
      return { text: response, metrics: completion.metrics };
    } catch (error) {
      const err = error as Error;
      logger.error(
        "Agent",
        "generateText failed",
        { promptLength: prompt.length },
        err
      );
      throw error;
    }
  };

  public runAgent = async (prompt: string): Promise<AgentRunMetrics> => {
    const initialPrompt = prompt;
    let roleForGeneration: "user" | "tool" = "user";
    let appendPromptMessage = true;
    const start = performance.now();
    let generatedTokens = 0;
    let prefillTokens = 0;
    let prefillMs = 0;
    let decodeMs = 0;
    const MAX_TOOL_CALLS = 3;
    let toolCallCount = 0;
    let directAnswerRetryCount = 0;
    let hasOpenTabsContext = false;

    try {
      logger.info(
        "Agent",
        `runAgent started with prompt: "${prompt.substring(0, 50)}..."`
      );

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
        const { toolCalls, message } = this.extractEnabledToolCalls(response);
        logger.debug(
          "Agent",
          `extractToolCalls found ${toolCalls.length} tools`
        );

        toolCalls.map((tool) => {
          if (
            !Boolean(assistantMessage.tools.find(({ id }) => tool.id === id))
          ) {
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
          tokensPerSecond:
            decodeMs > 0 ? generatedTokens / (decodeMs / 1000) : 0,
          msPerToken: generatedTokens > 0 ? decodeMs / generatedTokens : 0,
        };

        const { toolCalls, message } =
          this.extractEnabledToolCalls(finalResponse);
        messageInThisAgentRun = message;
        toolCallCount++;

        if (
          toolCalls.length > 0 &&
          !this.shouldExecuteToolForPrompt(initialPrompt)
        ) {
          logger.warn("Agent", "Ignored tool call for non-tool prompt", {
            prompt: initialPrompt,
            toolNames: toolCalls.map((toolCall) => toolCall.name),
          });
          prompt = null;
          assistantMessage.tools = [];
          assistantMessage.content =
            message.trim().length > 0
              ? message
              : this.fallbackDirectResponse(initialPrompt);
          this.messages = this.messages.map((historyMessage, index, all) => ({
            ...historyMessage,
            content:
              index === all.length - 1
                ? assistantMessage.content
                : historyMessage.content,
          }));
        } else if (
          toolCalls.length === 0 &&
          finalResponse.includes("<tool_call>") &&
          message.trim().length === 0 &&
          directAnswerRetryCount === 0
        ) {
          directAnswerRetryCount += 1;
          for (let i = this.messages.length - 1; i >= 0; i -= 1) {
            if (this.messages[i].role === "assistant") {
              this.messages[i] = {
                ...this.messages[i],
                content: "",
              };
              break;
            }
          }
          prompt =
            "Answer the user's last message directly in plain text. Do not call tools.";
          roleForGeneration = "user";
          appendPromptMessage = true;
        } else if (toolCalls.length === 0 || toolCallCount >= MAX_TOOL_CALLS) {
          prompt = null;
        } else {
          const toolCallsToExecute = this.resolveToolDependencies(
            toolCalls,
            initialPrompt,
            hasOpenTabsContext
          );
          const waitingForTabSelection =
            toolCallsToExecute.some(
              (toolCall) => toolCall.name === "get_open_tabs"
            ) && this.needsTabIdDiscovery(initialPrompt);
          const executedToolCallText =
            this.renderExecutedToolCalls(toolCallsToExecute);

          assistantMessage.tools = toolCallsToExecute.map((toolCall) => {
            const existingTool = assistantMessage.tools.find(
              ({ id }) => id === toolCall.id
            );
            return (
              existingTool || {
                name: toolCall.name,
                functionSignature: `${toolCall.name}(${JSON.stringify(
                  toolCall.arguments
                )})`,
                id: toolCall.id,
                result: "",
              }
            );
          });

          const toolResponses = await Promise.all(
            toolCallsToExecute.map(this.executeToolCall)
          );
          hasOpenTabsContext =
            hasOpenTabsContext ||
            toolResponses.some(({ name }) => name === "get_open_tabs");

          for (let i = this.messages.length - 1; i >= 0; i -= 1) {
            if (this.messages[i].role === "assistant") {
              this.messages[i] = {
                ...this.messages[i],
                content: executedToolCallText || finalResponse,
              };
              break;
            }
          }

          this.messages = [
            ...this.messages,
            ...toolResponses.map(({ name, result }) => ({
              role: "user" as const,
              content: `Tool ${name} returned:\n${result}`,
            })),
          ];

          assistantMessage.tools = assistantMessage.tools.map((tool) => ({
            ...tool,
            result:
              toolResponses.find(({ id }) => id === tool.id)?.result ||
              tool.result,
          }));

          this.chatMessages = [...prevChatMessages, assistantMessage];
          prompt = waitingForTabSelection
            ? "Use the open tabs result above. If the requested tab is present, call go_to_tab with its id. If it is not present, answer that it is not open. Do not invent IDs."
            : "Use the tool results above to continue the user's request. Call another listed tool if needed; otherwise answer normally.";
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
      logger.error(
        "Agent",
        "runAgent failed",
        { prompt: prompt.substring(0, 100) },
        err
      );
      throw error;
    }
  };

  private executeToolCall = async (
    toolCall: ToolCallPayload
  ): Promise<{ id: string; name: string; result: string }> => {
    const toolToUse = this.tools.find((t) => t.name === toolCall.name);
    if (!toolToUse) {
      const err = new Error(
        `Tool '${toolCall.name}' not found or is disabled.`
      );
      logger.error("Agent", "Tool not found", { toolName: toolCall.name }, err);
      throw err;
    }

    try {
      logger.info(
        "Agent",
        `Executing tool: ${toolCall.name}`,
        toolCall.arguments
      );
      const result = await executeWebMCPTool(toolToUse, toolCall.arguments);
      logger.debug("Agent", `Tool result: ${result.substring(0, 100)}...`);
      return {
        id: toolCall.id,
        name: toolCall.name,
        result,
      };
    } catch (error) {
      const err = error as Error;
      logger.error(
        "Agent",
        "Tool execution failed",
        { toolName: toolCall.name },
        err
      );
      return {
        id: toolCall.id,
        name: toolCall.name,
        result: `Error: ${err.message}`,
      };
    }
  };

  public clear() {
    this.messages = createInitialMessages();
    this.chatMessages = [];
  }

  private extractEnabledToolCalls(text: string): {
    toolCalls: ToolCallPayload[];
    message: string;
  } {
    const parsed = extractToolCalls(text);
    const enabledToolNames = new Set(this.tools.map((tool) => tool.name));
    const toolCalls = parsed.toolCalls.filter((toolCall) =>
      enabledToolNames.has(toolCall.name)
    );

    if (parsed.toolCalls.length !== toolCalls.length) {
      logger.warn("Agent", "Ignored invalid tool call", {
        parsedToolNames: parsed.toolCalls.map((toolCall) => toolCall.name),
        enabledToolNames: [...enabledToolNames],
      });
    }

    return { ...parsed, toolCalls };
  }

  private messagesForTrillim(): Array<TrillimMessage> {
    const [first, ...rest] = this.messages;
    const toolInstructions = this.renderToolInstructions();
    return [
      {
        role: "system",
        content: toolInstructions
          ? `${first.content}\n\n${toolInstructions}`
          : first.content,
      },
      ...rest
        .filter((message) => message.content.trim().length > 0)
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
    ];
  }

  private renderToolInstructions(): string {
    if (this.tools.length === 0) return "";

    const tools = this.tools
      .map((tool) => `${tool.name}${this.renderToolArguments(tool)}`)
      .join(", ");

    return (
      `The following tools are available: ${tools}.\n` +
      "Call it as follows: <tool_call>{JSON with name and arguments}</tool_call>\n" +
      "Rules: call get_open_tabs before go_to_tab/close_tab unless the user gave a tabId. Never invent tabId.\n" +
      "Use only listed tool names. If no tool is needed, answer normally."
    );
  }

  private resolveToolDependencies(
    toolCalls: ToolCallPayload[],
    initialPrompt: string,
    hasOpenTabsContext: boolean
  ): ToolCallPayload[] {
    if (
      !toolCalls.some((toolCall) =>
        this.requiresKnownTabId(
          toolCall,
          initialPrompt,
          hasOpenTabsContext
        )
      )
    ) {
      return toolCalls;
    }

    logger.warn("Agent", "Replaced tab action with open-tabs discovery", {
      toolNames: toolCalls.map((toolCall) => toolCall.name),
    });

    return [
      {
        id: JSON.stringify({ name: "get_open_tabs", arguments: {} }),
        name: "get_open_tabs",
        arguments: {},
      },
    ];
  }

  private requiresKnownTabId(
    toolCall: ToolCallPayload,
    initialPrompt: string,
    hasOpenTabsContext: boolean
  ): boolean {
    return (
      (toolCall.name === "go_to_tab" || toolCall.name === "close_tab") &&
      !hasOpenTabsContext &&
      !this.userProvidedTabId(initialPrompt)
    );
  }

  private needsTabIdDiscovery(prompt: string): boolean {
    return (
      /\b(go to|switch to|close)\b/i.test(prompt) &&
      !this.userProvidedTabId(prompt)
    );
  }

  private userProvidedTabId(prompt: string): boolean {
    return /\b(tab\s*(id\s*)?#?\s*\d+|tab\s+\d+)\b/i.test(prompt);
  }

  private renderExecutedToolCalls(toolCalls: ToolCallPayload[]): string {
    return toolCalls
      .map(
        (toolCall) =>
          `<tool_call>${JSON.stringify({
            name: toolCall.name,
            arguments: toolCall.arguments,
          })}</tool_call>`
      )
      .join("\n");
  }

  private renderToolArguments(tool: WebMCPTool): string {
    const entries = Object.entries(tool.inputSchema.properties).filter(
      ([name]) => tool.inputSchema.required.includes(name)
    );
    if (entries.length === 0) return "{}";

    const args = entries.reduce<Record<string, string>>(
      (acc, [name, property]) => ({
        ...acc,
        [name]: property.type,
      }),
      {}
    );

    return `(${Object.entries(args)
      .map(([name, type]) => `${name}:${type}`)
      .join(",")})`;
  }

  private shouldExecuteToolForPrompt(prompt: string): boolean {
    return /\b(tab|tabs|open|close|go to|switch|browser|page|website|history|url|highlight|find|search|current site|current page)\b/i.test(
      prompt
    );
  }

  private fallbackDirectResponse(prompt: string): string {
    if (/^\s*(hi|hello|hey|yo|sup)\b[!.\s]*$/i.test(prompt)) {
      return "Hello! How can I help?";
    }
    return "I can answer that directly. What would you like to know?";
  }
}

export default Agent;
