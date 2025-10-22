// IndexedDB for search history
let db;
const DB_NAME = 'SearchHistoryDB';
const STORE_NAME = 'searches';

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

function formatDateTime(isoString) {
  const date = new Date(isoString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
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

// Event listeners
document.getElementById('historyBackBtn').addEventListener('click', () => {
  window.close();
});

document.getElementById('historySearch').addEventListener('input', debounce(loadAndDisplayHistory, 300));
document.getElementById('searchMode').addEventListener('change', loadAndDisplayHistory);
document.getElementById('quickFilter').addEventListener('change', loadAndDisplayHistory);
document.getElementById('applyCustomFilter').addEventListener('click', loadAndDisplayHistory);
document.getElementById('clearCustomFilter').addEventListener('click', clearCustomDateRange);
document.getElementById('deleteAllHistory').addEventListener('click', deleteAllHistory);

// Initialize
initDB().then(() => {
  loadAndDisplayHistory();
}).catch(console.error);
