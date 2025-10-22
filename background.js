// Global abort controller for search requests
let currentSearchAbortController = null;

// ===== Markdown Converter =====
class MarkdownConverter {
  constructor(options = {}) {
    this.maxPageSize = (options.maxPageSize || 500) * 1024;
    this.timeout = options.timeout || 10000;
  }

  async convertToMarkdown(url) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit'
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();

      if (html.length > this.maxPageSize) {
        return this.extractTextContent(html.substring(0, this.maxPageSize));
      }

      return this.extractTextContent(html);

    } catch (error) {
      console.warn(`Failed to convert ${url}:`, error.message);
      return null;
    }
  }

  extractTextContent(html) {
    try {
      // Service workers don't have DOMParser, so use regex-based extraction
      // Remove script and style tags
      let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
      
      // Remove HTML tags but keep the content
      text = text.replace(/<[^>]+>/g, ' ');
      
      // Decode HTML entities
      text = text.replace(/&nbsp;/g, ' ');
      text = text.replace(/&amp;/g, '&');
      text = text.replace(/&lt;/g, '<');
      text = text.replace(/&gt;/g, '>');
      text = text.replace(/&quot;/g, '"');
      text = text.replace(/&#39;/g, "'");
      
      // Clean up whitespace
      text = text.replace(/\s+/g, ' ').trim();
      
      return text;
    } catch (error) {
      console.error('Error extracting text:', error);
      return '';
    }
  }

  // Note: DOM-based functions removed because Service Workers don't have access to DOMParser
  // Using regex-based text extraction instead (see extractTextContent above)

  cleanMarkdown(markdown) {
    if (!markdown) return '';
    return markdown
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+|\s+$/g, '')
      .replace(/\n /g, '\n')
      .replace(/ \n/g, '\n');
  }
}

// ===== Markdown Cache =====
class MarkdownCache {
  constructor() {
    this.CACHE_KEY = 'markdownCache';
    this.SETTINGS_KEY = 'deepSearchSettings';
  }

  async get(url) {
    try {
      const cache = await this.getCache();
      const entry = cache[url];
      if (!entry || this.isExpired(entry)) {
        if (entry) await this.remove(url);
        return null;
      }
      return entry.content;
    } catch (error) {
      return null;
    }
  }

  async set(url, content) {
    try {
      const cache = await this.getCache();
      cache[url] = {
        content: content,
        timestamp: Date.now(),
        size: content.length,
        url: url
      };
      await this.saveCache(cache);
    } catch (error) {
      console.error('Error setting cache:', error);
    }
  }

  async remove(url) {
    try {
      const cache = await this.getCache();
      delete cache[url];
      await this.saveCache(cache);
    } catch (error) {
      console.error('Error removing cache:', error);
    }
  }

  isExpired(entry) {
    if (!entry || !entry.timestamp) return true;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours default
    return (Date.now() - entry.timestamp) > maxAge;
  }

  async getCache() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.CACHE_KEY], (data) => {
        resolve(data[this.CACHE_KEY] || {});
      });
    });
  }

  async saveCache(cache) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [this.CACHE_KEY]: cache }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }
}

// Initialize converter and cache
const markdownConverter = new MarkdownConverter();
const markdownCache = new MarkdownCache();

// Helper function to get API URL for different providers
function getAPIUrl(provider, model, apiKey) {
  const urls = {
    xai: "https://api.x.ai/v1/chat/completions",
    together: "https://api.together.xyz/v1/chat/completions",
    fireworks: "https://api.fireworks.ai/inference/v1/chat/completions",
    deepseek: "https://api.deepseek.com/v1/chat/completions",
    perplexity: "https://api.perplexity.ai/chat/completions",
    cohere: "https://api.cohere.ai/v1/generate",
    mistral: "https://api.mistral.ai/v1/chat/completions",
    ai21: "https://api.ai21.com/studio/v1/chat/completions",
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
    novita: "https://api.novita.ai/v3/openai/chat/completions"
  };
  return urls[provider] || "";
}

// Get all bookmarks recursively
async function getAllBookmarks() {
  return new Promise((resolve) => {
    chrome.bookmarks.getTree((tree) => {
      const bookmarks = [];

      function traverse(nodes, path = []) {
        for (const node of nodes) {
          if (node.url) {
            bookmarks.push({
              title: node.title,
              url: node.url,
              path: path.join(" > "),
            });
          }
          if (node.children) {
            traverse(node.children, [...path, node.title]);
          }
        }
      }

      traverse(tree);
      resolve(bookmarks);
    });
  });
}

// Assign global numbers to bookmarks (1-indexed)
function assignGlobalNumbers(bookmarks) {
  return bookmarks.map((bookmark, index) => ({
    ...bookmark,
    globalNumber: index + 1
  }));
}

// Helper function to format bookmark list based on field settings
async function formatBookmarkList(bookmarks) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['bookmarkFields'], (data) => {
      const fields = data.bookmarkFields || {
        includeTitle: true,
        includeUrl: true,
        includeFolder: true
      };
      
      const formattedList = bookmarks.map((b, i) => {
        return formatBookmarkWithContent(b, i, fields);
      }).join("\n");
      
      resolve(formattedList);
    });
  });
}

// Add Markdown content to bookmarks if Deep Search is enabled
async function enrichBookmarksWithMarkdown(bookmarks) {
  // Get Deep Search settings
  const settings = await new Promise((resolve) => {
    chrome.storage.local.get(['deepSearchSettings'], (data) => {
      resolve(data.deepSearchSettings || { enabled: false });
    });
  });

  if (!settings.enabled) {
    return bookmarks; // Deep Search disabled, return as-is
  }

  // Update converter settings
  if (settings.maxPageSize) {
    markdownConverter.maxPageSize = settings.maxPageSize * 1024;
  }

  // Process bookmarks
  const enrichedBookmarks = [];
  
  for (const bookmark of bookmarks) {
    // Check cache first
    let markdown = await markdownCache.get(bookmark.url);
    
    if (!markdown) {
      // Convert to Markdown
      markdown = await markdownConverter.convertToMarkdown(bookmark.url);
      
      // Cache if successful
      if (markdown) {
        await markdownCache.set(bookmark.url, markdown);
      }
    }
    
    // Add to bookmark
    enrichedBookmarks.push({
      ...bookmark,
      content: markdown || undefined
    });
  }
  
  return enrichedBookmarks;
}

// Format bookmark with optional Markdown content
function formatBookmarkWithContent(bookmark, index, fields) {
  let parts = [`${index + 1}.`];
  
  if (fields.includeTitle) {
    parts.push(bookmark.title);
  }
  
  if (fields.includeUrl) {
    parts.push(fields.includeTitle ? `- ${bookmark.url}` : bookmark.url);
  }
  
  if (fields.includeFolder && bookmark.path) {
    parts.push(`(Folder: ${bookmark.path})`);
  }
  
  // Add Markdown content if available
  if (bookmark.content) {
    parts.push(`\nContent: ${bookmark.content.substring(0, 1000)}...`); // Limit to 1000 chars per bookmark
  }
  
  return parts.join(' ');
}

// AI search using Ollama
async function aiSearchWithOllama(query, ollamaUrl, ollamaModel, customPrompt, usePrompt) {
  const allBookmarks = await getAllBookmarks();
  
  // Enrich with Markdown if Deep Search enabled
  const enrichedBookmarks = await enrichBookmarksWithMarkdown(allBookmarks);
  
  // Assign global numbers to bookmarks
  const numberedBookmarks = assignGlobalNumbers(enrichedBookmarks);
  
  // Get batch settings for Ollama
  const batchSize = await getBatchSettings('ollama');
  
  // Check if batching is enabled
  if (batchSize === 'none' || !batchSize) {
    // No batching - use original logic
    const bookmarkList = await formatBookmarkList(allBookmarks);

    let prompt;
    
    if (usePrompt === false) {
      prompt = `Here are all the user's bookmarks:

${bookmarkList}

${query}`;
    } else {
      const defaultPrompt = `You are a bookmark search assistant. Here are all the user's bookmarks:

${bookmarkList}

User query: "${query}"

Based on the query, return ONLY the numbers of the most relevant bookmarks (comma-separated). For example: 1,5,12
If no bookmarks match, return: NONE

Your response:`;

      prompt = defaultPrompt;
      if (customPrompt) {
        prompt = customPrompt.replace('{SEARCH}', query);
        prompt = prompt.replace('[BOOKMARKS_WILL_BE_INSERTED_HERE]', bookmarkList);
      }
    }

    currentSearchAbortController = new AbortController();
    
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        prompt: prompt,
        stream: false,
      }),
      signal: currentSearchAbortController.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.response.trim();

    if (aiResponse === "NONE") {
      return { results: [], rawData: { sent: prompt, received: aiResponse } };
    }

    const indices = aiResponse.split(",").map((n) => parseInt(n.trim()) - 1);
    const results = indices
      .filter((i) => i >= 0 && i < allBookmarks.length)
      .map((i) => allBookmarks[i]);

    return { results, rawData: { sent: prompt, received: aiResponse } };
  }
  
  // Batch processing enabled
  const batches = divideToBatches(numberedBookmarks, batchSize);
  
  currentSearchAbortController = new AbortController();
  
  const batchResult = await processBatchSequentially(
    batches, 
    query, 
    'ollama',
    { ollamaUrl, ollamaModel },
    customPrompt,
    usePrompt
  );
  
  const results = aggregateResults(batchResult.numbers, numberedBookmarks);
  
  return { 
    results, 
    rawData: { 
      batches: batches.length, 
      totalBookmarks: allBookmarks.length,
      batchSize: batchSize,
      batchDetails: batchResult.batchDetails
    } 
  };
}

// AI search using API providers
async function aiSearchWithAPI(query, provider, apiKey, model, customPrompt, usePrompt) {
  const allBookmarks = await getAllBookmarks();
  
  // Assign global numbers to bookmarks
  const numberedBookmarks = assignGlobalNumbers(allBookmarks);
  
  // Get batch settings for API
  const batchSize = await getBatchSettings('api');
  
  // Check if batching is enabled
  if (batchSize !== 'none' && batchSize) {
    // Batch processing enabled
    const batches = divideToBatches(numberedBookmarks, batchSize);
    
    currentSearchAbortController = new AbortController();
    
    const batchResult = await processBatchSequentially(
      batches, 
      query, 
      'api',
      { apiProvider: provider, apiKey, apiModel: model },
      customPrompt,
      usePrompt
    );
    
    const results = aggregateResults(batchResult.numbers, numberedBookmarks);
    
    return { 
      results, 
      rawData: { 
        batches: batches.length, 
        totalBookmarks: allBookmarks.length,
        batchSize: batchSize,
        batchDetails: batchResult.batchDetails
      } 
    };
  }

  // No batching - use original logic
  const bookmarkList = await formatBookmarkList(allBookmarks);

  let userPrompt;
  
  if (usePrompt === false) {
    // Send bookmarks + query without instructions
    userPrompt = `Here are all the user's bookmarks:

${bookmarkList}

${query}`;
  } else {
    // Send full prompt with bookmarks and instructions
    const defaultUserPrompt = `You are a bookmark search assistant. Here are all the user's bookmarks:

${bookmarkList}

User query: "${query}"

Based on the query, return ONLY the numbers of the most relevant bookmarks (comma-separated). For example: 1,5,12
If no bookmarks match, return: NONE`;

    userPrompt = defaultUserPrompt;
    if (customPrompt) {
      // Replace {SEARCH} with actual query and insert bookmarks
      userPrompt = customPrompt.replace('{SEARCH}', query);
      userPrompt = userPrompt.replace('[BOOKMARKS_WILL_BE_INSERTED_HERE]', bookmarkList);
    }
  }

  let apiUrl, headers, body;

  switch (provider) {
    case "openai":
      apiUrl = "https://api.openai.com/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      body = {
        model: model || "gpt-3.5-turbo",
        messages: [{ role: "user", content: userPrompt }],
        temperature: 0.3,
      };
      break;

    case "anthropic":
      apiUrl = "https://api.anthropic.com/v1/messages";
      headers = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      };
      body = {
        model: model || "claude-3-haiku-20240307",
        max_tokens: 1024,
        messages: [{ role: "user", content: userPrompt }],
      };
      break;

    case "google":
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${
        model || "gemini-pro"
      }:generateContent?key=${apiKey}`;
      headers = {
        "Content-Type": "application/json",
      };
      body = {
        contents: [{ parts: [{ text: userPrompt }] }],
      };
      break;

    case "cohere":
      apiUrl = "https://api.cohere.ai/v1/generate";
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      body = {
        model: model || "command",
        prompt: userPrompt,
        max_tokens: 300,
      };
      break;

    case "mistral":
      apiUrl = "https://api.mistral.ai/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      body = {
        model: model || "mistral-tiny",
        messages: [{ role: "user", content: userPrompt }],
      };
      break;

    case "groq":
      apiUrl = "https://api.groq.com/openai/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      body = {
        model: model || "mixtral-8x7b-32768",
        messages: [{ role: "user", content: userPrompt }],
      };
      break;

    case "perplexity":
      apiUrl = "https://api.perplexity.ai/chat/completions";
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      body = {
        model: model || "llama-3.1-sonar-small-128k-online",
        messages: [{ role: "user", content: userPrompt }],
      };
      break;

    case "xai":
      apiUrl = "https://api.x.ai/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      body = {
        model: model || "grok-beta",
        messages: [{ role: "user", content: userPrompt }],
      };
      break;

    case "together":
      apiUrl = "https://api.together.xyz/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      body = {
        model: model || "mistralai/Mixtral-8x7B-Instruct-v0.1",
        messages: [{ role: "user", content: userPrompt }],
      };
      break;

    case "deepseek":
      apiUrl = "https://api.deepseek.com/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      body = {
        model: model || "deepseek-chat",
        messages: [{ role: "user", content: userPrompt }],
      };
      break;

    case "fireworks":
      apiUrl = "https://api.fireworks.ai/inference/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      body = {
        model: model || "accounts/fireworks/models/llama-v3p1-8b-instruct",
        messages: [{ role: "user", content: userPrompt }],
      };
      break;

    case "ai21":
      apiUrl = "https://api.ai21.com/studio/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      body = {
        model: model || "jamba-instruct",
        messages: [{ role: "user", content: userPrompt }],
      };
      break;

    case "huggingface":
      apiUrl = `https://api-inference.huggingface.co/models/${
        model || "mistralai/Mistral-7B-Instruct-v0.2"
      }`;
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      body = {
        inputs: userPrompt,
        parameters: { max_new_tokens: 250, temperature: 0.3 },
      };
      break;



    case "anyscale":
      apiUrl = "https://api.endpoints.anyscale.com/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      body = {
        model: model || "meta-llama/Llama-2-7b-chat-hf",
        messages: [{ role: "user", content: userPrompt }],
      };
      break;

    case "azure":
      // Azure requires endpoint in model field: https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT
      apiUrl = `${model}/chat/completions?api-version=2024-02-15-preview`;
      headers = {
        "Content-Type": "application/json",
        "api-key": apiKey,
      };
      body = {
        messages: [{ role: "user", content: userPrompt }],
        temperature: 0.3,
      };
      break;



    case "cloudflare":
      // Cloudflare Workers AI requires account ID in model field
      apiUrl = `https://api.cloudflare.com/client/v4/accounts/${model}/ai/run/@cf/meta/llama-2-7b-chat-int8`;
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      body = {
        messages: [{ role: "user", content: userPrompt }],
      };
      break;

    case "openrouter":
      apiUrl = "https://openrouter.ai/api/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "chrome-extension://bookmark-search",
      };
      body = {
        model: model || "meta-llama/llama-3.1-8b-instruct:free",
        messages: [{ role: "user", content: userPrompt }],
      };
      break;

    case "novita":
      apiUrl = "https://api.novita.ai/v3/openai/chat/completions";
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      body = {
        model: model || "meta-llama/llama-3.1-8b-instruct",
        messages: [{ role: "user", content: userPrompt }],
      };
      break;

    case "lepton":
      apiUrl = `https://${
        model || "llama2-7b"
      }.lepton.run/api/v1/chat/completions`;
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      body = {
        messages: [{ role: "user", content: userPrompt }],
      };
      break;

    default:
      throw new Error("Unsupported API provider");
  }

  // Create abort controller for this request
  currentSearchAbortController = new AbortController();
  
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(body),
    signal: currentSearchAbortController.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  let aiResponse;

  // Parse response based on provider
  switch (provider) {
    case "openai":
    case "mistral":
    case "groq":
    case "perplexity":
    case "xai":
    case "together":
    case "deepseek":
    case "fireworks":
    case "ai21":
    case "anyscale":
    case "azure":
    case "openrouter":
    case "novita":
    case "lepton":
      aiResponse = data.choices[0].message.content.trim();
      break;
    case "anthropic":
      aiResponse = data.content[0].text.trim();
      break;
    case "google":
      aiResponse = data.candidates[0].content.parts[0].text.trim();
      break;
    case "cohere":
      aiResponse = data.generations[0].text.trim();
      break;
    case "huggingface":
      aiResponse = Array.isArray(data)
        ? data[0].generated_text.trim()
        : data.generated_text.trim();
      break;
    case "cloudflare":
      aiResponse = data.result.response.trim();
      break;
    default:
      throw new Error("Unable to parse response");
  }

  if (aiResponse === "NONE") {
    return { results: [], rawData: { sent: userPrompt, received: aiResponse } };
  }

  const indices = aiResponse.split(",").map((n) => parseInt(n.trim()) - 1);
  const results = indices
    .filter((i) => i >= 0 && i < allBookmarks.length)
    .map((i) => allBookmarks[i]);

  return { results, rawData: { sent: userPrompt, received: aiResponse } };
}

// Fuzzy search algorithm (Levenshtein distance based)
function fuzzyScore(query, text) {
  if (!text) return 0;
  
  query = query.toLowerCase();
  text = text.toLowerCase();
  
  // Exact match gets highest score
  if (text.includes(query)) {
    return 100;
  }
  
  // Calculate fuzzy match score
  let score = 0;
  let queryIndex = 0;
  
  for (let i = 0; i < text.length && queryIndex < query.length; i++) {
    if (text[i] === query[queryIndex]) {
      score += 10;
      queryIndex++;
    }
  }
  
  // Bonus for matching all characters
  if (queryIndex === query.length) {
    score += 20;
  }
  
  // Penalty for length difference
  const lengthDiff = Math.abs(text.length - query.length);
  score -= lengthDiff * 0.5;
  
  return Math.max(0, score);
}

// Fuzzy search bookmarks
async function fuzzySearchBookmarks(query) {
  const allBookmarks = await getAllBookmarks();
  
  // Score each bookmark
  const scoredBookmarks = allBookmarks.map(bookmark => {
    const titleScore = fuzzyScore(query, bookmark.title);
    const urlScore = fuzzyScore(query, bookmark.url) * 0.7; // URL less important
    const pathScore = fuzzyScore(query, bookmark.path) * 0.3; // Path even less
    
    return {
      ...bookmark,
      score: titleScore + urlScore + pathScore
    };
  });
  
  // Filter and sort by score
  return scoredBookmarks
    .filter(b => b.score > 10) // Minimum threshold
    .sort((a, b) => b.score - a.score)
    .slice(0, 50) // Top 50 results
    .map(({ title, url, path }) => ({ title, url, path }));
}

// Exact match search (original Chrome API)
async function exactMatchSearch(query) {
  return new Promise((resolve) => {
    chrome.bookmarks.search(query, (results) => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }

      const formatted = results
        .map((b) => ({
          title: b.title,
          url: b.url,
        }))
        .filter((b) => b.url);

      resolve(formatted);
    });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "abortSearch") {
    // Abort the current search if one is in progress
    if (currentSearchAbortController) {
      currentSearchAbortController.abort();
      currentSearchAbortController = null;
    }
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === "verifyAPI") {
    const { provider, apiKey, model } = request;
    
    (async () => {
      try {
        if (!provider || !apiKey || !model) {
          sendResponse({ success: false, error: 'Missing provider, API key, or model' });
          return;
        }
        
        const simplePrompt = "Answer only yes or no: Is this working?";
        let apiUrl, headers, body;
        
        // Configure request based on provider
        switch (provider) {
          case "openai":
            apiUrl = "https://api.openai.com/v1/chat/completions";
            headers = {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            };
            body = {
              model: model,
              messages: [{ role: "user", content: simplePrompt }],
              max_tokens: 10
            };
            break;
            
          case "anthropic":
            apiUrl = "https://api.anthropic.com/v1/messages";
            headers = {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            };
            body = {
              model: model,
              max_tokens: 10,
              messages: [{ role: "user", content: simplePrompt }],
            };
            break;
            
          case "google":
            apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            headers = { "Content-Type": "application/json" };
            body = {
              contents: [{ parts: [{ text: simplePrompt }] }],
            };
            break;
            
          case "groq":
            apiUrl = "https://api.groq.com/openai/v1/chat/completions";
            headers = {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            };
            body = {
              model: model,
              messages: [{ role: "user", content: simplePrompt }],
              max_tokens: 10
            };
            break;
            
          default:
            // For other providers, use OpenAI-compatible format
            apiUrl = getAPIUrl(provider, model, apiKey);
            headers = {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            };
            body = {
              model: model,
              messages: [{ role: "user", content: simplePrompt }],
              max_tokens: 10
            };
        }
        
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: headers,
          body: JSON.stringify(body),
        });
        
        if (response.ok) {
          sendResponse({ success: true });
        } else {
          const errorText = await response.text();
          let errorMsg = `HTTP ${response.status}`;
          
          // Try to parse error message
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.error && errorData.error.message) {
              errorMsg = errorData.error.message.substring(0, 100);
            }
          } catch (e) {
            // Keep default error message
          }
          
          sendResponse({ success: false, error: errorMsg });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message || 'Network error' });
      }
    })();
    
    return true;
  }
  
  if (request.action === "testOllamaCors") {
    const { ollamaUrl, ollamaModel } = request;
    
    (async () => {
      try {
        // Quick CORS test with longer timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(`${ollamaUrl}/api/generate`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Origin': 'chrome-extension://' + chrome.runtime.id
          },
          mode: 'cors',
          body: JSON.stringify({
            model: ollamaModel,
            prompt: 'test',
            stream: false,
            options: {
              num_predict: 1
            }
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // If we got any response (even error), CORS is working
        if (response.ok || response.status === 200 || response.status === 400) {
          sendResponse({ success: true });
        } else if (response.status === 403) {
          sendResponse({ success: false });
        } else {
          // Any other response means CORS is configured
          sendResponse({ success: true });
        }
      } catch (error) {
        // Network error or timeout = CORS not configured
        sendResponse({ success: false });
      }
    })();
    
    return true;
  }
  
  if (request.action === "testOllama") {
    const { ollamaUrl, ollamaModel } = request;
    
    (async () => {
      try {
        const response = await fetch(`${ollamaUrl}/api/generate`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Origin': 'chrome-extension://' + chrome.runtime.id
          },
          mode: 'cors',
          body: JSON.stringify({
            model: ollamaModel,
            prompt: 'Say only: OK',
            stream: false,
            options: {
              num_predict: 10
            }
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          // Check if we got a valid response object (even if response is empty)
          if (data && (data.response !== undefined || data.done !== undefined)) {
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'Invalid response format from model' });
          }
        } else if (response.status === 403) {
          sendResponse({ 
            success: false, 
            error: 'CORS blocked. Please set OLLAMA_ORIGINS environment variable.\n\nWindows: setx OLLAMA_ORIGINS "*"\nThen restart Ollama service.' 
          });
        } else {
          const errorText = await response.text();
          sendResponse({ success: false, error: `HTTP ${response.status}: ${errorText}` });
        }
      } catch (error) {
        if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
          sendResponse({ 
            success: false, 
            error: 'CORS blocked. Set OLLAMA_ORIGINS=* environment variable and restart Ollama.' 
          });
        } else {
          sendResponse({ success: false, error: error.message });
        }
      }
    })();
    
    return true;
  }
  
  if (request.action === "searchBookmarks") {
    const query = request.query;
    const searchType = request.searchType || "exact";

    (async () => {
      try {
        let results;
        
        if (searchType === "exact") {
          results = await exactMatchSearch(query);
        } else {
          results = await fuzzySearchBookmarks(query);
        }
        
        sendResponse({ results });
      } catch (error) {
        sendResponse({ results: [], error: error.message });
      }
    })();

    return true;
  }

  if (request.action === "aiSearchBookmarks") {
    const { query, settings, customPrompt } = request;

    (async () => {
      try {
        // Read usePrompt from storage
        chrome.storage.local.get(['usePrompt'], async (data) => {
          try {
            const usePrompt = data.usePrompt !== undefined ? data.usePrompt : true;
            
            let results;

            // Try API provider first if configured
            if (settings.apiProvider && settings.apiKey) {
              results = await aiSearchWithAPI(
                query,
                settings.apiProvider,
                settings.apiKey,
                settings.apiModel,
                customPrompt,
                usePrompt
              );
            }
            // Fall back to Ollama
            else if (settings.ollamaUrl || settings.ollamaModel) {
              const ollamaUrl = settings.ollamaUrl || "http://localhost:11434";
              const ollamaModel = settings.ollamaModel || "llama2";
              results = await aiSearchWithOllama(query, ollamaUrl, ollamaModel, customPrompt, usePrompt);
            } else {
              throw new Error("No AI provider configured");
            }

            sendResponse({ 
              results: results.results || results, 
              rawData: results.rawData || null 
            });
          } catch (error) {
            sendResponse({ results: [], error: error.message });
          }
        });
      } catch (error) {
        sendResponse({ results: [], error: error.message });
      }
    })();

    return true;
  }
});

// Divide bookmarks into batches with dynamic sizing for Deep Search
async function divideToBatches(bookmarks, batchSize) {
  if (!batchSize || batchSize === 'none') {
    return [bookmarks]; // No batching - return all as single batch
  }
  
  // Check if Deep Search is enabled
  const deepSearchSettings = await new Promise((resolve) => {
    chrome.storage.local.get(['deepSearchSettings'], (data) => {
      resolve(data.deepSearchSettings || { enabled: false });
    });
  });
  
  // Use Deep Search batch size if enabled and bookmarks have content
  let size = parseInt(batchSize);
  const hasMarkdownContent = bookmarks.some(b => b.content);
  
  if (deepSearchSettings.enabled && hasMarkdownContent) {
    // Use smaller batch size for Deep Search
    size = Math.min(size, deepSearchSettings.batchSize || 3);
  }
  
  const batches = [];
  let currentBatch = [];
  let currentSize = 0;
  const maxBatchSize = 100000; // 100KB per batch
  
  for (const bookmark of bookmarks) {
    // Estimate size
    const estimatedSize = 
      (bookmark.title?.length || 0) + 
      (bookmark.url?.length || 0) + 
      (bookmark.content?.length || 0);
    
    // Check if adding this bookmark would exceed limits
    if (currentBatch.length >= size || 
        (currentSize + estimatedSize > maxBatchSize && currentBatch.length > 0)) {
      batches.push(currentBatch);
      currentBatch = [];
      currentSize = 0;
    }
    
    currentBatch.push(bookmark);
    currentSize += estimatedSize;
  }
  
  // Add remaining bookmarks
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }
  
  return batches;
}

// Get batch settings for current provider
async function getBatchSettings(provider) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiBatchSize', 'ollamaBatchSize', 'deepSearchSettings'], (data) => {
      const key = provider === 'ollama' ? 'ollamaBatchSize' : 'apiBatchSize';
      let batchSize = data[key] || (provider === 'ollama' ? '25' : 'none');
      
      // Override with Deep Search batch size if enabled
      const deepSearchSettings = data.deepSearchSettings || { enabled: false };
      if (deepSearchSettings.enabled) {
        batchSize = deepSearchSettings.batchSize || 3;
      }
      
      resolve(batchSize);
    });
  });
}

// Format batch for AI with global numbers
async function formatBatchForAI(batch) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['bookmarkFields'], (data) => {
      const fields = data.bookmarkFields || {
        includeTitle: true,
        includeUrl: true,
        includeFolder: true
      };
      
      const formattedList = batch.map((b) => {
        let parts = [`${b.globalNumber}.`];
        
        if (fields.includeTitle) {
          parts.push(b.title);
        }
        
        if (fields.includeUrl) {
          parts.push(fields.includeTitle ? `- ${b.url}` : b.url);
        }
        
        if (fields.includeFolder && b.path) {
          parts.push(`(Folder: ${b.path})`);
        }
        
        return parts.join(' ');
      }).join("\n");
      
      resolve(formattedList);
    });
  });
}

// Parse AI response (comma-separated numbers or "NONE")
function parseAIResponse(response) {
  const trimmed = response.trim();
  
  if (trimmed === 'NONE' || trimmed === '' || !trimmed) {
    return [];
  }
  
  // Parse comma-separated numbers
  return trimmed
    .split(',')
    .map(n => parseInt(n.trim()))
    .filter(n => !isNaN(n) && n > 0);
}

// Aggregate results from all batches
function aggregateResults(globalNumbers, allBookmarks) {
  // Remove duplicates
  const uniqueNumbers = [...new Set(globalNumbers)];
  
  // Map back to bookmarks
  return uniqueNumbers
    .map(num => allBookmarks.find(b => b.globalNumber === num))
    .filter(b => b !== undefined);
}

// Process batches sequentially
async function processBatchSequentially(batches, query, provider, settings, customPrompt, usePrompt) {
  const allResultNumbers = [];
  const batchDetails = []; // Store details of each batch for RAW data
  
  for (let i = 0; i < batches.length; i++) {
    try {
      // Check if search was aborted
      if (currentSearchAbortController?.signal.aborted) {
        console.log('Search aborted, stopping batch processing');
        break;
      }
      
      // Send progress update to popup
      chrome.runtime.sendMessage({
        action: 'batchProgress',
        current: i + 1,
        total: batches.length
      }).catch(() => {
        // Ignore if popup is closed
      });
      
      // Format batch with global numbers
      const batchText = await formatBatchForAI(batches[i]);
      
      // Build prompt with batch
      let prompt;
      if (usePrompt === false) {
        prompt = `Here are bookmarks:\n\n${batchText}\n\n${query}`;
      } else {
        const defaultPrompt = `You are a bookmark search assistant. Here are bookmarks:\n\n${batchText}\n\nUser query: "${query}"\n\nBased on the query, return ONLY the numbers of the most relevant bookmarks (comma-separated). For example: 1,5,12\nIf no bookmarks match, return: NONE\n\nYour response:`;
        
        prompt = customPrompt 
          ? customPrompt.replace('{SEARCH}', query).replace('[BOOKMARKS_WILL_BE_INSERTED_HERE]', batchText)
          : defaultPrompt;
      }
      
      // Send to AI based on provider
      let aiResponse;
      if (provider === 'ollama') {
        aiResponse = await sendToOllama(prompt, settings.ollamaUrl, settings.ollamaModel);
      } else {
        aiResponse = await sendToAPIProvider(prompt, settings.apiProvider, settings.apiKey, settings.apiModel);
      }
      
      // Store batch details for RAW data
      batchDetails.push({
        batchNumber: i + 1,
        sent: prompt,
        received: aiResponse
      });
      
      // Parse response
      const numbers = parseAIResponse(aiResponse);
      allResultNumbers.push(...numbers);
      
    } catch (error) {
      // Check if it's an abort error
      if (error.name === 'AbortError' || currentSearchAbortController?.signal.aborted) {
        console.log('Search aborted');
        break; // Stop processing batches
      }
      
      console.error(`Batch ${i + 1} failed:`, error);
      batchDetails.push({
        batchNumber: i + 1,
        sent: 'Error occurred',
        received: error.message
      });
      // Continue with other batches only if not aborted
    }
  }
  
  return { numbers: allResultNumbers, batchDetails };
}

// Send to Ollama
async function sendToOllama(prompt, ollamaUrl, ollamaModel) {
  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel,
      prompt: prompt,
      stream: false,
    }),
    signal: currentSearchAbortController?.signal,
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const data = await response.json();
  return data.response.trim();
}

// Send to API Provider
async function sendToAPIProvider(prompt, provider, apiKey, model) {
  // This will use the existing API logic
  // For now, we'll create a simplified version
  let apiUrl, headers, body;

  switch (provider) {
    case "openai":
      apiUrl = "https://api.openai.com/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      body = {
        model: model || "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      };
      break;

    case "anthropic":
      apiUrl = "https://api.anthropic.com/v1/messages";
      headers = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      };
      body = {
        model: model || "claude-3-haiku-20240307",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      };
      break;

    case "google":
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${
        model || "gemini-pro"
      }:generateContent?key=${apiKey}`;
      headers = {
        "Content-Type": "application/json",
      };
      body = {
        contents: [{ parts: [{ text: prompt }] }],
      };
      break;

    default:
      // Use OpenAI-compatible format for other providers
      apiUrl = getAPIUrl(provider, model, apiKey);
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      body = {
        model: model,
        messages: [{ role: "user", content: prompt }],
      };
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(body),
    signal: currentSearchAbortController?.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  
  // Parse response based on provider
  switch (provider) {
    case "openai":
      return data.choices[0].message.content.trim();
    case "anthropic":
      return data.content[0].text.trim();
    case "google":
      return data.candidates[0].content.parts[0].text.trim();
    default:
      return data.choices[0].message.content.trim();
  }
}


// Clear expired cache on startup
chrome.runtime.onStartup.addListener(async () => {
  try {
    const cache = await markdownCache.getCache();
    const urls = Object.keys(cache);
    let removedCount = 0;
    
    for (const url of urls) {
      if (markdownCache.isExpired(cache[url])) {
        delete cache[url];
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      await markdownCache.saveCache(cache);
      console.log(`Cleared ${removedCount} expired cache entries on startup`);
    }
  } catch (error) {
    console.error('Error clearing expired cache on startup:', error);
  }
});

// Also clear on install
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const cache = await markdownCache.getCache();
    const urls = Object.keys(cache);
    let removedCount = 0;
    
    for (const url of urls) {
      if (markdownCache.isExpired(cache[url])) {
        delete cache[url];
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      await markdownCache.saveCache(cache);
      console.log(`Cleared ${removedCount} expired cache entries on install`);
    }
  } catch (error) {
    console.error('Error clearing expired cache on install:', error);
  }
});
