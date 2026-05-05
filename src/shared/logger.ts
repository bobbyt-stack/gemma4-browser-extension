/* eslint-disable @typescript-eslint/no-explicit-any */
const chrome = (globalThis as any).chrome;

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  timestamp: number;
  level: LogLevel;
  source: string;
  message: string;
  data?: unknown;
  error?: string;
}

interface LogExport {
  version: string;
  exportedAt: string;
  appInfo: {
    modelId: string;
    modelTitle: string;
  };
  logs: LogEntry[];
}

class ExtensionLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 2000;
  private minLevel = LogLevel.DEBUG;
  private appInfo = { modelId: "", modelTitle: "" };

  constructor() {
    this.loadLogs();
  }

  setAppInfo(modelId: string, modelTitle: string) {
    this.appInfo = { modelId, modelTitle };
  }

  private async loadLogs() {
    try {
      const stored = await chrome.storage.local.get("extension_logs");
      if (stored.extension_logs) {
        this.logs = stored.extension_logs;
      }
    } catch {
      this.logs = [];
    }
  }

  private async saveLogs() {
    try {
      const toSave = this.logs.slice(-this.maxLogs);
      await chrome.storage.local.set({ extension_logs: toSave });
    } catch {
      // Storage write failed
    }
  }

  log(
    level: LogLevel,
    source: string,
    message: string,
    data?: unknown,
    error?: Error
  ) {
    if (level < this.minLevel) return;

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      source,
      message,
      data,
      error: error?.toString(),
    };

    this.logs.push(entry);

    const levelNames = ["DEBUG", "INFO", "WARN", "ERROR"];
    const prefix = `[${new Date().toISOString()}] [${levelNames[level]}] [${source}]`;

    switch (level) {
      case LogLevel.ERROR:
        console.error(prefix, message, data, error);
        break;
      case LogLevel.WARN:
        console.warn(prefix, message, data);
        break;
      default:
        console.log(prefix, message, data);
    }

    if (this.logs.length >= 100) {
      this.saveLogs();
    }
  }

  debug(source: string, message: string, data?: unknown) {
    this.log(LogLevel.DEBUG, source, message, data);
  }

  info(source: string, message: string, data?: unknown) {
    this.log(LogLevel.INFO, source, message, data);
  }

  warn(source: string, message: string, data?: unknown) {
    this.log(LogLevel.WARN, source, message, data);
  }

  error(source: string, message: string, data?: unknown, err?: Error) {
    this.log(LogLevel.ERROR, source, message, data, err);
  }

  async getLogs(limit = 100): Promise<LogEntry[]> {
    return this.logs.slice(-limit);
  }

  async getLogsByLevel(level: LogLevel): Promise<LogEntry[]> {
    return this.logs.filter((l) => l.level === level);
  }

  async getLogsBySource(source: string): Promise<LogEntry[]> {
    return this.logs.filter((l) => l.source.startsWith(source));
  }

  async clearLogs() {
    this.logs = [];
    await chrome.storage.local.remove("extension_logs");
  }

  async exportLogs(): Promise<string> {
    const exportData: LogExport = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      appInfo: this.appInfo,
      logs: this.logs,
    };
    return JSON.stringify(exportData, null, 2);
  }

  async downloadLogs(): Promise<void> {
    try {
      const logsJson = await this.exportLogs();
      const blob = new Blob([logsJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement("a");
      a.href = url;
      a.download = `extension-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.info("Logger", "Logs downloaded", { filename: a.download });
    } catch (error) {
      this.error("Logger", "Failed to download logs", null, error as Error);
    }
  }
}

export const logger = new ExtensionLogger();

export const wrapAsync = async <T>(
  source: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> => {
  try {
    logger.debug(source, `Starting: ${operation}`);
    const result = await fn();
    logger.debug(source, `Completed: ${operation}`);
    return result;
  } catch (err) {
    const error = err as Error;
    logger.error(source, `Failed: ${operation}`, { operation }, error);
    throw err;
  }
};

export const wrapSync = <T>(
  source: string,
  operation: string,
  fn: () => T
): T => {
  try {
    logger.debug(source, `Starting: ${operation}`);
    const result = fn();
    logger.debug(source, `Completed: ${operation}`);
    return result;
  } catch (err) {
    const error = err as Error;
    logger.error(source, `Failed: ${operation}`, { operation }, error);
    throw err;
  }
};