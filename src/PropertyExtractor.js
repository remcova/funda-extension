class PropertyExtractor {
    constructor() {
        this.seenStrings = new Set();
    }

    async extractPropertyInfo() {
        try {
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
                    if (!this.extractPropertyInfo.seenStrings) {
                        this.extractPropertyInfo.seenStrings = new Set();
                    }
                    const lowerValue = value.toLowerCase();
                    if (this.extractPropertyInfo.seenStrings.has(lowerValue)) return false;
                    this.extractPropertyInfo.seenStrings.add(lowerValue);

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

                    const neighborhoodStats = await this.getNeighborhoodStats(propertyJsonData.title);

                    if (neighborhoodStats) {
                        const avgPurchasePriceNeighborhood = new Intl.NumberFormat('en-DE').format(neighborhoodStats.averagePrice);

                        const avgPricePerSqmNeighborhood = neighborhoodStats.pricePerSqm;
                        const neighborhood = neighborhoodStats.neighborhood;
                        const municipality = neighborhoodStats.municipality;
                        const livingArea = propertyJsonData.details["living area"].replace(/\s|m²/g, '');

                        const propertyPrice = propertyJsonData.price.replace(/\s|€|k\.k\.|[.]/g, '');

                        const propertyPricePerSqm = this.calculatePricePerSqm(propertyPrice, livingArea).value;
                        const avgPriceComparisonSqm = this.comparePropertyPricePerSqm(propertyPricePerSqm, avgPricePerSqmNeighborhood);

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

            return propertyInfo;
        } catch (error) {
            console.error('Error extracting property info:', error);
            return null;
        }
    }

    comparePropertyPricePerSqm(propertyPricePerSqm, avgPricePerSqmNeighborhood) {
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

    async getWozValues(address) {
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

    async predictFutureValues(wozWaarden) {

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

        const jsonResult = JSON.stringify(formattedResult);

        // Parse the JSON response
        const prediction = JSON.parse(jsonResult);

        return prediction.value_prediction;

    }

    async getNeighborhoodStats(address) {
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
        const pricePerSqm = await this.getTopPricePerSqm(gemeenteCode, avgPurchasePrice);

        return {
            averagePrice: avgPurchasePrice,
            pricePerSqm: pricePerSqm,
            neighborhood: lookupData.response.docs[0].buurtnaam,
            municipality: lookupData.response.docs[0].gemeentenaam,
            year: previousYear
        };
    }

    async getTopPricePerSqm(gemeenteCode, avgPurchasePrice) {
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

    calculatePricePerSqm(price, livingArea) {
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
}