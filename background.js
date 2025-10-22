// Global abort controller for search requests
let currentSearchAbortController = null;

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
        let parts = [`${i + 1}.`];
        
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

// AI search using Ollama
async function aiSearchWithOllama(query, ollamaUrl, ollamaModel, customPrompt, usePrompt) {
  const allBookmarks = await getAllBookmarks();

  // Always include bookmarks list with selected fields
  const bookmarkList = await formatBookmarkList(allBookmarks);

  let prompt;
  
  if (usePrompt === false) {
    // Send bookmarks + query without instructions
    prompt = `Here are all the user's bookmarks:

${bookmarkList}

${query}`;
  } else {
    // Send full prompt with bookmarks and instructions
    const defaultPrompt = `You are a bookmark search assistant. Here are all the user's bookmarks:

${bookmarkList}

User query: "${query}"

Based on the query, return ONLY the numbers of the most relevant bookmarks (comma-separated). For example: 1,5,12
If no bookmarks match, return: NONE

Your response:`;

    prompt = defaultPrompt;
    if (customPrompt) {
      // Replace {SEARCH} with actual query and insert bookmarks
      prompt = customPrompt.replace('{SEARCH}', query);
      prompt = prompt.replace('[BOOKMARKS_WILL_BE_INSERTED_HERE]', bookmarkList);
    }
  }

  // Create abort controller for this request
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

// AI search using API providers
async function aiSearchWithAPI(query, provider, apiKey, model, customPrompt, usePrompt) {
  const allBookmarks = await getAllBookmarks();

  // Always include bookmarks list with selected fields
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
