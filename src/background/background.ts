import {
  TRILLIM_BASE_URL,
  TRILLIM_MODEL_ID,
  TRILLIM_MODEL_TITLE,
} from "../shared/constants.ts";
import { logger } from "../shared/logger.ts";
import { AvailableTools } from "../shared/tools.ts";
import {
  BackgroundMessages,
  BackgroundTasks,
  ResponseStatus,
} from "../shared/types.ts";
import Agent, { AgentState } from "./agent/Agent.ts";
import { highlightWebsiteElementTool } from "./tools/askWebsite.ts";
//import { googleSearchTool } from "./tools/search.ts";
import {
  closeTabTool,
  getOpenTabsTool,
  goToTabTool,
  openUrlTool,
} from "./tools/tabActions.ts";
let lastProgress: number = 0;
const onModelDownloadProgress = (modelId: string, percentage: number) => {
  const rounded = Math.round(percentage * 100) / 100;
  if (rounded === lastProgress) return;
  lastProgress = rounded;

  logger.debug("Background", `Model download progress: ${modelId}`, {
    percentage: rounded,
  });

  chrome.runtime.sendMessage({
    type: BackgroundMessages.DOWNLOAD_PROGRESS,
    modelId,
    percentage: rounded,
  });
};

logger.info("Background", "Extension initialized", {
  version: chrome.runtime.getManifest().version,
  backend: TRILLIM_BASE_URL,
  modelConfig: {
    modelId: TRILLIM_MODEL_ID,
    modelTitle: TRILLIM_MODEL_TITLE,
  },
});

logger.setAppInfo(TRILLIM_MODEL_ID, TRILLIM_MODEL_TITLE);

let currentAgent: Agent | null = null;

const ACTIVE_TOOLS_STORAGE_KEY = "activeTools";
const AGENT_STATE_STORAGE_KEY = "agentState";

const availableTools: Record<string, () => any> = {
  [AvailableTools.GET_OPEN_TABS]: () => getOpenTabsTool,
  [AvailableTools.GO_TO_TAB]: () => goToTabTool,
  [AvailableTools.OPEN_URL]: () => openUrlTool,
  [AvailableTools.CLOSE_TAB]: () => closeTabTool,
  [AvailableTools.HIGHLIGHT_WEBSITE_ELEMENT]: () => highlightWebsiteElementTool,
  //[AvailableTools.GOOGLE_SEARCH]: () => googleSearchTool,
};

const createAgent = (toolNames?: string[], state?: AgentState): Agent => {
  const agent = new Agent();

  const toolsToRegister = toolNames ?? [];

  for (const toolName of toolsToRegister) {
    const toolFactory = availableTools[toolName];
    if (toolFactory) {
      agent.setTool(toolFactory());
    } else {
      console.warn(`[Agent] Unknown tool requested: ${toolName}`);
    }
  }

  if (state) {
    agent.restoreState(state);
  }

  agent.onChatMessageUpdate((messages) => {
    void persistAgentState(agent);
    chrome.runtime.sendMessage({
      type: BackgroundMessages.MESSAGES_UPDATE,
      messages,
    });
  });

  return agent;
};

const getStoredActiveTools = async (): Promise<string[]> => {
  const stored = await chrome.storage.local.get(ACTIVE_TOOLS_STORAGE_KEY);
  return sanitizeToolNames(stored[ACTIVE_TOOLS_STORAGE_KEY]);
};

const getStoredAgentState = async (): Promise<AgentState | undefined> => {
  const stored = await chrome.storage.local.get(AGENT_STATE_STORAGE_KEY);
  const state = stored[AGENT_STATE_STORAGE_KEY] as
    | Partial<AgentState>
    | undefined;
  if (!state || !Array.isArray(state.messages)) return undefined;
  return state as AgentState;
};

const persistAgentState = async (agent = currentAgent) => {
  if (!agent) return;
  await chrome.storage.local.set({
    [AGENT_STATE_STORAGE_KEY]: agent.getState(),
  });
};

const clearStoredAgentState = async () => {
  await chrome.storage.local.remove(AGENT_STATE_STORAGE_KEY);
};

const getAgent = async (): Promise<Agent> => {
  if (!currentAgent) {
    currentAgent = createAgent(
      await getStoredActiveTools(),
      await getStoredAgentState()
    );
  }
  return currentAgent;
};

const sanitizeToolNames = (toolNames: unknown): string[] => {
  if (!Array.isArray(toolNames)) return [];
  return toolNames.filter((toolName): toolName is string =>
    Object.prototype.hasOwnProperty.call(availableTools, toolName)
  );
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  logger.debug("Background", "Message received", { type: message.type });

  if (message.type === BackgroundTasks.CHECK_MODELS) {
    fetch(`${TRILLIM_BASE_URL}/healthz`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Trillim backend returned HTTP ${response.status}`);
        }
        sendResponse({
          status: ResponseStatus.SUCCESS,
          results: [
            {
              size: 0,
              cached: true,
              modelId: TRILLIM_MODEL_ID,
            },
          ],
        });
      })
      .catch((error: Error) => {
        logger.error("Background", "CHECK_MODELS failed", null, error);
        sendResponse({
          status: ResponseStatus.ERROR,
          error: `Trillim backend is not reachable at ${TRILLIM_BASE_URL}. Start it with \`uv run python main.py\`. ${error.message}`,
        });
      });
    return true;
  }

  if (message.type === BackgroundTasks.INITIALIZE_MODELS) {
    Promise.all([
      getAgent(),
    ])
      .then(([agent]) =>
        agent.getTextGenerationPipeline(onModelDownloadProgress)
      )
      .then(() => {
        sendResponse({ status: ResponseStatus.SUCCESS });
      })
      .catch((error: Error) => {
        console.error("INITIALIZE_MODELS failed:", error);
        sendResponse({ status: ResponseStatus.ERROR, error: error.message });
      });

    return true;
  }

  if (message.type === BackgroundTasks.AGENT_INITIALIZE) {
    const tools = sanitizeToolNames(message.tools);
    const statePromise = currentAgent
      ? Promise.resolve(currentAgent.getState())
      : getStoredAgentState();

    Promise.all([
      chrome.storage.local.set({
        [ACTIVE_TOOLS_STORAGE_KEY]: tools,
      }),
      statePromise,
    ]).then(([, state]) => {
      currentAgent = createAgent(tools, state);
      persistAgentState(currentAgent).then(() => {
        sendResponse({ status: ResponseStatus.SUCCESS });
        chrome.runtime.sendMessage({
          type: BackgroundMessages.MESSAGES_UPDATE,
          messages: currentAgent?.chatMessages ?? [],
        });
      });
    });
    return true;
  }

  if (message.type === BackgroundTasks.AGENT_GENERATE_TEXT) {
    logger.info("Background", "AGENT_GENERATE_TEXT", {
      prompt: message.prompt?.substring(0, 50),
    });
    getAgent()
      .then((agent) => {
        return agent.runAgent(message.prompt).then((metrics) => {
          void persistAgentState(agent);
          logger.debug("Background", "AGENT_GENERATE_TEXT complete", metrics);
          sendResponse({ status: ResponseStatus.SUCCESS, metrics });
        });
      })
      .catch((error: Error) => {
        logger.error("Background", "AGENT_GENERATE_TEXT failed", null, error);
        sendResponse({ status: ResponseStatus.ERROR, error: error.message });
      });

    return true;
  }

  if (message.type === BackgroundTasks.AGENT_GET_MESSAGES) {
    getAgent().then((agent) => {
      sendResponse({
        status: ResponseStatus.SUCCESS,
        messages: agent.chatMessages,
      });
    });
    return true;
  }

  if (message.type === BackgroundTasks.AGENT_CLEAR) {
    getAgent().then((agent) => {
      agent.clear();
      clearStoredAgentState().then(() => {
        sendResponse({ status: ResponseStatus.SUCCESS });
      });
    });
    return true;
  }

  if (message.type === "GET_DEBUG_LOGS") {
    logger.getLogs(500).then((logs) => {
      console.log("=== EXTENSION LOGS ===");
      logs.forEach((log) => {
        console.log(
          `[${new Date(log.timestamp).toISOString()}] [${log.source}] ${log.message}`,
          log.data
        );
      });
      sendResponse({ status: ResponseStatus.SUCCESS, logs });
    });
    return true;
  }

  if (message.type === "EXPORT_LOGS") {
    logger.exportLogs().then(async (logsJson) => {
      try {
        const blob = new Blob([logsJson], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        // Use chrome.downloads API to save file
        await chrome.downloads.download({
          url: url,
          filename: `extension-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
          saveAs: true,
        });

        logger.info("Background", "Logs exported to downloads folder");
      } catch (err) {
        logger.error("Background", "Failed to export logs", null, err as Error);
      }
      sendResponse({ status: ResponseStatus.SUCCESS });
    });
    return true;
  }

  if (message.type === "CLEAR_LOGS") {
    logger.clearLogs().then(() => {
      logger.info("Background", "Logs cleared");
      sendResponse({ status: ResponseStatus.SUCCESS });
    });
    return true;
  }

  return false;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});
