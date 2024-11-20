class PropertySummaryGenerator {
    constructor() {
        this.propertyExtractor = new PropertyExtractor();
    }

    async createSummary(propertyInfo) {
        if (!propertyInfo) {
            return '<p>Unable to extract property information</p>';
        }

        const { title, address, price, features, description, details, price_comparison, price_comparison_explanation, pros, cons } = propertyInfo;

        // Initialize variables for WOZ and predictions
        let wozWaarden = null;
        let valuePrediction = null;

        // Fetch WOZ values and predictions first
        wozWaarden = await this.propertyExtractor.getWozValues(address);
        if (wozWaarden) {
            valuePrediction = await this.propertyExtractor.predictFutureValues(wozWaarden);
        }


        // Build summary HTML after data is fetched
        let summary = `<h1>${title}</h1>`;
        summary += `<h3>${price}</h3>`;
        summary += this.createPriceComparisonSection(price_comparison, price_comparison_explanation);

        summary += '<div class="ai-summary-content-block">';

        // Add WOZ and prediction sections only if data is available
        if (wozWaarden && valuePrediction) {
            summary += this.createValuePredictionSection(valuePrediction);
            summary += this.createWozSection(wozWaarden);
        } else {
            summary += "<p>WOZ values and value predictions not available.</p>";
        }
        summary += '</div>';

        summary += this.createProsConsSection(pros, cons);
        summary += this.createListSection('Features', features, '✓');
        summary += this.createContentBlock('Description', description);
        summary += this.createDetailsSection(details);

        return summary;
    }

    createListSection(title, items, icon) {
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

    createContentBlock(title, content) {
        return `<div class="ai-summary-content-block"><p><strong>${title}:</strong></p><p>${content}</p></div>`;
    }

    createDetailsSection(details) {
        if (Object.keys(details).length === 0) {
            return "<p>No details available</p>";
        }

        let section = "<p><strong>Details:</strong></p>";
        for (const [key, value] of Object.entries(details)) {
            section += `<p><strong>${key}:</strong> ${value ?? 'N/A'}</p>`;
        }
        return section;
    }

    createPriceComparisonSection(comparison, explanation) {
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

    createProsConsSection(pros, cons) {
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

    createWozSection(wozWaarden) {
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

    createValuePredictionSection(valuePrediction) {
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
}