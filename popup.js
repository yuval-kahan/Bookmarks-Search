// RAW data storage for debugging
let lastRawData = {
  sent: null,
  received: null
};

// IndexedDB for search history
let db;
const DB_NAME = 'SearchHistoryDB';
const STORE_NAME = 'searches';
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
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        objectStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

function saveSearchToHistory(query, results) {
  if (!db) return;
  
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  
  const searchRecord = {
    query: query,
    results: results,
    timestamp: new Date().toISOString()
  };
  
  store.add(searchRecord);
  
  // Keep only last 100 records
  const index = store.index('timestamp');
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
      reject('Database not initialized');
      return;
    }
    
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev'); // Reverse order (newest first)
    
    const history = [];
    
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        history.push({
          id: cursor.primaryKey,
          ...cursor.value
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
      reject('Database not initialized');
      return;
    }
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const deleteRequest = store.delete(id);
    
    deleteRequest.onsuccess = () => resolve();
    deleteRequest.onerror = () => reject(deleteRequest.error);
  });
}

function clearAllSearchHistory() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject('Database not initialized');
      return;
    }
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
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
    console.error('Error deleting history item:', error);
    alert('Failed to delete history item');
  }
}

async function deleteAllHistory() {
  const confirmed = confirm('Are you sure you want to delete all search history? This action cannot be undone.');
  
  if (confirmed) {
    try {
      await clearAllSearchHistory();
      await loadAndDisplayHistory();
      const emptyState = document.getElementById('emptyState');
      emptyState.style.display = 'block';
      emptyState.querySelector('.empty-message').textContent = 'History cleared successfully';
    } catch (error) {
      console.error('Error clearing history:', error);
      alert('Failed to clear history');
    }
  }
}

// Initialize DB on load
initDB().catch(console.error);

// Load Use Prompt state
function loadUsePromptState() {
  chrome.storage.local.get(['usePrompt'], (data) => {
    const usePrompt = data.usePrompt !== undefined ? data.usePrompt : true;
    document.getElementById('usePromptCheckbox').checked = usePrompt;
  });
}

// Save Use Prompt state
function saveUsePromptState() {
  const usePrompt = document.getElementById('usePromptCheckbox').checked;
  chrome.storage.local.set({ usePrompt: usePrompt });
}

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

// Use Prompt checkbox event listener
document.getElementById('usePromptCheckbox').addEventListener('change', saveUsePromptState);

// Update indicator on load
updateSearchModeIndicator();

// Load Use Prompt state on page load
loadUsePromptState();

// State management functions
function savePopupState(state) {
  chrome.storage.local.set({ popupState: state });
}

function restorePopupState() {
  chrome.storage.local.get(['popupState'], (data) => {
    if (data.popupState) {
      const state = data.popupState;
      
      // Restore query
      if (state.query) {
        document.getElementById('query').value = state.query;
        autoResizeTextarea();
      }
      
      // Restore results
      if (state.results && state.results.length > 0) {
        displayResults(state.results);
      }
      
      // Restore search status
      if (state.isSearching) {
        document.getElementById('status').textContent = 'Searching with AI...';
        document.getElementById('searchBtn').disabled = true;
        document.getElementById('searchBtn').style.opacity = '0.6';
        document.getElementById('stopBtn').classList.add('visible');
        searchInProgress = true;
      }
      
      // Restore error
      if (state.error) {
        const errorDiv = document.getElementById('error');
        errorDiv.textContent = state.error;
        errorDiv.className = 'error';
      }
    }
  });
}

// Restore state on load
restorePopupState();

// Auto-resize textarea
function autoResizeTextarea() {
  const textarea = document.getElementById('query');
  
  // Reset height to get accurate scrollHeight
  textarea.style.height = 'auto';
  
  // Set new height based on content
  const newHeight = Math.min(textarea.scrollHeight, 200); // Max 200px
  textarea.style.height = newHeight + 'px';
  
  // Show scrollbar if content exceeds max height
  if (textarea.scrollHeight > 200) {
    textarea.style.overflowY = 'auto';
  } else {
    textarea.style.overflowY = 'hidden';
  }
}

// Add event listener for textarea auto-resize
const queryTextarea = document.getElementById('query');
queryTextarea.addEventListener('input', autoResizeTextarea);
queryTextarea.addEventListener('change', autoResizeTextarea);

// Initial resize
autoResizeTextarea();

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
    error: null
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
                  error: errorMsg
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
                  error: errorMsg
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
                  error: errorMsg
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
      query: document.getElementById('query').value,
      isSearching: false,
      results: [],
      error: 'Search cancelled'
    });
    return;
  }

  if (results.length === 0) {
    list.innerHTML = "<li>No bookmarks found</li>";
    // Save no results state
    savePopupState({
      query: document.getElementById('query').value,
      isSearching: false,
      results: [],
      error: null
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
  const query = document.getElementById('query').value;
  savePopupState({
    query: query,
    isSearching: false,
    results: results,
    error: null
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
  document.getElementById('historyScreen').style.display = 'block';
  loadAndDisplayHistory();
}

function closeHistoryScreen() {
  document.getElementById('historyScreen').style.display = 'none';
  // Reset filters when closing
  document.getElementById('historySearch').value = '';
  document.getElementById('searchMode').value = 'fuzzy';
  document.getElementById('quickFilter').value = 'all';
  clearCustomDateRange();
}

function openHistoryDetail(historyItem) {
  document.getElementById('historyDetailScreen').style.display = 'block';
  displayHistoryDetail(historyItem);
}

function closeHistoryDetail() {
  document.getElementById('historyDetailScreen').style.display = 'none';
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = date.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
  return { date: dateStr, time: timeStr };
}

// Filter functions
function applySearchFilter(history, query) {
  const mode = document.getElementById('searchMode').value;
  
  if (mode === 'fuzzy') {
    return history.filter(item => 
      fuzzyMatch(item.query.toLowerCase(), query.toLowerCase())
    );
  } else {
    return history.filter(item => 
      item.query.toLowerCase().includes(query.toLowerCase())
    );
  }
}

function applyQuickFilter(history, filter) {
  const now = new Date();
  let startDate;
  
  switch (filter) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'yesterday':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return history.filter(item => {
        const itemDate = new Date(item.timestamp);
        return itemDate >= startDate && itemDate < endDate;
      });
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      return history;
  }
  
  return history.filter(item => {
    const itemDate = new Date(item.timestamp);
    return itemDate >= startDate;
  });
}

function getCustomDateRange() {
  const fromDate = document.getElementById('fromDate').value;
  const fromTime = document.getElementById('fromTime').value;
  const toDate = document.getElementById('toDate').value;
  const toTime = document.getElementById('toTime').value;
  
  if (!fromDate || !toDate) return null;
  
  const startDateTime = new Date(`${fromDate}T${fromTime || '00:00'}`);
  const endDateTime = new Date(`${toDate}T${toTime || '23:59'}`);
  
  return { start: startDateTime.getTime(), end: endDateTime.getTime() };
}

function applyCustomDateFilter(history, customRange) {
  return history.filter(item => {
    const itemDate = new Date(item.timestamp);
    const itemTime = itemDate.getTime();
    return itemTime >= customRange.start && itemTime <= customRange.end;
  });
}

function applyAllFilters(history) {
  let filtered = history;
  
  // Apply search filter
  const searchQuery = document.getElementById('historySearch').value;
  if (searchQuery) {
    filtered = applySearchFilter(filtered, searchQuery);
  }
  
  // Apply custom date range if set (takes precedence over quick filter)
  const customRange = getCustomDateRange();
  if (customRange) {
    filtered = applyCustomDateFilter(filtered, customRange);
  } else {
    // Apply quick filter only if no custom range
    const quickFilter = document.getElementById('quickFilter').value;
    if (quickFilter !== 'all') {
      filtered = applyQuickFilter(filtered, quickFilter);
    }
  }
  
  return filtered;
}

function clearCustomDateRange() {
  document.getElementById('fromDate').value = '';
  document.getElementById('fromTime').value = '';
  document.getElementById('toDate').value = '';
  document.getElementById('toTime').value = '';
  loadAndDisplayHistory();
}

async function loadAndDisplayHistory() {
  try {
    const history = await loadSearchHistory();
    const historyList = document.getElementById('historyList');
    const emptyState = document.getElementById('emptyState');
    
    // Apply all filters
    const filtered = applyAllFilters(history);
    
    if (history.length === 0) {
      historyList.innerHTML = '';
      emptyState.style.display = 'block';
      emptyState.querySelector('.empty-message').textContent = 'No search history yet';
      return;
    }
    
    if (filtered.length === 0) {
      historyList.innerHTML = '';
      emptyState.style.display = 'block';
      emptyState.querySelector('.empty-message').textContent = 'No results found for the current filters';
      return;
    }
    
    emptyState.style.display = 'none';
    historyList.innerHTML = '';
    
    filtered.forEach((item) => {
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      historyItem.dataset.id = item.id;
      
      const historyContent = document.createElement('div');
      historyContent.className = 'history-content';
      historyContent.innerHTML = `
        <div class="history-time">🕐 ${formatDateTime(item.timestamp)}</div>
        <div class="history-query">${item.query}</div>
        <div class="history-count">→ ${item.results.length} results</div>
      `;
      
      historyContent.addEventListener('click', () => {
        openHistoryDetail(item);
      });
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-item-btn';
      deleteBtn.textContent = '🗑️';
      deleteBtn.title = 'Delete this search';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteHistoryItem(item.id);
      });
      
      historyItem.appendChild(historyContent);
      historyItem.appendChild(deleteBtn);
      historyList.appendChild(historyItem);
    });
  } catch (error) {
    console.error('Error loading history:', error);
    const historyList = document.getElementById('historyList');
    const emptyState = document.getElementById('emptyState');
    historyList.innerHTML = '';
    emptyState.style.display = 'block';
    emptyState.querySelector('.empty-message').textContent = 'Error loading history';
  }
}

function displayHistoryDetail(historyItem) {
  const detailContent = document.getElementById('historyDetailContent');
  
  let resultsHTML = '';
  if (historyItem.results.length === 0) {
    resultsHTML = '<div style="padding: 10px; color: #999;">No results found</div>';
  } else {
    resultsHTML = '<ul style="list-style: none; padding: 0;">';
    historyItem.results.forEach((result) => {
      resultsHTML += `
        <li style="margin-bottom: 8px; padding: 10px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid #667eea;">
          <a href="${result.url}" target="_blank" style="color: #333; text-decoration: none; font-size: 13px; display: block; word-break: break-word;">
            ${result.title || result.url}
          </a>
        </li>
      `;
    });
    resultsHTML += '</ul>';
  }
  
  detailContent.innerHTML = `
    <div class="history-time" style="margin-bottom: 10px;">🕐 ${formatDateTime(historyItem.timestamp)}</div>
    <div class="history-detail-query">${historyItem.query}</div>
    <div class="history-results-title">📌 Results (${historyItem.results.length}):</div>
    ${resultsHTML}
  `;
}

// Event listeners for history
document.getElementById('historyBtn').addEventListener('click', openHistoryScreen);
document.getElementById('historyBackBtn').addEventListener('click', closeHistoryScreen);
document.getElementById('historyDetailBackBtn').addEventListener('click', closeHistoryDetail);

// Event listeners for history filters
document.getElementById('historySearch').addEventListener('input', debounce(loadAndDisplayHistory, 300));
document.getElementById('searchMode').addEventListener('change', loadAndDisplayHistory);
document.getElementById('quickFilter').addEventListener('change', loadAndDisplayHistory);
document.getElementById('applyCustomFilter').addEventListener('click', loadAndDisplayHistory);
document.getElementById('clearCustomFilter').addEventListener('click', clearCustomDateRange);
document.getElementById('deleteAllHistory').addEventListener('click', deleteAllHistory);

// RAW Data Modal functions - inject into active tab
async function openRawModal() {
  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.id) {
      openRawModalInNewTab();
      return;
    }
    
    // Try to send message to content script
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'showRawModal',
        rawData: {
          sent: lastRawData.sent || 'No data sent yet. Perform a search to see the data.',
          received: lastRawData.received || 'No data received yet. Perform a search to see the data.'
        }
      });
    } catch (err) {
      // Content script not loaded, open in new tab instead
      console.log('Content script not available, opening in new tab');
      openRawModalInNewTab();
    }
  } catch (error) {
    console.error('Error opening RAW modal:', error);
    openRawModalInNewTab();
  }
}

// Fallback: Open RAW data in a new tab
function openRawModalInNewTab() {
  const rawData = {
    sent: lastRawData.sent || 'No data sent yet. Perform a search to see the data.',
    received: lastRawData.received || 'No data received yet. Perform a search to see the data.'
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
      <div class="section-content">${rawData.sent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    </div>
    <div class="section">
      <div class="section-title">📥 Received from AI:</div>
      <div class="section-content received">${rawData.received.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    </div>
  </div>
</body>
</html>
  `;
  
  // Open in new tab
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  chrome.tabs.create({ url: url });
}

// Event listener for RAW button
document.getElementById('rawBtn').addEventListener('click', openRawModal);

// Listen for batch progress messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'batchProgress') {
    const progressDiv = document.getElementById('batchProgress');
    const progressText = document.getElementById('batchProgressText');
    const progressBar = document.getElementById('batchProgressBar');
    const progressTitle = document.getElementById('batchProgressTitle');
    
    // Show progress
    progressDiv.style.display = 'block';
    
    // Calculate percentage
    const percentage = (message.current / message.total) * 100;
    
    // Update based on view mode
    if (progressViewMode === 'percentage') {
      // Percentage mode - show only percentage
      progressTitle.textContent = '📦 Processing...';
      progressText.textContent = `${Math.round(percentage)}%`;
    } else {
      // Batch mode - show batch details
      progressTitle.textContent = '📦 Processing batches...';
      progressText.textContent = `Batch ${message.current} of ${message.total}`;
    }
    
    // Update progress bar
    progressBar.style.width = `${percentage}%`;
    
    // Hide when complete
    if (message.current === message.total) {
      setTimeout(() => {
        progressDiv.style.display = 'none';
      }, 1000);
    }
  }
});

// Hide progress on new search
const originalSearchFunction = document.getElementById('searchBtn').onclick;
document.getElementById('searchBtn').addEventListener('click', () => {
  const progressDiv = document.getElementById('batchProgress');
  progressDiv.style.display = 'none';
  // Reset progress display for next search
  updateProgressDisplay();
});

// Progress view toggle (batch details vs percentage only)
let progressViewMode = 'percentage'; // 'batch' or 'percentage' - default is percentage

// Load progress view preference
chrome.storage.local.get(['progressViewMode'], (data) => {
  progressViewMode = data.progressViewMode || 'percentage';
});

// Toggle progress view
document.getElementById('progressToggleIcon').addEventListener('click', () => {
  // Only allow toggle if search is actually in progress
  if (!searchInProgress) {
    return; // Do nothing if no search is active
  }
  
  // Toggle mode
  progressViewMode = progressViewMode === 'batch' ? 'percentage' : 'batch';
  
  // Save preference
  chrome.storage.local.set({ progressViewMode });
  
  // Update current display if progress is visible
  const progressDiv = document.getElementById('batchProgress');
  if (progressDiv.style.display !== 'none') {
    updateProgressDisplay();
  }
  
  // Visual feedback - rotate icon
  const icon = document.getElementById('progressToggleIcon');
  icon.style.transform = 'rotate(180deg)';
  setTimeout(() => {
    icon.style.transform = 'rotate(0deg)';
  }, 200);
});

// Update progress display based on mode
function updateProgressDisplay() {
  const titleElement = document.getElementById('batchProgressTitle');
  const textElement = document.getElementById('batchProgressText');
  
  if (progressViewMode === 'percentage') {
    // Percentage mode - show only percentage
    titleElement.textContent = '📦 Processing...';
    // Text will be updated by the message listener to show percentage
  } else {
    // Batch mode - show batch details
    titleElement.textContent = '📦 Processing batches...';
    // Text will be updated by the message listener to show batch number
  }
}

// Clean button functionality
document.getElementById('cleanBtn').addEventListener('click', () => {
  // Clear search input
  document.getElementById('query').value = '';
  
  // Clear results
  document.getElementById('results').innerHTML = '';
  
  // Clear error messages
  document.getElementById('error').textContent = '';
  document.getElementById('error').className = '';
  
  // Clear status messages
  document.getElementById('status').textContent = '';
  
  // Hide batch progress
  document.getElementById('batchProgress').style.display = 'none';
  
  // Reset textarea height
  const textarea = document.getElementById('query');
  textarea.style.height = 'auto';
  
  // Focus back on search input
  textarea.focus();
});

// Disable/enable clean button based on search state
function updateCleanButtonState(isSearching) {
  const cleanBtn = document.getElementById('cleanBtn');
  cleanBtn.disabled = isSearching;
}

// Initialize popup - hide progress indicator on load
document.addEventListener('DOMContentLoaded', () => {
  // Always hide batch progress when popup opens
  const progressDiv = document.getElementById('batchProgress');
  if (progressDiv) {
    progressDiv.style.display = 'none';
  }
  
  // Ensure searchInProgress is false on popup open
  searchInProgress = false;
  
  // Ensure clean button is enabled
  updateCleanButtonState(false);
});
