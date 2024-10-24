// Listen for messages from the content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'summarize') {
    // Here you can add any additional processing or actions you want to perform with the summary
    sendResponse({status: 'Summary received in background'});
  }
  return true;  // Indicates that the response will be sent asynchronously
});

// Listen for clicks on the extension icon
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'togglePanel'}, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message:', chrome.runtime.lastError.message);
        } else {
          console.log('Response from content script:', response);
        }
      });
    } else {
      console.error('No active tab found');
    }
  });
});
