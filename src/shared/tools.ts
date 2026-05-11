export const AvailableTools = {
  GET_OPEN_TABS: "get_open_tabs",
  GO_TO_TAB: "go_to_tab",
  OPEN_URL: "open_url",
  CLOSE_TAB: "close_tab",
  HIGHLIGHT_WEBSITE_ELEMENT: "highlight_website_element",
  // GOOGLE_SEARCH: "google_search", // Commented out - not implemented yet
} as const;

export type ToolName = (typeof AvailableTools)[keyof typeof AvailableTools];
