async function extractPropertyInfo() {
  const scriptElement = document.querySelector('script[type="application/json"][data-nuxt-data="nuxt-app"][data-ssr="true"][id="__NUXT_DATA__"]');
  if (!scriptElement) {
    console.error('__NUXT_DATA__ script not found');
    return null;
  }

  try {
    let jsonData = JSON.parse(scriptElement.textContent);

    // Clean unnecessary data from response
    jsonData = Object.fromEntries(
      Object.entries(jsonData).filter(([key, value]) => 
        (typeof value === 'string') && 
        (!/[\/\\]/.test(value) || /^\d{2}\/\d{2}\/\d{4}$/.test(value)) && 
        (!/^\d+$/.test(value) || /^\d{4}$/.test(value))
      )
    );
    
    console.log('Cleaned JSON data:', jsonData);
    // Use OpenAI GPT API to extract required information
    const openaiApiKey = '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'; // Replace with your actual API key
    const openaiEndpoint = 'https://api.openai.com/v1/chat/completions';

    const prompt = `Dit is een verzoek om de volgende informatie uit JSON-data te halen:
Titel (combinatie van straat en huisnummer)
Prijs
Kenmerken (lijst met eigenschappen, zoals tuin, garage, sauna, laadpaal, parkeerplek, warmtepomp, zolder, schuur, etc.)
Beschrijving (Geef een samengevatte beschrijving van het pand, bij voorkeur onder 150 woorden)
Details (vermeld indien beschikbaar: bouwjaar, soort woonhuis/huis, woonoppervlakte, bergruimte, aantal kamers, badkamer, woonlagen, badkamervoorzieningen, energielabel, verwarming, isolatie, gemeubileerd, gestoffeerd, permanente bewoning toegestaan)
Geef een indicatie of de prijs van dit pand 'hoog', 'laag' of 'gemiddeld' is vergeleken met de gemiddelde prijs van vergelijkbare panden in de buurt. Houd rekening met het type woning en neem de 'Gem. vraagprijs / m²', 'ligging', 'bouwjaar', 'soort bouw', 'soort huis', de pro's en con's en alle andere factoren in overweging (behalve permanente bewoning). De belangrijkste voor de bepaling is de gemiddelde vraagprijs per vierkante meter. Geef een toelichting op je conclusie betreft de prijs. Onderbouw het met minimaal 3 argumenten, je verteld het aan een potentiële koper.

Noem ook 5 voor- en nadelen, zet de voor- en nadelen in een bullet point lijst met groene vinkjes en rode kruisjes.

Retourneer in JSON-formaat met de keys 'title', 'price', 'features', 'description', 'details', 'price_comparison', 'price_comparison_explanation', 'pros', 'cons'.

Data waaruit u de informatie moet halen:
${JSON.stringify(jsonData)}
`;

    const response = await fetch(openaiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      })
    });

    const result = await response.json();

    if (!result.choices || result.choices.length === 0) {
      throw new Error('No choices returned from OpenAI API');
    }

    const extractedInfo = JSON.parse(result.choices[0].message.content);

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
  } catch (error) {
    console.error('Error in extractPropertyInfo:', error);
    return null;
  }
}

function createSummary(propertyInfo) {
  if (!propertyInfo) {
    return '<p>Kan de woninginformatie niet extraheren</p>';
  }

  const { title, price, features, description, details, price_comparison, price_comparison_explanation, pros, cons } = propertyInfo;

  let summary = `<h1>${title}</h1>`;
  summary += `<h3>${price}</h3>`;

  if (Array.isArray(features) && features.length > 0) {
    summary += "<p><strong>Kenmerken:</strong></p><ul>";
    features.forEach(feature => {
      summary += `<li><span style="color: #4CAF50;">✓</span> ${feature}</li>`;
    });
    summary += "</ul>";
  } else {
    summary += "<p>Geen kenmerken beschikbaar</p>";
  }

  summary += `<div id="ai-summary-content-block"><p><strong>Beschrijving:</strong></p><p>${description}</p></div>`;

  if (Object.keys(details).length > 0) {
    summary += "<p><strong>Details:</strong></p>";
    for (const [key, value] of Object.entries(details)) {
      summary += `<p><strong>${key}:</strong> ${value}</p>`;
    }
  } else {
    summary += "<p>Geen details beschikbaar</p>";
  }

  // Add labeled box for price comparison
  console.log('Price comparison:', price_comparison);
  let priceComparisonLabel = '';
  let labelColor = '';
  if (price_comparison.toLowerCase().includes('hoog')) {
    priceComparisonLabel = 'Hoog';
    labelColor = 'red';
  } else if (price_comparison.toLowerCase().includes('laag')) {
    priceComparisonLabel = 'Laag';
    labelColor = 'green';
  } else if (price_comparison.toLowerCase().includes('gemiddeld')) {
    priceComparisonLabel = 'Gemiddeld';
    labelColor = 'orange';
  }

  summary += `
    <div style="border: 2px solid ${labelColor}; border-radius: 5px; padding: 10px; margin: 10px 0;">
      <span style="background-color: ${labelColor}; color: white; padding: 2px 5px; border-radius: 3px; font-weight: bold;">${priceComparisonLabel}</span>
      <p>${price_comparison_explanation}</p>
    </div>
  `;

  if (pros.length > 0 || cons.length > 0) {
    summary += "<p><strong>Pro's and Con's:</strong></p>";
    summary += '<ul>';
    pros.forEach(pro => summary += `<li><span style="color: #4CAF50;">✓</span> ${pro}</li>`);
    cons.forEach(con => summary += `<li><span style="color: red;">X</span> ${con}</li>`);
    summary += '</ul>';
  }
  return summary;
}

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

    #ai-summary-content-block {
      margin: 10px 0 10px 0;
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

  // Update loader element
  const loader = document.createElement('div');
  loader.id = 'ai-summary-loader';
  loader.innerHTML = `
    <p>Samenvatting genereren...</p>
    <div class="progress-bar">
      <div class="progress-bar-inner"></div>
    </div>
  `;
  panel.appendChild(loader);

  const toggleButton = document.createElement('button');
  toggleButton.id = 'ai-summary-toggle';
  toggleButton.textContent = 'Samenvatting';
  toggleButton.style.cssText = `
    position: fixed;
    top: 50%;
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
    const summary = createSummary(propertyInfo);

    // Update the panel with the summary
    const summaryContent = document.getElementById('ai-summary-content');
    if (summaryContent) {
      summaryContent.innerHTML = summary;
      console.log('Summary added to sidebar');
    } else {
      console.error('Summary content element not found');
    }

    // Send the summary to the background script
    chrome.runtime.sendMessage({ action: 'summarize', summary }, (response) => {
      console.log('Message sent, waiting for response...');
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError.message);
      } else if (response === undefined) {
        console.warn('Response is undefined. Background script may not have sent a response.');
      } else {
        console.log('Response from background:', response);
      }
    });
  } else {
    console.error('Failed to extract property information');
    const summaryContent = document.getElementById('ai-summary-content');
    if (summaryContent) {
      summaryContent.innerHTML = '<p>Failed to extract property information</p>';
    }
  }

  // Hide loader and show content
  const loader = document.getElementById('ai-summary-loader');
  const summaryContent = document.getElementById('ai-summary-content');
  if (loader && summaryContent) {
    loader.style.display = 'none';
    summaryContent.style.display = 'block';
  }
}

let summaryRetrieved = false;

function togglePanel() {
  const panel = document.getElementById('ai-summary-panel');
  const toggleButton = document.getElementById('ai-summary-toggle');
  const loader = document.getElementById('ai-summary-loader');
  const summaryContent = document.getElementById('ai-summary-content');

  if (panel.style.right === '0px') {
    panel.style.right = '-300px';
    toggleButton.textContent = 'Samenvatting';
  } else {
    panel.style.right = '0px';
    toggleButton.textContent = 'Verberg';
    
    if (!summaryRetrieved) {
      // Show loader and hide content
      if (loader && summaryContent) {
        loader.style.display = 'block';
        summaryContent.style.display = 'none';
      }
      retrievePropertyInfo();
      summaryRetrieved = true;
    }
  }
}

// Initialize the extension
async function init() {
  injectStyles();
  injectSidePanel();
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'togglePanel') {
    togglePanel();
    sendResponse({status: 'Panel toggled'});
  }
  return true;  // Indicates that the response will be sent asynchronously
});

// Run the initialization when the DOM is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
