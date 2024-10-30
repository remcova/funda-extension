document.addEventListener('DOMContentLoaded', () => {
    // Load saved API key
    chrome.storage.sync.get(['geminiApiKey'], (result) => {
      if (result.geminiApiKey) {
        document.getElementById('geminiApiKey').value = result.geminiApiKey;
      }
    });
  
    // Save API key
    document.getElementById('save').addEventListener('click', () => {
      const apiKey = document.getElementById('geminiApiKey').value;
      chrome.storage.sync.set({ geminiApiKey: apiKey }, () => {
        const status = document.getElementById('status');
        status.textContent = 'Settings saved!';
        status.className = 'status success';
        status.style.display = 'block';
        setTimeout(() => {
          status.style.display = 'none';
        }, 3000);
      });
    });
  });