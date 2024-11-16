function comparePropertyPricePerSqm(propertyPricePerSqm, avgPricePerSqmNeighborhood) {
  // Allow for a 5% margin to consider prices "equal"
  const margin = 0.05;
  const ratio = propertyPricePerSqm / avgPricePerSqmNeighborhood;

  if (ratio > 1 + margin) {
    return "HIGHER";
  } else if (ratio < 1 - margin) {
    return "LOWER";
  } else {
    return "EQUAL";
  }
}

async function extractPropertyInfo() {
  const scriptElement = document.querySelector('script[type="application/json"][data-nuxt-data="nuxt-app"][data-ssr="true"][id="__NUXT_DATA__"]');
  if (!scriptElement) {
    console.error('__NUXT_DATA__ script not found');
    return null;
  }

  let jsonData = JSON.parse(scriptElement.textContent);

  // Clean unnecessary data from response
  jsonData = Object.fromEntries(
    Object.entries(jsonData).filter(([_, value]) => {
      if (typeof value !== 'string') return false;

      // Filter out strings with more than 500 consecutive characters
      if (value.match(/[^\s]{500,}/)) return false;
      // Filter out image file extensions
      if (/\.(jpg|png|bmp|webp)$/i.test(value)) return false;
      // Filter out URLs
      if (value.startsWith('http')) return false;

      // Filter out duplicate strings (case-insensitive)
      // Use a static Set to persist across function calls
      if (!extractPropertyInfo.seenStrings) {
        extractPropertyInfo.seenStrings = new Set();
      }
      const lowerValue = value.toLowerCase();
      if (extractPropertyInfo.seenStrings.has(lowerValue)) return false;
      extractPropertyInfo.seenStrings.add(lowerValue);

      // Filter out hyphenated technical terms, but keep regular sentences that may contain them
      if (value.includes('-') && !value.includes(' ')) return false;

      // Filter out hash-like strings (long strings of hex characters)
      if (/^[a-f0-9]{32,}$/i.test(value)) return false;

      // Filter out strings longer than 1000 characters to avoid extremely long property descriptions
      if (value.length > 1000) return false;

      if ((value.match(/\//g) || []).length > 6) return false;
      if (/^\d+\/\d+\/\d+$/.test(value)) return false;
      if (!/^\d+$/.test(value)) return true;
      // Keep strings that are not just numbers, except 4-digit years
      if (/^\d{4}$/.test(value)) return true;

      return false;
    })
  );

  console.log('JSON DATA:', jsonData);

  // First, get the basic property info from Gemini without neighborhood stats
  // Split jsonData into chunks of max 1000 tokens each
  const jsonEntries = Object.entries(jsonData);
  const chunks = [];
  let currentChunk = [];
  let currentTokenCount = 0;

  for (const entry of jsonEntries) {
    // Rough estimate: 1 char ≈ 1 token for Latin text
    const dataInPromptLength = JSON.stringify(entry).length;

    if (currentTokenCount + dataInPromptLength > 1000) {
      // When the current chunk gets too large:
      // 1. Convert the array of entries back into an object and add it to chunks
      // 2. Reset the current chunk array to empty
      // 3. Reset the token count to 0
      chunks.push(Object.fromEntries(currentChunk));
      currentChunk = [];
      currentTokenCount = 0;
    }

    currentChunk.push(entry);
    currentTokenCount += dataInPromptLength;
  }

  // Push the last chunk if it has any entries
  if (currentChunk.length > 0) {
    chunks.push(Object.fromEntries(currentChunk));
  }

  const basePrompt = `
You only respond when I say so. I will provide you with chunks of JSON data of a real estate property you should remember. When all the chunks are provided, I will ask you to extract specific information. Don't respond, only when you have the JSON data ready. Tip: the living area size is always the first square meter value you read, save that.
`;

  // Initialize model
  const initModel = await ai.languageModel.create({
    temperature: 1, // 0.4
    topK: 1, // 1
    topP: 0.5,
    systemPrompt: basePrompt
  });

  const initResult = await initModel.prompt(basePrompt);
  console.log('initResult:', initResult);

  for (let i = 0; i < chunks.length; i++) {
    console.log('Processing chunk', i + 1);
    const chunkPrompt = `Just read & remember the data and don't respond: ${JSON.stringify(chunks[i])}\n.
`;
    // console.log('chunkPrompt:', chunkPrompt);
    const chunkResult = await initModel.prompt(chunkPrompt);
    console.log('chunkResult:', chunkResult);

    if (i === chunks.length - 1) {
      console.log('Final chunk');
      const finalResult = await initModel.prompt(`
Return the property data in JSON format, don't respond with anything else (make sure integers are wrapped in Strings):\n
{\n
  title: string, (returns: street, house number, postal code and city. Example: Streetname 1-A1, 1234 AB City)\n
  price: string, (return price starting with '€' and ends on 'k.k.', so like '€ XXX.XXX k.k.')\n
  features: array of strings, (returns the 10 most important amenities such as: garden, garage, sauna, hot tub, charging station, parking space, heat pump, attic and shed)\n
  description: string, (Returns summarized description of the property under 150 words)\n
  details: object (keys-value pairs), (Returns: living area, year of construction, type of house/residence, storage space, number of rooms, bathroom, floors, bathroom facilities, energy label, heating, insulation, furnished, upholstered, permanent residence allowed, sauna, hot tub)\n
}`);

      console.log('finalResult:', finalResult);
      const jsonMatch = finalResult.match(/```json\n([\s\S]*?)\n```/);
      const propertyJsonData = JSON.parse(jsonMatch ? jsonMatch[1] : finalResult);
      console.log('propertyJsonData:', propertyJsonData);

      const neighborhoodStats = await getNeighborhoodStats(propertyJsonData.title);

      if (neighborhoodStats) {
        const avgPurchasePriceNeighborhood = new Intl.NumberFormat('en-DE').format(neighborhoodStats.averagePrice);
        
        const avgPricePerSqmNeighborhood = neighborhoodStats.pricePerSqm;
        const neighborhood = neighborhoodStats.neighborhood;
        const municipality = neighborhoodStats.municipality;
        const livingArea = propertyJsonData.details["living area"].replace(/\s|m²/g, '');

        const propertyPrice = propertyJsonData.price.replace(/\s|€|k\.k\.|[.]/g, '');
        
        const propertyPricePerSqm = calculatePricePerSqm(propertyPrice, livingArea).value;
        const avgPriceComparisonSqm = comparePropertyPricePerSqm(propertyPricePerSqm, avgPricePerSqmNeighborhood);

        const priceAnalysisPrompt = `
You are a real estate expert. Based on the following information, provide a price analysis:

Property Information:
- Price: €${propertyPrice}
- Price per sqm: €${propertyPricePerSqm}
- Average price per sqm in area: €${avgPricePerSqmNeighborhood}
- Average purchase price in ${neighborhood}, ${municipality}: €${avgPurchasePriceNeighborhood}
- The property per square meter price is ${avgPriceComparisonSqm} than the average in the area

Please analyze if this represents good value for an investor and provide:
1. A classification of the price as 'high', 'low' or 'average'
2. A detailed explanation starting with "The asking price €${propertyPrice} is X because: [reasons]"
3. List 5 pros and cons for investors

Return the response in this JSON format:
{
  price_comparison: string,
  price_comparison_explanation: string,
  pros: array of strings,
  cons: array of strings
}`;

        initModel.destroy(); // destroy previous model session after use

        // console.log('priceAnalysisPrompt:', priceAnalysisPrompt);

        const priceAnalysisModel = await ai.languageModel.create({
          temperature: 0.05,
          topK: 1,
          systemPrompt: priceAnalysisPrompt
        });
        const priceAnalysisResult = await priceAnalysisModel.prompt(priceAnalysisPrompt);
        console.log('priceAnalysisResult:', priceAnalysisResult);
        const priceAnalysis = JSON.parse(priceAnalysisResult.replace(/```json|```/g, ''));

        priceAnalysisModel.destroy(); // destroy price analysis model session after use

        return {
          title: propertyJsonData.title ?? '',
          address: propertyJsonData.title ?? '',
          price: propertyJsonData.price ?? 0,
          features: propertyJsonData.features ?? [],
          description: propertyJsonData.description ?? '',
          details: propertyJsonData.details ?? {},
          price_comparison: priceAnalysis.price_comparison ?? '',
          price_comparison_explanation: priceAnalysis.price_comparison_explanation ?? '',
          pros: priceAnalysis.pros ?? [],
          cons: priceAnalysis.cons ?? []
        };
      }

      return {
        title: propertyJsonData.title ?? '',
        address: propertyJsonData.title ?? '',
        price: propertyJsonData.price ?? 0,
        features: propertyJsonData.features ?? [],
        description: propertyJsonData.description ?? '',
        details: propertyJsonData.details ?? {},
        price_comparison: '',
        price_comparison_explanation: '',
        pros: [],
        cons: []
      };
    }
  }

  
}



async function createSummary(propertyInfo) {
  if (!propertyInfo) {
    return '<p>Unable to extract property information</p>';
  }

  const { title, address, price, features, description, details, price_comparison, price_comparison_explanation, pros, cons } = propertyInfo;

  // Initialize variables for WOZ and predictions
  let wozWaarden = null;
  let valuePrediction = null;

  // Fetch WOZ values and predictions first
  wozWaarden = await getWozValues(address);
  if (wozWaarden) {
    valuePrediction = await predictFutureValues(wozWaarden);
  }


  // Build summary HTML after data is fetched
  let summary = `<h1>${title}</h1>`;
  summary += `<h3>${price}</h3>`;
  summary += createPriceComparisonSection(price_comparison, price_comparison_explanation);

  summary += '<div class="ai-summary-content-block">';

  // Add WOZ and prediction sections only if data is available
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

function createListSection(title, items, icon) {
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

function createContentBlock(title, content) {
  return `<div class="ai-summary-content-block"><p><strong>${title}:</strong></p><p>${content}</p></div>`;
}

function createDetailsSection(details) {
  if (Object.keys(details).length === 0) {
    return "<p>No details available</p>";
  }

  let section = "<p><strong>Details:</strong></p>";
  for (const [key, value] of Object.entries(details)) {
    section += `<p><strong>${key}:</strong> ${value ?? 'N/A'}</p>`;
  }
  return section;
}

function createPriceComparisonSection(comparison, explanation) {
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

function createProsConsSection(pros, cons) {
  if (pros.length === 0 && cons.length === 0) {
    return '';
  }

  let section = "<div class='ai-summary-content-block'>";
  section += "<p><strong>Pro's and Con's:</strong></p>";
  section += '<ul>';
  pros.forEach(pro => section += `<li>✅ ${pro}</li>`);
  cons.forEach(con => section += `<li>❌ ${con}</li>`);
  section += '</ul>';
  section += '</div>';
  return section;
}

function createWozSection(wozWaarden) {
  let section = "<p style='margin-top: 20px;'><strong>WOZ values:</strong></p>";
  section += `<ul id="woz-list">`;

  const sortedWozWaarden = wozWaarden.sort((a, b) => new Date(b.peildatum) - new Date(a.peildatum));

  sortedWozWaarden.forEach((year, index) => {
    let textColor = '';
    if (index < sortedWozWaarden.length - 1) {
      const nextYear = sortedWozWaarden[index + 1];
      if (year.vastgesteldeWaarde > nextYear.vastgesteldeWaarde) {
        textColor = 'color: green;';
      } else if (year.vastgesteldeWaarde < nextYear.vastgesteldeWaarde) {
        textColor = 'color: red;';
      }
    }
    const display = index < 3 ? '' : 'style="display: none;"';
    section += `<li ${display}><span style="${textColor}">${year.peildatum} €${year.vastgesteldeWaarde.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></li>`;
  });

  section += "</ul>";

  if (sortedWozWaarden.length > 3) {
    section += `<button id="show-more-woz">Show more</button>`;
  }

  // Add event listener for the "Show more" button
  setTimeout(() => {
    const showMoreButton = document.getElementById('show-more-woz');
    if (showMoreButton) {
      showMoreButton.addEventListener('click', () => {
        const wozList = document.getElementById('woz-list');
        const hiddenItems = wozList.querySelectorAll('li[style="display: none;"]');

        if (hiddenItems.length > 0) {
          hiddenItems.forEach(item => item.style.display = '');
          showMoreButton.textContent = 'Show less';
        } else {
          Array.from(wozList.children).slice(3).forEach(item => item.style.display = 'none');
          showMoreButton.textContent = 'Show more';
        }
      });
    }
  }, 0);

  return section;
}

function createValuePredictionSection(valuePrediction) {
  let section = "<p style='margin-top: 20px;'><strong>Value prediction for the next 5 years:</strong></p>";
  section += "<ul>";
  let previousValue = valuePrediction[0].value;
  valuePrediction.forEach((prediction, index) => {
    let valueColor = '';
    if (index > 0) {
      if (prediction.value > previousValue) {
        valueColor = 'color: green;';
      } else if (prediction.value < previousValue) {
        valueColor = 'color: red;';
      }
    }
    previousValue = prediction.value;
    section += `<li>
      <strong>${prediction.year}:</strong> <span style="${valueColor}">€${prediction.value.toLocaleString('en-EN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      <span class="info-icon" data-toggle="tooltip" data-placement="right" title="Klik voor meer informatie">ℹ️</span>
      <div class="prediction-details" id="prediction-${index}" style="display: none;">
        <em>Explanation: ${prediction.explanation}</em>
      </div>
    </li>`;
  });
  section += "</ul>";

  // Add event listener for info icons
  setTimeout(() => {
    const infoIcons = document.querySelectorAll('.info-icon');
    infoIcons.forEach((icon, index) => {
      icon.addEventListener('click', () => {
        const details = document.getElementById(`prediction-${index}`);
        details.style.display = details.style.display === 'none' ? 'block' : 'none';
      });
    });
  }, 0);

  return section;
}

document.addEventListener('click', function (event) {
  if (event.target && event.target.id === 'show-more-woz') {
    const allWozWaarden = document.getElementById('all-woz-waarden');
    if (allWozWaarden.style.display === 'none') {
      allWozWaarden.style.display = 'block';
      event.target.textContent = 'Show less';
    } else {
      allWozWaarden.style.display = 'none';
      event.target.textContent = 'Show more';
    }
  }
});

function injectStyles() {
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

function injectSidePanel() {
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

  toggleButton.addEventListener('click', togglePanel);

  document.body.appendChild(panel);
  document.body.appendChild(toggleButton);
}

async function retrievePropertyInfo() {
  const propertyInfo = await extractPropertyInfo();
  if (propertyInfo) {
    console.log('Creating summary...');
    const loaderMessage = document.getElementById('loader-message-text');
    if (loaderMessage) {
      loaderMessage.textContent = 'Creating summary...';
    }

    console.log('PROPERTY INFO:', propertyInfo);
    const summary = await createSummary(propertyInfo);

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

  toggleLoader(false);
}

let summaryRetrieved = false;

function togglePanel() {
  const panel = document.getElementById('ai-summary-panel');
  const toggleButton = document.getElementById('ai-summary-toggle');

  if (panel.style.right === '0px') {
    panel.style.right = '-300px';
    toggleButton.textContent = 'Summary';
  } else {
    panel.style.right = '0px';
    toggleButton.textContent = 'Hide';

    if (!summaryRetrieved) {
      toggleLoader(true);
      retrievePropertyInfo();
      summaryRetrieved = true;
    }
  }
}

function toggleLoader(show) {
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

async function init() {
  injectStyles();
  injectSidePanel();
}

chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
  if (request.action === 'togglePanel') {
    togglePanel();
    sendResponse({ status: 'Panel toggled' });
  }
  return true;
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

async function getWozValues(address) {
  const suggestResponse = await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=${encodeURIComponent(address)}&rows=1000`);
  const suggestData = await suggestResponse.json();
  let addressId = null;

  // console.log(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=${encodeURIComponent(address)}&rows=1000`);

  console.log('Suggest data:', suggestData);
  console.log('Address:', address);

  // Extract all numbers from the search address
  const searchNumbers = address.match(/\d+/g) || [];

  // Search through the suggested addresses
  for (const doc of suggestData.response.docs) {
    const weergavenaam = doc.weergavenaam;

    // Extract all numbers from weergavenaam
    const docNumbers = weergavenaam.match(/\d+/g) || [];

    // Check if all search numbers are present in doc numbers
    const allNumbersMatch = searchNumbers.every(num =>
      docNumbers.includes(num)
    );

    if (allNumbersMatch) {
      addressId = doc.id;
      break;
    }

  }

  // Fallback to first result if no match found
  if (!addressId && suggestData.response.docs.length > 0) {
    addressId = suggestData.response.docs[0].id;
  }

  if (!addressId) {
    throw new Error('Address ID not found');
  }

  const lookupResponse = await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?fl=*&id=${addressId}`);
  const lookupData = await lookupResponse.json();
  const nummeraanduidingId = lookupData.response.docs[0]?.nummeraanduiding_id;

  if (!nummeraanduidingId) {
    throw new Error("'Nummeraanduiding ID' not found");
  }

  const wozResponse = await fetch(`https://api.kadaster.nl/lvwoz/wozwaardeloket-api/v1/wozwaarde/nummeraanduiding/${nummeraanduidingId}`);
  const wozData = await wozResponse.json();
  const wozWaarden = wozData.wozWaarden;

  if (!wozWaarden) {
    throw new Error('WOZ values not found');
  }

  return wozWaarden;
}

async function predictFutureValues(wozWaarden) {

  const session = await ai.languageModel.create({
    temperature: 0.1,
    topK: 3,
    systemPrompt: "You are a real estate expert who predicts the future value of a property and returns it in CSV format."
  });

  const prompt = `
Make a prediction of the value evaluation for the next 5 years. You can base this on the WOZ values, previous years, current market, economic factors, etc. If it concerns a vacation home, include tourism factors. Provide the value for each year (the next 5 years).

Given the following WOZ values from previous years:
${wozWaarden.map(woz => `WOZ waarde ${woz.peildatum}: €${woz.vastgesteldeWaarde}`).join('\n')}

For each annual prediction, provide:
1. A brief explanation of why the value increases, decreases or remains stable compared to the previous year. Name at least 1-2 resources that back your conclusion.

Start your prediction from the current year, which is ${new Date().getFullYear()}.

Always return the predictions in this format:
year,value,explanation
`;

  const result = await session.prompt(prompt);

  // Convert CSV to array of objects
  const lines = result.trim().split('\n');
  const formattedResult = {
    value_prediction: lines
      .slice(2, 7)
      .map(line => {
        const values = line.split(',').map((value, index) => index === 2 ? value.replace(/,/g, '') : value);
        const price = values[1].replace(/[^0-9]/g, '').trim();
        return {
          year: parseInt(values[0]),
          value: price,
          explanation: values[2]
        };
      })
  };

  session.destroy();

  jsonResult = JSON.stringify(formattedResult);

  // Parse the JSON response
  const prediction = JSON.parse(jsonResult);

  return prediction.value_prediction;

}

async function getNeighborhoodStats(address) {
  // Get previous year since that's typically the most recent complete dataset
  const previousYear = (new Date().getFullYear() - 1).toString() + 'JJ00';

  console.log('Address:', address);

  // Get BAG id from PDOK
  const suggestResponse = await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=${encodeURIComponent(address)}&rows=1`);
  const suggestData = await suggestResponse.json();

  // console.log('Neighborhood suggest:', `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=${encodeURIComponent(address)}&rows=1`);

  if (!suggestData.response?.docs?.[0]?.id) {
    console.error('Could not find BAG id for address:', address);
    return null;
  }

  // Get detailed information including neighborhood code
  const lookupResponse = await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=${suggestData.response.docs[0].id}`);
  const lookupData = await lookupResponse.json();

  // console.log('Neighborhood lookup:', `https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=${suggestData.response.docs[0].id}`);

  if (!lookupData.response?.docs?.[0]?.buurtcode) {
    console.error('Could not find neighborhood code');
    return null;
  }

  const gemeenteCode = `GM${lookupData.response.docs[0].gemeentecode}`;

  // Get neighborhood statistics from CBS (StatLine) for the previous year only (current year is not possible)
  // G3625ENG = dataset code
  const statsResponse = await fetch(
    `https://opendata.cbs.nl/ODataApi/odata/83625ENG/TypedDataSet?$filter=Regions eq '${gemeenteCode}' and Periods eq '${previousYear}'`
  );
  const statsData = await statsResponse.json();

  if (!statsData.value?.[0]) {
    console.error('Could not find CBS statistics for this neighborhood for year:', previousYear);
    return null;
  }

  const avgPurchasePrice = statsData.value[0].AveragePurchasePrice_1;
  const pricePerSqm = await getTopPricePerSqm(gemeenteCode, avgPurchasePrice);

  return {
    averagePrice: avgPurchasePrice,
    pricePerSqm: pricePerSqm,
    neighborhood: lookupData.response.docs[0].buurtnaam,
    municipality: lookupData.response.docs[0].gemeentenaam,
    year: previousYear
  };
}

async function getTopPricePerSqm(gemeenteCode, avgPurchasePrice) {
  // Fetch data from the specific CBS endpoint
  const currentYear = (new Date().getFullYear()).toString() + 'JJ00';
  const response = await fetch(`https://opendata.cbs.nl/ODataApi/odata/82550NED/TypedDataSet?$top=1&$orderby=RegioS&$filter=RegioS eq '${gemeenteCode}' and Perioden eq '${currentYear}'`);
  const data = await response.json();

  if (!data.value?.[0]) {
    return null;
  }

  const avgLivingArea = data.value[0].GemiddeldeOppervlakte_2;
  const pricePerSqm = avgPurchasePrice / avgLivingArea;

  return Math.round(pricePerSqm);
}

function calculatePricePerSqm(price, livingArea) {
  // Check if both inputs are valid numbers
  if (!price || !livingArea || isNaN(price) || isNaN(livingArea) || livingArea <= 0) {
    console.error('Invalid input for price per sqm calculation:', { price, livingArea });
    return null;
  }

  console.log('LIVING AREA:', livingArea);

  // Calculate price per square meter and round to nearest integer
  const pricePerSqm = Math.round(price / livingArea);

  // Format the result with thousand separators
  const formattedPrice = new Intl.NumberFormat('en-EN', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(pricePerSqm);

  return {
    value: pricePerSqm,
    formatted: formattedPrice,
    price: price,
    livingArea: livingArea
  };
}

async function translateContent(content, targetLanguage) {
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

// After translation, reattach event listeners
document.addEventListener('change', async function (event) {
  if (event.target && event.target.id === 'translation-language') {
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
      const translatedContent = await translateContent(
        summaryContent.getAttribute('data-original-content'),
        targetLanguage
      );
      summaryContent.innerHTML = translatedContent;
      summaryContent.setAttribute('data-current-language', targetLanguage);

      // Reattach event listeners after translation
      const infoIcons = document.querySelectorAll('.info-icon');
      infoIcons.forEach((icon, index) => {
        icon.addEventListener('click', () => {
          const details = document.getElementById(`prediction-${index}`);
          if (details) {
            details.style.display = details.style.display === 'none' ? 'block' : 'none';
          }
        });
      });

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
});
