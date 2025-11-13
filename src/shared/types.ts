export enum ResponseStatus {
  SUCCESS,
  ERROR,
  STARTED,
}

export enum BackgroundTasks {
  EXTRACT_FEATURES,
  TOGGLE_ACTIVE,
  INITIALIZE_MODELS,
  GENERATE_TEXT,
}

export enum BackgroundMessages {
  DOWNLOAD_PROGRESS,
  STATUS_UPDATE,
}

export const REQUIRED_MODEL_IDS = [
  "onnx-community/all-MiniLM-L6-v2-ONNX",
  "onnx-community/granite-4.0-micro-ONNX-web",
];

export type Dtype = "fp32" | "fp16" | "q4" | "q4f16";

export const MODELS: Record<
  string,
  { modelId: string; title: string; size: number; dtype: Dtype }
> = {
  allMiniLM: {
    modelId: "onnx-community/all-MiniLM-L6-v2-ONNX",
    title: "all-MiniLM-L6-v2",
    size: 90318300,
    dtype: "fp32",
  },
  granite350m: {
    modelId: "onnx-community/granite-4.0-350m-ONNX-web",
    title: "Granite-4.0 350M (fp16)",
    size: 0,
    dtype: "fp16",
  },
  granite1B: {
    modelId: "onnx-community/granite-4.0-1b-ONNX-web",
    title: "Granite-4.0 1B (q4)",
    size: 0,
    dtype: "q4",
  },
  granite3B: {
    modelId: "onnx-community/granite-4.0-micro-ONNX-web",
    title: "Granite-4.0 3B (q4f16)",
    size: 2324038975,
    dtype: "q4f16",
  },
};

export const STORAGE_KEYS = {
  IS_ACTIVE: "isActive",
  DOWNLOADED_MODELS: "downloadedModels",
};
