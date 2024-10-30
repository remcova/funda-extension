async function extractPropertyInfo() {
  const scriptElement = document.querySelector('script[type="application/json"][data-nuxt-data="nuxt-app"][data-ssr="true"][id="__NUXT_DATA__"]');
  if (!scriptElement) {
    console.error('__NUXT_DATA__ script not found');
    return null;
  }

  let jsonData = JSON.parse(scriptElement.textContent);

  // Clean unnecessary data from response
  jsonData = Object.fromEntries(
    Object.entries(jsonData).filter(([_, value]) =>
      (typeof value === 'string') &&
      (!/^\d+$/.test(value) || /^\d{4}$/.test(value))
    )
  );

  // Get the API key from storage
  const { geminiApiKey } = await chrome.storage.sync.get(['geminiApiKey']);
  
  if (!geminiApiKey) {
    console.error('Gemini API key not set');
    return null;
  }

  const geminiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

  const prompt = `You are a real estate expert who needs to analyze property information.

This is a request to extract the following information from JSON data:
1. Title (combination of street, house number, postal code and city)
2. Price
3. Features (list of all amenities such as: garden, garage, sauna, charging station, parking space, heat pump, attic and shed)
4. Description (Give a summarized description of the property, preferably under 150 words)
5. Details (mention if available: year of construction, type of house/residence, living area, storage space, number of rooms, bathroom, floors, bathroom facilities, energy label, heating, insulation, furnished, upholstered, permanent residence allowed, sauna, hot tub)
6. Give an indication whether the price of this property is 'high', 'low' or 'average' for an investor. Base this on
the difference between the asking price and the WOZ value of the previous year (it is now ${new Date().getFullYear()}). If the 'Avg. asking price / m²' is available in the JSON information below, include that in your conclusion as well. The smaller the difference, the fairer the price.
7. Provide an explanation of your conclusion regarding the price. The conclusion is aimed at investors.
Support it with at least 3 arguments, you are telling it to a potential investor who wants to rent or sell this property for profit.
8. Also list 5 advantages and disadvantages (if any) for investors, put the pros and cons in a bullet point list with green checkmarks and red crosses.

Keep your conclusions consistent and clear for investors for all points mentioned above. Go into details.

Return in JSON format with the keys 'title', 'price', 'features', 'description', 'details', 'price_comparison', 'price_comparison_explanation', 'pros', 'cons'.
${JSON.stringify(jsonData)}
`;

  // console.log('Prompt:');
  // console.log(prompt);

  const result = await fetchGemini(geminiEndpoint, geminiApiKey, prompt);

  // Parse Gemini response
  const extractedInfo = JSON.parse(result.candidates[0].content.parts[0].text.replace(/```json|```/g, ''));

  console.log('Extracted info:');
  console.log(extractedInfo);

  return {
    title: extractedInfo.title ?? '',
    price: extractedInfo.price ?? 0,
    features: extractedInfo.features ?? [],
    description: extractedInfo.description ?? '',
    details: extractedInfo.details ?? {},
    price_comparison: extractedInfo.price_comparison ?? '',
    price_comparison_explanation: extractedInfo.price_comparison_explanation ?? '',
    pros: extractedInfo.pros ?? [],
    cons: extractedInfo.cons ?? []
  };

}

async function createSummary(propertyInfo) {
  if (!propertyInfo) {
    return '<p>Unable to extract property information</p>';
  }

  const { title, price, features, description, details, price_comparison, price_comparison_explanation, pros, cons } = propertyInfo;

  let summary = `<h1>${title}</h1>`;
  summary += `<h3>${price}</h3>`;

  summary += createPriceComparisonSection(price_comparison, price_comparison_explanation);

  summary += '<div class="ai-summary-content-block">';
  const propertyAddress = title.split(',')[0].split('-')[0].trim();
  try {
    // Value predictions for the next 5 years
    const wozWaarden = await getWozValues(propertyAddress);
    const valuePrediction = await predictFutureValues(wozWaarden);
    if (valuePrediction) {
      summary += createValuePredictionSection(valuePrediction);
    }

    // WOZ values (Property Valuation Act values in English)
    summary += createWozSection(wozWaarden);
  } catch (error) {
    console.error('Error retrieving WOZ values:', error);
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
    section += `<p><strong>${key}:</strong> ${value}</p>`;
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
  pros.forEach(pro => section += `<li><span style="color: #4CAF50;">✓</span> ${pro}</li>`);
  cons.forEach(con => section += `<li><span style="color: red;">X</span> ${con}</li>`);
  section += '</ul>';
  section += '</div>';
  return section;
}

function createWozSection(wozWaarden) {
  let section = "<p style='margin-top: 20px;'><strong>WOZ waarden:</strong></p>";
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
        <br><strong>Sources:</strong> ${prediction.sources}
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
        temperature: 0.1,
        topK: 1,
        topP: 1
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
      display: none;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    }
    
    .progress-bar {
      width: 200px;
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
  panel.appendChild(summaryContent);

  const loader = document.createElement('div');
  loader.id = 'ai-summary-loader';
  loader.innerHTML = `
    <p id="loader-message">Extracting information...</p>
    <div class="progress-bar">
      <div class="progress-bar-inner"></div>
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
    const loaderMessage = document.getElementById('loader-message');
    if (loaderMessage) {
      loaderMessage.textContent = 'Creating summary now';
    }
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
  const suggestResponse = await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=${encodeURIComponent(address)}&rows=3`);
  const suggestData = await suggestResponse.json();
  const addressId = suggestData.response.docs[0]?.id;

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
    systemPrompt: "You are a real estate expert who predicts the future value of a property and returns it in CSV format."
  });

  const prompt = `
Make a prediction of the value evaluation for the next 5 years. You can base this on the WOZ values, previous years, current market, economic factors, etc. If it concerns a vacation home, include tourism factors. Provide the value for each year (the next 5 years).

Given the following WOZ values from previous years:
${wozWaarden.map(woz => `WOZ waarde ${woz.peildatum}: €${woz.vastgesteldeWaarde}`).join('\n')}

For each annual prediction, provide:
1. A brief explanation of why the value increases, decreases or remains stable.
2. List the sources or data on which you base your conclusion. These could include economic reports, market trends, or specific news articles. Name the sources specifically (websites, reports, etc.).

The current year is ${new Date().getFullYear()}. Start the prediction from next year.

Always return the predictions in this format:
year,value,explanation,sources
`;

  // console.log(prompt);

  const result = await session.prompt(prompt);

  console.log('AI response:');
  console.log(result);

  // Convert CSV to array of objects
  const lines = result.trim().split('\n');
  const formattedResult = {
    value_prediction: lines
      .slice(2, 7)
      .map(line => {
        const values = line.split(',').map((value, index) => index === 2 ? value.replace(/,/g, '') : value);
        console.log(values);
        const price = values[1].replace(/[^0-9]/g, '').trim();
        console.log(price);
        return {
          year: parseInt(values[0]),
          value: price,
          explanation: values[2],
          sources: values[3]
        };
      })
  };

  session.destroy();

  jsonResult = JSON.stringify(formattedResult);

  // Parse the JSON response
  const prediction = JSON.parse(jsonResult);

  console.log(prediction);

  return prediction.value_prediction;

}
