/**
 * Markdown Converter Module
 * Converts webpage HTML content to clean Markdown format
 */

class MarkdownConverter {
  constructor(options = {}) {
    this.maxPageSize = (options.maxPageSize || 500) * 1024; // Convert KB to bytes
    this.timeout = options.timeout || 10000; // 10 seconds default
  }

  /**
   * Fetch and convert a URL to Markdown
   * @param {string} url - The URL to convert
   * @returns {Promise<string|null>} - Markdown content or null if failed
   */
  async convertToMarkdown(url) {
    try {
      // Set timeout for fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit'
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();

      // Check size limit
      if (html.length > this.maxPageSize) {
        console.warn(`Page too large: ${url} (${html.length} bytes)`);
        // Truncate instead of failing
        return this.extractTextContent(html.substring(0, this.maxPageSize));
      }

      return this.extractTextContent(html);

    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn(`Timeout converting ${url}`);
      } else {
        console.warn(`Failed to convert ${url}:`, error.message);
      }
      return null;
    }
  }

  /**
   * Extract text content from HTML and convert to Markdown
   * @param {string} html - Raw HTML content
   * @returns {string} - Markdown formatted text
   */
  extractTextContent(html) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Remove unwanted elements
      this.removeUnwantedElements(doc);

      // Extract content from body
      const body = doc.body;
      if (!body) {
        return '';
      }

      // Convert to Markdown
      const markdown = this.nodeToMarkdown(body);

      // Clean and format
      return this.cleanMarkdown(markdown);

    } catch (error) {
      console.error('Error extracting text content:', error);
      return '';
    }
  }

  /**
   * Remove unwanted elements from document
   * @param {Document} doc - Parsed HTML document
   */
  removeUnwantedElements(doc) {
    // Remove scripts, styles, and other non-content elements
    const unwantedSelectors = [
      'script',
      'style',
      'noscript',
      'iframe',
      'object',
      'embed',
      'img',
      'video',
      'audio',
      'canvas',
      'svg',
      'nav',
      'header',
      'footer',
      'aside',
      '.advertisement',
      '.ad',
      '.ads',
      '.social-share',
      '.comments',
      '#comments'
    ];

    unwantedSelectors.forEach(selector => {
      const elements = doc.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    });
  }

  /**
   * Convert DOM node to Markdown recursively
   * @param {Node} node - DOM node to convert
   * @param {number} depth - Current heading depth
   * @returns {string} - Markdown text
   */
  nodeToMarkdown(node, depth = 0) {
    if (!node) return '';

    // Text node
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.trim();
    }

    // Element node
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();
      let markdown = '';

      switch (tagName) {
        case 'h1':
          markdown = '\n# ' + this.getTextContent(node) + '\n\n';
          break;
        case 'h2':
          markdown = '\n## ' + this.getTextContent(node) + '\n\n';
          break;
        case 'h3':
          markdown = '\n### ' + this.getTextContent(node) + '\n\n';
          break;
        case 'h4':
          markdown = '\n#### ' + this.getTextContent(node) + '\n\n';
          break;
        case 'h5':
          markdown = '\n##### ' + this.getTextContent(node) + '\n\n';
          break;
        case 'h6':
          markdown = '\n###### ' + this.getTextContent(node) + '\n\n';
          break;

        case 'p':
          markdown = this.getTextContent(node) + '\n\n';
          break;

        case 'br':
          markdown = '\n';
          break;

        case 'ul':
        case 'ol':
          markdown = '\n' + this.convertList(node, tagName === 'ol') + '\n';
          break;

        case 'li':
          // Handled by convertList
          break;

        case 'a':
          const href = node.getAttribute('href');
          const text = this.getTextContent(node);
          if (href && text) {
            markdown = `[${text}](${href})`;
          } else {
            markdown = text;
          }
          break;

        case 'strong':
        case 'b':
          markdown = '**' + this.getTextContent(node) + '**';
          break;

        case 'em':
        case 'i':
          markdown = '*' + this.getTextContent(node) + '*';
          break;

        case 'code':
          markdown = '`' + this.getTextContent(node) + '`';
          break;

        case 'pre':
          markdown = '\n```\n' + this.getTextContent(node) + '\n```\n\n';
          break;

        case 'blockquote':
          const lines = this.getTextContent(node).split('\n');
          markdown = '\n' + lines.map(line => '> ' + line).join('\n') + '\n\n';
          break;

        case 'hr':
          markdown = '\n---\n\n';
          break;

        default:
          // For other elements, process children
          markdown = this.processChildren(node);
          break;
      }

      return markdown;
    }

    return '';
  }

  /**
   * Convert list to Markdown
   * @param {Element} listNode - UL or OL element
   * @param {boolean} ordered - Whether it's an ordered list
   * @returns {string} - Markdown list
   */
  convertList(listNode, ordered = false) {
    const items = Array.from(listNode.children).filter(
      child => child.tagName.toLowerCase() === 'li'
    );

    return items.map((item, index) => {
      const prefix = ordered ? `${index + 1}. ` : '- ';
      const content = this.getTextContent(item);
      return prefix + content;
    }).join('\n');
  }

  /**
   * Get text content from node and its children
   * @param {Node} node - DOM node
   * @returns {string} - Text content
   */
  getTextContent(node) {
    if (!node) return '';

    // For text nodes
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.trim();
    }

    // For element nodes, process children
    return this.processChildren(node);
  }

  /**
   * Process all children of a node
   * @param {Node} node - Parent node
   * @returns {string} - Combined text from children
   */
  processChildren(node) {
    if (!node.childNodes || node.childNodes.length === 0) {
      return '';
    }

    let result = '';
    node.childNodes.forEach(child => {
      const childMarkdown = this.nodeToMarkdown(child);
      if (childMarkdown) {
        result += childMarkdown + ' ';
      }
    });

    return result.trim();
  }

  /**
   * Clean and format Markdown text
   * @param {string} markdown - Raw markdown
   * @returns {string} - Cleaned markdown
   */
  cleanMarkdown(markdown) {
    if (!markdown) return '';

    // Remove excessive whitespace
    let cleaned = markdown
      .replace(/[ \t]+/g, ' ')           // Multiple spaces to single space
      .replace(/\n{3,}/g, '\n\n')        // Multiple newlines to double newline
      .replace(/^\s+|\s+$/g, '')         // Trim start and end
      .replace(/\n /g, '\n')             // Remove spaces after newlines
      .replace(/ \n/g, '\n');            // Remove spaces before newlines

    // Ensure proper spacing around headings
    cleaned = cleaned.replace(/([^\n])(#+ )/g, '$1\n\n$2');
    cleaned = cleaned.replace(/(#+ [^\n]+)([^\n])/g, '$1\n\n$2');

    return cleaned;
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MarkdownConverter;
}
