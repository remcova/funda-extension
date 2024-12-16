![alt text](https://i.ibb.co/BGVG7w5/Real-Estate-Property-Analyzer.jpg)
---
- Main branch is stable branch and contains the version that uses the built-in AI.
- gemini_nano_v2 is a hybrid version. It uses the built-in AI and the Gemini Nano API.

## Demo
**Complete** video (3:20 min): 
https://youtu.be/yzQAbjErlj0

**Quick** demo video (0:41 sec): https://www.youtube.com/clip/Ugkx2H7STa0PlWA9PKOg8X1UOX7FXPmdONe7

**Slides**
https://docs.google.com/presentation/d/1JXicF45GddUerCxtEPg5vN-Ino-vRrKSXqj8CEPMWEE/edit?usp=sharing

## Inspiration
Recently, I got more interested in real estate and I found out that there is no tool that helps real estate investors analyze properties quickly on revenue potential (rental income) and value appreciation. So, I've decided to create my own as a project for this hackathon.

## What problem does it solve?
Finding properties that are worth to invest in is hard in today's challenging housing market (especially in the netherlands where I come from). This tool simplifies the process for real estate investors and individual buyers to get insights into a property whether it's worth to invest in or not. The tool simplifies the process of evaluating real estate listings in one click by providing an in-depth, data-driven analysis that includes price evaluations, future predictions, and language support for international investors. Furthermore, it gives a whole summary of the property including property features, description, and details. The tool also knows when it's analyzing a home or a vacation property.

## Functionalities
### Data scraping
The tool extracts the data from __NUXT_DATA__ element of the funda property page and processes this data. Before sending this data to Gemini Nano, the data is cleaned first by removing unnecessary values.
It extracts key property details (such as address, price, description, and more) from a listing page. This data is processed through the Gemini Nano Prompt API, which structures the desired information into a readable JSON format.

### Price evaluation
The tool evaluates whether the property is undervalued, fairly valued, or overvalued based on the current listing price. It compares the price per square meter of the property against the average price in the area to provide context. Not only that, but because it knows where the property is located, it knows if there are amenities close and/or public transport. These and other factors can increase the value of the property. Also the location of the property within the city.

### 5 Year valuation prediction
It predicts the property’s future value over the next 5 years, providing insights into potential long-term returns. These predictions are based on the property history valuation, previous valuation values, current market, news, and economic factors. If it concerns a vacation home, it also includes tourism factors.

### Historical value tracking
The tool includes a history of the property’s valuation, so users can see trends in its price changes. The historic property valuation values are retrieved via the Kadaster API (read "How I built it" to find out what Kadaster is).

### Pros and cons evaluation
It highlights the advantages and disadvantages of the property, offering a balanced view for potential buyers and investors.

### Translation
The tool uses the translation API of Gemini Nano to automatically translate the entire analysis into 19 different languages, making it accessible for foreign investors.

The tool generates a comprehensive summary of the property, helping users quickly assess whether it’s a good investment opportunity.

## How I built it
I built the chrome extension using vanilla javascript and the built-in Gemini Nano API.

I used the following built-in Gemini Nano APIs:
1. Prompt API: For organizing scraped data, creating price evaluation, and forecasting future property values.
2. Translation API: Translating the whole analysis to 19 languages.

The data that is used to analyze the property comes from different sources. Obviously, the tool uses data from the property listing page but it also uses third-party sources. These are GOV owned sources. The tool makes API calls to:
- Kadaster (The Kadaster API in the Netherlands is a service provided by the Dutch Cadastre that offers access to land registry and cadastral information). By using the Kadaster API, the tool is able to retrieve the property value data and history.
- CBS (CBS stands for Centraal Bureau voor de Statistiek, which translates to Central Office for the Statistics Netherlands. It is the Dutch national statistical office responsible for collecting and disseminating statistical information about the Netherlands.). By using the CBS API, the tool is able to get the average purchase price and average living area in a specific neighborhood/city/area.

## Challenges I've ran into
- Token limit: Due to the token limit of the model, I split the extracted property data into smaller chunks before feeding it into Gemini Nano for processing.
- Fine-tuning model parameters for consistent results.

## Accomplishments that I am proud of
- It's my first chrome extension

## What I learned
- Learned more about Gemini
- How to make a chrome extension

## What's next for "Real Estate Property Analyser Tool"
In the future, the tool can be extended with advanced features giving even more insights into the property.
