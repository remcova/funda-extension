import { PropertyInfo, WozWaarde, ValuePrediction } from '../types';
import { getWozValues, predictFutureValues } from './api';
import {
  createPriceComparisonSection,
  createValuePredictionSection,
  createWozSection,
  createProsConsSection,
  createListSection,
  createContentBlock,
  createDetailsSection
} from '../utils/htmlGenerators';

export class SummaryService {
    async createSummary(propertyInfo: PropertyInfo): Promise<string> {
      if (!propertyInfo) {
        return '<p>Unable to extract property information</p>';
      }
  
      const { 
        title, 
        address, 
        price, 
        features, 
        description, 
        details, 
        price_comparison, 
        price_comparison_explanation, 
        pros, 
        cons 
      } = propertyInfo;
  
      let wozWaarden: WozWaarde[] | null = null;
      let valuePrediction: ValuePrediction[] | null = null;
  
      try {
        wozWaarden = await getWozValues(address);
        if (wozWaarden) {
          valuePrediction = await predictFutureValues(wozWaarden);
        }
      } catch (error) {
        console.error('Error fetching WOZ values or predictions:', error);
      }
  
      let summary = `<h1>${title}</h1>`;
      summary += `<h3>${price}</h3>`;
      summary += createPriceComparisonSection(price_comparison, price_comparison_explanation);
  
      summary += '<div class="ai-summary-content-block">';
      if (wozWaarden && valuePrediction) {
        summary += createValuePredictionSection(valuePrediction);
        summary += createWozSection(wozWaarden);
      } else {
        summary += "<p>WOZ values and value predictions not available.</p>";
      }
      summary += '</div>';
  
      summary += createProsConsSection(pros, cons);
      summary += createListSection('Features', features, '✓');
      summary += createContentBlock('Description', description);
      summary += createDetailsSection(details);
  
      return summary;
    }
  }