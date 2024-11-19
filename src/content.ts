import { SummaryPanel } from './components/SummaryPanel';
import { TranslationService } from './services/TranslationService';
import { AIService } from './services/AIService';
import { SummaryService } from './services/SummaryService';
import { getWozValues, getNeighborhoodStats } from './services/api';
import { calculatePricePerSqm, comparePropertyPricePerSqm } from './utils/calculations';
import {
  PropertyInfo,
  Message,
  MessageResponse,
  PropertyData,
  NeighborhoodStats
} from './types';

class PropertySummarizer {
  private panel: SummaryPanel;
  private translator: TranslationService;
  private aiService: AIService;
  private summaryService: SummaryService;
  private seenStrings: Set<string>;
  private isProcessing: boolean;

  constructor() {
    this.panel = new SummaryPanel();
    this.translator = new TranslationService();
    this.aiService = new AIService();
    this.summaryService = new SummaryService();
    this.seenStrings = new Set<string>();
    this.isProcessing = false;
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await this.attachMessageListeners();
      await this.checkAndProcessProperty();
    } catch (error) {
      console.error('Initialization error:', error);
    }
  }

  private async attachMessageListeners(): Promise<void> {
    chrome.runtime.onMessage.addListener((
      message: Message,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: MessageResponse) => void
    ) => {
      if (message.action === 'togglePanel') {
        this.panel.toggle();
        sendResponse({ status: 'Panel toggled' });
      }
      return true;
    });
  }

  private async checkAndProcessProperty(): Promise<void> {
    console.log('1. Starting property check and processing');
    
    if (this.isProcessing || !this.isPropertyPage()) {
      console.log('Skipping: Already processing or not a property page');
      return;
    }

    try {
      this.isProcessing = true;
      this.panel.setLoading(true);
      console.log('2. Panel set to loading state');

      const propertyInfo = await this.extractPropertyInfo();
      console.log('3. Property info extracted:', propertyInfo);

      if (!propertyInfo) {
        throw new Error('Failed to extract property information');
      }

      const summary = await this.summaryService.createSummary(propertyInfo);
      console.log('4. Summary created:', summary);
      
      this.panel.setContent(summary);
      console.log('5. Panel content updated');

      chrome.runtime.sendMessage({ 
        action: 'summarize', 
        summary 
      } as Message);
      console.log('6. Summary sent to background script');

    } catch (error) {
      console.error('Property processing error:', error);
      this.panel.setError('Failed to process property information');
    } finally {
      this.isProcessing = false;
      this.panel.setLoading(false);
      console.log('7. Processing completed');
    }
  }

  private isPropertyPage(): boolean {
    return window.location.href.includes('/koop/') && 
           !window.location.href.includes('/verkocht/');
  }

  private async extractPropertyInfo(): Promise<PropertyInfo | null> {
    console.log('2.1 Starting property info extraction');
    
    const scriptElement = document.querySelector<HTMLScriptElement>(
      'script[type="application/json"][data-nuxt-data="nuxt-app"][data-ssr="true"][id="__NUXT_DATA__"]'
    );

    if (!scriptElement?.textContent) {
      console.error('2.2 __NUXT_DATA__ script not found');
      return null;
    }

    try {
      const rawData = JSON.parse(scriptElement.textContent);
      console.log('2.3 Raw JSON data:', rawData);

      const jsonData = this.cleanJsonData(rawData);
      console.log('2.4 Cleaned JSON data:', jsonData);

      const chunks = this.createDataChunks(jsonData);
      console.log('2.5 Created data chunks:', chunks);

      const propertyData = await this.processDataWithAI(chunks);
      console.log('2.6 AI processed property data:', propertyData);

      const neighborhoodStats = await getNeighborhoodStats(propertyData.address);
      console.log('2.7 Neighborhood stats:', neighborhoodStats);

      const propertyInfo = await this.createPropertyInfo(propertyData, neighborhoodStats);
      console.log('2.8 Final property info:', propertyInfo);

      return propertyInfo;
    } catch (error) {
      console.error('2.9 Error processing property data:', error);
      return null;
    }
  }

  private cleanJsonData(data: Record<string, any>): Record<string, any> {
    return Object.fromEntries(
      Object.entries(data).filter(([_, value]) => {
        if (typeof value !== 'string') return false;
        
        // Filter out strings with more than 500 consecutive characters
        if (value.match(/[^\s]{500,}/)) return false;
        
        // Filter out image file extensions
        if (/\.(jpg|png|bmp|webp)$/i.test(value)) return false;
        
        // Filter out URLs
        if (value.startsWith('http')) return false;

        // Filter out duplicate strings (case-insensitive)
        const lowerValue = value.toLowerCase();
        if (this.seenStrings.has(lowerValue)) return false;
        this.seenStrings.add(lowerValue);

        // Filter out hyphenated technical terms
        if (value.includes('-') && !value.includes(' ')) return false;

        // Filter out hash-like strings
        if (/^[a-f0-9]{32,}$/i.test(value)) return false;

        // Filter out strings longer than 1000 characters
        if (value.length > 1000) return false;

        if ((value.match(/\//g) || []).length > 6) return false;
        if (/^\d+\/\d+\/\d+$/.test(value)) return false;
        
        // Keep strings that are not just numbers, except 4-digit years
        if (!/^\d+$/.test(value)) return true;
        if (/^\d{4}$/.test(value)) return true;

        return false;
      })
    );
  }

  private createDataChunks(data: Record<string, any>): Record<string, any>[] {
    const chunks: Record<string, any>[] = [];
    const chunkSize = 10;
    const entries = Object.entries(data);

    for (let i = 0; i < entries.length; i += chunkSize) {
      const chunk = Object.fromEntries(entries.slice(i, i + chunkSize));
      chunks.push(chunk);
    }

    return chunks;
  }

  private async processDataWithAI(chunks: Record<string, any>[]): Promise<PropertyData> {
    await this.aiService.initialize(
      'You are a real estate data extraction expert. Extract relevant property information.'
    );
    const result = await this.aiService.processChunks(chunks);
    return JSON.parse(result) as PropertyData;
  }

  private async createPropertyInfo(
    propertyData: PropertyData,
    neighborhoodStats: NeighborhoodStats | null
  ): Promise<PropertyInfo> {
    const price = parseInt(propertyData.price.replace(/[^0-9]/g, ''));
    const livingArea = parseInt(propertyData.details['Living area'] || '0');
    const pricePerSqm = calculatePricePerSqm(price, livingArea);

    let priceComparison = 'EQUAL';
    let priceComparisonExplanation = 'Unable to compare prices due to missing data.';

    if (neighborhoodStats && pricePerSqm) {
      priceComparison = comparePropertyPricePerSqm(
        pricePerSqm.value,
        neighborhoodStats.pricePerSqm
      );

      const analysis = await this.aiService.analyzePricing({
        propertyPrice: propertyData.price,
        propertyPricePerSqm: pricePerSqm.value,
        avgPricePerSqmNeighborhood: neighborhoodStats.pricePerSqm,
        avgPurchasePriceNeighborhood: neighborhoodStats.averagePrice.toString(),
        neighborhood: neighborhoodStats.neighborhood,
        municipality: neighborhoodStats.municipality,
        avgPriceComparison: priceComparison
      });

      const analysisData = JSON.parse(analysis);
      priceComparisonExplanation = analysisData.explanation;
    }

    return {
      ...propertyData,
      price_comparison: priceComparison,
      price_comparison_explanation: priceComparisonExplanation,
      pros: propertyData.features.filter(f => f.toLowerCase().includes('pro')),
      cons: propertyData.features.filter(f => f.toLowerCase().includes('con'))
    };
  }
}

// Initialize the summarizer when the document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new PropertySummarizer());
} else {
  new PropertySummarizer();
}