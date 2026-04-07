import { TaskType } from "../../../transformers.js/packages/transformers";
import { Dtype } from "./types.ts";

export const MODELS: Record<
  string,
  { modelId: string; title: string; dtype: Dtype; task: TaskType }
> = {
  allMiniLM: {
    modelId: "onnx-community/all-MiniLM-L6-v2-ONNX",
    title: "all-MiniLM-L6-v2",
    dtype: "fp32",
    task: "feature-extraction",
  },
  granite350m: {
    modelId: "onnx-community/granite-4.0-350m-ONNX-web",
    title: "Granite-4.0 350M (fp16)",
    dtype: "fp16",
    task: "text-generation",
  },
  granite1B: {
    modelId: "onnx-community/granite-4.0-1b-ONNX-web",
    title: "Granite-4.0 1B (q4)",
    dtype: "q4",
    task: "text-generation",
  },
  granite3B: {
    modelId: "onnx-community/granite-4.0-micro-ONNX-web",
    title: "Granite-4.0 3B (q4f16)",
    dtype: "q4f16",
    task: "text-generation",
  },
};

export const REQUIRED_MODEL_IDS = [
  MODELS.allMiniLM.modelId,
  MODELS.granite3B.modelId,
];

export const STORAGE_KEYS = {
  IS_ACTIVE: "isActive",
  //DOWNLOADED_MODELS: "downloadedModels",
};
