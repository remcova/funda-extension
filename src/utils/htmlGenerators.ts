import { WozWaarde, ValuePrediction } from '../types';

export function createListSection(title: string, items: string[], icon: string): string {
    if (!Array.isArray(items) || items.length === 0) {
      return `<p>No ${title.toLowerCase()} available</p>`;
    }
  
    let section = `<p style="margin-top: 10px;"><strong>${title}:</strong></p><ul>`;
    items.forEach(item => {
      section += `<li><span style="color: #4CAF50;">${icon}</span> ${item}</li>`;
    });
    section += "</ul>";
    return section;
  }
  
  export function createContentBlock(title: string, content: string): string {
    return `<div class="ai-summary-content-block"><p><strong>${title}:</strong></p><p>${content}</p></div>`;
  }
  
  export function createDetailsSection(details: Record<string, string>): string {
    if (Object.keys(details).length === 0) {
      return "<p>No details available</p>";
    }
  
    let section = "<p><strong>Details:</strong></p>";
    for (const [key, value] of Object.entries(details)) {
      section += `<p><strong>${key}:</strong> ${value ?? 'N/A'}</p>`;
    }
    return section;
  }
  
  export function createPriceComparisonSection(comparison: string, explanation: string): string {
    let label = '';
    let color = '';
    
    if (comparison.toLowerCase().includes('high')) {
      label = 'High';
      color = 'red';
    } else if (comparison.toLowerCase().includes('low')) {
      label = 'Low';
      color = 'green';
    } else if (comparison.toLowerCase().includes('average')) {
      label = 'Average';
      color = 'orange';
    }
  
    return `
      <div class="ai-summary-content-block">
        <div style="border: 2px solid ${color}; border-radius: 5px; padding: 10px; margin: 10px 0;">
          <span style="background-color: ${color}; color: white; padding: 2px 5px; border-radius: 3px; font-weight: bold;">${label}</span>
          <p>${explanation}</p>
        </div>
      </div>
    `;
  }
  
  export function createWozSection(wozWaarden: WozWaarde[]): string {
    let section = "<p style='margin-top: 20px;'><strong>WOZ values:</strong></p>";
    section += `<ul id="woz-list">`;
  
    const sortedWozWaarden = [...wozWaarden].sort((a, b) => 
      new Date(b.peildatum).getTime() - new Date(a.peildatum).getTime()
    );
  
    sortedWozWaarden.forEach((woz, index) => {
      let textColor = '';
      if (index < sortedWozWaarden.length - 1) {
        const nextWoz = sortedWozWaarden[index + 1];
        textColor = woz.vastgesteldeWaarde > nextWoz.vastgesteldeWaarde ? 'color: green;' : 
                   woz.vastgesteldeWaarde < nextWoz.vastgesteldeWaarde ? 'color: red;' : '';
      }
      
      const display = index < 3 ? '' : 'style="display: none;"';
      section += `
        <li ${display}>
          <span style="${textColor}">
            ${woz.peildatum} €${woz.vastgesteldeWaarde.toLocaleString('nl-NL', { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            })}
          </span>
        </li>`;
    });
  
    section += "</ul>";
  
    if (sortedWozWaarden.length > 3) {
      section += `<button id="show-more-woz">Show more</button>`;
    }
  
    return section;
  }
  
  export function createValuePredictionSection(valuePrediction: ValuePrediction[]): string {
    let section = "<p style='margin-top: 20px;'><strong>Value prediction for the next 5 years:</strong></p>";
    section += "<ul>";
    
    let previousValue = Number(valuePrediction[0].value);
    valuePrediction.forEach((prediction, index) => {
      const currentValue = Number(prediction.value);
      let valueColor = '';
      if (index > 0) {
        valueColor = currentValue > previousValue ? 'color: green;' : 
                    currentValue < previousValue ? 'color: red;' : '';
      }
      previousValue = currentValue;
      
      section += `<li>
        <strong>${prediction.year}:</strong> <span style="${valueColor}">€${currentValue.toLocaleString('en-EN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <span class="info-icon" data-toggle="tooltip" data-placement="right" title="Click for more information">ℹ️</span>
        <div class="prediction-details" id="prediction-${index}" style="display: none;">
          <em>Explanation: ${prediction.explanation}</em>
        </div>
      </li>`;
    });
    section += "</ul>";
    
    return section;
  }
  
  export function createProsConsSection(pros: string[], cons: string[]): string {
    let section = '<div class="pros-cons-section">';
    
    if (pros.length > 0) {
      section += createListSection('Pros', pros, '✓');
    }
    
    if (cons.length > 0) {
      section += createListSection('Cons', cons, '✗');
    }
    
    section += '</div>';
    return section;
  }