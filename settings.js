// Load saved settings
function loadSettings() {
  chrome.storage.local.get(['searchMode', 'simpleSearchType', 'ollamaUrl', 'ollamaModel', 'apiProvider', 'apiKey', 'apiModel'], (data) => {
    // Set search mode
    if (data.searchMode === 'ai') {
      document.getElementById('aiMode').checked = true;
      document.getElementById('aiSettings').style.display = 'block';
      document.getElementById('simpleSettings').style.display = 'none';
    } else {
      document.getElementById('simpleMode').checked = true;
      document.getElementById('simpleSettings').style.display = 'block';
      document.getElementById('aiSettings').style.display = 'none';
    }

    // Set simple search type
    if (data.simpleSearchType === 'fuzzy') {
      document.getElementById('fuzzySearch').checked = true;
    } else {
      document.getElementById('exactSearch').checked = true;
    }

    // Load AI settings
    if (data.ollamaUrl) document.getElementById('ollamaUrl').value = data.ollamaUrl;
    if (data.ollamaModel) document.getElementById('ollamaModel').value = data.ollamaModel;
    if (data.apiProvider) document.getElementById('apiProvider').value = data.apiProvider;
    if (data.apiKey) document.getElementById('apiKey').value = data.apiKey;
    if (data.apiModel) document.getElementById('apiModel').value = data.apiModel;
  });
}

// Back button
document.getElementById('backBtn').addEventListener('click', () => {
  window.location.href = 'popup.html';
});

// Toggle search mode
document.querySelectorAll('input[name="searchMode"]').forEach((radio) => {
  radio.addEventListener('change', (e) => {
    const aiSettings = document.getElementById('aiSettings');
    const simpleSettings = document.getElementById('simpleSettings');
    
    if (e.target.value === 'ai') {
      aiSettings.style.display = 'block';
      simpleSettings.style.display = 'none';
    } else {
      aiSettings.style.display = 'none';
      simpleSettings.style.display = 'block';
    }
  });
});

// Collapsible functionality
document.querySelectorAll('.collapsible-header').forEach((header) => {
  header.addEventListener('click', () => {
    const targetId = header.getAttribute('data-target');
    const content = document.getElementById(targetId);

    header.classList.toggle('active');
    content.classList.toggle('active');
  });
});

// Save settings
document.getElementById('saveBtn').addEventListener('click', () => {
  const searchMode = document.querySelector('input[name="searchMode"]:checked').value;
  const simpleSearchType = document.querySelector('input[name="simpleSearchType"]:checked').value;
  
  const settings = {
    searchMode: searchMode,
    simpleSearchType: simpleSearchType,
    ollamaUrl: document.getElementById('ollamaUrl').value.trim(),
    ollamaModel: document.getElementById('ollamaModel').value.trim(),
    apiProvider: document.getElementById('apiProvider').value,
    apiKey: document.getElementById('apiKey').value.trim(),
    apiModel: document.getElementById('apiModel').value.trim()
  };

  chrome.storage.local.set(settings, () => {
    const saveStatus = document.getElementById('saveStatus');
    saveStatus.className = 'success';
    saveStatus.textContent = '✓ Settings saved successfully!';
    
    setTimeout(() => {
      window.location.href = 'popup.html';
    }, 1000);
  });
});

// Load settings on page open
loadSettings();
