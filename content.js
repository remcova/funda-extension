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
      
      // Keep strings that are not just numbers, except 4-digit years
      if (/^\d+\/\d+\/\d+$/.test(value)) return false;
      if (!/^\d+$/.test(value)) return true;
      if (/^\d{4}$/.test(value)) return true;
      
      return false;
    })
  );

  // Get the API key from storage
  const { geminiApiKey } = await chrome.storage.sync.get(['geminiApiKey']);

  if (!geminiApiKey) {
    console.error('Gemini API key not set');
    return null;
  }

  console.log('JSON DATA:', jsonData);

  const geminiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

  // First, get the basic property info from Gemini without neighborhood stats
  const initialPrompt = `

This is a request to extract the following information from JSON data:
1. Title: combination of street, house number, postal code and city
2. Price: asking price
3. Features: List of all amenities such as: garden, garage, sauna, hot tub, charging station, parking space, heat pump, attic and shed)
4. Description: Give a summarized description of the property, preferably under 150 words)
5. Details: Mention if available: year of construction, type of house/residence, living area, storage space, number of rooms, bathroom, floors, bathroom facilities, energy label, heating, insulation, furnished, upholstered, permanent residence allowed, sauna, hot tub)

Please convert the following real estate data into JSON format with these fields:
{
  title: string,
  price: number,
  features: array of strings,
  description: string,
  details: object
}

Only return the JSON object, nothing else.
${JSON.stringify(jsonData)}`;

  // Get initial property info
  const initialResult = await fetchGemini(geminiEndpoint, geminiApiKey, initialPrompt);
  console.log(initialResult.candidates[0].content.parts[0].text);
  const initialInfo = JSON.parse(initialResult.candidates[0].content.parts[0].text.replace(/```json|```/g, ''));

  // Now we can get neighborhood stats using the correct address
  const neighborhoodStats = await getNeighborhoodStats(initialInfo.title);

  if (neighborhoodStats) {
    const avgPurchasePriceNeighborhood = neighborhoodStats.averagePrice;
    const avgPricePerSqmNeighborhood = neighborhoodStats.pricePerSqm;
    const neighborhood = neighborhoodStats.neighborhood;
    const municipality = neighborhoodStats.municipality;

    const propertyPricePerSqm = calculatePricePerSqm(initialInfo.price, initialInfo.details["living area"]);
    const avgPriceComparisonSqm = comparePropertyPricePerSqm(propertyPricePerSqm.value, avgPricePerSqmNeighborhood);

    // Now get the price analysis with the neighborhood stats
    const priceAnalysisPrompt = `You are a real estate expert. Based on the following information, provide a price analysis:

Property Information:
- Price: €${initialInfo.price}
- Price per sqm: €${propertyPricePerSqm.value}
- Average price per sqm in area: €${avgPricePerSqmNeighborhood}
- Average purchase price in ${neighborhood}, ${municipality}: €${avgPurchasePriceNeighborhood}
- The property per square meter price is ${avgPriceComparisonSqm} than the average in the area

Please analyze if this represents good value for an investor and provide:
1. A classification of the price as 'high', 'low' or 'average'
2. A detailed explanation starting with "The asking price €${initialInfo.price} is X because: [reasons]"
3. List 5 pros and cons for investors

Return the response in this JSON format:
{
  price_comparison: string,
  price_comparison_explanation: string,
  pros: array of strings,
  cons: array of strings
}`;

    const priceAnalysisResult = await fetchGemini(geminiEndpoint, geminiApiKey, priceAnalysisPrompt);
    const priceAnalysis = JSON.parse(priceAnalysisResult.candidates[0].content.parts[0].text.replace(/```json|```/g, ''));

    // Combine all the information
    return {
      title: initialInfo.title ?? '',
      address: initialInfo.title ?? '',
      price: initialInfo.price ?? 0,
      features: initialInfo.features ?? [],
      description: initialInfo.description ?? '',
      details: initialInfo.details ?? {},
      price_comparison: priceAnalysis.price_comparison ?? '',
      price_comparison_explanation: priceAnalysis.price_comparison_explanation ?? '',
      pros: priceAnalysis.pros ?? [],
      cons: priceAnalysis.cons ?? []
    };
  }

  // Return basic info if neighborhood stats couldn't be retrieved
  return {
    title: initialInfo.title ?? '',
    address: initialInfo.title ?? '',
    price: initialInfo.price ?? 0,
    features: initialInfo.features ?? [],
    description: initialInfo.description ?? '',
    details: initialInfo.details ?? {},
    price_comparison: '',
    price_comparison_explanation: '',
    pros: [],
    cons: []
  };
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
    section += `<button id="show-more-woz">Meer weergeven</button>`;
  }

  // Add event listener for the "Meer weergeven" button
  setTimeout(() => {
    const showMoreButton = document.getElementById('show-more-woz');
    if (showMoreButton) {
      showMoreButton.addEventListener('click', () => {
        const wozList = document.getElementById('woz-list');
        const hiddenItems = wozList.querySelectorAll('li[style="display: none;"]');

        if (hiddenItems.length > 0) {
          hiddenItems.forEach(item => item.style.display = '');
          showMoreButton.textContent = 'Minder weergeven';
        } else {
          Array.from(wozList.children).slice(3).forEach(item => item.style.display = 'none');
          showMoreButton.textContent = 'Meer weergeven';
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

async function fetchGemini(endpoint, apiKey, prompt) {
  const response = await fetch(`${endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.05,
        topP: 0.8,
        topK: 1,
      }
    })
  });

  const result = await response.json();

  if (!result.candidates || result.candidates.length === 0) {
    throw new Error('No response from Gemini API');
  }

  return result;
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
      padding: 20px;
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
  `;
  document.head.appendChild(style);
}

function injectSidePanel() {
  const panel = document.createElement('div');
  panel.id = 'ai-summary-panel';
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
  if (loader && summaryContent) {
    loader.style.display = show ? 'block' : 'none';
    summaryContent.style.display = show ? 'none' : 'block';
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

  console.log(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=${encodeURIComponent(address)}&rows=1000`);

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

  console.log('Neighborhood suggest:', `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=${encodeURIComponent(address)}&rows=1`);

  if (!suggestData.response?.docs?.[0]?.id) {
    console.error('Could not find BAG id for address:', address);
    return null;
  }

  // Get detailed information including neighborhood code
  const lookupResponse = await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=${suggestData.response.docs[0].id}`);
  const lookupData = await lookupResponse.json();

  console.log('Neighborhood lookup:', `https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=${suggestData.response.docs[0].id}`);

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
