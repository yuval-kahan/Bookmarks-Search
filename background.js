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

// AI search using Ollama
async function aiSearchWithOllama(query, ollamaUrl, ollamaModel) {
  const allBookmarks = await getAllBookmarks();

  const bookmarkList = allBookmarks
    .map((b, i) => `${i + 1}. ${b.title} - ${b.url} (Folder: ${b.path})`)
    .join("\n");

  const prompt = `You are a bookmark search assistant. Here are all the user's bookmarks:

${bookmarkList}

User query: "${query}"

Based on the query, return ONLY the numbers of the most relevant bookmarks (comma-separated). For example: 1,5,12
If no bookmarks match, return: NONE

Your response:`;

  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel,
      prompt: prompt,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const data = await response.json();
  const aiResponse = data.response.trim();

  if (aiResponse === "NONE") {
    return [];
  }

  const indices = aiResponse.split(",").map((n) => parseInt(n.trim()) - 1);
  const results = indices
    .filter((i) => i >= 0 && i < allBookmarks.length)
    .map((i) => allBookmarks[i]);

  return results;
}

// AI search using API providers
async function aiSearchWithAPI(query, provider, apiKey, model) {
  const allBookmarks = await getAllBookmarks();

  const bookmarkList = allBookmarks
    .map((b, i) => `${i + 1}. ${b.title} - ${b.url} (Folder: ${b.path})`)
    .join("\n");

  const userPrompt = `You are a bookmark search assistant. Here are all the user's bookmarks:

${bookmarkList}

User query: "${query}"

Based on the query, return ONLY the numbers of the most relevant bookmarks (comma-separated). For example: 1,5,12
If no bookmarks match, return: NONE`;

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

    default:
      throw new Error("Unsupported API provider");
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(body),
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
    default:
      throw new Error("Unable to parse response");
  }

  if (aiResponse === "NONE") {
    return [];
  }

  const indices = aiResponse.split(",").map((n) => parseInt(n.trim()) - 1);
  const results = indices
    .filter((i) => i >= 0 && i < allBookmarks.length)
    .map((i) => allBookmarks[i]);

  return results;
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
    const { query, settings } = request;

    (async () => {
      try {
        let results;

        // Try API provider first if configured
        if (settings.apiProvider && settings.apiKey) {
          results = await aiSearchWithAPI(
            query,
            settings.apiProvider,
            settings.apiKey,
            settings.apiModel
          );
        }
        // Fall back to Ollama
        else if (settings.ollamaUrl || settings.ollamaModel) {
          const ollamaUrl = settings.ollamaUrl || "http://localhost:11434";
          const ollamaModel = settings.ollamaModel || "llama2";
          results = await aiSearchWithOllama(query, ollamaUrl, ollamaModel);
        } else {
          throw new Error("No AI provider configured");
        }

        sendResponse({ results });
      } catch (error) {
        sendResponse({ results: [], error: error.message });
      }
    })();

    return true;
  }
});
