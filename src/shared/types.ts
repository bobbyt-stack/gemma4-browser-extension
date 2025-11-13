export enum ResponseStatus {
  SUCCESS,
  ERROR,
  STARTED,
}

export enum BackgroundTasks {
  EXTRACT_FEATURES,
  TOGGLE_ACTIVE,
  INITIALIZE_MODELS,
}

export enum BackgroundMessages {
  DOWNLOAD_PROGRESS,
  STATUS_UPDATE,
}

export const REQUIRED_MODEL_IDS = ["onnx-community/all-MiniLM-L6-v2-ONNX"];

export const MODELS: Record<string, { modelId: string; size: number }> = {
  allMiniLM: {
    modelId: "onnx-community/all-MiniLM-L6-v2-ONNX",
    size: 90318300,
  },
};

export const STORAGE_KEYS = {
  IS_ACTIVE: "isActive",
  DOWNLOADED_MODELS: "downloadedModels",
};
