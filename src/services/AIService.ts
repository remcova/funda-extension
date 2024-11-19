import { AILanguageModel, AIModel } from '../types';

export class AIService {
  private model: any = null;

  async initialize(basePrompt: string): Promise<void> {
    try {
      console.log('AI Initialize - Sending prompt:', basePrompt);
      // @ts-ignore - Chrome Canary experimental AI API
      const response = await chrome.runtime.sendMessage({
        action: 'createAIModel',
        options: {
          temperature: 1,
          topK: 1,
          topP: 0.5,
          systemPrompt: basePrompt
        }
      });
      console.log('AI Initialize - Response:', response);

      this.model = response;
      if (!this.model) {
        throw new Error('Failed to initialize AI model');
      }
    } catch (error) {
      console.error('AI initialization error:', error);
      throw new Error(`Failed to initialize AI model`);
    }
  }

  async processChunks(chunks: Record<string, any>[]): Promise<string> {
    console.log('AI Process - Starting chunk processing');
    
    if (!this.model) {
      console.error('AI Process - Model not initialized');
      throw new Error('AI model not initialized');
    }

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunkPrompt = `Just read & remember the data and don't respond: ${JSON.stringify(chunks[i])}\n.`;
        console.log(`AI Process - Chunk ${i + 1} prompt:`, chunkPrompt);
        
        const chunkResponse = await chrome.runtime.sendMessage({
          action: 'generateText',
          prompt: chunkPrompt
        });
        console.log(`AI Process - Chunk ${i + 1} response:`, chunkResponse);

        if (i === chunks.length - 1) {
          const finalPrompt = this.getFinalPrompt();
          console.log('AI Process - Final prompt:', finalPrompt);
          
          const finalResponse = await chrome.runtime.sendMessage({
            action: 'generateText',
            prompt: finalPrompt
          });
          console.log('AI Process - Final response:', finalResponse);
          return finalResponse;
        }
      }
    } catch (error) {
      console.error('AI Process - Error:', error);
      throw error;
    }

    throw new Error('No chunks processed');
  }

  private getFinalPrompt(): string {
    return `
Return the property data in JSON format, don't respond with anything else (make sure integers are wrapped in Strings):
{
  title: string,
  price: string,
  features: array of strings,
  description: string,
  details: object
}`;
  }

  async analyzePricing(priceAnalysisData: any): Promise<string> {
    try {
      console.log('AI Pricing - Analysis data:', priceAnalysisData);
      const prompt = this.getPriceAnalysisPrompt(priceAnalysisData);
      console.log('AI Pricing - Prompt:', prompt);

      const response = await chrome.runtime.sendMessage({
        action: 'generateText',
        prompt: prompt
      });
      console.log('AI Pricing - Response:', response);
      return response;
    } catch (error) {
      console.error('AI Pricing - Error:', error);
      throw error;
    }
  }

  destroy(): void {
    if (this.model) {
      this.model.destroy();
      this.model = null;
    }
  }

  private getPriceAnalysisPrompt(data: any): string {
    return `
You are a real estate expert. Based on the following information, provide a price analysis:
// ... rest of the prompt
`;
  }
}