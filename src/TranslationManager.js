class TranslationManager {
    constructor() {
      this.bindEvents();
    }
  
    bindEvents() {
      document.addEventListener('change', async (event) => {
        if (event.target?.id === 'translation-language') {
          await this.handleLanguageChange(event);
        }
      });
    }
  
    async translateContent(content, targetLanguage) {
        try {
          const canTranslate = await translation.canTranslate({
            sourceLanguage: 'en',
            targetLanguage: targetLanguage
          });
      
          if (canTranslate === 'no') {
            throw new Error(`Translation to ${targetLanguage} is not supported`);
          }
      
          const translator = await translation.createTranslator({
            sourceLanguage: 'en',
            targetLanguage: targetLanguage
          });
      
          if (canTranslate === 'after-download') {
            await translator.ready;
          }
      
          // Create a temporary div to parse HTML
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = content;
      
          // Store info icons to preserve their functionality
          const infoIcons = tempDiv.querySelectorAll('.info-icon');
          infoIcons.forEach((icon, index) => {
            icon.setAttribute('data-preserve', `info-${index}`);
          });
      
          // Translate the content
          const translateNode = async (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              // Translate text nodes that aren't empty
              if (node.textContent.trim()) {
                node.textContent = await translator.translate(node.textContent);
              }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              // Skip translation of info icons
              if (node.classList.contains('info-icon')) {
                return;
              }
      
              // Translate all child nodes recursively
              for (const child of Array.from(node.childNodes)) {
                await translateNode(child);
              }
            }
          };
      
          await translateNode(tempDiv);
      
          // Restore info icons
          const originalIcons = document.querySelectorAll('.info-icon');
          const translatedIcons = tempDiv.querySelectorAll('.info-icon');
          translatedIcons.forEach((icon, index) => {
            if (originalIcons[index]) {
              icon.outerHTML = originalIcons[index].outerHTML;
            }
          });
      
          return tempDiv.innerHTML;
        } catch (error) {
          console.error('Translation error:', error);
          throw error;
        }
      }
  
    async handleLanguageChange(event) {
        const summaryContent = document.getElementById('ai-summary-content');
        const languageSelect = event.target;
    
        if (!summaryContent) return;
    
        const targetLanguage = languageSelect.value;
    
        // Save original content if not already saved
        if (!summaryContent.hasAttribute('data-original-content')) {
          summaryContent.setAttribute('data-original-content', summaryContent.innerHTML);
        }
    
        // If English is selected, show original content
        if (targetLanguage === 'en') {
          summaryContent.innerHTML = summaryContent.getAttribute('data-original-content');
          summaryContent.removeAttribute('data-current-language');
          return;
        }
    
        // If already translated to this language, do nothing
        if (summaryContent.getAttribute('data-current-language') === targetLanguage) {
          return;
        }
    
        // Show loading state
        languageSelect.disabled = true;
    
        try {
          const translatedContent = await this.translateContent(
            summaryContent.getAttribute('data-original-content'),
            targetLanguage
          );
          summaryContent.innerHTML = translatedContent;
          summaryContent.setAttribute('data-current-language', targetLanguage);
    
          // Reattach event listeners after translation
          this.reattachEventListeners();
    
          // Translate and store the button texts
          const translator = await translation.createTranslator({
            sourceLanguage: 'en',
            targetLanguage: targetLanguage
          });
    
          const showMoreText = await translator.translate('Show more');
          const showLessText = await translator.translate('Show less');
    
          // Reattach show more WOZ values button listener with translated texts
          const showMoreButton = document.getElementById('show-more-woz');
          if (showMoreButton) {
            // Store the translated texts as data attributes
            showMoreButton.setAttribute('data-show-more', showMoreText);
            showMoreButton.setAttribute('data-show-less', showLessText);
    
            showMoreButton.addEventListener('click', () => {
              const wozList = document.getElementById('woz-list');
              const hiddenItems = wozList.querySelectorAll('li[style="display: none;"]');
    
              if (hiddenItems.length > 0) {
                hiddenItems.forEach(item => item.style.display = '');
                showMoreButton.textContent = showMoreButton.getAttribute('data-show-less');
              } else {
                Array.from(wozList.children).slice(3).forEach(item => item.style.display = 'none');
                showMoreButton.textContent = showMoreButton.getAttribute('data-show-more');
              }
            });
    
            // Set initial button text
            showMoreButton.textContent = showMoreText;
          }
    
        } catch (error) {
          console.error('Translation failed:', error);
          alert(`Translation failed: ${error.message}`);
          summaryContent.innerHTML = summaryContent.getAttribute('data-original-content');
          languageSelect.value = 'en';
        } finally {
          languageSelect.disabled = false;
        }
    }
  
    async reattachEventListeners() {
        const infoIcons = document.querySelectorAll('.info-icon');
        infoIcons.forEach((icon, index) => {
          icon.addEventListener('click', () => {
            const details = document.getElementById(`prediction-${index}`);
            if (details) {
              details.style.display = details.style.display === 'none' ? 'block' : 'none';
            }
          });
        });
    }
  }