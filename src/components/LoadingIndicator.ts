interface LoadingIndicatorOptions {
    size?: number;
    color?: string;
    thickness?: number;
    message?: string;
    containerClass?: string;
  }
  
  export class LoadingIndicator {
    private container: HTMLDivElement;
    private spinner: HTMLDivElement;
    private messageElement: HTMLDivElement;
    private options: Required<LoadingIndicatorOptions>;
  
    constructor(options: LoadingIndicatorOptions = {}) {
      // Default options
      this.options = {
        size: options.size || 40,
        color: options.color || '#4CAF50',
        thickness: options.thickness || 4,
        message: options.message || 'Loading...',
        containerClass: options.containerClass || 'loading-indicator-container'
      };
  
      this.container = this.createContainer();
      this.spinner = this.createSpinner();
      this.messageElement = this.createMessage();
      
      this.container.appendChild(this.spinner);
      this.container.appendChild(this.messageElement);
      
      this.injectStyles();
    }
  
    private createContainer(): HTMLDivElement {
      const container = document.createElement('div');
      container.className = this.options.containerClass;
      container.style.display = 'none';
      container.style.position = 'absolute';
      container.style.top = '50%';
      container.style.left = '50%';
      container.style.transform = 'translate(-50%, -50%)';
      container.style.textAlign = 'center';
      return container;
    }
  
    private createSpinner(): HTMLDivElement {
      const spinner = document.createElement('div');
      spinner.className = 'loading-spinner';
      spinner.style.width = `${this.options.size}px`;
      spinner.style.height = `${this.options.size}px`;
      return spinner;
    }
  
    private createMessage(): HTMLDivElement {
      const message = document.createElement('div');
      message.className = 'loading-message';
      message.textContent = this.options.message;
      message.style.marginTop = '10px';
      message.style.color = this.options.color;
      message.style.fontFamily = 'Arial, sans-serif';
      return message;
    }
  
    private injectStyles(): void {
      const styleId = 'loading-indicator-styles';
      if (document.getElementById(styleId)) return;
  
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .loading-spinner {
          border: ${this.options.thickness}px solid #f3f3f3;
          border-top: ${this.options.thickness}px solid ${this.options.color};
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto;
        }
  
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
  
        .loading-indicator-container {
          z-index: 1000;
          background-color: rgba(255, 255, 255, 0.9);
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
  
        .loading-message {
          font-size: 14px;
          font-weight: 500;
        }
      `;
  
      document.head.appendChild(style);
    }
  
    /**
     * Shows the loading indicator
     * @param message Optional message to display (overrides default)
     */
    show(message?: string): void {
      if (message) {
        this.messageElement.textContent = message;
      }
      this.container.style.display = 'block';
    }
  
    /**
     * Hides the loading indicator
     */
    hide(): void {
      this.container.style.display = 'none';
    }
  
    /**
     * Updates the loading message
     * @param message New message to display
     */
    updateMessage(message: string): void {
      this.messageElement.textContent = message;
    }
  
    /**
     * Updates the spinner color
     * @param color New color for the spinner
     */
    updateColor(color: string): void {
      this.options.color = color;
      this.spinner.style.borderTopColor = color;
      this.messageElement.style.color = color;
    }
  
    /**
     * Mounts the loading indicator to a parent element
     * @param parent Parent element to mount the loading indicator to
     */
    mount(parent: HTMLElement): void {
      parent.appendChild(this.container);
    }
  
    /**
     * Removes the loading indicator from the DOM
     */
    destroy(): void {
      this.container.remove();
    }
  
    /**
     * Shows a loading indicator with a promise
     * @param promise Promise to wait for
     * @param message Optional message to display
     * @returns Promise result
     */
    async showWithPromise<T>(promise: Promise<T>, message?: string): Promise<T> {
      try {
        this.show(message);
        return await promise;
      } finally {
        this.hide();
      }
    }
  }
  
  // Example usage:
  /*
  const loadingIndicator = new LoadingIndicator({
    size: 50,
    color: '#2196F3',
    message: 'Processing property data...'
  });
  
  // Mount to a container
  loadingIndicator.mount(document.getElementById('summary-panel'));
  
  // Use with a promise
  await loadingIndicator.showWithPromise(
    fetchPropertyData(),
    'Fetching property details...'
  );
  
  // Or manual control
  loadingIndicator.show();
  // ... do something
  loadingIndicator.hide();
  */