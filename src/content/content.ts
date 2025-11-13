console.log("AgentGemma Extension: Content script loaded");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "EXTRACT_PAGE_DATA") {
    const pageText = document.body.innerText;
    const pageTitle = document.title;
    const pageUrl = window.location.href;

    sendResponse({
      text: pageText,
      title: pageTitle,
      url: pageUrl,
    });
  }

  /*if (message.type === "HIGHLIGHT_ELEMENTS") {
    const elements = message.selector
      ? document.querySelectorAll(message.selector)
      : [];

    elements.forEach((element) => {
      const htmlElement = element as HTMLElement;
      htmlElement.style.outline = "2px solid blue";
      htmlElement.style.backgroundColor = "rgba(0, 0, 255, 0.1)";
    });

    sendResponse({ count: elements.length });
  }*/

  if (message.type === "CLEAR_HIGHLIGHTS") {
    const allElements = document.querySelectorAll('[style*="outline"]');
    allElements.forEach((element) => {
      const htmlElement = element as HTMLElement;
      htmlElement.style.outline = "";
      htmlElement.style.backgroundColor = "";
    });

    sendResponse({ success: true });
  }

  return true;
});
