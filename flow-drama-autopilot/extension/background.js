// Background service worker for handling downloads and background tasks
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "download_video") {
    chrome.downloads.download(
      {
        url: message.url,
        filename: "flow_drama/" + (message.filename || "scene.mp4"),
        conflictAction: "uniquify",
        saveAs: false
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, downloadId });
        }
      }
    );
    return true; // Keep message channel open for async response
  }
});
