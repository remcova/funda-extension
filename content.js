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
        (!/^\d+$/.test(value) || /^\d{4}$/.test(value))
      )
    );

    const openaiApiKey = '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'; // Replace with your actual API key
    const openaiEndpoint = 'https://api.openai.com/v1/chat/completions';

    const prompt = `Je bent een vastgoed expert die informatie van een woning moet analyseren.

Dit is een verzoek om de volgende informatie uit JSON-data te halen:
1. Titel (combinatie van straat, huisnummer, postcode en stad)
2. Prijs
3. Kenmerken (lijst met alle faciliteiten (min. 5 indien beschikbaar) zoals: tuin, garage, sauna, laadpaal, parkeerplek, warmtepomp, zolder en schuur).
4. Beschrijving (Geef een samengevatte beschrijving van het pand, bij voorkeur onder 150 woorden)
5. Details (vermeld indien beschikbaar: bouwjaar, soort woonhuis/huis, woonoppervlakte, bergruimte, aantal kamers, badkamer, woonlagen, badkamervoorzieningen, energielabel, verwarming, isolatie, gemeubileerd, gestoffeerd, permanente bewoning toegestaan, sauna, hottub)
6. Geef een indicatie of de prijs van dit pand 'hoog', 'laag' of 'gemiddeld' is voor een investeerder. Baseer dit op
het verschil tussen de vraagprijs en de woz waarde van het vorige jaar (het is nu ${new Date().getFullYear()}). Indien de 'Gem. vraagprijs / m²' beschikbaar is in de onderstaande JSON informatie, neem die ook mee in je conclusie. Hoe kleiner het verschil, hoe eerlijker de prijs.
Neem ook deze factoren mee:
Locatie: De locatie van de woning is een cruciale factor die de marktwaarde beïnvloedt. Factoren zoals de buurt, voorzieningen in de omgeving, bereikbaarheid en nabijheid van scholen, winkels en openbaar vervoer spelen een grote rol.
Staat van de woning: De fysieke staat van de woning, inclusief leeftijd, grootte, kwaliteit van de bouw, voorzieningen, energiezuinigheid en eventuele renovaties of verbeteringen, bepaalt mede de marktwaarde.
Vergelijkbare verkoopprijzen: Het vergelijken van de woning met vergelijkbare woningen die recentelijk zijn verkocht in dezelfde buurt of omgeving (vergelijkingsmethode) is een belangrijke variabele om de marktwaarde te bepalen.
7. Geef een toelichting op je conclusie betreft de prijs. De conclusie is gericht op investeerders. 
Onderbouw het met minimaal 3 argumenten, je verteld het aan een potentiële investeerder die met winst dit pand wil verhuren of verkopen.
8. Noem ook 5 voor- en nadelen (als die er zijn) voor investeerders, zet de voor- en nadelen in een bullet point lijst met groene vinkjes en rode kruisjes. 

Houd je conclusies consistent en duidelijk voor investeerders voor alle punten bovengenoemde punten. Ga in op details.

Retourneer in JSON-formaat met de keys 'title', 'price', 'features', 'description', 'details', 'price_comparison', 'price_comparison_explanation', 'pros', 'cons'.

Data waaruit u de informatie moet halen:
${JSON.stringify(jsonData)}
`;

    const result = await fetchOpenAI(openaiEndpoint, openaiApiKey, prompt);

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

async function createSummary(propertyInfo) {
  if (!propertyInfo) {
    return '<p>Kan de woninginformatie niet extraheren</p>';
  }

  const { title, price, features, description, details, price_comparison, price_comparison_explanation, pros, cons } = propertyInfo;

  let summary = `<h1>${title}</h1>`;
  summary += `<h3>${price}</h3>`;

  summary += createPriceComparisonSection(price_comparison, price_comparison_explanation);

  summary += '<div class="ai-summary-content-block">';
  const propertyAddress = title.split(',')[0].split('-')[0].trim();
  try {
    // Waarde voorspellingen voor de komende 5 jaren
    const wozWaarden = await getWozValues(propertyAddress);
    const valuePrediction = await predictFutureValues(wozWaarden, propertyInfo);
    if (valuePrediction) {
      summary += createValuePredictionSection(valuePrediction);
    }

    // WOZ waarden
    summary += createWozSection(wozWaarden);
  } catch (error) {
    console.error('Error retrieving WOZ values:', error);
    summary += "<p>WOZ waarden en waarde voorspellingen niet beschikbaar</p>";
  }
  summary += '</div>';

  summary += createProsConsSection(pros, cons);

  summary += createListSection('Kenmerken', features, '✓');
  summary += createContentBlock('Beschrijving', description);
  summary += createDetailsSection(details);

  return summary;
}

function createListSection(title, items, icon) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p>Geen ${title.toLowerCase()} beschikbaar</p>`;
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
    return "<p>Geen details beschikbaar</p>";
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
  if (comparison.toLowerCase().includes('hoog')) {
    label = 'Hoog';
    color = 'red';
  } else if (comparison.toLowerCase().includes('laag')) {
    label = 'Laag';
    color = 'green';
  } else if (comparison.toLowerCase().includes('gemiddeld')) {
    label = 'Gemiddeld';
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
  section += "<p><strong>Pro's en Con's:</strong></p>";
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
  let section = "<p style='margin-top: 20px;'><strong>Waarde voorspelling voor de komende 5 jaren:</strong></p>";
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
      <strong>${prediction.year}:</strong> <span style="${valueColor}">€${prediction.value.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      <span class="info-icon" data-toggle="tooltip" data-placement="right" title="Klik voor meer informatie">ℹ️</span>
      <div class="prediction-details" id="prediction-${index}" style="display: none;">
        <em>Verklaring: ${prediction.explanation}</em>
        <br><strong>Bronnen:</strong> ${prediction.sources}
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

async function fetchOpenAI(endpoint, apiKey, prompt) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
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

  return result;
}

document.addEventListener('click', function (event) {
  if (event.target && event.target.id === 'show-more-woz') {
    const allWozWaarden = document.getElementById('all-woz-waarden');
    if (allWozWaarden.style.display === 'none') {
      allWozWaarden.style.display = 'block';
      event.target.textContent = 'Minder weergeven';
    } else {
      allWozWaarden.style.display = 'none';
      event.target.textContent = 'Meer weergeven';
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
    toggleButton.textContent = 'Samenvatting';
  } else {
    panel.style.right = '0px';
    toggleButton.textContent = 'Verberg';

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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
    throw new Error('Nummeraanduiding ID not found');
  }

  const wozResponse = await fetch(`https://api.kadaster.nl/lvwoz/wozwaardeloket-api/v1/wozwaarde/nummeraanduiding/${nummeraanduidingId}`);
  const wozData = await wozResponse.json();
  const wozWaarden = wozData.wozWaarden;

  if (!wozWaarden) {
    throw new Error('WOZ values not found');
  }

  return wozWaarden;
}

async function predictFutureValues(wozWaarden, propertyInfo) {
  const openaiApiKey = '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'; // Replace with your actual API key
  const openaiEndpoint = 'https://api.openai.com/v1/chat/completions';

  const prompt = `Je bent een vastgoed expert die de toekomstige waarde van een woning moet voorspellen.

Gegeven de volgende WOZ-waarden van de afgelopen jaren:
${JSON.stringify(wozWaarden)}

Gegeven de volgende informatie van de woning:
titel: ${propertyInfo.title}
titel: ${propertyInfo.features}
titel: ${propertyInfo.details}


Maak een predictie van de waarde evaluatie voor de komende 5 jaren. Je mag dit baseren op de woz waarden, voorgaande jaren, de huidige markt, economische factoren, etc. Als er sprake is van een recreatie woning, neem toeristische factoren mee. Geef voor elk jaar (de komende 5 jaren) de waarde op.

Geef voor elke jaarlijkse voorspelling:
1. Een korte verklaring waarin je uitlegt waarom de waarde stijgt, daalt of gelijk blijft.
2. Vermeld de bronnen of gegevens waarop je je conclusie baseert. Dit kunnen bijvoorbeeld economische rapporten, markttrends, of specifieke nieuwsartikelen zijn. Noem de bronnen bij naam (websites, rapporten, etc.).

Het huidige jaar is ${new Date().getFullYear()}. Begin met de voorspelling vanaf het volgende jaar.

Retourneer een JSON-object met de volgende structuur:
{
  "value_prediction": [
    {"year": x, "value": 000000, "explanation": "...", "sources": "..."},
    {"year": x, "value": 000000, "explanation": "...", "sources": "..."},
    {"year": x, "value": 000000, "explanation": "...", "sources": "..."},
    {"year": x, "value": 000000, "explanation": "...", "sources": "..."},
    {"year": x, "value": 000000, "explanation": "...", "sources": "..."}
  ]
}`;

  try {
    const result = await fetchOpenAI(openaiEndpoint, openaiApiKey, prompt);
    const prediction = JSON.parse(result.choices[0].message.content);
    return prediction.value_prediction;
  } catch (error) {
    console.error('Error in predictFutureValues:', error);
    return null;
  }
}
