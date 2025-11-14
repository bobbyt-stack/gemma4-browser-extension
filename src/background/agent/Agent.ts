import {
  AutoModelForCausalLM,
  AutoTokenizer,
  Message,
  PreTrainedModel,
  PreTrainedTokenizer,
  TextStreamer,
} from "@huggingface/transformers";

import { MODELS } from "../../shared/constants.ts";
import { ChatMessage, ChatMessageAssistant } from "../../shared/types.ts";
import { calculateDownloadProgress } from "../utils/calculateDownloadProgress.ts";
import { extractToolCalls } from "./extractToolCalls.ts";
import { ToolCallPayload } from "./types.ts";
import {
  WebMCPTool,
  executeWebMCPTool,
  webMCPToolToChatTemplateTool,
} from "./webMcp.tsx";

interface Pipeline {
  tokenizer: PreTrainedTokenizer;
  model: PreTrainedModel;
}

/*const weatherTool: WebMCPTool = {
  name: "get_weather",
  description: "Get the weather for a given location",
  inputSchema: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "The name of the location.",
      },
    },
    required: ["location"],
  },
  execute: async ({ location }) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return location + ": sunny";
  },
};

const transportationTool: WebMCPTool = {
  name: "get_transport_method",
  description: "Get the transport method based on the weather.",
  inputSchema: {
    type: "object",
    properties: {
      weather: {
        type: "string",
        description: "weather can be sunny or rainy",
      },
    },
    required: ["weather"],
  },
  execute: async ({ weather }) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return weather === "sunny" ? "walk" : "drive";
  },
};

const tools: Array<WebMCPTool> = [weatherTool, transportationTool];*/

let pipeline: Pipeline = null;
const getTextGenerationPipeline = async (
  onDownloadProgress: (id: string, percentage: number) => void = () => {}
): Promise<Pipeline> => {
  if (pipeline) return pipeline;

  try {
    const m = MODELS.granite3B;

    const tokenizer = await AutoTokenizer.from_pretrained(m.modelId, {
      progress_callback: calculateDownloadProgress(({ percentage }) =>
        onDownloadProgress(m.modelId, percentage)
      ),
    });

    const model = await AutoModelForCausalLM.from_pretrained(m.modelId, {
      dtype: m.dtype,
      device: "webgpu",
      progress_callback: calculateDownloadProgress(({ percentage }) =>
        onDownloadProgress(m.modelId, percentage)
      ),
    });
    pipeline = { tokenizer, model };
    return pipeline;
  } catch (error) {
    console.error("Failed to initialize feature extraction pipeline:", error);
    throw error;
  }
};

class Agent {
  private pastKeyValues: any = null;
  private messages: Array<Message> = [
    {
      role: "system",
      content:
        "You are a helpful assistant. If you use a tool, explain first what you are doing.",
    },
  ];
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
    onResponseUpdate: (response: string) => void = () => {}
  ): Promise<string> => {
    this.messages = [...this.messages, { role, content: prompt }];
    const { tokenizer, model } = await this.getTextGenerationPipeline();

    const input = tokenizer.apply_chat_template(this.messages, {
      tools: this.tools.map(webMCPToolToChatTemplateTool),
      add_generation_prompt: true,
      return_dict: true,
    }) as Object;

    let response = "";

    this.messages.push({ role: "assistant", content: "" });

    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: false,
      callback_function: (token: string) => {
        response = response + token;
        this.messages = this.messages.map((message, index, all) => ({
          ...message,
          content: index === all.length - 1 ? response : message.content,
        }));
        onResponseUpdate(response.replace(/<\|end_of_text\|>$/, ""));
      },
    });

    // Generate the response
    const output: any = await model.generate({
      ...input,
      // @ts-expect-error
      past_key_values: this.pastKeyValues,
      max_new_tokens: 512,
      do_sample: false,
      streamer,
      return_dict_in_generate: true,
    });
    const { sequences, past_key_values } = output;
    this.pastKeyValues = past_key_values;

    const inputIds = (input as any).input_ids;
    response = tokenizer
      .batch_decode(sequences.slice(null, [inputIds.dims[1], null]), {
        skip_special_tokens: false,
      })[0]
      .replace(/<\|end_of_text\|>$/, "");

    this.messages = this.messages.map((message, index, all) => ({
      ...message,
      content: index === all.length - 1 ? response : message.content,
    }));

    return response;
  };

  public runAgent = async (prompt: string): Promise<void> => {
    let isUser = true;

    this.chatMessages = [
      ...this.chatMessages,
      { role: "user", content: prompt },
    ];
    const prevChatMessages = this.chatMessages;
    const assistantMessage: ChatMessageAssistant = {
      role: "assistant",
      content: "",
      tools: [],
    };

    this.chatMessages = [...prevChatMessages, assistantMessage];

    let messageInThisAgentRun = "";
    const updateAssistantMessage = (response: string) => {
      const { toolCalls, message } = extractToolCalls(response);

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

    while (prompt) {
      const finalResponse = await this.generateText(
        prompt,
        isUser ? "user" : "tool",
        updateAssistantMessage
      );
      isUser = false;
      const { toolCalls, message } = extractToolCalls(finalResponse);
      messageInThisAgentRun = message;

      if (toolCalls.length === 0) {
        prompt = null;
      } else {
        const toolResponses = await Promise.all(
          toolCalls.map(this.executeToolCall)
        );

        assistantMessage.tools = assistantMessage.tools.map((tool) => ({
          ...tool,
          result:
            toolResponses.find(({ id }) => id === tool.id)?.result ||
            tool.result,
        }));

        this.chatMessages = [...prevChatMessages, assistantMessage];
        prompt = toolResponses.map(({ result }) => result).join("\n");
      }
    }
    return;
  };

  private executeToolCall = async (
    toolCall: ToolCallPayload
  ): Promise<{ id: string; result: string }> => {
    const toolToUse = this.tools.find((t) => t.name === toolCall.name);
    if (!toolToUse)
      throw new Error(`Tool '${toolCall.name}' not found or is disabled.`);

    return {
      id: toolCall.id,
      result: await executeWebMCPTool(toolToUse, toolCall.arguments),
    };
  };

  public clear() {
    this.messages = [];
    this.pastKeyValues = null;
    this.chatMessages = [];
  }
}

export default Agent;
