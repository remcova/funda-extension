import { LoadingIndicator } from './LoadingIndicator';

interface SummaryPanelOptions {
  width?: string;
  position?: 'left' | 'right';
  theme?: 'light' | 'dark';
  showCloseButton?: boolean;
  animate?: boolean;
}

export class SummaryPanel {
  private panel!: HTMLDivElement;
  private content!: HTMLDivElement;
  private closeButton!: HTMLButtonElement;
  private loadingIndicator!: LoadingIndicator;
  private isOpen: boolean = false;
  private options: Required<SummaryPanelOptions>;

  constructor(options: SummaryPanelOptions = {}) {
    // Default options
    this.options = {
      width: options.width || '300px',
      position: options.position || 'right',
      theme: options.theme || 'light',
      showCloseButton: options.showCloseButton ?? true,
      animate: options.animate ?? true
    };

    this.initializePanel();
    this.initializeLoadingIndicator();
    this.injectStyles();
    this.attachEventListeners();
  }

  private initializePanel(): void {
    // Create main panel
    this.panel = document.createElement('div');
    this.panel.id = 'funda-summary-panel';
    this.panel.className = `theme-${this.options.theme}`;

    // Create content container
    this.content = document.createElement('div');
    this.content.id = 'funda-summary-content';

    // Create close button if enabled
    if (this.options.showCloseButton) {
      this.closeButton = document.createElement('button');
      this.closeButton.id = 'funda-summary-close';
      this.closeButton.innerHTML = '✕';
      this.panel.appendChild(this.closeButton);
    }

    // Assemble panel
    this.panel.appendChild(this.content);
    document.body.appendChild(this.panel);
  }

  private initializeLoadingIndicator(): void {
    this.loadingIndicator = new LoadingIndicator({
      color: this.options.theme === 'dark' ? '#ffffff' : '#4CAF50',
      message: 'Analyzing property...',
      containerClass: 'summary-panel-loader'
    });
    this.loadingIndicator.mount(this.panel);
  }

  private injectStyles(): void {
    const styleId = 'funda-summary-panel-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      #funda-summary-panel {
        position: fixed;
        top: 0;
        ${this.options.position}: ${this.options.animate ? `-${this.options.width}` : '0'};
        width: ${this.options.width};
        height: 100%;
        background-color: ${this.options.theme === 'dark' ? '#2c2c2c' : '#ffffff'};
        color: ${this.options.theme === 'dark' ? '#ffffff' : '#333333'};
        box-shadow: ${this.options.position === 'right' ? '-2px' : '2px'} 0 5px rgba(0, 0, 0, 0.2);
        transition: ${this.options.animate ? `${this.options.position} 0.3s ease-in-out` : 'none'};
        z-index: 9999;
        padding: 20px;
        box-sizing: border-box;
        overflow-y: auto;
      }

      #funda-summary-panel.open {
        ${this.options.position}: 0;
      }

      #funda-summary-close {
        position: absolute;
        top: 10px;
        right: 10px;
        background-color: transparent;
        border: none;
        color: ${this.options.theme === 'dark' ? '#ffffff' : '#333333'};
        font-size: 20px;
        cursor: pointer;
        padding: 5px 10px;
        transition: opacity 0.2s ease;
      }

      #funda-summary-close:hover {
        opacity: 0.7;
      }

      #funda-summary-content {
        margin-top: ${this.options.showCloseButton ? '40px' : '10px'};
        font-family: Arial, sans-serif;
        line-height: 1.5;
      }

      .summary-panel-loader {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }

      .theme-dark #funda-summary-content {
        color: #ffffff;
      }

      .theme-dark .info-icon {
        background-color: #4a4a4a;
      }

      /* Responsive styles */
      @media (max-width: 768px) {
        #funda-summary-panel {
          width: 100%;
          ${this.options.position}: ${this.options.animate ? '-100%' : '0'};
        }
      }

      /* Animation keyframes */
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .fade-in {
        animation: fadeIn 0.3s ease-in-out;
      }
    `;

    document.head.appendChild(style);
  }

  private attachEventListeners(): void {
    // Close button click handler
    if (this.closeButton) {
      this.closeButton.addEventListener('click', () => this.toggle());
    }

    // Handle escape key
    document.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.isOpen) {
        this.toggle();
      }
    });

    // Handle click outside
    document.addEventListener('click', (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (this.isOpen && !this.panel.contains(target) && !target.closest('#funda-summary-panel')) {
        this.toggle();
      }
    });
  }

  /**
   * Toggles the panel visibility
   */
  public toggle(): void {
    this.isOpen = !this.isOpen;
    this.panel.classList.toggle('open');
  }

  /**
   * Sets the panel content
   * @param html HTML content to display
   */
  public setContent(html: string): void {
    this.content.innerHTML = html;
    if (this.options.animate) {
      this.content.classList.add('fade-in');
    }
  }

  /**
   * Sets the loading state
   * @param loading Loading state
   * @param message Optional loading message
   */
  public setLoading(loading: boolean, message?: string): void {
    if (loading) {
      this.loadingIndicator.show(message);
      this.content.style.opacity = '0.5';
    } else {
      this.loadingIndicator.hide();
      this.content.style.opacity = '1';
    }
  }

  /**
   * Sets an error message
   * @param message Error message to display
   */
  public setError(message: string): void {
    this.content.innerHTML = `
      <div class="error-message" style="
        color: ${this.options.theme === 'dark' ? '#ff6b6b' : '#dc3545'};
        padding: 15px;
        border-radius: 4px;
        background-color: ${this.options.theme === 'dark' ? '#3d3d3d' : '#f8d7da'};
        margin-top: 20px;
      ">
        <strong>Error:</strong> ${message}
      </div>
    `;
  }

  /**
   * Updates the panel theme
   * @param theme New theme to apply
   */
  public updateTheme(theme: 'light' | 'dark'): void {
    this.options.theme = theme;
    this.panel.className = `theme-${theme}`;
    this.loadingIndicator.updateColor(theme === 'dark' ? '#ffffff' : '#4CAF50');
  }

  /**
   * Removes the panel from the DOM
   */
  public destroy(): void {
    this.loadingIndicator.destroy();
    this.panel.remove();
  }

  /**
   * Gets the panel's open state
   */
  public isVisible(): boolean {
    return this.isOpen;
  }

  /**
   * Updates the panel width
   * @param width New width value
   */
  public updateWidth(width: string): void {
    this.options.width = width;
    this.panel.style.width = width;
  }
}

// Example usage:
/*
const panel = new SummaryPanel({
  width: '400px',
  position: 'right',
  theme: 'dark',
  showCloseButton: true,
  animate: true
});

panel.setLoading(true, 'Loading property details...');

// Later...
panel.setContent(`
  <h2>Property Summary</h2>
  <p>Price: €500,000</p>
  <p>Location: Amsterdam</p>
`);

panel.setLoading(false);
*/