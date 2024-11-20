class UIManager {
    constructor() {
        this.propertyExtractor = new PropertyExtractor();
        this.summaryGenerator = new PropertySummaryGenerator();
        this.translationManager = new TranslationManager();
        this.summaryRetrieved = false;
    }

    init() {
        this.injectStyles();
        this.injectSidePanel();
        this.bindEvents();
    }

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
          h1 {
            font-size: 26px;
            font-weight: bold;
          }
      
          h3 {
            font-size: 22px;
            font-weight: bold;
          }
      
          .ai-summary-content-block {
            margin: 20px 0 20px 0;
          }
      
          #ai-summary-panel::-webkit-scrollbar {
            width: 10px;
          }
          #ai-summary-panel::-webkit-scrollbar-track {
            background: #f1f1f1;
          }
          #ai-summary-panel::-webkit-scrollbar-thumb {
            background: #888;
          }
          #ai-summary-panel::-webkit-scrollbar-thumb:hover {
            background: #555;
          }
      
          #show-more-woz {
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            color: #4CAF50;
            border: 1px solid #4CAF50;
            border-radius: 4px;
            padding: 2px 4px;
            margin-top: 10px;
          }
          
          #ai-summary-loader {
            position: relative;
            min-height: 200px;
            min-width: 250px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .progress-bar {
            width: 100%;
            height: 4px;
            background-color: #f3f3f3;
            border-radius: 2px;
            overflow: hidden;
            margin-top: 10px;
          }
          
          .progress-bar-inner {
            width: 100%;
            height: 100%;
            background-color: #4CAF50;
            animation: indeterminateAnimation 1.5s infinite linear;
            transform-origin: 0% 50%;
          }
          
          @keyframes indeterminateAnimation {
            0% {
              transform:  translateX(0) scaleX(0);
            }
            40% {
              transform:  translateX(0) scaleX(0.4);
            }
            100% {
              transform:  translateX(100%) scaleX(0.5);
            }
          }
      
          .placeholder {
            background: #eee;
            background: linear-gradient(110deg, #ececec 8%, #f5f5f5 18%, #ececec 33%);
            border-radius: 5px;
            background-size: 200% 100%;
            animation: 1.5s shine linear infinite;
            margin-bottom: 10px;
          }
      
          .placeholder-text {
            height: 14px;
            margin-bottom: 10px;
            width: 100%;
          }
      
          .placeholder-title {
            height: 24px;
            width: 80%;
            margin-bottom: 20px;
          }
      
          .placeholder-price {
            height: 20px;
            width: 40%;
            margin-bottom: 30px;
          }
      
          .placeholder-block {
            height: 80px;
            margin-bottom: 20px;
            width: 100%;
          }
      
          @keyframes shine {
            to {
              background-position-x: -200%;
            }
          }
      
          #ai-summary-content {
            display: none;
          }
      
          #loader-message {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            font-weight: 500;
            color: #4CAF50;
            background: white;
            padding: 10px 20px;
            border-radius: 4px;
            z-index: 2;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            width: 80%;
            margin: 0 auto;
          }
      
          .placeholder-container {
            opacity: 0.3;  /* Make placeholders more subtle */
          }
      
          #translation-language {
            padding: 8px;
            border-radius: 4px;
            border: 1px solid #ccc;
            width: 100%;
            font-size: 14px;
            background-color: white;
            cursor: pointer;
          }
      
          #translation-language:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
      
          #translation-language:focus {
            outline: none;
            border-color: #4CAF50;
            box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
          }
        `;
        document.head.appendChild(style);
    }

    injectSidePanel() {
        const panel = document.createElement('div');
        panel.id = 'ai-summary-panel';

        // Create translation controls but don't add them yet
        const translationControls = document.createElement('div');
        translationControls.id = 'translation-controls';
        translationControls.style.cssText = `
          margin-bottom: 15px;
          display: none;  // Hidden by default
        `;

        const languageSelect = document.createElement('select');
        languageSelect.id = 'translation-language';
        const languages = [
            ['en', 'English (Original)'],
            ['ar', 'Arabic'],
            ['bn', 'Bengali'],
            ['de', 'German'],
            ['es', 'Spanish'],
            ['fr', 'French'],
            ['hi', 'Hindi'],
            ['it', 'Italian'],
            ['ja', 'Japanese'],
            ['ko', 'Korean'],
            ['nl', 'Dutch'],
            ['pl', 'Polish'],
            ['pt', 'Portuguese'],
            ['ru', 'Russian'],
            ['th', 'Thai'],
            ['tr', 'Turkish'],
            ['vi', 'Vietnamese'],
            ['zh', 'Chinese (Simplified)'],
            ['zh-Hant', 'Chinese (Traditional)']
        ];

        languages.forEach(([code, name]) => {
            const option = document.createElement('option');
            option.value = code;
            option.textContent = name;
            languageSelect.appendChild(option);
        });

        translationControls.appendChild(languageSelect);
        panel.appendChild(translationControls);

        panel.style.cssText = `
          position: fixed;
          top: 0;
          right: -300px;
          width: 300px;
          height: 100%;
          background-color: white;
          box-shadow: -2px 0 5px rgba(0,0,0,0.2);
          transition: right 0.3s ease;
          z-index: 10000;
          padding: 20px;
          overflow-y: auto;
          padding-right: 25px;
        `;

        const summaryContent = document.createElement('div');
        summaryContent.id = 'ai-summary-content';
        summaryContent.style.display = 'none';
        panel.appendChild(summaryContent);

        const loader = document.createElement('div');
        loader.id = 'ai-summary-loader';
        loader.innerHTML = `
          <div id="loader-message">
            <p id="loader-message-text">Extracting information...</p>
            <div class="progress-bar">
              <div class="progress-bar-inner"></div>
            </div>
          </div>
          <div class="placeholder-container">
            <div class="placeholder placeholder-title"></div>
            <div class="placeholder placeholder-price"></div>
      
            <div class="placeholder placeholder-block"></div>
            <div class="placeholder placeholder-title"></div>
            <div class="placeholder placeholder-text"></div>
            <div class="placeholder placeholder-text"></div>
            <div class="placeholder placeholder-text"></div>
      
            <div class="placeholder placeholder-block"></div>
            <div class="placeholder placeholder-title"></div>
            <div class="placeholder placeholder-text"></div>
            <div class="placeholder placeholder-text"></div>
            <div class="placeholder placeholder-text"></div>
      
            <div class="placeholder placeholder-block"></div>
            <div class="placeholder placeholder-title"></div>
            <div class="placeholder placeholder-text"></div>
            <div class="placeholder placeholder-text"></div>
            <div class="placeholder placeholder-text"></div>
          </div>
        `;
        panel.appendChild(loader);

        const toggleButton = document.createElement('button');
        toggleButton.id = 'ai-summary-toggle';
        toggleButton.textContent = 'Summary';
        toggleButton.style.cssText = `
          position: fixed;
          top: 70%;
          right: 0;
          transform: translateY(-50%) rotate(-90deg);
          transform-origin: right bottom;
          z-index: 10001;
          padding: 10px 20px;
          background-color: #4CAF50;
          color: white;
          border: none;
          cursor: pointer;
          border-radius: 4px 4px 0 0;
          font-weight: bold;
          box-shadow: -2px 0 5px rgba(0,0,0,0.2);
        `;

        toggleButton.addEventListener('click', () => this.togglePanel());

        document.body.appendChild(panel);
        document.body.appendChild(toggleButton);
    }


    bindEvents() {
        chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
            if (request.action === 'togglePanel') {
                this.togglePanel();
                sendResponse({ status: 'Panel toggled' });
            }
            return true;
        });

        document.addEventListener('click', (event) => {
            if (event.target?.id === 'show-more-woz') {
                this.handleWozToggle(event);
            }
        });
    }

    togglePanel() {
        const panel = document.getElementById('ai-summary-panel');
        const toggleButton = document.getElementById('ai-summary-toggle');

        if (panel.style.right === '0px') {
            panel.style.right = '-300px';
            toggleButton.textContent = 'Summary';
        } else {
            panel.style.right = '0px';
            toggleButton.textContent = 'Hide';

            if (!this.summaryRetrieved) {
                this.toggleLoader(true);
                this.retrievePropertyInfo();
                this.summaryRetrieved = true;
            }
        }
    }

    toggleLoader(show) {
        const loader = document.getElementById('ai-summary-loader');
        const summaryContent = document.getElementById('ai-summary-content');
        const translationControls = document.getElementById('translation-controls');

        if (loader && summaryContent && translationControls) {
            loader.style.display = show ? 'block' : 'none';
            summaryContent.style.display = show ? 'none' : 'block';
            // Show translation controls only when loader is hidden and summary is shown
            translationControls.style.display = show ? 'none' : 'block';
        }
    }

    async retrievePropertyInfo() {
        try {
            const propertyInfo = await this.propertyExtractor.extractPropertyInfo();
            if (propertyInfo) {
                console.log('Creating summary...');
                const loaderMessage = document.getElementById('loader-message-text');
                if (loaderMessage) {
                    loaderMessage.textContent = 'Creating summary...';
                }

                console.log('PROPERTY INFO:', propertyInfo);
                const summary = await this.summaryGenerator.createSummary(propertyInfo);

                const summaryContent = document.getElementById('ai-summary-content');
                if (summaryContent) {
                    summaryContent.innerHTML = summary;
                    console.log('Summary added to sidebar');
                } else {
                    console.error('Summary content element not found');
                }

                chrome.runtime.sendMessage({ action: 'summarize', summary });
            } else {
                console.error('Failed to extract property information');
                const summaryContent = document.getElementById('ai-summary-content');
                if (summaryContent) {
                    summaryContent.innerHTML = '<p>Failed to extract property information</p>';
                }
            }

            this.toggleLoader(false);
        } catch (error) {
            console.error('Error in retrievePropertyInfo:', error);
            const summaryContent = document.getElementById('ai-summary-content');
            if (summaryContent) {
                summaryContent.innerHTML = '<p>An error occurred while processing the property information</p>';
            }
            this.toggleLoader(false);
        }
    }

    handleWozToggle(event) {
        const allWozWaarden = document.getElementById('all-woz-waarden');
        if (allWozWaarden.style.display === 'none') {
            allWozWaarden.style.display = 'block';
            event.target.textContent = 'Show less';
        } else {
            allWozWaarden.style.display = 'none';
            event.target.textContent = 'Show more';
        }
    }
}

// Initialize the application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new UIManager().init());
} else {
    new UIManager().init();
}