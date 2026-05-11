import {
  LOCAL_EMBEDDING_TITLE,
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
import Agent from "./agent/Agent.ts";
import {
  createAskWebsiteTool,
  highlightWebsiteElementTool,
} from "./tools/askWebsite.ts";
//import { googleSearchTool } from "./tools/search.ts";
import {
  closeTabTool,
  getOpenTabsTool,
  goToTabTool,
  openUrlTool,
} from "./tools/tabActions.ts";
import FeatureExtractor from "./utils/FeatureExtractor.ts";
import VectorHistory from "./vectorHistory/VectorHistory.ts";

import Tab = chrome.tabs.Tab;

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
    embeddingTitle: LOCAL_EMBEDDING_TITLE,
  },
});

logger.setAppInfo(TRILLIM_MODEL_ID, TRILLIM_MODEL_TITLE);

const featureExtractor = new FeatureExtractor();
const vectorHistory = new VectorHistory(featureExtractor);
let currentAgent: Agent | null = null;

const availableTools: Record<string, () => any> = {
  [AvailableTools.GET_OPEN_TABS]: () => getOpenTabsTool,
  [AvailableTools.GO_TO_TAB]: () => goToTabTool,
  [AvailableTools.OPEN_URL]: () => openUrlTool,
  [AvailableTools.CLOSE_TAB]: () => closeTabTool,
  [AvailableTools.FIND_HISTORY]: () => vectorHistory.findHistoryTool,
  [AvailableTools.ASK_WEBSITE]: () => createAskWebsiteTool(featureExtractor),
  [AvailableTools.HIGHLIGHT_WEBSITE_ELEMENT]: () => highlightWebsiteElementTool,
  //[AvailableTools.GOOGLE_SEARCH]: () => googleSearchTool,
};

const createAgent = (toolNames?: string[]): Agent => {
  const agent = new Agent();

  const toolsToRegister = toolNames || Object.keys(availableTools);

  for (const toolName of toolsToRegister) {
    const toolFactory = availableTools[toolName];
    if (toolFactory) {
      agent.setTool(toolFactory());
    } else {
      console.warn(`[Agent] Unknown tool requested: ${toolName}`);
    }
  }

  agent.onChatMessageUpdate((messages) =>
    chrome.runtime.sendMessage({
      type: BackgroundMessages.MESSAGES_UPDATE,
      messages,
    })
  );

  return agent;
};

const getAgent = (): Agent => {
  if (!currentAgent) {
    currentAgent = createAgent();
  }
  return currentAgent;
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
    const agent = getAgent();
    Promise.all([
      featureExtractor.getFeatureExtractionPipeline(onModelDownloadProgress),
      agent.getTextGenerationPipeline(onModelDownloadProgress),
    ])
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
    const tools = message.tools as string[] | undefined;
    currentAgent = createAgent(tools);
    sendResponse({ status: ResponseStatus.SUCCESS });
    chrome.runtime.sendMessage({
      type: BackgroundMessages.MESSAGES_UPDATE,
      messages: [],
    });
    return true;
  }

  if (message.type === BackgroundTasks.AGENT_GENERATE_TEXT) {
    const agent = getAgent();
    logger.info("Background", "AGENT_GENERATE_TEXT", {
      prompt: message.prompt?.substring(0, 50),
    });
    agent
      .runAgent(message.prompt)
      .then((metrics) => {
        logger.debug("Background", "AGENT_GENERATE_TEXT complete", metrics);
        sendResponse({ status: ResponseStatus.SUCCESS, metrics });
      })
      .catch((error: Error) => {
        logger.error("Background", "AGENT_GENERATE_TEXT failed", null, error);
        sendResponse({ status: ResponseStatus.ERROR, error: error.message });
      });

    return true;
  }

  if (message.type === BackgroundTasks.AGENT_GET_MESSAGES) {
    const agent = getAgent();
    sendResponse({
      status: ResponseStatus.SUCCESS,
      messages: agent.chatMessages,
    });
    return true;
  }

  if (message.type === BackgroundTasks.AGENT_CLEAR) {
    const agent = getAgent();
    agent.clear();
    sendResponse({ status: ResponseStatus.SUCCESS });
    return true;
  }

  if (message.type === BackgroundTasks.EXTRACT_FEATURES) {
    featureExtractor
      .extractFeatures([message.text])
      .then((result) => {
        sendResponse({ status: ResponseStatus.SUCCESS, result: result[0] });
      })
      .catch((error: Error) => {
        logger.error(
          "Background",
          "EXTRACT_FEATURES failed",
          { text: message.text?.substring(0, 50) },
          error
        );
        sendResponse({ status: ResponseStatus.ERROR, error: error.message });
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

const addCurrentPageToVectorHistory = async (tabId: number, tab: Tab) => {
  const title = tab.title || "Untitled";
  let description = "";

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const metaDescription = document.querySelector(
          'meta[name="description"]'
        );
        return metaDescription?.getAttribute("content") || "";
      },
    });
    description = results[0]?.result || "";
  } catch (error) {
    logger.warn("Background", "Could not extract description", { tabId });
  }

  if (!description) {
    description = tab.url || "";
  }

  // Add to vector history
  try {
    await vectorHistory.addEntry(title, description, tab.url);
    logger.info("Background", "Added to vector history", {
      title,
      url: tab.url,
    });
  } catch (error) {
    const err = error as Error;
    logger.error(
      "Background",
      "Failed to add page to vector history",
      { title },
      err
    );
  }
};

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url?.startsWith("http")) return;

  // Add page to vector history for later retrieval
  addCurrentPageToVectorHistory(tabId, tab);
});
