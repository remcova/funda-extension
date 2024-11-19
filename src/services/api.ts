import { WozWaarde, NeighborhoodStats, ValuePrediction, AILanguageModel, AIModel, AIModelOptions } from '../types';

export async function getWozValues(address: string): Promise<WozWaarde[] | null> {
  try {
    const suggestResponse = await fetch(
      `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=${encodeURIComponent(address)}&rows=1000`
    );
    const suggestData = await suggestResponse.json();
    
    const searchNumbers = address.match(/\d+/g) || [];
    let addressId: string | null = null;

    for (const doc of suggestData.response.docs) {
      const weergavenaam = doc.weergavenaam;
      const docNumbers = weergavenaam.match(/\d+/g) || [];
      
      if (searchNumbers.every(num => docNumbers.includes(num))) {
        addressId = doc.id;
        break;
      }
    }

    if (!addressId && suggestData.response.docs.length > 0) {
      addressId = suggestData.response.docs[0].id;
    }

    if (!addressId) {
      throw new Error('Address ID not found');
    }

    const lookupResponse = await fetch(
      `https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?fl=*&id=${addressId}`
    );
    const lookupData = await lookupResponse.json();
    const nummeraanduidingId = lookupData.response.docs[0]?.nummeraanduiding_id;

    if (!nummeraanduidingId) {
      throw new Error("'Nummeraanduiding ID' not found");
    }

    const wozResponse = await fetch(
      `https://api.kadaster.nl/lvwoz/wozwaardeloket-api/v1/wozwaarde/nummeraanduiding/${nummeraanduidingId}`
    );
    const wozData = await wozResponse.json();
    return wozData.wozWaarden || null;

  } catch (error) {
    console.error('Error fetching WOZ values:', error);
    return null;
  }
}

export async function getNeighborhoodStats(address: string): Promise<NeighborhoodStats | null> {
  const previousYear = `${(new Date().getFullYear() - 1).toString()}JJ00`;

  try {
    const suggestResponse = await fetch(
      `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=${encodeURIComponent(address)}&rows=1`
    );
    const suggestData = await suggestResponse.json();

    if (!suggestData.response?.docs?.[0]?.id) {
      console.error('Could not find BAG id for address:', address);
      return null;
    }

    const lookupResponse = await fetch(
      `https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=${suggestData.response.docs[0].id}`
    );
    const lookupData = await lookupResponse.json();

    if (!lookupData.response?.docs?.[0]?.buurtcode) {
      console.error('Could not find neighborhood code');
      return null;
    }

    const gemeenteCode = `GM${lookupData.response.docs[0].gemeentecode}`;
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
      pricePerSqm: pricePerSqm ?? 0,
      neighborhood: lookupData.response.docs[0].buurtnaam,
      municipality: lookupData.response.docs[0].gemeentenaam,
      year: previousYear
    };
  } catch (error) {
    console.error('Error fetching neighborhood stats:', error);
    return null;
  }
}

export async function predictFutureValues(wozWaarden: WozWaarde[]): Promise<ValuePrediction[]> {
  const predictions: ValuePrediction[] = [];
  const currentYear = new Date().getFullYear();
  
  // Sort WOZ values by year
  const sortedWoz = [...wozWaarden].sort((a, b) => a.jaar - b.jaar);
  
  // Calculate average yearly growth
  let totalGrowth = 0;
  for (let i = 1; i < sortedWoz.length; i++) {
    const yearlyGrowth = (sortedWoz[i].vastgesteldeWaarde - sortedWoz[i-1].vastgesteldeWaarde) / sortedWoz[i-1].vastgesteldeWaarde;
    totalGrowth += yearlyGrowth;
  }
  const avgGrowth = totalGrowth / (sortedWoz.length - 1);

  // Generate predictions for next 5 years
  let lastValue = sortedWoz[sortedWoz.length - 1].vastgesteldeWaarde;
  for (let i = 1; i <= 5; i++) {
    const predictedValue = lastValue * (1 + avgGrowth);
    predictions.push({
      year: (currentYear + i).toString(),
      value: Math.round(predictedValue),
      explanation: `Based on historical WOZ value trends`
    });
    lastValue = predictedValue;
  }

  return predictions;
}

async function getTopPricePerSqm(gemeenteCode: string, avgPurchasePrice: number): Promise<number> {
  try {
    // Implement your logic to get price per square meter
    // This is a placeholder implementation
    return avgPurchasePrice / 100; // Example calculation
  } catch (error) {
    console.error('Error calculating top price per sqm:', error);
    return 0;
  }
}