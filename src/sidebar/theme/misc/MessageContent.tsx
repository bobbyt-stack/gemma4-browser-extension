import { useEffect, useState } from "react";
import showdown from "showdown";

const converter = new showdown.Converter();
interface ParsedContent {
  thinkContent: string | null;
  afterContent: string;
  isThinking: boolean;
}

function parseThinkTags(content: string): ParsedContent {
  const openTagIndex = content.indexOf("<think>");

  if (openTagIndex === -1) {
    return {
      thinkContent: null,
      afterContent: content,
      isThinking: false,
    };
  }

  const closeTagIndex = content.indexOf("</think>");

  if (closeTagIndex === -1) {
    return {
      thinkContent: content.slice(openTagIndex + 7),
      afterContent: "",
      isThinking: true,
    };
  }

  return {
    thinkContent: content.slice(openTagIndex + 7, closeTagIndex),
    afterContent: content.slice(closeTagIndex + 8),
    isThinking: false,
  };
}

export default function MessageContent({ content }: { content: string }) {
  const [showThinking, setShowThinking] = useState(false);
  const [thinkingTime, setThinkingTime] = useState(0);
  const parsed = parseThinkTags(content);

  useEffect(() => {
    if (parsed.isThinking) {
      const startTime = Date.now();
      const interval = setInterval(() => {
        setThinkingTime((Date.now() - startTime) / 1000);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [parsed.isThinking]);

  if (!parsed.thinkContent) {
    return (
      <div
        className="prose prose-sm prose-invert prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2 prose-h3:text-base prose-p:my-2 prose-ul:my-2 prose-li:my-0 max-w-none"
        dangerouslySetInnerHTML={{
          __html: converter.makeHtml(content),
        }}
      />
    );
  }

  return (
    <div className="space-y-2">
      {parsed.isThinking ? (
        <div className="flex items-center gap-2 text-gray-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-blue-400" />
          <span className="text-xs">
            Thinking for {thinkingTime.toFixed(1)}s...
          </span>
        </div>
      ) : (
        <div>
          <button
            onClick={() => setShowThinking(!showThinking)}
            className="text-xs text-gray-400 hover:text-gray-300"
          >
            {showThinking ? "Hide" : "Show"} thinking
          </button>
          {showThinking && (
            <div
              className="prose prose-invert prose-li:text-xs prose-headings:text-xs prose-p:text-xs prose-headings:font-semibold prose-p:my-2 prose-ul:my-2 prose-li:my-0 prose-hr:my-4 max-w-none"
              dangerouslySetInnerHTML={{
                __html: converter.makeHtml(parsed.thinkContent),
              }}
            />
          )}
        </div>
      )}
      {parsed.afterContent && (
        <div
          className="prose prose-invert prose-li:text-sm prose-headings:text-sm prose-p:text-sm prose-headings:font-semibold prose-p:my-2 prose-ul:my-2 prose-li:my-0 prose-hr:my-4 max-w-none"
          dangerouslySetInnerHTML={{
            __html: converter.makeHtml(parsed.afterContent),
          }}
        />
      )}
    </div>
  );
}
