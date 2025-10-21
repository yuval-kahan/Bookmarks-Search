// Load and display current search mode
function updateSearchModeIndicator() {
  chrome.storage.local.get(
    ["searchMode", "simpleSearchType", "ollamaModel", "apiProvider"],
    (data) => {
      const indicator = document.getElementById("searchModeIndicator");
      const modeIcon = indicator.querySelector(".mode-icon");
      const modeText = indicator.querySelector(".mode-text");

      const searchMode = data.searchMode || "simple";

      if (searchMode === "simple") {
        const searchType = data.simpleSearchType || "exact";

        if (searchType === "exact") {
          modeIcon.textContent = "🎯";
          modeText.innerHTML = "Mode: <strong>Simple - Exact Match</strong>";
        } else {
          modeIcon.textContent = "🔍";
          modeText.innerHTML = "Mode: <strong>Simple - Fuzzy Search</strong>";
        }
      } else {
        // AI Search mode
        const ollamaModel = data.ollamaModel;
        const apiProvider = data.apiProvider;

        if (apiProvider) {
          modeIcon.textContent = "🌐";
          modeText.innerHTML = `Mode: <strong>AI - ${getProviderName(
            apiProvider
          )}</strong>`;
        } else if (ollamaModel) {
          modeIcon.textContent = "🦙";
          modeText.innerHTML = `Mode: <strong>AI - Ollama (${ollamaModel})</strong>`;
        } else {
          modeIcon.textContent = "🤖";
          modeText.innerHTML =
            "Mode: <strong>AI Search</strong> (not configured)";
        }
      }
    }
  );
}

// Get provider display name
function getProviderName(provider) {
  const names = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google Gemini",
    xai: "xAI",
    groq: "Groq",
    together: "Together AI",
    fireworks: "Fireworks AI",
    deepseek: "DeepSeek",
    perplexity: "Perplexity",
    cohere: "Cohere",
    mistral: "Mistral AI",
    ai21: "AI21 Labs",
    huggingface: "Hugging Face",
    anyscale: "Anyscale",
    azure: "Azure OpenAI",
    cloudflare: "Cloudflare",
    lepton: "Lepton AI",
    openrouter: "OpenRouter",
    novita: "Novita AI",
  };
  return names[provider] || provider;
}

// Open settings page
document.getElementById("settingsBtn").addEventListener("click", () => {
  window.location.href = "settings.html";
});

// Update indicator on load
updateSearchModeIndicator();

// Track if search is in progress
let searchInProgress = false;
let abortSearch = false;

// Search functionality
document.getElementById("searchBtn").addEventListener("click", async () => {
  const query = document.getElementById("query").value.trim();
  const errorDiv = document.getElementById("error");
  const statusDiv = document.getElementById("status");
  const list = document.getElementById("results");
  const stopBtn = document.getElementById("stopBtn");
  const searchBtn = document.getElementById("searchBtn");

  errorDiv.textContent = "";
  errorDiv.className = "";
  statusDiv.textContent = "";
  list.innerHTML = "";
  abortSearch = false;

  if (!query) {
    errorDiv.textContent = "Please enter a search term";
    errorDiv.className = "error";
    return;
  }

  // Show stop button, disable search button
  searchInProgress = true;
  stopBtn.classList.add("visible");
  searchBtn.disabled = true;
  searchBtn.style.opacity = "0.6";

  // Get saved search mode
  chrome.storage.local.get(["searchMode"], (data) => {
    const searchMode = data.searchMode || "simple";

    if (searchMode === "simple") {
      // Get simple search type
      chrome.storage.local.get(["simpleSearchType"], (typeData) => {
        const searchType = typeData.simpleSearchType || "exact";

        chrome.runtime.sendMessage(
          { action: "searchBookmarks", query, searchType },
          (response) => {
            if (abortSearch) {
              displayResults([]);
              return;
            }

            if (chrome.runtime.lastError) {
              searchInProgress = false;
              stopBtn.classList.remove("visible");
              searchBtn.disabled = false;
              searchBtn.style.opacity = "1";
              errorDiv.textContent =
                "Error: " + chrome.runtime.lastError.message;
              errorDiv.className = "error";
              return;
            }

            if (!response || !response.results) {
              searchInProgress = false;
              stopBtn.classList.remove("visible");
              searchBtn.disabled = false;
              searchBtn.style.opacity = "1";
              errorDiv.textContent = "No response from background script";
              errorDiv.className = "error";
              return;
            }

            displayResults(response.results);
          }
        );
      });
    } else {
      // AI search
      statusDiv.textContent = "Searching with AI...";

      chrome.storage.local.get(
        [
          "ollamaUrl",
          "ollamaModel",
          "apiProvider",
          "apiKeys",
          "apiModel",
          "customPrompt",
        ],
        (settings) => {
          // Get API key for the selected provider
          const apiKey =
            settings.apiKeys && settings.apiKeys[settings.apiProvider]
              ? settings.apiKeys[settings.apiProvider]
              : "";
          settings.apiKey = apiKey;
          const hasOllama = settings.ollamaUrl || settings.ollamaModel;
          const hasApi = settings.apiProvider && settings.apiKey;

          if (!hasOllama && !hasApi) {
            statusDiv.textContent = "";
            errorDiv.textContent =
              "Please configure AI settings first (click ⚙️)";
            errorDiv.className = "error";
            return;
          }

          chrome.runtime.sendMessage(
            {
              action: "aiSearchBookmarks",
              query,
              settings: settings,
              customPrompt: settings.customPrompt,
            },
            (response) => {
              statusDiv.textContent = "";

              if (abortSearch) {
                displayResults([]);
                return;
              }

              if (chrome.runtime.lastError) {
                searchInProgress = false;
                stopBtn.classList.remove("visible");
                searchBtn.disabled = false;
                searchBtn.style.opacity = "1";
                errorDiv.textContent =
                  "Error: " + chrome.runtime.lastError.message;
                errorDiv.className = "error";
                return;
              }

              if (response.error) {
                searchInProgress = false;
                stopBtn.classList.remove("visible");
                searchBtn.disabled = false;
                searchBtn.style.opacity = "1";
                errorDiv.textContent = "AI Error: " + response.error;
                errorDiv.className = "error";
                return;
              }

              if (!response || !response.results) {
                searchInProgress = false;
                stopBtn.classList.remove("visible");
                searchBtn.disabled = false;
                searchBtn.style.opacity = "1";
                errorDiv.textContent = "No response from AI";
                errorDiv.className = "error";
                return;
              }

              displayResults(response.results);
            }
          );
        }
      );
    }
  });
});

function displayResults(results) {
  const list = document.getElementById("results");
  const stopBtn = document.getElementById("stopBtn");
  const searchBtn = document.getElementById("searchBtn");

  // Hide stop button, enable search button
  searchInProgress = false;
  stopBtn.classList.remove("visible");
  searchBtn.disabled = false;
  searchBtn.style.opacity = "1";

  if (abortSearch) {
    list.innerHTML = "<li style='color: #e53e3e;'>Search cancelled</li>";
    return;
  }

  if (results.length === 0) {
    list.innerHTML = "<li>No bookmarks found</li>";
    return;
  }

  results.forEach((item) => {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = item.url;
    link.target = "_blank";
    link.textContent = item.title || item.url;
    li.appendChild(link);
    list.appendChild(li);
  });
}

// Allow search on Enter key
document.getElementById("query").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    document.getElementById("searchBtn").click();
  }
});

// Stop button functionality
document.getElementById("stopBtn").addEventListener("click", () => {
  if (searchInProgress) {
    abortSearch = true;
    searchInProgress = false;

    const stopBtn = document.getElementById("stopBtn");
    const searchBtn = document.getElementById("searchBtn");
    const statusDiv = document.getElementById("status");
    const errorDiv = document.getElementById("error");
    const list = document.getElementById("results");

    // Send abort message to background script to stop the fetch request
    chrome.runtime.sendMessage({ action: "abortSearch" });

    // Hide stop button, enable search button
    stopBtn.classList.remove("visible");
    searchBtn.disabled = false;
    searchBtn.style.opacity = "1";

    // Clear status and show cancelled message
    statusDiv.textContent = "";
    errorDiv.textContent = "";
    list.innerHTML = "<li style='color: #e53e3e;'>⏹ Search cancelled</li>";
  }
});
