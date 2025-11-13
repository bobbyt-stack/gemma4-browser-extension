import { useEffect, useState } from "react";

import {
  BackgroundMessages,
  BackgroundTasks,
  MODELS,
  REQUIRED_MODEL_IDS,
  STORAGE_KEYS,
} from "../shared/types.ts";
import Chat from "./chat/Chat.tsx";
import { Button, Slider } from "./theme";
import { formatBytes } from "./utils/format.ts";

export default function App() {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [downloadedModels, setDownloadedModels] = useState<Array<string>>([]);
  const [downloadingModels, setDownloadingModels] = useState<
    Record<string, number>
  >({});
  const [initialDownload, setInitialDownload] = useState<boolean>(false);

  const toggleActive = async (active: boolean = null) => {
    const newState = active !== null ? active : !isActive;
    setIsActive(newState);

    await chrome.storage.local.set({ isActive: newState });

    chrome.runtime.sendMessage({
      type: BackgroundTasks.TOGGLE_ACTIVE,
      isActive: newState,
    });
  };

  useEffect(() => {
    const messageListener = (message: any) => {
      if (message.type === BackgroundMessages.STATUS_UPDATE) {
        //setStatus(message.status);
      }

      if (message.type === BackgroundMessages.DOWNLOAD_PROGRESS) {
        setDownloadingModels((prev) => ({
          ...prev,
          [message.modelId]: message.percentage,
        }));
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    chrome.storage.local.get(
      [STORAGE_KEYS.IS_ACTIVE, STORAGE_KEYS.DOWNLOADED_MODELS],
      (result) => {
        setIsActive(result.isActive || false);
        setDownloadedModels(result.downloadedModels || []);
      }
    );

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  return REQUIRED_MODEL_IDS.filter((id) => !downloadedModels.includes(id))
    .length !== 0 ? (
    /* Initialize */
    <div className="flex items-center justify-center h-full w-full flex-col gap-6">
      <Button
        loading={initialDownload}
        onClick={() => {
          setInitialDownload(true);
          chrome.runtime.sendMessage(
            { type: BackgroundTasks.INITIALIZE_MODELS },
            () => {
              chrome.storage.local.set({
                [STORAGE_KEYS.DOWNLOADED_MODELS]: REQUIRED_MODEL_IDS,
              });
              setDownloadedModels(REQUIRED_MODEL_IDS);
              setInitialDownload(false);
              toggleActive(true);
            }
          );
        }}
      >
        Download models (
        {formatBytes(
          REQUIRED_MODEL_IDS.reduce(
            (acc, id) =>
              acc +
              (Object.values(MODELS).find(({ modelId }) => modelId === id)
                ?.size || 0),
            0
          )
        )}
        )
      </Button>
      <div className="max-w-4/5 w-full flex flex-col gap-2">
        {Object.entries(downloadingModels).map(([id, progress]) => (
          <Slider text={`${id} (${progress})%`} width={progress} />
        ))}
      </div>
    </div>
  ) : (
    <div className="h-full w-full flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 text-white p-4 shadow-md border-b-1 border-gray-700 flex items-center justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-bold">AgentGemma Browser Assistant</h1>
          <p className="text-sm mt-2 text-gray-400">
            Powered by{" "}
            <a
              href="https://github.com/huggingface/transformers.js"
              target="_blank"
              className="underline"
            >
              🤗 Transformers.js
            </a>
          </p>
        </div>

        {/* Toggle Switch */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => toggleActive()}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:ring-offset-gray-800 ${
              isActive ? "bg-green-500" : "bg-gray-600"
            }`}
            role="switch"
            aria-checked={isActive}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isActive ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-xs text-gray-400">
            {isActive ? "Active" : "Inactive"}
          </span>
        </div>
      </div>
      {/* Chat */}
      <Chat className="grow" />
    </div>
  );
}
