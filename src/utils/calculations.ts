import { PricePerSqmResult } from '../types';

export function calculatePricePerSqm(price: number, livingArea: number): PricePerSqmResult | null {
    if (!price || !livingArea || isNaN(price) || isNaN(livingArea) || livingArea <= 0) {
      console.error('Invalid input for price per sqm calculation:', { price, livingArea });
      return null;
    }
  
    const pricePerSqm = Math.round(price / livingArea);
  
    const formattedPrice = new Intl.NumberFormat('en-EN', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(pricePerSqm);
  
    return {
      value: pricePerSqm,
      formattedValue: formattedPrice,
      price,
      livingArea
    };
  }
  
  export function comparePropertyPricePerSqm(
    propertyPricePerSqm: number,
    avgPricePerSqmNeighborhood: number
  ): "HIGHER" | "LOWER" | "EQUAL" {
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