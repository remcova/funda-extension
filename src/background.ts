import { Message, MessageResponse } from './types';

chrome.runtime.onMessage.addListener((
  request: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void
) => {
  console.log('Background - Received message:', request);

  if (request.action === 'summarize' || request.action === 'togglePanel') {
    console.log('Background - Handling action:', request.action);
    // Mock response
    sendResponse({ status: 'Action handled' });
  }

  if (request.action === 'summarize' || request.action === 'togglePanel') {
    console.log('Background - Handling action:', request.action);
    // Mock response
    sendResponse({ status: 'Action handled' });
  }

  if (request.action === 'summarize') {
    console.log('Background - Summary received:', request.summary);
    sendResponse({ status: 'Summary received in background' });
  }

  return true;
});

chrome.action.onClicked.addListener((tab: chrome.tabs.Tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(
      tab.id,
      { action: 'togglePanel' } as Message,
      (response: MessageResponse) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message:', chrome.runtime.lastError.message);
        } else {
          console.log('Response from content script:', response);
        }
      }
    );
  } else {
    console.error('No active tab found');
  }
});