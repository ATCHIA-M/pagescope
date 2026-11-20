chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch((error) => {
      console.error("PageScope could not configure the side panel:", error);
    });
});

chrome.action.onClicked.addListener((tab) => {
  if (!Number.isInteger(tab.id)) {
    console.error("PageScope could not open the panel because the tab has no ID.");
    return;
  }

  chrome.sidePanel.open({ tabId: tab.id }).catch((error) => {
    console.error("PageScope could not open the side panel:", error);
  });
});
