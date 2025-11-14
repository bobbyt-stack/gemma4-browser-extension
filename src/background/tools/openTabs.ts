import { WebMCPTool } from "../agent/webMcp.tsx";

export const getOpenTabsTool: WebMCPTool = {
  name: "get_open_tabs",
  description:
    "Get information about all open browser tabs including their title, URL, description, and active status",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  execute: async () => {
    try {
      const tabs = await chrome.tabs.query({});

      const tabInfoPromises = tabs.map(async (tab) => {
        let description = null;

        if (tab.id && tab.url?.startsWith("http")) {
          try {
            const results = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => {
                const metaDescription = document.querySelector(
                  'meta[name="description"]'
                );
                return metaDescription?.getAttribute("content") || null;
              },
            });
            description = results[0]?.result || null;
          } catch {
            description = null;
          }
        }

        return {
          id: tab.id,
          title: tab.title,
          url: tab.url,
          description,
          active: tab.active,
          windowId: tab.windowId,
          index: tab.index,
        };
      });

      const tabInfo = await Promise.all(tabInfoPromises);
      return JSON.stringify(tabInfo, null, 2);
    } catch (error) {
      return `Error getting tabs: ${error.toString()}`;
    }
  },
};

export const goToTabTool: WebMCPTool = {
  name: "go_to_tab",
  description:
    "Navigate to a specific browser tab by its ID and bring it to focus",
  inputSchema: {
    type: "object",
    properties: {
      tabId: {
        type: "number",
        description: "The ID of the tab to navigate to",
      },
    },
    required: ["tabId"],
  },
  execute: async (args) => {
    const tabId = args.tabId as number;
    try {
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(tabId, { active: true });

      return `Successfully navigated to tab ${tabId}: "${tab.title}"`;
    } catch (error) {
      return `Error navigating to tab ${tabId}: ${error.toString()}`;
    }
  },
};
