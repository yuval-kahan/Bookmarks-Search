// RAW data storage for debugging
let lastRawData = {
  sent: null,
  received: null,
};

// Provider model lists (for dropdown)
const providerModels = {
  openai: ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"],
  anthropic: [
    "claude-3-5-sonnet-20241022",
    "claude-3-haiku-20240307",
    "claude-3-opus-20240229",
  ],
  google: ["gemini-pro", "gemini-1.5-pro", "gemini-1.5-flash"],
  xai: ["grok-beta"],
  groq: [
    "mixtral-8x7b-32768",
    "llama-3.1-70b-versatile",
    "llama-3.1-8b-instant",
  ],
  together: [
    "mistralai/Mixtral-8x7B-Instruct-v0.1",
    "meta-llama/Llama-3-70b-chat-hf",
  ],
  fireworks: [
    "accounts/fireworks/models/llama-v3p1-8b-instruct",
    "accounts/fireworks/models/llama-v3p1-70b-instruct",
  ],
  deepseek: ["deepseek-chat", "deepseek-coder"],
  perplexity: [
    "llama-3.1-sonar-small-128k-online",
    "llama-3.1-sonar-large-128k-online",
  ],
  cohere: ["command", "command-light"],
  mistral: ["mistral-tiny", "mistral-small", "mistral-medium"],
  ai21: ["jamba-instruct"],
  huggingface: [
    "mistralai/Mistral-7B-Instruct-v0.2",
    "meta-llama/Llama-2-7b-chat-hf",
  ],
  anyscale: ["meta-llama/Llama-2-7b-chat-hf", "meta-llama/Llama-2-13b-chat-hf"],
  openrouter: [
    "meta-llama/llama-3.1-8b-instruct:free",
    "google/gemini-pro-1.5",
    "anthropic/claude-3-haiku",
  ],
  novita: ["meta-llama/llama-3.1-8b-instruct"],
  lepton: ["llama2-7b"],
};

// IndexedDB for search history
let db;
const DB_NAME = "SearchHistoryDB";
const STORE_NAME = "searches";
const MAX_HISTORY = 100;

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        objectStore.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

function saveSearchToHistory(query, results) {
  if (!db) return;

  const transaction = db.transaction([STORE_NAME], "readwrite");
  const store = transaction.objectStore(STORE_NAME);

  const searchRecord = {
    query: query,
    results: results,
    timestamp: new Date().toISOString(),
  };

  store.add(searchRecord);

  // Keep only last 100 records
  const index = store.index("timestamp");
  const countRequest = store.count();

  countRequest.onsuccess = () => {
    if (countRequest.result > MAX_HISTORY) {
      const getAllRequest = index.openCursor();
      let deleteCount = countRequest.result - MAX_HISTORY;

      getAllRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && deleteCount > 0) {
          store.delete(cursor.primaryKey);
          deleteCount--;
          cursor.continue();
        }
      };
    }
  };
}

function loadSearchHistory() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("Database not initialized");
      return;
    }

    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("timestamp");
    const request = index.openCursor(null, "prev"); // Reverse order (newest first)

    const history = [];

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        history.push({
          id: cursor.primaryKey,
          ...cursor.value,
        });
        cursor.continue();
      } else {
        resolve(history);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

function removeFromSearchHistory(id) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("Database not initialized");
      return;
    }

    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const deleteRequest = store.delete(id);

    deleteRequest.onsuccess = () => resolve();
    deleteRequest.onerror = () => reject(deleteRequest.error);
  });
}

function clearAllSearchHistory() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("Database not initialized");
      return;
    }

    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const clearRequest = store.clear();

    clearRequest.onsuccess = () => resolve();
    clearRequest.onerror = () => reject(clearRequest.error);
  });
}

async function deleteHistoryItem(id) {
  try {
    await removeFromSearchHistory(id);
    await loadAndDisplayHistory();
  } catch (error) {
    console.error("Error deleting history item:", error);
    alert("Failed to delete history item");
  }
}

async function deleteAllHistory() {
  const confirmed = confirm(
    "Are you sure you want to delete all search history? This action cannot be undone."
  );

  if (confirmed) {
    try {
      await clearAllSearchHistory();
      await loadAndDisplayHistory();
      const emptyState = document.getElementById("emptyState");
      emptyState.style.display = "block";
      emptyState.querySelector(".empty-message").textContent =
        "History cleared successfully";
    } catch (error) {
      console.error("Error clearing history:", error);
      alert("Failed to clear history");
    }
  }
}

// Initialize DB on load
initDB().catch(console.error);

// Load Use Prompt state
function loadUsePromptState() {
  chrome.storage.local.get(["usePrompt"], (data) => {
    const usePrompt = data.usePrompt !== undefined ? data.usePrompt : true;
    document.getElementById("usePromptCheckbox").checked = usePrompt;
  });
}

// Save Use Prompt state
function saveUsePromptState() {
  const usePrompt = document.getElementById("usePromptCheckbox").checked;
  chrome.storage.local.set({ usePrompt: usePrompt });
}

// Load Deep Search state
function loadDeepSearchState() {
  chrome.storage.local.get(["deepSearchSettings"], (data) => {
    const settings = data.deepSearchSettings || {
      enabled: false,
      preMarkdown: false,
    };

    const deepSearchCheckbox = document.getElementById("deepSearchCheckbox");
    const preMarkdownCheckbox = document.getElementById("preMarkdownCheckbox");
    const preMarkdownLabel = preMarkdownCheckbox.closest(".pre-markdown-label");

    deepSearchCheckbox.checked = settings.enabled;
    preMarkdownCheckbox.checked = settings.preMarkdown;

    // Update Pre Markdown enabled state
    if (settings.enabled) {
      preMarkdownCheckbox.disabled = false;
      preMarkdownLabel.classList.remove("disabled");
      preMarkdownLabel.style.opacity = "1";
      preMarkdownLabel.style.cursor = "pointer";
      preMarkdownCheckbox.style.cursor = "pointer";
    } else {
      preMarkdownCheckbox.disabled = true;
      preMarkdownCheckbox.checked = false;
      preMarkdownLabel.classList.add("disabled");
      preMarkdownLabel.style.opacity = "0.6";
      preMarkdownLabel.style.cursor = "not-allowed";
      preMarkdownCheckbox.style.cursor = "not-allowed";
    }
  });
}

// Save Deep Search state
function saveDeepSearchState() {
  const deepSearchEnabled =
    document.getElementById("deepSearchCheckbox").checked;
  const preMarkdownEnabled = document.getElementById(
    "preMarkdownCheckbox"
  ).checked;

  chrome.storage.local.get(["deepSearchSettings"], (data) => {
    const settings = data.deepSearchSettings || {
      batchSize: 3,
      cacheDuration: 24,
      maxPageSize: 500,
    };

    settings.enabled = deepSearchEnabled;
    settings.preMarkdown = preMarkdownEnabled;

    chrome.storage.local.set({ deepSearchSettings: settings });
  });
}

// Handle Deep Search checkbox change
function handleDeepSearchChange() {
  const deepSearchCheckbox = document.getElementById("deepSearchCheckbox");
  const preMarkdownCheckbox = document.getElementById("preMarkdownCheckbox");
  const preMarkdownLabel = preMarkdownCheckbox.closest(".pre-markdown-label");

  if (deepSearchCheckbox.checked) {
    // Enable Pre Markdown checkbox
    preMarkdownCheckbox.disabled = false;
    preMarkdownLabel.classList.remove("disabled");
    preMarkdownLabel.style.opacity = "1";
    preMarkdownLabel.style.cursor = "pointer";
    preMarkdownCheckbox.style.cursor = "pointer";
  } else {
    // Disable and uncheck Pre Markdown
    preMarkdownCheckbox.disabled = true;
    preMarkdownCheckbox.checked = false;
    preMarkdownLabel.classList.add("disabled");
    preMarkdownLabel.style.opacity = "0.6";
    preMarkdownLabel.style.cursor = "not-allowed";
    preMarkdownCheckbox.style.cursor = "not-allowed";
  }

  saveDeepSearchState();
}

// Update AI features based on search mode
function updateAIFeaturesState() {
  chrome.storage.local.get(["searchMode"], (data) => {
    const searchMode = data.searchMode || "simple";
    const isAIMode = searchMode === "ai";

    // Get all AI-related elements
    const usePromptCheckbox = document.getElementById("usePromptCheckbox");
    const usePromptLabel = usePromptCheckbox.closest(".use-prompt-label");
    const usePromptContainer = usePromptCheckbox.closest(
      ".use-prompt-container"
    );

    const deepSearchCheckbox = document.getElementById("deepSearchCheckbox");
    const deepSearchLabel = deepSearchCheckbox.closest(".deep-search-label");
    const deepSearchContainer = deepSearchCheckbox.closest(
      ".deep-search-container"
    );

    const preMarkdownCheckbox = document.getElementById("preMarkdownCheckbox");
    const preMarkdownLabel = preMarkdownCheckbox.closest(".pre-markdown-label");
    const preMarkdownContainer = preMarkdownCheckbox.closest(
      ".pre-markdown-container"
    );

    if (isAIMode) {
      // AI Mode - Enable and restore saved states

      // Use Prompt
      usePromptCheckbox.disabled = false;
      usePromptLabel.style.opacity = "1";
      usePromptLabel.style.cursor = "pointer";
      usePromptCheckbox.style.cursor = "pointer";
      loadUsePromptState();

      // Deep Search
      deepSearchCheckbox.disabled = false;
      deepSearchLabel.style.opacity = "1";
      deepSearchLabel.style.cursor = "pointer";
      deepSearchCheckbox.style.cursor = "pointer";
      loadDeepSearchState();
    } else {
      // Simple Mode - Disable and uncheck all AI features

      // Use Prompt
      usePromptCheckbox.disabled = true;
      usePromptCheckbox.checked = false;
      usePromptLabel.style.opacity = "0.6";
      usePromptLabel.style.cursor = "not-allowed";
      usePromptCheckbox.style.cursor = "not-allowed";

      // Deep Search
      deepSearchCheckbox.disabled = true;
      deepSearchCheckbox.checked = false;
      deepSearchLabel.style.opacity = "0.6";
      deepSearchLabel.style.cursor = "not-allowed";
      deepSearchCheckbox.style.cursor = "not-allowed";

      // Pre Markdown
      preMarkdownCheckbox.disabled = true;
      preMarkdownCheckbox.checked = false;
      preMarkdownLabel.style.opacity = "0.6";
      preMarkdownLabel.style.cursor = "not-allowed";
      preMarkdownCheckbox.style.cursor = "not-allowed";
    }
  });
}

// Load and display current search mode
function updateSearchModeIndicator() {
  chrome.storage.local.get(
    [
      "searchMode",
      "simpleSearchType",
      "ollamaModel",
      "apiProvider",
      "apiModel",
    ],
    (data) => {
      const indicator = document.getElementById("searchModeIndicator");
      const modeIcon = indicator.querySelector(".mode-icon");
      const modeText = indicator.querySelector(".mode-text");
      const dropdownArrow = document.getElementById("dropdownArrow");

      const searchMode = data.searchMode || "simple";

      if (searchMode === "simple") {
        const searchType = data.simpleSearchType || "exact";

        // Make indicator clickable in Simple mode
        indicator.style.cursor = "pointer";
        indicator.title =
          "Click to toggle between Exact Match and Fuzzy Search";

        // Hide dropdown arrow
        dropdownArrow.style.display = "none";

        if (searchType === "exact") {
          modeIcon.textContent = "🎯";
          modeText.innerHTML = "Mode: <strong>Simple - Exact Match</strong>";
        } else {
          modeIcon.textContent = "🔍";
          modeText.innerHTML = "Mode: <strong>Simple - Fuzzy Search</strong>";
        }
      } else {
        // AI mode - clickable to show dropdown
        indicator.style.cursor = "pointer";
        indicator.title = "Click to change model";

        // Show dropdown arrow
        dropdownArrow.style.display = "inline-block";

        // AI Search mode
        const ollamaModel = data.ollamaModel;
        const apiProvider = data.apiProvider;
        const apiModel = data.apiModel;

        if (apiProvider) {
          modeIcon.textContent = "🌐";
          const modelDisplay = apiModel ? ` (${apiModel})` : "";
          modeText.innerHTML = `Mode: <strong>AI - ${getProviderName(
            apiProvider
          )}${modelDisplay}</strong>`;
        } else if (ollamaModel) {
          modeIcon.textContent = "🦙";
          modeText.innerHTML = `Mode: <strong>AI - Ollama (${ollamaModel})</strong>`;
        } else {
          modeIcon.textContent = "🤖";
          modeText.innerHTML =
            "Mode: <strong>AI Search</strong> (not configured)";
          dropdownArrow.style.display = "none";
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

// Use Prompt checkbox event listener
document.getElementById("usePromptCheckbox").addEventListener("change", (e) => {
  // Only save if not disabled
  if (!e.target.disabled) {
    saveUsePromptState();
  }
});

// Deep Search checkbox event listeners
document
  .getElementById("deepSearchCheckbox")
  .addEventListener("change", (e) => {
    // Only handle if not disabled
    if (!e.target.disabled) {
      handleDeepSearchChange();
    }
  });

document
  .getElementById("preMarkdownCheckbox")
  .addEventListener("change", (e) => {
    // Only save if not disabled
    if (!e.target.disabled) {
      saveDeepSearchState();
    }
  });

// Update indicator on load
updateSearchModeIndicator();

// Update AI features state based on search mode
updateAIFeaturesState();

// Handle mode indicator click
document.getElementById("searchModeIndicator").addEventListener("click", () => {
  chrome.storage.local.get(["searchMode", "simpleSearchType"], (data) => {
    const searchMode = data.searchMode || "simple";

    if (searchMode === "simple") {
      // Toggle Simple search type
      const currentType = data.simpleSearchType || "exact";
      const newType = currentType === "exact" ? "fuzzy" : "exact";

      // Save new type
      chrome.storage.local.set({ simpleSearchType: newType }, () => {
        // Update indicator
        updateSearchModeIndicator();
      });
    } else {
      // Toggle model dropdown for AI mode
      const dropdown = document.getElementById("modelDropdown");
      if (dropdown.style.display === "block") {
        closeDropdown();
      } else {
        showModelDropdown();
      }
    }
  });
});

// Listen for storage changes (when user changes mode in settings)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.searchMode) {
    updateAIFeaturesState();
    updateSearchModeIndicator();
  }

  // Also update indicator when simpleSearchType changes
  if (namespace === "local" && changes.simpleSearchType) {
    updateSearchModeIndicator();
  }
});

// State management functions
function savePopupState(state) {
  chrome.storage.local.set({ popupState: state });
}

function restorePopupState() {
  chrome.storage.local.get(["popupState"], (data) => {
    if (data.popupState) {
      const state = data.popupState;

      // Restore query
      if (state.query) {
        document.getElementById("query").value = state.query;
        autoResizeTextarea();
      }

      // Restore results
      if (state.results && state.results.length > 0) {
        displayResults(state.results);
      }

      // Restore search status
      if (state.isSearching) {
        document.getElementById("status").textContent = "Searching with AI...";
        document.getElementById("searchBtn").disabled = true;
        document.getElementById("searchBtn").style.opacity = "0.6";
        document.getElementById("stopBtn").classList.add("visible");
        searchInProgress = true;
      }

      // Restore error
      if (state.error) {
        const errorDiv = document.getElementById("error");
        errorDiv.textContent = state.error;
        errorDiv.className = "error";
      }
    }
  });
}

// Restore state on load
restorePopupState();

// Auto-resize textarea
function autoResizeTextarea() {
  const textarea = document.getElementById("query");

  // Reset height to get accurate scrollHeight
  textarea.style.height = "auto";

  // Set new height based on content
  const newHeight = Math.min(textarea.scrollHeight, 200); // Max 200px
  textarea.style.height = newHeight + "px";

  // Show scrollbar if content exceeds max height
  if (textarea.scrollHeight > 200) {
    textarea.style.overflowY = "auto";
  } else {
    textarea.style.overflowY = "hidden";
  }
}

// Add event listener for textarea auto-resize
const queryTextarea = document.getElementById("query");
queryTextarea.addEventListener("input", autoResizeTextarea);
queryTextarea.addEventListener("change", autoResizeTextarea);

// Initial resize
autoResizeTextarea();

// Track if search is in progress
let searchInProgress = false;
let abortSearch = false;

// Check if Deep Search warning should be shown
async function shouldShowDeepSearchWarning() {
  const deepSearchCheckbox = document.getElementById("deepSearchCheckbox");

  // Don't show if checkbox is disabled (Simple mode)
  if (deepSearchCheckbox.disabled) {
    return false;
  }

  const deepSearchEnabled = deepSearchCheckbox.checked;

  if (!deepSearchEnabled) {
    return false; // Deep Search not enabled
  }

  // Check if user disabled the warning
  return new Promise((resolve) => {
    chrome.storage.local.get(["dontShowDeepSearchWarning"], (data) => {
      resolve(!data.dontShowDeepSearchWarning);
    });
  });
}

// Show Deep Search warning modal
function showDeepSearchWarning() {
  return new Promise((resolve) => {
    const modal = document.getElementById("deepSearchWarningModal");
    const preMarkdownSuggestion = document.getElementById(
      "preMarkdownSuggestion"
    );
    const preMarkdownEnabled = document.getElementById(
      "preMarkdownCheckbox"
    ).checked;

    // Show/hide Pre Markdown suggestion based on current state
    if (preMarkdownEnabled) {
      preMarkdownSuggestion.style.display = "none";
    } else {
      preMarkdownSuggestion.style.display = "block";
    }

    modal.style.display = "flex";

    // OK button
    const okBtn = document.getElementById("deepSearchWarningOk");
    const cancelBtn = document.getElementById("deepSearchWarningCancel");
    const closeBtn = document.getElementById("deepSearchWarningClose");
    const dontShowCheckbox = document.getElementById(
      "dontShowDeepSearchWarning"
    );

    const handleOk = () => {
      // Save preference if checkbox is checked
      if (dontShowCheckbox.checked) {
        chrome.storage.local.set({ dontShowDeepSearchWarning: true });
      }
      modal.style.display = "none";
      cleanup();
      resolve(true); // Continue with search
    };

    const handleCancel = () => {
      modal.style.display = "none";
      cleanup();
      resolve(false); // Cancel search
    };

    const cleanup = () => {
      okBtn.removeEventListener("click", handleOk);
      cancelBtn.removeEventListener("click", handleCancel);
      closeBtn.removeEventListener("click", handleCancel);
      dontShowCheckbox.checked = false;
    };

    okBtn.addEventListener("click", handleOk);
    cancelBtn.addEventListener("click", handleCancel);
    closeBtn.addEventListener("click", handleCancel);
  });
}

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

  // Validate query first - before any warnings
  if (!query) {
    errorDiv.textContent = "⚠️ Please enter a search term";
    errorDiv.className = "error";
    return;
  }

  // Check if Deep Search warning should be shown
  if (await shouldShowDeepSearchWarning()) {
    const shouldContinue = await showDeepSearchWarning();
    if (!shouldContinue) {
      return; // User cancelled
    }
  }

  // Show stop button, disable search button and clean button
  searchInProgress = true;
  stopBtn.classList.add("visible");
  searchBtn.disabled = true;
  searchBtn.style.opacity = "0.6";
  updateCleanButtonState(true); // Disable clean button during search

  // Save state - search started
  savePopupState({
    query: query,
    isSearching: true,
    results: [],
    error: null,
  });

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
              updateCleanButtonState(false);
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
              updateCleanButtonState(false);
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

              // Save RAW data if available
              if (response && response.rawData) {
                // Check if it's batch processing or regular
                if (response.rawData.batchDetails) {
                  // Batch processing - save the entire rawData object
                  lastRawData = response.rawData;
                } else {
                  // Regular processing - save sent and received
                  lastRawData.sent = response.rawData.sent;
                  lastRawData.received = response.rawData.received;
                }
              }

              if (abortSearch) {
                displayResults([]);
                return;
              }

              if (chrome.runtime.lastError) {
                searchInProgress = false;
                updateCleanButtonState(false);
                stopBtn.classList.remove("visible");
                searchBtn.disabled = false;
                searchBtn.style.opacity = "1";
                const errorMsg = "Error: " + chrome.runtime.lastError.message;
                errorDiv.textContent = errorMsg;
                errorDiv.className = "error";
                // Save error state
                savePopupState({
                  query: query,
                  isSearching: false,
                  results: [],
                  error: errorMsg,
                });
                return;
              }

              if (response.error) {
                searchInProgress = false;
                updateCleanButtonState(false);
                stopBtn.classList.remove("visible");
                searchBtn.disabled = false;
                searchBtn.style.opacity = "1";
                const errorMsg = "AI Error: " + response.error;
                errorDiv.textContent = errorMsg;
                errorDiv.className = "error";
                // Save error state
                savePopupState({
                  query: query,
                  isSearching: false,
                  results: [],
                  error: errorMsg,
                });
                return;
              }

              if (!response || !response.results) {
                searchInProgress = false;
                updateCleanButtonState(false);
                stopBtn.classList.remove("visible");
                searchBtn.disabled = false;
                searchBtn.style.opacity = "1";
                const errorMsg = "No response from AI";
                errorDiv.textContent = errorMsg;
                errorDiv.className = "error";
                // Save error state
                savePopupState({
                  query: query,
                  isSearching: false,
                  results: [],
                  error: errorMsg,
                });
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
  updateCleanButtonState(false);
  stopBtn.classList.remove("visible");
  searchBtn.disabled = false;
  searchBtn.style.opacity = "1";

  if (abortSearch) {
    list.innerHTML = "<li style='color: #e53e3e;'>Search cancelled</li>";
    // Save cancelled state
    savePopupState({
      query: document.getElementById("query").value,
      isSearching: false,
      results: [],
      error: "Search cancelled",
    });
    return;
  }

  if (results.length === 0) {
    list.innerHTML = "<li>No bookmarks found</li>";
    // Save no results state
    savePopupState({
      query: document.getElementById("query").value,
      isSearching: false,
      results: [],
      error: null,
    });
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

  // Save successful results state
  const query = document.getElementById("query").value;
  savePopupState({
    query: query,
    isSearching: false,
    results: results,
    error: null,
  });

  // Save to history (only if there are results)
  if (results.length > 0) {
    saveSearchToHistory(query, results);
  }
}

// Allow search on Ctrl+Enter or Shift+Enter (Enter alone creates new line)
document.getElementById("query").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.shiftKey)) {
    e.preventDefault();
    document.getElementById("searchBtn").click();
  }
});

// Stop button functionality
document.getElementById("stopBtn").addEventListener("click", () => {
  if (searchInProgress) {
    abortSearch = true;
    searchInProgress = false;
    updateCleanButtonState(false);

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

    // Fade out and clear the cancelled message after 2.5 seconds
    setTimeout(() => {
      const cancelledItem = list.querySelector("li");
      if (cancelledItem) {
        cancelledItem.classList.add("fade-out");
        // Remove after fade animation completes
        setTimeout(() => {
          list.innerHTML = "";
        }, 500);
      }
    }, 2500);
  }
});

// Utility: Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Utility: Fuzzy matching
function fuzzyMatch(text, pattern) {
  let patternIdx = 0;
  let textIdx = 0;

  while (textIdx < text.length && patternIdx < pattern.length) {
    if (text[textIdx] === pattern[patternIdx]) {
      patternIdx++;
    }
    textIdx++;
  }

  return patternIdx === pattern.length;
}

// History UI functions
function openHistoryScreen() {
  document.getElementById("historyScreen").style.display = "block";
  loadAndDisplayHistory();
}

function closeHistoryScreen() {
  document.getElementById("historyScreen").style.display = "none";
  // Reset filters when closing
  document.getElementById("historySearch").value = "";
  document.getElementById("searchMode").value = "fuzzy";
  document.getElementById("quickFilter").value = "all";
  clearCustomDateRange();
}

function openHistoryDetail(historyItem) {
  document.getElementById("historyDetailScreen").style.display = "block";
  displayHistoryDetail(historyItem);
}

function closeHistoryDetail() {
  document.getElementById("historyDetailScreen").style.display = "none";
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD
  const timeStr = date.toTimeString().split(" ")[0].substring(0, 5); // HH:MM
  return { date: dateStr, time: timeStr };
}

// Filter functions
function applySearchFilter(history, query) {
  const mode = document.getElementById("searchMode").value;

  if (mode === "fuzzy") {
    return history.filter((item) =>
      fuzzyMatch(item.query.toLowerCase(), query.toLowerCase())
    );
  } else {
    return history.filter((item) =>
      item.query.toLowerCase().includes(query.toLowerCase())
    );
  }
}

function applyQuickFilter(history, filter) {
  const now = new Date();
  let startDate;

  switch (filter) {
    case "today":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "yesterday":
      startDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 1
      );
      const endDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );
      return history.filter((item) => {
        const itemDate = new Date(item.timestamp);
        return itemDate >= startDate && itemDate < endDate;
      });
    case "week":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      return history;
  }

  return history.filter((item) => {
    const itemDate = new Date(item.timestamp);
    return itemDate >= startDate;
  });
}

function getCustomDateRange() {
  const fromDate = document.getElementById("fromDate").value;
  const fromTime = document.getElementById("fromTime").value;
  const toDate = document.getElementById("toDate").value;
  const toTime = document.getElementById("toTime").value;

  if (!fromDate || !toDate) return null;

  const startDateTime = new Date(`${fromDate}T${fromTime || "00:00"}`);
  const endDateTime = new Date(`${toDate}T${toTime || "23:59"}`);

  return { start: startDateTime.getTime(), end: endDateTime.getTime() };
}

function applyCustomDateFilter(history, customRange) {
  return history.filter((item) => {
    const itemDate = new Date(item.timestamp);
    const itemTime = itemDate.getTime();
    return itemTime >= customRange.start && itemTime <= customRange.end;
  });
}

function applyAllFilters(history) {
  let filtered = history;

  // Apply search filter
  const searchQuery = document.getElementById("historySearch").value;
  if (searchQuery) {
    filtered = applySearchFilter(filtered, searchQuery);
  }

  // Apply custom date range if set (takes precedence over quick filter)
  const customRange = getCustomDateRange();
  if (customRange) {
    filtered = applyCustomDateFilter(filtered, customRange);
  } else {
    // Apply quick filter only if no custom range
    const quickFilter = document.getElementById("quickFilter").value;
    if (quickFilter !== "all") {
      filtered = applyQuickFilter(filtered, quickFilter);
    }
  }

  return filtered;
}

function clearCustomDateRange() {
  document.getElementById("fromDate").value = "";
  document.getElementById("fromTime").value = "";
  document.getElementById("toDate").value = "";
  document.getElementById("toTime").value = "";
  loadAndDisplayHistory();
}

async function loadAndDisplayHistory() {
  try {
    const history = await loadSearchHistory();
    const historyList = document.getElementById("historyList");
    const emptyState = document.getElementById("emptyState");

    // Apply all filters
    const filtered = applyAllFilters(history);

    if (history.length === 0) {
      historyList.innerHTML = "";
      emptyState.style.display = "block";
      emptyState.querySelector(".empty-message").textContent =
        "No search history yet";
      return;
    }

    if (filtered.length === 0) {
      historyList.innerHTML = "";
      emptyState.style.display = "block";
      emptyState.querySelector(".empty-message").textContent =
        "No results found for the current filters";
      return;
    }

    emptyState.style.display = "none";
    historyList.innerHTML = "";

    filtered.forEach((item) => {
      const historyItem = document.createElement("div");
      historyItem.className = "history-item";
      historyItem.dataset.id = item.id;

      const historyContent = document.createElement("div");
      historyContent.className = "history-content";
      historyContent.innerHTML = `
        <div class="history-time">🕐 ${formatDateTime(item.timestamp)}</div>
        <div class="history-query">${item.query}</div>
        <div class="history-count">→ ${item.results.length} results</div>
      `;

      historyContent.addEventListener("click", () => {
        openHistoryDetail(item);
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-item-btn";
      deleteBtn.textContent = "🗑️";
      deleteBtn.title = "Delete this search";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteHistoryItem(item.id);
      });

      historyItem.appendChild(historyContent);
      historyItem.appendChild(deleteBtn);
      historyList.appendChild(historyItem);
    });
  } catch (error) {
    console.error("Error loading history:", error);
    const historyList = document.getElementById("historyList");
    const emptyState = document.getElementById("emptyState");
    historyList.innerHTML = "";
    emptyState.style.display = "block";
    emptyState.querySelector(".empty-message").textContent =
      "Error loading history";
  }
}

function displayHistoryDetail(historyItem) {
  const detailContent = document.getElementById("historyDetailContent");

  let resultsHTML = "";
  if (historyItem.results.length === 0) {
    resultsHTML =
      '<div style="padding: 10px; color: #999;">No results found</div>';
  } else {
    resultsHTML = '<ul style="list-style: none; padding: 0;">';
    historyItem.results.forEach((result) => {
      resultsHTML += `
        <li style="margin-bottom: 8px; padding: 10px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid #667eea;">
          <a href="${
            result.url
          }" target="_blank" style="color: #333; text-decoration: none; font-size: 13px; display: block; word-break: break-word;">
            ${result.title || result.url}
          </a>
        </li>
      `;
    });
    resultsHTML += "</ul>";
  }

  detailContent.innerHTML = `
    <div class="history-time" style="margin-bottom: 10px;">🕐 ${formatDateTime(
      historyItem.timestamp
    )}</div>
    <div class="history-detail-query">${historyItem.query}</div>
    <div class="history-results-title">📌 Results (${
      historyItem.results.length
    }):</div>
    ${resultsHTML}
  `;
}

// Event listeners for history
document
  .getElementById("historyBtn")
  .addEventListener("click", openHistoryScreen);
document
  .getElementById("historyBackBtn")
  .addEventListener("click", closeHistoryScreen);
document
  .getElementById("historyDetailBackBtn")
  .addEventListener("click", closeHistoryDetail);

// Event listeners for history filters
document
  .getElementById("historySearch")
  .addEventListener("input", debounce(loadAndDisplayHistory, 300));
document
  .getElementById("searchMode")
  .addEventListener("change", loadAndDisplayHistory);
document
  .getElementById("quickFilter")
  .addEventListener("change", loadAndDisplayHistory);
document
  .getElementById("applyCustomFilter")
  .addEventListener("click", loadAndDisplayHistory);
document
  .getElementById("clearCustomFilter")
  .addEventListener("click", clearCustomDateRange);
document
  .getElementById("deleteAllHistory")
  .addEventListener("click", deleteAllHistory);

// RAW Data Modal functions - inject into active tab
async function openRawModal() {
  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab || !tab.id) {
      openRawModalInNewTab();
      return;
    }

    // Try to send message to content script
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: "showRawModal",
        rawData: {
          sent:
            lastRawData.sent ||
            "No data sent yet. Perform a search to see the data.",
          received:
            lastRawData.received ||
            "No data received yet. Perform a search to see the data.",
        },
      });
    } catch (err) {
      // Content script not loaded, open in new tab instead
      console.log("Content script not available, opening in new tab");
      openRawModalInNewTab();
    }
  } catch (error) {
    console.error("Error opening RAW modal:", error);
    openRawModalInNewTab();
  }
}

// Fallback: Open RAW data in a new tab
function openRawModalInNewTab() {
  const rawData = {
    sent:
      lastRawData.sent || "No data sent yet. Perform a search to see the data.",
    received:
      lastRawData.received ||
      "No data received yet. Perform a search to see the data.",
  };

  // Create HTML for new tab
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>RAW Data View</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #f5f5f5;
      padding: 40px 20px;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 20px rgba(0,0,0,0.1);
      padding: 30px;
    }
    h1 {
      color: #667eea;
      margin-bottom: 30px;
      font-size: 24px;
    }
    .section {
      margin-bottom: 30px;
    }
    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: #667eea;
      margin-bottom: 10px;
    }
    .section-content {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #667eea;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.8;
      white-space: pre-wrap;
      word-break: break-word;
      color: #333;
      max-height: 500px;
      overflow-y: auto;
    }
    .received { border-left-color: #48bb78; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📤 RAW Data View</h1>
    <div class="section">
      <div class="section-title">📨 Sent to AI:</div>
      <div class="section-content">${rawData.sent
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</div>
    </div>
    <div class="section">
      <div class="section-title">📥 Received from AI:</div>
      <div class="section-content received">${rawData.received
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</div>
    </div>
  </div>
</body>
</html>
  `;

  // Open in new tab
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  chrome.tabs.create({ url: url });
}

// Event listener for RAW button
document.getElementById("rawBtn").addEventListener("click", openRawModal);

// Listen for batch progress messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "batchProgress") {
    const progressDiv = document.getElementById("batchProgress");
    const progressText = document.getElementById("batchProgressText");
    const progressBar = document.getElementById("batchProgressBar");
    const progressTitle = document.getElementById("batchProgressTitle");

    // Show progress
    progressDiv.style.display = "block";

    // Calculate percentage
    const percentage = (message.current / message.total) * 100;

    // Update based on view mode
    if (progressViewMode === "percentage") {
      // Percentage mode - show only percentage
      progressTitle.textContent = "📦 Processing...";
      progressText.textContent = `${Math.round(percentage)}%`;
    } else {
      // Batch mode - show batch details
      progressTitle.textContent = "📦 Processing batches...";
      progressText.textContent = `Batch ${message.current} of ${message.total}`;
    }

    // Update progress bar
    progressBar.style.width = `${percentage}%`;

    // Hide when complete
    if (message.current === message.total) {
      setTimeout(() => {
        progressDiv.style.display = "none";
      }, 1000);
    }
  }
});

// Hide progress on new search
const originalSearchFunction = document.getElementById("searchBtn").onclick;
document.getElementById("searchBtn").addEventListener("click", () => {
  const progressDiv = document.getElementById("batchProgress");
  progressDiv.style.display = "none";
  // Reset progress display for next search
  updateProgressDisplay();
});

// Progress view toggle (batch details vs percentage only)
let progressViewMode = "percentage"; // 'batch' or 'percentage' - default is percentage

// Load progress view preference
chrome.storage.local.get(["progressViewMode"], (data) => {
  progressViewMode = data.progressViewMode || "percentage";
});

// Toggle progress view
document.getElementById("progressToggleIcon").addEventListener("click", () => {
  // Only allow toggle if search is actually in progress
  if (!searchInProgress) {
    return; // Do nothing if no search is active
  }

  // Toggle mode
  progressViewMode = progressViewMode === "batch" ? "percentage" : "batch";

  // Save preference
  chrome.storage.local.set({ progressViewMode });

  // Update current display if progress is visible
  const progressDiv = document.getElementById("batchProgress");
  if (progressDiv.style.display !== "none") {
    updateProgressDisplay();
  }

  // Visual feedback - rotate icon
  const icon = document.getElementById("progressToggleIcon");
  icon.style.transform = "rotate(180deg)";
  setTimeout(() => {
    icon.style.transform = "rotate(0deg)";
  }, 200);
});

// Update progress display based on mode
function updateProgressDisplay() {
  const titleElement = document.getElementById("batchProgressTitle");
  const textElement = document.getElementById("batchProgressText");

  if (progressViewMode === "percentage") {
    // Percentage mode - show only percentage
    titleElement.textContent = "📦 Processing...";
    // Text will be updated by the message listener to show percentage
  } else {
    // Batch mode - show batch details
    titleElement.textContent = "📦 Processing batches...";
    // Text will be updated by the message listener to show batch number
  }
}

// Clean button functionality
document.getElementById("cleanBtn").addEventListener("click", () => {
  // Clear search input
  document.getElementById("query").value = "";

  // Clear results
  document.getElementById("results").innerHTML = "";

  // Clear error messages
  document.getElementById("error").textContent = "";
  document.getElementById("error").className = "";

  // Clear status messages
  document.getElementById("status").textContent = "";

  // Hide batch progress
  document.getElementById("batchProgress").style.display = "none";

  // Reset textarea height
  const textarea = document.getElementById("query");
  textarea.style.height = "auto";

  // Clear saved popup state
  chrome.storage.local.remove("popupState");

  // Focus back on search input
  textarea.focus();
});

// Disable/enable clean button based on search state
function updateCleanButtonState(isSearching) {
  const cleanBtn = document.getElementById("cleanBtn");
  cleanBtn.disabled = isSearching;
}

// Initialize popup - hide progress indicator on load
document.addEventListener("DOMContentLoaded", () => {
  // Always hide batch progress when popup opens
  const progressDiv = document.getElementById("batchProgress");
  if (progressDiv) {
    progressDiv.style.display = "none";
  }

  // Ensure searchInProgress is false on popup open
  searchInProgress = false;

  // Ensure clean button is enabled
  updateCleanButtonState(false);
});

// ============================================
// Model Selector Dropdown Functionality
// ============================================

// Show model dropdown
async function showModelDropdown() {
  const dropdown = document.getElementById("modelDropdown");
  const dropdownList = document.getElementById("modelDropdownList");
  const dropdownArrow = document.getElementById("dropdownArrow");

  // Get current settings
  const data = await chrome.storage.local.get([
    "searchMode",
    "ollamaUrl",
    "ollamaModel",
    "apiProvider",
    "apiModel",
    "apiKeys",
  ]);

  const searchMode = data.searchMode || "simple";

  // Only show dropdown for AI mode
  if (searchMode !== "ai") {
    return;
  }

  // Clear previous content
  dropdownList.innerHTML =
    '<div class="dropdown-loading">⏳ Loading models...</div>';

  // Show dropdown
  dropdown.style.display = "block";
  dropdownArrow.classList.add("open");

  // Load models based on provider
  if (data.apiProvider) {
    // API Provider
    await loadAPIModels(data.apiProvider, data.apiModel);
  } else if (data.ollamaModel) {
    // Ollama
    await loadOllamaModels(
      data.ollamaUrl || "http://localhost:11434",
      data.ollamaModel
    );
  } else {
    dropdownList.innerHTML =
      '<div class="dropdown-error">❌ No AI provider configured</div>';
  }
}

// Load Ollama models
async function loadOllamaModels(ollamaUrl, currentModel) {
  const dropdownList = document.getElementById("modelDropdownList");

  try {
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch models");
    }

    const data = await response.json();

    if (!data.models || data.models.length === 0) {
      dropdownList.innerHTML =
        '<div class="dropdown-empty">No models installed</div>';
      return;
    }

    // Render models
    dropdownList.innerHTML = "";
    data.models.forEach((model) => {
      const modelItem = document.createElement("div");
      modelItem.className = "model-item";
      if (model.name === currentModel) {
        modelItem.classList.add("active");
      }
      modelItem.dataset.model = model.name;
      modelItem.dataset.provider = "ollama";

      modelItem.innerHTML = `
        <span class="model-name">${model.name}</span>
        <span class="model-status">${
          model.name === currentModel ? "✓" : ""
        }</span>
      `;

      modelItem.addEventListener("click", () =>
        selectModel(model.name, "ollama")
      );

      dropdownList.appendChild(modelItem);
    });
  } catch (error) {
    console.error("Error loading Ollama models:", error);
    dropdownList.innerHTML =
      '<div class="dropdown-error">❌ Ollama not running or unreachable</div>';
  }
}

// Load API models
async function loadAPIModels(provider, currentModel) {
  const dropdownList = document.getElementById("modelDropdownList");

  const models = providerModels[provider];

  if (!models || models.length === 0) {
    dropdownList.innerHTML =
      '<div class="dropdown-empty">No models available</div>';
    return;
  }

  // Render models
  dropdownList.innerHTML = "";
  models.forEach((modelName) => {
    const modelItem = document.createElement("div");
    modelItem.className = "model-item";
    if (modelName === currentModel) {
      modelItem.classList.add("active");
    }
    modelItem.dataset.model = modelName;
    modelItem.dataset.provider = provider;

    modelItem.innerHTML = `
      <span class="model-name">${modelName}</span>
      <span class="model-status">${modelName === currentModel ? "✓" : ""}</span>
    `;

    modelItem.addEventListener("click", () => selectModel(modelName, provider));

    dropdownList.appendChild(modelItem);
  });
}

// Select and verify model
async function selectModel(modelName, provider) {
  const modelItems = document.querySelectorAll(".model-item");
  const clickedItem = Array.from(modelItems).find(
    (item) => item.dataset.model === modelName
  );

  if (!clickedItem || clickedItem.classList.contains("verifying")) {
    return;
  }

  // Disable all items
  modelItems.forEach((item) => item.classList.add("disabled"));

  // Show verifying state
  clickedItem.classList.add("verifying");
  const statusSpan = clickedItem.querySelector(".model-status");
  statusSpan.innerHTML = '<span class="loading">⏳</span>';

  try {
    let result = null;

    // Show verifying toast with timeout info for Ollama
    const providerName =
      provider === "ollama" ? "Ollama" : getProviderName(provider);
    if (provider === "ollama") {
      const timeout = getModelTimeout(modelName);
      showToast(
        `🔍 Testing ${modelName}... (may take up to ${timeout / 1000}s)`,
        "info"
      );
    } else {
      showToast(`🔍 Testing ${modelName} with ${providerName}...`, "info");
    }

    if (provider === "ollama") {
      result = await verifyOllamaModel(modelName);
    } else {
      result = await verifyAPIModel(provider, modelName);
    }

    if (result.success || result === true) {
      // Save model
      if (provider === "ollama") {
        await chrome.storage.local.set({ ollamaModel: modelName });
      } else {
        await chrome.storage.local.set({ apiModel: modelName });
      }

      // Show success
      statusSpan.innerHTML = '<span class="success">✓</span>';
      showToast(`✓ ${modelName} verified and activated!`, "success");

      // Update indicator
      updateSearchModeIndicator();

      // Close dropdown after short delay
      setTimeout(() => {
        closeDropdown();
      }, 1000);
    } else {
      // Show error with specific message
      statusSpan.innerHTML = '<span class="error">✗</span>';
      const errorMsg = result.error || `${modelName} verification failed`;
      showToast(errorMsg, "error");

      // Suggest lighter model if Ollama and model is large
      if (provider === "ollama" && getModelSize(modelName) > 7) {
        const allModels = Array.from(modelItems).map(
          (item) => item.dataset.model
        );
        const suggestion = suggestLighterModel(modelName, allModels);

        if (suggestion) {
          setTimeout(() => {
            showToast(
              `💡 Try ${suggestion} instead? (lighter & faster)`,
              "info"
            );
          }, 3500);
        }
      }

      // Re-enable items after delay
      setTimeout(() => {
        clickedItem.classList.remove("verifying");
        modelItems.forEach((item) => item.classList.remove("disabled"));
        statusSpan.innerHTML = "";
      }, 3000);
    }
  } catch (error) {
    console.error("Error verifying model:", error);
    statusSpan.innerHTML = '<span class="error">✗</span>';
    showToast(`❌ Unexpected error: ${error.message}`, "error");

    // Re-enable items
    setTimeout(() => {
      clickedItem.classList.remove("verifying");
      modelItems.forEach((item) => item.classList.remove("disabled"));
      statusSpan.innerHTML = "";
    }, 3000);
  }
}

// Get timeout based on model size
function getModelTimeout(modelName) {
  // Extract model size from name (e.g., "llama3.1:8b" -> 8)
  const sizeMatch = modelName.match(/(\d+)b/i);
  const size = sizeMatch ? parseInt(sizeMatch[1]) : 7;

  if (size <= 7) return 15000; // 15 seconds for small models
  if (size <= 13) return 25000; // 25 seconds for medium models
  return 35000; // 35 seconds for large models
}

// Get model size from name
function getModelSize(modelName) {
  const sizeMatch = modelName.match(/(\d+)b/i);
  return sizeMatch ? parseInt(sizeMatch[1]) : 7;
}

// Suggest lighter alternative model
function suggestLighterModel(failedModel, availableModels) {
  const failedSize = getModelSize(failedModel);

  // If failed model is already small, no suggestion
  if (failedSize <= 7) return null;

  // Find smaller models
  const smallerModels = availableModels.filter((model) => {
    const size = getModelSize(model);
    return size < failedSize && size <= 8;
  });

  // Prefer llama3.1:8b if available
  const preferred = smallerModels.find(
    (m) => m.includes("llama3.1") && m.includes("8b")
  );
  if (preferred) return preferred;

  // Otherwise return the first smaller model
  return smallerModels[0] || null;
}

// Parse Ollama error for user-friendly message
function parseOllamaError(error, modelName) {
  const errorMsg = error.message.toLowerCase();

  if (errorMsg.includes("timeout") || error.name === "TimeoutError") {
    return `⏱️ ${modelName} is taking too long to load. Try a smaller model or wait a moment.`;
  }

  if (errorMsg.includes("fetch") || errorMsg.includes("network")) {
    return `🔌 Can't reach Ollama. Make sure it's running.`;
  }

  if (errorMsg.includes("memory") || errorMsg.includes("oom")) {
    return `💾 Not enough memory. Close other apps or try a smaller model.`;
  }

  if (errorMsg.includes("gpu") || errorMsg.includes("cuda")) {
    return `🔥 GPU issue detected. Try again or use a smaller model.`;
  }

  return `❌ ${modelName} verification failed - ${error.message}`;
}

// Verify Ollama model
async function verifyOllamaModel(modelName) {
  const data = await chrome.storage.local.get(["ollamaUrl"]);
  const ollamaUrl = data.ollamaUrl || "http://localhost:11434";

  const timeout = getModelTimeout(modelName);

  try {
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        prompt: "test",
        stream: false,
      }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return { success: true };
  } catch (error) {
    console.error("Ollama verification error:", error);
    return {
      success: false,
      error: parseOllamaError(error, modelName),
    };
  }
}

// Verify API model
async function verifyAPIModel(provider, modelName) {
  const data = await chrome.storage.local.get(["apiKeys"]);
  const apiKeys = data.apiKeys || {};
  const apiKey = apiKeys[provider];

  if (!apiKey) {
    return {
      success: false,
      error: `❌ No API key found for ${getProviderName(provider)}`,
    };
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: "verifyAPI",
      provider: provider,
      apiKey: apiKey,
      model: modelName,
    });

    if (response && response.success) {
      return { success: true };
    } else {
      const errorMsg = response?.error || "Verification failed";
      return {
        success: false,
        error: `❌ ${modelName}: ${errorMsg}`,
      };
    }
  } catch (error) {
    console.error("API verification error:", error);
    return {
      success: false,
      error: `❌ Connection error: ${error.message}`,
    };
  }
}

// Close dropdown
function closeDropdown() {
  const dropdown = document.getElementById("modelDropdown");
  const dropdownArrow = document.getElementById("dropdownArrow");

  dropdown.style.display = "none";
  dropdownArrow.classList.remove("open");
}

// Show toast notification
function showToast(message, type = "info") {
  // Remove existing toast
  const existingToast = document.querySelector(".toast-notification");
  if (existingToast) {
    existingToast.remove();
  }

  // Create toast
  const toast = document.createElement("div");
  toast.className = `toast-notification toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    background: ${
      type === "success" ? "#48bb78" : type === "error" ? "#e53e3e" : "#667eea"
    };
    color: white;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    animation: toastSlideIn 0.3s ease;
  `;

  document.body.appendChild(toast);

  // Auto remove after 3 seconds
  setTimeout(() => {
    toast.style.animation = "toastSlideOut 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add toast animations to document
if (!document.querySelector("#toast-animations")) {
  const style = document.createElement("style");
  style.id = "toast-animations";
  style.textContent = `
    @keyframes toastSlideIn {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
    @keyframes toastSlideOut {
      from {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
      to {
        opacity: 0;
        transform: translateX(-50%) translateY(20px);
      }
    }
  `;
  document.head.appendChild(style);
}

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  const dropdown = document.getElementById("modelDropdown");
  const indicator = document.getElementById("searchModeIndicator");

  if (
    dropdown.style.display === "block" &&
    !dropdown.contains(e.target) &&
    !indicator.contains(e.target)
  ) {
    closeDropdown();
  }
});

// Close dropdown on Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const dropdown = document.getElementById("modelDropdown");
    if (dropdown.style.display === "block") {
      closeDropdown();
    }
  }
});

// ============================================
// Bookmark Scope Filter Functionality
// ============================================

// Global state for bookmark tree
let bookmarkTreeRoot = null;
let selectedBookmarkIds = new Set();
let expandedFolderIds = new Set();

// Build bookmark tree from Chrome API
async function buildBookmarkTree() {
  try {
    const bookmarks = await chrome.bookmarks.getTree();

    if (!bookmarks || !Array.isArray(bookmarks) || bookmarks.length === 0) {
      console.error("No bookmarks returned from Chrome API");
      return null;
    }

    bookmarkTreeRoot = processBookmarkNode(bookmarks[0], []);

    if (!bookmarkTreeRoot) {
      console.error("Failed to process bookmark tree");
      return null;
    }

    return bookmarkTreeRoot;
  } catch (error) {
    console.error("Error building bookmark tree:", error);
    throw error; // Re-throw to show in UI
  }
}

// Process a single bookmark node recursively
function processBookmarkNode(chromeNode, parentPath = []) {
  if (!chromeNode) return null;

  const node = {
    id: chromeNode.id,
    title: chromeNode.title || "Bookmarks",
    type: chromeNode.url ? "bookmark" : "folder",
    url: chromeNode.url || null,
    children: [],
    selected: true, // Default: all selected
    expanded: false, // Default: all collapsed
    parentId: parentPath[parentPath.length - 1] || null,
    path: [...parentPath],
  };

  // Process children recursively
  if (
    chromeNode.children &&
    Array.isArray(chromeNode.children) &&
    chromeNode.children.length > 0
  ) {
    node.children = chromeNode.children
      .map((child) => processBookmarkNode(child, [...parentPath, node.id]))
      .filter((child) => child !== null); // Filter out null nodes
  }

  // Add to selected set
  selectedBookmarkIds.add(node.id);

  return node;
}

// Count total items in tree
function countTreeItems(node) {
  let count = 1; // Count this node

  if (
    node.children &&
    Array.isArray(node.children) &&
    node.children.length > 0
  ) {
    node.children.forEach((child) => {
      count += countTreeItems(child);
    });
  }

  return count;
}

// Count selected items
function countSelectedItems(node = bookmarkTreeRoot) {
  if (!node) return 0;

  let count = node.selected ? 1 : 0;

  if (
    node.children &&
    Array.isArray(node.children) &&
    node.children.length > 0
  ) {
    node.children.forEach((child) => {
      count += countSelectedItems(child);
    });
  }

  return count;
}

// Check if all items are selected
function isAllSelected() {
  if (!bookmarkTreeRoot) return true;

  const total = countTreeItems(bookmarkTreeRoot);
  const selected = countSelectedItems();

  return total === selected;
}

// Get all selected bookmark nodes (not folders)
function getSelectedBookmarks(node = bookmarkTreeRoot) {
  if (!node) return [];

  const selected = [];

  if (node.type === "bookmark" && node.selected) {
    selected.push(node);
  }

  if (
    node.children &&
    Array.isArray(node.children) &&
    node.children.length > 0
  ) {
    node.children.forEach((child) => {
      selected.push(...getSelectedBookmarks(child));
    });
  }

  return selected;
}

// Find node by ID
function findNodeById(id, node = bookmarkTreeRoot) {
  if (!node) return null;
  if (node.id === id) return node;

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      const found = findNodeById(id, child);
      if (found) return found;
    }
  }

  return null;
}

// Render the bookmark tree
function renderBookmarkTree(node, container, level = 0) {
  if (!node || !container) return;

  // Skip hidden nodes
  if (node.hidden) return;

  // Skip the root "Bookmarks" node, render its children directly
  if (level === 0 && node.title === "Bookmarks") {
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach((child) =>
        renderBookmarkTree(child, container, level)
      );
    }
    return;
  }

  const nodeDiv = document.createElement("div");
  nodeDiv.className = "tree-node";
  nodeDiv.dataset.id = node.id;
  nodeDiv.style.paddingLeft = `${level * 20}px`;

  const content = document.createElement("div");
  content.className = "node-content";

  // Checkbox
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "node-checkbox";
  checkbox.checked = node.selected;
  checkbox.dataset.nodeId = node.id;
  content.appendChild(checkbox);

  // Expand/collapse for folders with children
  if (node.type === "folder" && node.children && node.children.length > 0) {
    const expand = document.createElement("span");
    expand.className = "node-expand";
    expand.textContent = "▶";
    expand.dataset.nodeId = node.id;
    if (node.expanded) {
      expand.classList.add("expanded");
    }
    content.appendChild(expand);
  } else if (node.type === "folder") {
    // Empty folder - add spacer
    const spacer = document.createElement("span");
    spacer.style.width = "16px";
    spacer.style.display = "inline-block";
    content.appendChild(spacer);
  }

  // Icon
  const icon = document.createElement("span");
  icon.className = "node-icon";
  icon.textContent = node.type === "folder" ? "📁" : "🔖";
  content.appendChild(icon);

  // Title with highlighting
  const title = document.createElement("span");
  title.className = "node-title";
  title.title = node.title; // Tooltip for long names

  // Highlight matching text if search is active
  if (searchQuery && node.title.toLowerCase().includes(searchQuery)) {
    const regex = new RegExp(`(${searchQuery})`, "gi");
    const highlightedText = node.title.replace(
      regex,
      '<mark style="background: #ffeb3b; padding: 2px 4px; border-radius: 2px;">$1</mark>'
    );
    title.innerHTML = highlightedText;
  } else {
    title.textContent = node.title;
  }

  content.appendChild(title);

  nodeDiv.appendChild(content);

  // Children container for folders
  if (node.type === "folder" && node.children && node.children.length > 0) {
    const childrenDiv = document.createElement("div");
    childrenDiv.className = "node-children";
    childrenDiv.dataset.parentId = node.id;

    if (node.expanded) {
      childrenDiv.classList.add("expanded");
    }

    // Render children
    node.children.forEach((child) =>
      renderBookmarkTree(child, childrenDiv, level + 1)
    );

    nodeDiv.appendChild(childrenDiv);
  }

  container.appendChild(nodeDiv);
}

// Re-render the entire tree
function refreshTree() {
  const treeContainer = document.getElementById("scopeTree");
  if (!treeContainer) return;

  if (!bookmarkTreeRoot) {
    showEmptyState(treeContainer);
    return;
  }

  treeContainer.innerHTML = "";
  renderBookmarkTree(bookmarkTreeRoot, treeContainer);
}

// Show loading state
function showLoadingState(container) {
  container.innerHTML = `
    <div style="padding: 40px 20px; text-align: center; color: #667eea;">
      <div style="font-size: 24px; margin-bottom: 10px;">⏳</div>
      <div style="font-size: 13px; font-weight: 500;">Loading bookmarks...</div>
    </div>
  `;
}

// Show empty state
function showEmptyState(container) {
  container.innerHTML = `
    <div style="padding: 40px 20px; text-align: center; color: #999;">
      <div style="font-size: 24px; margin-bottom: 10px;">📚</div>
      <div style="font-size: 13px; font-weight: 500;">No bookmarks found</div>
      <div style="font-size: 11px; margin-top: 5px;">Add some bookmarks to get started</div>
    </div>
  `;
}

// Show error state
function showErrorState(container, errorMessage) {
  container.innerHTML = `
    <div style="padding: 40px 20px; text-align: center; color: #e53e3e;">
      <div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>
      <div style="font-size: 13px; font-weight: 500;">Error loading bookmarks</div>
      <div style="font-size: 11px; margin-top: 5px;">${
        errorMessage || "Please try again"
      }</div>
    </div>
  `;
}

// Toggle folder expand/collapse
function toggleFolderExpand(nodeId) {
  const node = findNodeById(nodeId);
  if (!node || node.type !== "folder") return;

  node.expanded = !node.expanded;

  // Update expanded set
  if (node.expanded) {
    expandedFolderIds.add(nodeId);
  } else {
    expandedFolderIds.delete(nodeId);
  }

  // Re-render tree
  refreshTree();
}

// Expand all folders
function expandAllFolders(node = bookmarkTreeRoot) {
  if (!node) return;

  if (node.type === "folder") {
    node.expanded = true;
    expandedFolderIds.add(node.id);
  }

  if (
    node.children &&
    Array.isArray(node.children) &&
    node.children.length > 0
  ) {
    node.children.forEach((child) => expandAllFolders(child));
  }
}

// Collapse all folders
function collapseAllFolders(node = bookmarkTreeRoot) {
  if (!node) return;

  if (node.type === "folder") {
    node.expanded = false;
    expandedFolderIds.delete(node.id);
  }

  if (
    node.children &&
    Array.isArray(node.children) &&
    node.children.length > 0
  ) {
    node.children.forEach((child) => collapseAllFolders(child));
  }
}

// Handle checkbox change
function handleNodeCheckboxChange(nodeId, checked) {
  const node = findNodeById(nodeId);
  if (!node) return;

  node.selected = checked;

  // Update selected set
  if (checked) {
    selectedBookmarkIds.add(nodeId);
  } else {
    selectedBookmarkIds.delete(nodeId);
  }

  // Update all children recursively
  if (node.type === "folder" && node.children && node.children.length > 0) {
    updateChildrenSelection(node, checked);
  }

  // Update button text
  updateScopeButtonText();

  // Save selection state
  saveScopeSelection();

  // Re-render tree
  refreshTree();
}

// Update children selection recursively
function updateChildrenSelection(node, selected) {
  if (!node.children || !Array.isArray(node.children)) return;

  node.children.forEach((child) => {
    child.selected = selected;

    if (selected) {
      selectedBookmarkIds.add(child.id);
    } else {
      selectedBookmarkIds.delete(child.id);
    }

    if (
      child.type === "folder" &&
      child.children &&
      Array.isArray(child.children) &&
      child.children.length > 0
    ) {
      updateChildrenSelection(child, selected);
    }
  });
}

// Select all items
function selectAllItems(node = bookmarkTreeRoot) {
  if (!node) return;

  node.selected = true;
  selectedBookmarkIds.add(node.id);

  if (
    node.children &&
    Array.isArray(node.children) &&
    node.children.length > 0
  ) {
    node.children.forEach((child) => selectAllItems(child));
  }
}

// Clear all selections
function clearAllSelections(node = bookmarkTreeRoot) {
  if (!node) return;

  node.selected = false;
  selectedBookmarkIds.delete(node.id);

  if (
    node.children &&
    Array.isArray(node.children) &&
    node.children.length > 0
  ) {
    node.children.forEach((child) => clearAllSelections(child));
  }
}

// Save selection state to storage
function saveScopeSelection() {
  const selectedIds = Array.from(selectedBookmarkIds);
  chrome.storage.local.set({
    scopeSelection: {
      selectedIds: selectedIds,
      timestamp: Date.now(),
    },
  });
}

// Load selection state from storage
async function loadScopeSelection() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ["scopeSelection", "lastSearchTimestamp"],
      (data) => {
        // Check if a search was performed since last save
        if (data.lastSearchTimestamp && data.scopeSelection) {
          const selectionTime = data.scopeSelection.timestamp || 0;
          if (data.lastSearchTimestamp > selectionTime) {
            // Search was performed - reset to all selected
            resolve(null);
            return;
          }
        }

        // Restore previous selection
        resolve(data.scopeSelection);
      }
    );
  });
}

// Apply saved selection to tree
function applySavedSelection(savedSelection) {
  if (!savedSelection || !savedSelection.selectedIds) return;

  // Clear current selection
  selectedBookmarkIds.clear();
  clearAllSelections();

  // Apply saved selection
  const savedIds = new Set(savedSelection.selectedIds);
  applySelectionToTree(bookmarkTreeRoot, savedIds);

  updateScopeButtonText();
}

// Recursively apply selection to tree nodes
function applySelectionToTree(node, savedIds) {
  if (!node) return;

  if (savedIds.has(node.id)) {
    node.selected = true;
    selectedBookmarkIds.add(node.id);
  } else {
    node.selected = false;
  }

  if (
    node.children &&
    Array.isArray(node.children) &&
    node.children.length > 0
  ) {
    node.children.forEach((child) => applySelectionToTree(child, savedIds));
  }
}

// Save search timestamp
function saveSearchTimestamp() {
  chrome.storage.local.set({
    lastSearchTimestamp: Date.now(),
  });
}

// Validate scope selection before search
function validateScopeSelection() {
  const selectedCount = selectedBookmarkIds.size;

  if (selectedCount === 0) {
    return {
      valid: false,
      error: "⚠️ Please select at least one folder or bookmark to search in",
    };
  }

  return {
    valid: true,
    error: null,
  };
}

// NOTE: Call validateScopeSelection() before executing search
// Example usage in search button click handler:
// const validation = validateScopeSelection();
// if (!validation.valid) {
//   errorDiv.textContent = validation.error;
//   errorDiv.className = 'error';
//   return;
// }

// Get selected bookmark IDs for search filtering
function getSelectedBookmarkIdsForSearch() {
  // If all selected, return null to indicate no filtering needed
  if (isAllSelected()) {
    return null;
  }

  // Return array of selected IDs
  return Array.from(selectedBookmarkIds);
}

// Filter search results based on scope selection
function filterSearchResults(results) {
  const selectedIds = getSelectedBookmarkIdsForSearch();

  // If no filtering needed (all selected), return all results
  if (!selectedIds) {
    return results;
  }

  // Create a Set for faster lookup
  const selectedIdsSet = new Set(selectedIds);

  // Filter results to only include bookmarks in selected scope
  return results.filter((result) => {
    // Check if the bookmark ID is in the selected set
    // Note: result.id should match the bookmark ID from Chrome API
    return selectedIdsSet.has(result.id);
  });
}

// NOTE: Integration with search function
// 1. Before search: const validation = validateScopeSelection();
// 2. Get selected IDs: const selectedIds = getSelectedBookmarkIdsForSearch();
// 3. Pass selectedIds to background script or use for filtering
// 4. After getting results: const filteredResults = filterSearchResults(results);
// 5. After successful search: saveSearchTimestamp();

// Update scope button text based on selection
function updateScopeButtonText() {
  const scopeText = document.getElementById("scopeText");
  const scopeBtn = document.getElementById("scopeFilterBtn");

  if (!scopeText || !bookmarkTreeRoot) return;

  if (isAllSelected()) {
    scopeText.textContent = "Search in: All bookmarks";
    scopeBtn.classList.remove("filtered");
  } else {
    const count = countSelectedItems();
    scopeText.textContent = `Search in: ${count} items 🔎`;
    scopeBtn.classList.add("filtered");
  }
}

// Filter tree based on search query
let searchQuery = "";

function filterTree(query) {
  if (!bookmarkTreeRoot) return; // Don't filter if tree not loaded

  searchQuery = query.toLowerCase().trim();

  if (!searchQuery) {
    // Clear filter - show all nodes
    showAllNodes(bookmarkTreeRoot);
  } else {
    // Apply filter
    filterNode(bookmarkTreeRoot);
  }

  refreshTree();
}

// Filter a single node and its children
function filterNode(node) {
  if (!node) return false;

  const titleMatch = node.title.toLowerCase().includes(searchQuery);
  let hasMatchingChild = false;

  // Check children recursively
  if (
    node.children &&
    Array.isArray(node.children) &&
    node.children.length > 0
  ) {
    node.children.forEach((child) => {
      if (filterNode(child)) {
        hasMatchingChild = true;
      }
    });
  }

  // Show node if it matches or has matching children
  const shouldShow = titleMatch || hasMatchingChild;
  node.hidden = !shouldShow;

  // Auto-expand folders with matching children
  if (hasMatchingChild && node.type === "folder") {
    node.expanded = true;
    expandedFolderIds.add(node.id);
  }

  return shouldShow;
}

// Show all nodes (clear filter)
function showAllNodes(node) {
  if (!node) return;

  node.hidden = false;

  if (
    node.children &&
    Array.isArray(node.children) &&
    node.children.length > 0
  ) {
    node.children.forEach((child) => showAllNodes(child));
  }
}

// Debounce function for search input
let searchDebounceTimer;

function debounceSearch(query) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    filterTree(query);
  }, 300);
}

// Show scope filter dropdown
async function showScopeDropdown() {
  const dropdown = document.getElementById("scopeDropdown");
  const arrow = document.getElementById("scopeArrow");
  const treeContainer = document.getElementById("scopeTree");

  // Show dropdown first
  dropdown.style.display = "block";
  arrow.classList.add("open");

  // Build tree if not already built
  if (!bookmarkTreeRoot) {
    // Show loading state
    showLoadingState(treeContainer);

    try {
      await buildBookmarkTree();

      if (!bookmarkTreeRoot) {
        // Show empty state if no bookmarks
        showEmptyState(treeContainer);
        return;
      }

      // Load saved selection
      const savedSelection = await loadScopeSelection();
      if (savedSelection) {
        applySavedSelection(savedSelection);
      }
    } catch (error) {
      // Show error state
      showErrorState(treeContainer, error.message);
      return;
    }
  }

  // Render tree
  refreshTree();
}

// Close scope dropdown
function closeScopeDropdown() {
  const dropdown = document.getElementById("scopeDropdown");
  const arrow = document.getElementById("scopeArrow");

  dropdown.style.display = "none";
  arrow.classList.remove("open");
}

// Toggle scope dropdown
async function toggleScopeDropdown() {
  const dropdown = document.getElementById("scopeDropdown");

  if (dropdown.style.display === "block") {
    closeScopeDropdown();
  } else {
    await showScopeDropdown();
  }
}

// Event listener for scope filter button
document.getElementById("scopeFilterBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  toggleScopeDropdown();
});

// Quick action buttons
document.getElementById("selectAllBtn").addEventListener("click", () => {
  selectAllItems();
  updateScopeButtonText();
  saveScopeSelection();
  refreshTree();
});

document.getElementById("clearAllBtn").addEventListener("click", () => {
  clearAllSelections();
  updateScopeButtonText();
  saveScopeSelection();
  refreshTree();
});

document.getElementById("expandAllBtn").addEventListener("click", () => {
  expandAllFolders();
  refreshTree();
});

document.getElementById("minimizeAllBtn").addEventListener("click", () => {
  collapseAllFolders();
  refreshTree();
});

// Search input with debounce
document.getElementById("scopeSearch").addEventListener("input", (e) => {
  debounceSearch(e.target.value);
});

// Event delegation for tree interactions
document.getElementById("scopeTree").addEventListener("click", (e) => {
  // Handle checkbox clicks
  if (e.target.classList.contains("node-checkbox")) {
    const nodeId = e.target.dataset.nodeId;
    handleNodeCheckboxChange(nodeId, e.target.checked);
  }

  // Handle expand/collapse clicks
  if (e.target.classList.contains("node-expand")) {
    const nodeId = e.target.dataset.nodeId;
    toggleFolderExpand(nodeId);
  }
});

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  const dropdown = document.getElementById("scopeDropdown");
  const btn = document.getElementById("scopeFilterBtn");

  if (
    dropdown &&
    dropdown.style.display === "block" &&
    !dropdown.contains(e.target) &&
    !btn.contains(e.target)
  ) {
    closeScopeDropdown();
  }
});

// Close dropdown on Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const dropdown = document.getElementById("scopeDropdown");
    if (dropdown && dropdown.style.display === "block") {
      closeScopeDropdown();
    }
  }
});
