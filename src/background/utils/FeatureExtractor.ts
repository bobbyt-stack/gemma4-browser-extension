class FeatureExtractor {
  private dimensions = 384;

  public getFeatureExtractionPipeline = async (
    onDownloadProgress: (id: string, percentage: number) => void = () => {}
  ): Promise<FeatureExtractor> => {
    onDownloadProgress("local-lexical-embeddings", 100);
    return this;
  };

  public extractFeatures = async (
    input: Array<string>
  ): Promise<Array<Array<number>>> => {
    return input.map((text) => this.embed(text));
  };

  private embed(text: string): Array<number> {
    const vector = new Array(this.dimensions).fill(0);
    const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

    for (const token of tokens) {
      for (const feature of this.featuresForToken(token)) {
        const hash = this.hash(feature);
        const index = Math.abs(hash) % this.dimensions;
        const sign = hash % 2 === 0 ? 1 : -1;
        vector[index] += sign;
      }
    }

    let magnitude = 0;
    for (const value of vector) magnitude += value * value;
    magnitude = Math.sqrt(magnitude) || 1;
    return vector.map((value) => value / magnitude);
  }

  private featuresForToken(token: string): Array<string> {
    const features = [token];
    if (token.length > 4) features.push(token.slice(0, 4), token.slice(-4));
    for (let i = 0; i < token.length - 2; i += 1) {
      features.push(token.slice(i, i + 3));
    }
    return features;
  }

  private hash(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash | 0;
  }
}

export default FeatureExtractor;
