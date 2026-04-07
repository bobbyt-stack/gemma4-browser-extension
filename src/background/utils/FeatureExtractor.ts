import { FeatureExtractionPipeline, pipeline } from "@huggingface/transformers";

import { MODELS } from "../../shared/constants.ts";

class FeatureExtractor {
  private pipeline: FeatureExtractionPipeline = null;

  public getFeatureExtractionPipeline = async (
    onDownloadProgress: (id: string, percentage: number) => void = () => {}
  ): Promise<FeatureExtractionPipeline> => {
    if (this.pipeline) return this.pipeline;

    try {
      const pipe = await pipeline(
        "feature-extraction",
        MODELS.allMiniLM.modelId,
        {
          dtype: MODELS.allMiniLM.dtype,
          device: "webgpu",
          progress_callback: (i) => {
            if (i.status === "progress_total") {
              onDownloadProgress(MODELS.allMiniLM.modelId, i.progress);
            }
          },
        }
      );
      this.pipeline = pipe as FeatureExtractionPipeline;
      return this.pipeline;
    } catch (error) {
      console.error("Failed to initialize feature extraction pipeline:", error);
      throw error;
    }
  };

  public extractFeatures = async (
    input: Array<string>
  ): Promise<Array<Array<number>>> => {
    const pipe = await this.getFeatureExtractionPipeline();
    const result = await pipe(input, { normalize: true, pooling: "mean" });
    return result.tolist();
  };
}

export default FeatureExtractor;
