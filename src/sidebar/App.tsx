import { useEffect, useState } from "react";

import { BackgroundTasks, ResponseStatus } from "../shared/types.ts";
import Chat from "./chat/Chat.tsx";
import SettingsHeader from "./components/SettingsHeader.tsx";
import { Button, Loader, Message } from "./theme";

enum AppStatus {
  IDLE,
  CHECKING,
  NEEDS_DOWNLOAD,
  DOWNLOADING,
  READY,
  ERROR,
}

export default function App() {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(AppStatus.CHECKING);
    chrome.runtime.sendMessage(
      { type: BackgroundTasks.CHECK_MODELS },
      (
        e:
          | {
              results: Array<{
                size: number;
                cached: boolean;
                modelId: string;
              }>;
              status: ResponseStatus.SUCCESS;
            }
          | {
              error: string;
              status: ResponseStatus.ERROR;
            }
      ) => {
        if (e.status === ResponseStatus.SUCCESS) {
          if (Boolean(e.results.find((r) => !r.cached))) {
            setStatus(AppStatus.NEEDS_DOWNLOAD);
          } else {
            setStatus(AppStatus.READY);
          }
        }
        if (e.status === ResponseStatus.ERROR) {
          setError(e.error);
          setStatus(AppStatus.ERROR);
        }
      }
    );

    return () => {};
  }, []);

  if (status === AppStatus.ERROR) {
    return (
      <div className="flex items-center justify-center h-full w-full flex-col gap-8 px-6">
        <Message type="error" title="Setup error">
          {error}
        </Message>
      </div>
    );
  }

  if (status === AppStatus.IDLE || status === AppStatus.CHECKING) {
    return (
      <div className="flex items-center justify-center h-full w-full flex-col gap-8 px-6">
        <Loader />
      </div>
    );
  }

  if (status === AppStatus.NEEDS_DOWNLOAD || status === AppStatus.DOWNLOADING) {
    return (
      <div className="flex items-center justify-center h-full w-full flex-col gap-8 px-6">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-normal text-chrome-text-primary mb-2">
            Connect Trillim
          </h1>
          <p className="text-sm text-chrome-text-secondary mb-6">
            Start the local Trillim backend, then connect the extension.
          </p>
          <Button
            loading={status === AppStatus.DOWNLOADING}
            onClick={() => {
              setStatus(AppStatus.DOWNLOADING);
              chrome.runtime.sendMessage(
                { type: BackgroundTasks.INITIALIZE_MODELS },
                () => setStatus(AppStatus.READY)
              );
            }}
            className="w-full"
          >
            Connect Backend
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col">
      <SettingsHeader />
      <main className="flex-1 overflow-y-auto bg-chrome-bg-primary">
        <Chat />
      </main>
      <div className="p-2 border-t border-chrome-border flex justify-between items-center bg-chrome-bg-secondary">
        <button
          onClick={async () => {
            try {
              await chrome.runtime.sendMessage({ type: "EXPORT_LOGS" });
            } catch (e) {
              console.error("Export failed:", e);
            }
          }}
          className="text-xs text-chrome-text-secondary hover:text-chrome-accent-primary"
        >
          Export Logs
        </button>
        <span className="text-xs text-chrome-text-secondary">
          v{chrome.runtime.getManifest().version}
        </span>
      </div>
    </div>
  );
}
