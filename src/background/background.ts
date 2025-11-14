import {
  BackgroundMessages,
  BackgroundTasks,
  ResponseStatus,
} from "../shared/types.ts";
import Agent from "./agent/Agent.ts";
import { getOpenTabsTool, goToTabTool } from "./tools/openTabs.ts";
import FeatureExtractor from "./utils/FeatureExtractor.ts";


const onModelDownloadProgress = (modelId: string, percentage: number) =>
  chrome.runtime.sendMessage({
    type: BackgroundMessages.DOWNLOAD_PROGRESS,
    modelId,
    percentage,
  });

const agent = new Agent();
const featureExtractor = new FeatureExtractor();

agent.setTool(getOpenTabsTool);
agent.setTool(goToTabTool);

agent.onChatMessageUpdate((messages) =>
  chrome.runtime.sendMessage({
    type: BackgroundMessages.MESSAGES_UPDATE,
    messages,
  })
);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === BackgroundTasks.INITIALIZE_MODELS) {
    Promise.all([
      featureExtractor.getFeatureExtractionPipeline(onModelDownloadProgress),
      agent.getTextGenerationPipeline(onModelDownloadProgress),
    ])
      .then(() => {
        sendResponse({ status: ResponseStatus.SUCCESS });
      })
      .catch((error) => {
        console.error("INITIALIZE_MODELS failed:", error);
        sendResponse({ status: ResponseStatus.ERROR, error: error.message });
      });

    return true;
  }

  if (message.type === BackgroundTasks.AGENT_GENERATE_TEXT) {
    agent
      .runAgent(message.prompt)
      .then(() => {
        sendResponse({ status: ResponseStatus.SUCCESS });
      })
      .catch((error) => {
        console.error("GENERATE_TEXT failed:", error);
        sendResponse({ status: ResponseStatus.ERROR, error: error.message });
      });

    return true;
  }

  if (message.type === BackgroundTasks.AGENT_GET_MESSAGES) {
    sendResponse({
      status: ResponseStatus.SUCCESS,
      messages: agent.chatMessages,
    });
    return true;
  }

  if (message.type === BackgroundTasks.AGENT_CLEAR) {
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
      .catch((error) => {
        console.error("EXTRACT_FEATURES failed:", error);
        sendResponse({ status: ResponseStatus.ERROR, error: error.message });
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
