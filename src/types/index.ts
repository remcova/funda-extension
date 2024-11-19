// Base interfaces
export interface Message {
    action: 'summarize' | 'togglePanel';
    summary?: string;
  }
  
  export interface MessageResponse {
    status: string;
  }
  
  // Property related interfaces
  export interface PropertyInfo extends PropertyData {
    price_comparison: string;
    price_comparison_explanation: string;
    pros: string[];
    cons: string[];
  }
  
  export interface PropertyData {
    title: string;
    address: string;
    price: string;
    features: string[];
    description: string;
    details: Record<string, string>;
  }
  
  export interface NeighborhoodStats {
    neighborhood: string;
    municipality: string;
    averagePrice: number;
    pricePerSqm: number;
    year?: string;
  }
  
  // WOZ and value prediction interfaces
  export interface WozWaarde {
    peildatum: string;
    vastgesteldeWaarde: number;
    jaar: number;
    waarde: number;
  }
  
  export interface ValuePrediction {
    year: string;
    value: number;
    explanation: string;
  }
  
  export interface PricePerSqmResult {
    value: number;
    formattedValue: string;
    price: number;
    livingArea: number;
  }
  
  // AI related interfaces
  export interface AIModel {
    prompt(input: string): Promise<string>;
    process(input: string): Promise<string>;
    destroy(): void;
  }
  
  export interface AILanguageModel {
    create(options: AIModelOptions): Promise<AIModel>;
  }
  
  export interface AIModelOptions {
    temperature?: number;
    topK?: number;
    topP?: number;
    systemPrompt?: string;
  }
  
  // Translation related interfaces
  export interface TranslationAPI {
    canTranslate(options: TranslationOptions): Promise<'yes' | 'no' | 'after-download'>;
    createTranslator(options: TranslationOptions): Promise<Translator>;
  }
  
  export interface Translator {
    ready: Promise<void>;
    translate(text: string): Promise<string>;
  }
  
  export interface TranslationOptions {
    sourceLanguage: string;
    targetLanguage: string;
  }
  
  // Data chunk interface
  export interface DataChunk {
    [key: string]: any;
  }