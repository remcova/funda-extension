import { TranslationAPI, Translator } from '../types';

export class TranslationService {
  private translator: Translator | null = null;
  private currentLanguage: string = 'en';
  private translationAPI: TranslationAPI;

  constructor() {
    // Initialize the translation API (assuming it's available globally)
    this.translationAPI = (window as any).translation;
  }

  /**
   * Translates content to the target language
   * @param content HTML content to translate
   * @param targetLanguage Target language code (e.g., 'nl', 'de', 'fr')
   */
  async translateContent(content: string, targetLanguage: string): Promise<string> {
    try {
      // If target language is English or same as current, return original content
      if (targetLanguage === 'en' || targetLanguage === this.currentLanguage) {
        return content;
      }

      const canTranslate = await this.translationAPI.canTranslate({
        sourceLanguage: 'en',
        targetLanguage
      });

      if (canTranslate === 'no') {
        throw new Error(`Translation to ${targetLanguage} is not supported`);
      }

      this.translator = await this.translationAPI.createTranslator({
        sourceLanguage: 'en',
        targetLanguage
      });

      if (canTranslate === 'after-download') {
        await this.translator.ready;
      }

      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = content;

      // Store info icons to preserve their functionality
      const infoIcons = tempDiv.querySelectorAll('.info-icon');
      infoIcons.forEach((icon, index) => {
        icon.setAttribute('data-preserve', `info-${index}`);
      });

      await this.translateNode(tempDiv);

      // Restore info icons
      const originalIcons = document.querySelectorAll('.info-icon');
      const translatedIcons = tempDiv.querySelectorAll('.info-icon');
      translatedIcons.forEach((icon, index) => {
        if (originalIcons[index]) {
          icon.outerHTML = originalIcons[index].outerHTML;
        }
      });

      this.currentLanguage = targetLanguage;
      return tempDiv.innerHTML;

    } catch (error) {
      console.error('Translation error:', error);
      throw error;
    }
  }

  /**
   * Recursively translates all text nodes in a DOM element
   * @param node DOM node to translate
   */
  private async translateNode(node: Node): Promise<void> {
    if (!this.translator) return;

    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent?.trim()) {
        node.textContent = await this.translator.translate(node.textContent);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      
      // Skip translation for preserved elements
      if (element.hasAttribute('data-preserve') || 
          element.classList.contains('info-icon') ||
          element.tagName === 'SCRIPT' ||
          element.tagName === 'STYLE') {
        return;
      }

      // Handle input placeholders
      if (element instanceof HTMLInputElement && element.placeholder) {
        element.placeholder = await this.translator.translate(element.placeholder);
      }

      // Handle elements with title attributes
      if (element.title) {
        element.title = await this.translator.translate(element.title);
      }

      // Translate all child nodes
      for (const child of Array.from(node.childNodes)) {
        await this.translateNode(child);
      }
    }
  }

  /**
   * Checks if translation is available for a given language
   * @param targetLanguage Target language code
   */
  async isTranslationAvailable(targetLanguage: string): Promise<boolean> {
    try {
      const canTranslate = await this.translationAPI.canTranslate({
        sourceLanguage: 'en',
        targetLanguage
      });
      return canTranslate !== 'no';
    } catch (error) {
      console.error('Error checking translation availability:', error);
      return false;
    }
  }

  /**
   * Translates a single text string
   * @param text Text to translate
   * @param targetLanguage Target language code
   */
  async translateText(text: string, targetLanguage: string): Promise<string> {
    try {
      if (targetLanguage === 'en' || targetLanguage === this.currentLanguage) {
        return text;
      }

      if (!this.translator || this.currentLanguage !== targetLanguage) {
        this.translator = await this.translationAPI.createTranslator({
          sourceLanguage: 'en',
          targetLanguage
        });
        this.currentLanguage = targetLanguage;
      }

      return await this.translator.translate(text);
    } catch (error) {
      console.error('Error translating text:', error);
      return text;
    }
  }

  /**
   * Cleans up translation resources
   */
  destroy(): void {
    this.translator = null;
    this.currentLanguage = 'en';
  }
}

// Additional types for the translation service
interface TranslationOptions {
  sourceLanguage: string;
  targetLanguage: string;
}

interface TranslationResult {
  translatedText: string;
  detectedLanguage?: {
    language: string;
    confidence: number;
  };
}

// Error class for translation-specific errors
export class TranslationError extends Error {
  constructor(
    message: string,
    public readonly targetLanguage: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'TranslationError';
  }
}