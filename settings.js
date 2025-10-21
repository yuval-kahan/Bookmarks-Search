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
    // ollamaModel will be loaded from the models list
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
    const parentCollapsible = header.parentElement;

    // Toggle active state
    header.classList.toggle('active');
    content.classList.toggle('active');
    
    // Toggle selected state on parent
    if (content.classList.contains('active')) {
      parentCollapsible.classList.add('selected');
    } else {
      parentCollapsible.classList.remove('selected');
    }
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

// Provider setup instructions
const providerInstructions = {
  azure: {
    title: "Azure OpenAI Setup",
    body: `<strong>Azure OpenAI requires special configuration:</strong>
    
    1. Get your Azure OpenAI endpoint from Azure Portal
    2. In the <strong>Model</strong> field, enter your full endpoint URL:
    <code>https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT</code>
    
    3. In the <strong>API Key</strong> field, enter your Azure API key
    
    <strong>Note:</strong> Make sure your deployment is active in Azure Portal.`
  },
  cloudflare: {
    title: "Cloudflare Workers AI Setup",
    body: `<strong>Cloudflare Workers AI configuration:</strong>
    
    1. Get your Cloudflare Account ID from dashboard
    2. In the <strong>Model</strong> field, enter your Account ID:
    <code>YOUR-ACCOUNT-ID</code>
    
    3. In the <strong>API Key</strong> field, enter your Cloudflare API Token
    
    <strong>Tip:</strong> Create an API token with "Workers AI" permissions.`
  },
  huggingface: {
    title: "Hugging Face Setup",
    body: `<strong>Hugging Face Inference API:</strong>
    
    1. Get your API token from huggingface.co/settings/tokens
    2. In the <strong>Model</strong> field, enter the model path:
    <code>mistralai/Mistral-7B-Instruct-v0.2</code>
    
    3. In the <strong>API Key</strong> field, enter your HF token
    
    <strong>Note:</strong> Free tier has rate limits. Some models may be slow.`
  },
  lepton: {
    title: "Lepton AI Setup",
    body: `<strong>Lepton AI configuration:</strong>
    
    1. Create a deployment at lepton.ai
    2. In the <strong>Model</strong> field, enter your deployment name:
    <code>your-deployment-name</code>
    
    3. In the <strong>API Key</strong> field, enter your Lepton API key
    
    <strong>Note:</strong> The URL will be: <code>your-deployment-name.lepton.run</code>`
  }
};

// Show info modal when complex provider is selected
document.getElementById('apiProvider').addEventListener('change', (e) => {
  const provider = e.target.value;
  
  if (providerInstructions[provider]) {
    const modal = document.getElementById('infoModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    modalTitle.textContent = providerInstructions[provider].title;
    modalBody.innerHTML = providerInstructions[provider].body;
    
    modal.classList.add('active');
  }
});

// Close modal
document.getElementById('modalOkBtn').addEventListener('click', () => {
  document.getElementById('infoModal').classList.remove('active');
});

// Close modal on overlay click
document.getElementById('infoModal').addEventListener('click', (e) => {
  if (e.target.id === 'infoModal') {
    document.getElementById('infoModal').classList.remove('active');
  }
});

// Load available Ollama models
async function loadOllamaModels() {
  const modelSelect = document.getElementById('ollamaModel');
  const refreshBtn = document.getElementById('refreshModelsBtn');
  const ollamaUrl = document.getElementById('ollamaUrl').value.trim() || 'http://localhost:11434';
  
  // Save current selection
  const currentModel = modelSelect.value;
  
  // Disable refresh button
  refreshBtn.disabled = true;
  modelSelect.innerHTML = '<option value="">Loading models...</option>';
  
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.models && data.models.length > 0) {
        modelSelect.innerHTML = '';
        
        // Add models to dropdown
        data.models.forEach(model => {
          const option = document.createElement('option');
          option.value = model.name;
          option.textContent = `${model.name} (${formatSize(model.size)})`;
          modelSelect.appendChild(option);
        });
        
        // Restore previous selection or select first model
        if (currentModel && data.models.some(m => m.name === currentModel)) {
          modelSelect.value = currentModel;
        } else if (data.models.length > 0) {
          modelSelect.value = data.models[0].name;
        }
        
        // Save the selected model
        chrome.storage.local.set({ ollamaModel: modelSelect.value });
      } else {
        modelSelect.innerHTML = '<option value="">No models installed</option>';
      }
    } else {
      throw new Error('Failed to fetch models');
    }
  } catch (error) {
    modelSelect.innerHTML = '<option value="">Ollama not running</option>';
  } finally {
    refreshBtn.disabled = false;
  }
  
  // Update status after loading models
  await checkOllamaStatus();
}

// Format file size
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

// Check Ollama CORS configuration
async function checkOllamaCors() {
  const corsStatusDiv = document.getElementById('ollamaCorsStatus');
  const corsStatusText = corsStatusDiv.querySelector('.status-text');
  const setupWarning = document.getElementById('ollamaSetupWarning');
  const ollamaUrl = document.getElementById('ollamaUrl').value.trim() || 'http://localhost:11434';
  const ollamaModel = document.getElementById('ollamaModel').value;
  
  if (!ollamaModel) {
    corsStatusDiv.style.display = 'none';
    setupWarning.style.display = 'block';
    return;
  }
  
  corsStatusDiv.style.display = 'flex';
  corsStatusDiv.className = 'status-indicator checking';
  corsStatusText.textContent = 'Checking CORS...';
  
  // Send quick test to background
  chrome.runtime.sendMessage(
    {
      action: 'testOllamaCors',
      ollamaUrl: ollamaUrl,
      ollamaModel: ollamaModel
    },
    (response) => {
      if (response.success) {
        corsStatusDiv.className = 'status-indicator active';
        corsStatusText.textContent = '✓ CORS configured - Ready to use';
        // Hide setup warning if CORS is working
        setupWarning.style.display = 'none';
      } else {
        corsStatusDiv.className = 'status-indicator inactive';
        corsStatusText.textContent = '✗ First init needed - Run setup command above';
        // Show setup warning if CORS is not working
        setupWarning.style.display = 'block';
      }
    }
  );
}

// Check Ollama status
async function checkOllamaStatus() {
  const statusDiv = document.getElementById('ollamaStatus');
  const statusText = statusDiv.querySelector('.status-text');
  
  statusDiv.className = 'status-indicator checking';
  statusText.textContent = 'Checking...';
  
  try {
    const ollamaUrl = document.getElementById('ollamaUrl').value.trim() || 'http://localhost:11434';
    
    // Check if Ollama is running
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });
    
    if (response.ok) {
      const data = await response.json();
      const modelName = document.getElementById('ollamaModel').value;
      
      if (data.models && data.models.length > 0) {
        const modelExists = data.models.some(m => m.name === modelName);
        
        if (modelExists) {
          statusDiv.className = 'status-indicator active';
          statusText.textContent = `✓ Active - ${data.models.length} model(s) available`;
          
          // Check CORS after confirming Ollama is active
          checkOllamaCors();
        } else if (modelName) {
          statusDiv.className = 'status-indicator inactive';
          statusText.textContent = `⚠ Model "${modelName}" not found`;
        } else {
          statusDiv.className = 'status-indicator active';
          statusText.textContent = `✓ Active - ${data.models.length} model(s) available`;
          
          // Check CORS
          checkOllamaCors();
        }
      } else {
        statusDiv.className = 'status-indicator inactive';
        statusText.textContent = '⚠ No models installed';
      }
    } else {
      statusDiv.className = 'status-indicator inactive';
      statusText.textContent = '✗ Ollama not responding';
    }
  } catch (error) {
    statusDiv.className = 'status-indicator inactive';
    statusText.textContent = '✗ Ollama not running';
  }
}

// Refresh models list
document.getElementById('refreshModelsBtn').addEventListener('click', () => {
  loadOllamaModels();
});

// Show error modal
function showErrorModal(title, message) {
  const modal = document.getElementById('infoModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  
  modalTitle.textContent = title;
  modalBody.innerHTML = message;
  modal.classList.add('active');
}

// Test Ollama connection
document.getElementById('testOllamaBtn').addEventListener('click', async () => {
  const btn = document.getElementById('testOllamaBtn');
  const ollamaUrl = document.getElementById('ollamaUrl').value.trim() || 'http://localhost:11434';
  const ollamaModel = document.getElementById('ollamaModel').value;
  
  if (!ollamaModel) {
    showErrorModal('⚠️ No Model Selected', '<strong>Please select a model first.</strong><br><br>If no models appear in the list, install one using:<br><code>ollama pull llama2</code>');
    return;
  }
  
  btn.disabled = true;
  btn.textContent = '🔄 Testing...';
  
  // Send test request to background script
  chrome.runtime.sendMessage(
    {
      action: 'testOllama',
      ollamaUrl: ollamaUrl,
      ollamaModel: ollamaModel
    },
    (response) => {
      if (response.success) {
        btn.textContent = '✓ Test Successful!';
        btn.style.background = '#48bb78';
        
        // Update status
        checkOllamaStatus();
        
        setTimeout(() => {
          btn.textContent = '🧪 Test Connection';
          btn.style.background = '#667eea';
          btn.disabled = false;
        }, 2000);
      } else {
        btn.textContent = '✗ Test Failed';
        btn.style.background = '#e53e3e';
        
        setTimeout(() => {
          btn.textContent = '🧪 Test Connection';
          btn.style.background = '#667eea';
          btn.disabled = false;
        }, 2000);
        
        let errorMessage = `<strong>Error:</strong> ${response.error}<br><br>`;
        
        if (response.error.includes('CORS')) {
          errorMessage += `<strong>🔧 Fix CORS Issue:</strong><br><br>
          <strong>Windows (CMD as Administrator):</strong><br>
          <code>setx OLLAMA_ORIGINS "*"</code><br><br>
          <strong>Windows (PowerShell as Administrator):</strong><br>
          <code>[System.Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', '*', 'Machine')</code><br><br>
          <strong>Then restart Ollama:</strong><br>
          1. Close Ollama completely<br>
          2. Run <code>ollama serve</code> again<br><br>
          <strong>Or use AI Search instead</strong> - it works without CORS issues!`;
        } else {
          errorMessage += `<strong>Make sure:</strong><br>
          1. Ollama is running: <code>ollama serve</code><br>
          2. Model "${ollamaModel}" is installed: <code>ollama pull ${ollamaModel}</code>`;
        }
        
        showErrorModal('❌ Test Failed', errorMessage);
      }
    }
  );
});

// Load models when Ollama section is opened
document.querySelector('[data-target="ollamaContent"]').addEventListener('click', () => {
  setTimeout(() => {
    if (document.getElementById('ollamaContent').classList.contains('active')) {
      loadOllamaModels();
    }
  }, 100);
});

// Reload models when URL changes
document.getElementById('ollamaUrl').addEventListener('change', loadOllamaModels);

// Update status when model changes
document.getElementById('ollamaModel').addEventListener('change', () => {
  checkOllamaStatus();
  // Save selected model
  chrome.storage.local.set({ ollamaModel: document.getElementById('ollamaModel').value });
});

// Load settings on page open
loadSettings();

// Load models when settings page opens (if Ollama section is already open)
setTimeout(() => {
  if (document.getElementById('ollamaContent').classList.contains('active')) {
    loadOllamaModels();
  }
}, 500);
