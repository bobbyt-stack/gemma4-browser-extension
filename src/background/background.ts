import { pipeline } from "@huggingface/transformers";

import {
  BackgroundMessages,
  BackgroundTasks,
  ResponseStatus,
} from "../shared/types.ts";
import { calculateDownloadProgress } from "./utils/calculateDownloadProgress.ts";

console.log("AgentGemma Extension: Background service worker loaded");

let isBackgroundActive = false;
let featureExtractionPipeline: any = null;

const onModelDownloadProgress = (modelId: string, percentage: number) => {
  console.log(modelId, percentage);
  chrome.runtime.sendMessage({
    type: BackgroundMessages.DOWNLOAD_PROGRESS,
    modelId,
    percentage,
  });
};

const getFeatureExtractionPipeline = async () => {
  if (featureExtractionPipeline) return featureExtractionPipeline;

  try {
    const pipe = await pipeline(
      "feature-extraction",
      "onnx-community/all-MiniLM-L6-v2-ONNX",
      {
        device: "webgpu",
        progress_callback: calculateDownloadProgress(({ percentage }) =>
          onModelDownloadProgress(
            "onnx-community/all-MiniLM-L6-v2-ONNX",
            percentage
          )
        ),
      }
    );
    featureExtractionPipeline = pipe;
    return featureExtractionPipeline;
  } catch (error) {
    console.error("Failed to initialize feature extraction pipeline:", error);
    throw error;
  }
};

const updateIcon = async (active: boolean) => {
  await chrome.action.setBadgeText({
    text: active ? "ON" : "",
  });

  await chrome.action.setBadgeBackgroundColor({
    color: active ? "#22c55e" : "#6b7280",
  });
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === BackgroundTasks.TOGGLE_ACTIVE) {
    isBackgroundActive = message.isActive;
    updateIcon(isBackgroundActive);
    console.log(
      `Extension ${isBackgroundActive ? "activated" : "deactivated"}`
    );
    sendResponse({ success: true });
  }

  if (message.type === BackgroundTasks.INITIALIZE_MODELS) {
    getFeatureExtractionPipeline()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error("INITIALIZE_MODELS failed:", error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // Keep message channel open for async response
  }

  if (message.type === BackgroundTasks.EXTRACT_FEATURES) {
    extractFeatures(message.text)
      .then((result) => {
        sendResponse({ status: ResponseStatus.ERROR, result });
      })
      .catch((error) => {
        console.error("EXTRACT_FEATURES failed:", error);
        sendResponse({ status: "Task failed", error: error.message });
      });

    return true; // Keep message channel open for async response
  }

  return false;
});

const extractFeatures = async (text: string): Promise<number[]> => {
  const pipe = await getFeatureExtractionPipeline();
  const result = await pipe(text, { normalize: true, pooling: "mean" });
  return result.tolist();
};

chrome.runtime.onInstalled.addListener(() => {
  console.log("AgentGemma Extension installed");
  chrome.storage.local.set({ isActive: false });
  updateIcon(false);
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.isActive) {
    isBackgroundActive = changes.isActive.newValue;
    updateIcon(isBackgroundActive);
  }
});

/*

// Example ML task
async function runMLTask() {
  try {
    const pipe = await initializePipeline();

    // Example: Analyze sentiment of sample text
    const text = "I love using this Chrome extension!";
    const result = await pipe(text);

    console.log("ML Task Result:", result);

    // You can send results to content script or sidebar
    chrome.runtime.sendMessage({
      type: "STATUS_UPDATE",
      status: `Analysis complete: ${result[0].label} (${(result[0].score * 100).toFixed(1)}%)`,
    });

    return result;
  } catch (error) {
    console.error("ML task error:", error);
    throw error;
  }
}

// Analyze arbitrary text
async function analyzeText(text: string) {
  const pipe = await initializePipeline();
  const result = await pipe(text);
  return result;
}

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log("AgentGemma Extension installed");
  chrome.storage.local.set({ isActive: false });
  updateIcon(false);
});

// Open sidebar when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.isActive) {
    isBackgroundActive = changes.isActive.newValue;
    updateIcon(isBackgroundActive);
  }
});
*/
