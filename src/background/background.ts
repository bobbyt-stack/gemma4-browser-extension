import {
  AutoModelForCausalLM,
  AutoTokenizer,
  type FeatureExtractionPipeline,
  Message,
  PreTrainedModel,
  PreTrainedTokenizer,
  TextStreamer,
  pipeline,
} from "@huggingface/transformers";

import {
  BackgroundMessages,
  BackgroundTasks,
  MODELS,
  ResponseStatus,
} from "../shared/types.ts";
import { calculateDownloadProgress } from "./utils/calculateDownloadProgress.ts";

console.log("AgentGemma Extension: Background service worker loaded");

let isBackgroundActive = false;
let featureExtractionPipeline: FeatureExtractionPipeline = null;
let llm: { tokenizer: PreTrainedTokenizer; model: PreTrainedModel } = null;
let pastKeyValues = null;

const onModelDownloadProgress = (modelId: string, percentage: number) => {
  console.log(modelId, percentage);
  chrome.runtime.sendMessage({
    type: BackgroundMessages.DOWNLOAD_PROGRESS,
    modelId,
    percentage,
  });
};

const getFeatureExtractionPipeline =
  async (): Promise<FeatureExtractionPipeline> => {
    if (featureExtractionPipeline) return featureExtractionPipeline;

    try {
      const pipe = await pipeline(
        "feature-extraction",
        MODELS.allMiniLM.modelId,
        {
          dtype: MODELS.allMiniLM.dtype,
          device: "webgpu",
          progress_callback: calculateDownloadProgress(({ percentage }) =>
            onModelDownloadProgress(MODELS.allMiniLM.modelId, percentage)
          ),
        }
      );
      featureExtractionPipeline = pipe as FeatureExtractionPipeline;
      return featureExtractionPipeline;
    } catch (error) {
      console.error("Failed to initialize feature extraction pipeline:", error);
      throw error;
    }
  };

const getTextGenerationPipeline = async () => {
  if (llm) return llm;

  try {
    const m = MODELS.granite3B;

    const tokenizer = await AutoTokenizer.from_pretrained(m.modelId, {
      progress_callback: calculateDownloadProgress(({ percentage }) =>
        onModelDownloadProgress(m.modelId, percentage)
      ),
    });

    const model = await AutoModelForCausalLM.from_pretrained(m.modelId, {
      dtype: m.dtype,
      device: "webgpu",
      progress_callback: calculateDownloadProgress(({ percentage }) =>
        onModelDownloadProgress(m.modelId, percentage)
      ),
    });
    llm = { tokenizer, model };
    return llm;
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
    sendResponse({ status: ResponseStatus.SUCCESS });
  }

  if (message.type === BackgroundTasks.INITIALIZE_MODELS) {
    Promise.all([getFeatureExtractionPipeline(), getTextGenerationPipeline()])
      .then(() => {
        sendResponse({ status: ResponseStatus.SUCCESS });
      })
      .catch((error) => {
        console.error("INITIALIZE_MODELS failed:", error);
        sendResponse({ status: ResponseStatus.ERROR, error: error.message });
      });

    return true; // Keep message channel open for async response
  }

  if (message.type === BackgroundTasks.GENERATE_TEXT) {
    generateText(message.messages, console.log)
      .then((result) => {
        sendResponse({ status: ResponseStatus.SUCCESS, result });
      })
      .catch((error) => {
        console.error("GENERATE_TEXT failed:", error);
        sendResponse({ status: ResponseStatus.ERROR, error: error.message });
      });

    return true; // Keep message channel open for async response
  }

  if (message.type === BackgroundTasks.EXTRACT_FEATURES) {
    extractFeatures(message.text)
      .then((result) => {
        sendResponse({ status: ResponseStatus.SUCCESS, result });
      })
      .catch((error) => {
        console.error("EXTRACT_FEATURES failed:", error);
        sendResponse({ status: ResponseStatus.ERROR, error: error.message });
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

const generateText = async (
  messages: Array<Message>,
  onToken: (token: string) => void
): Promise<string> => {
  const { tokenizer, model } = await getTextGenerationPipeline();

  console.log(messages);

  const input = tokenizer.apply_chat_template(messages, {
    //tools,
    add_generation_prompt: true,
    return_dict: true,
  });

  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: false,
    callback_function: (token: string) => {
      onToken(token);
    },
  });

  // Generate the response
  const { sequences, past_key_values } = await model.generate({
    ...input,
    past_key_values: pastKeyValues,
    max_new_tokens: 512,
    do_sample: false,
    streamer,
    return_dict_in_generate: true,
  });
  pastKeyValues = past_key_values;

  const response = tokenizer
    .batch_decode(sequences.slice(null, [input.input_ids.dims[1], null]), {
      skip_special_tokens: false,
    })[0]
    .replace(/<\|end_of_text\|>$/, "");

  return response;
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
