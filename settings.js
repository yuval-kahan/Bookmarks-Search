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
    if (data.apiProvider) {
      document.getElementById('apiProvider').value = data.apiProvider;
      // Trigger change to load models
      document.getElementById('apiProvider').dispatchEvent(new Event('change'));
      
      // Load saved model
      setTimeout(() => {
        const modelSelect = document.getElementById('apiModelSelect');
        const modelCustom = document.getElementById('apiModelCustom');
        
        if (data.apiModel) {
          // Check if it's in the dropdown
          const optionExists = Array.from(modelSelect.options).some(opt => opt.value === data.apiModel);
          
          if (optionExists) {
            modelSelect.value = data.apiModel;
          } else {
            // It's a custom model
            modelSelect.value = 'custom';
            modelCustom.style.display = 'block';
            modelCustom.value = data.apiModel;
          }
        }
      }, 100);
    }
    if (data.apiKey) document.getElementById('apiKey').value = data.apiKey;
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

// Track selected AI provider (Ollama or API)
let selectedAIProvider = null;

// Collapsible functionality
document.querySelectorAll('.collapsible-header').forEach((header) => {
  header.addEventListener('click', () => {
    const targetId = header.getAttribute('data-target');
    const content = document.getElementById(targetId);
    const parentCollapsible = header.parentElement;

    // Toggle active state (open/close)
    header.classList.toggle('active');
    content.classList.toggle('active');
    
    // For AI settings (Ollama and API), handle selection
    if (targetId === 'ollamaContent' || targetId === 'apiContent') {
      // Remove selected from all AI collapsibles
      document.querySelectorAll('#aiSettings .collapsible').forEach(c => {
        c.classList.remove('selected');
      });
      
      // If opening, mark as selected
      if (content.classList.contains('active')) {
        parentCollapsible.classList.add('selected');
        selectedAIProvider = targetId === 'ollamaContent' ? 'ollama' : 'api';
      } else {
        selectedAIProvider = null;
      }
    }
  });
});

// Save settings
document.getElementById('saveBtn').addEventListener('click', () => {
  const searchMode = document.querySelector('input[name="searchMode"]:checked').value;
  const simpleSearchType = document.querySelector('input[name="simpleSearchType"]:checked').value;
  
  const settings = {
    searchMode: searchMode,
    simpleSearchType: simpleSearchType
  };
  
  // Save AI settings based on what's selected
  if (searchMode === 'ai') {
    if (selectedAIProvider === 'ollama') {
      // Save Ollama settings, clear API
      settings.ollamaUrl = document.getElementById('ollamaUrl').value.trim();
      settings.ollamaModel = document.getElementById('ollamaModel').value.trim();
      settings.apiProvider = '';
      settings.apiKey = '';
      settings.apiModel = '';
    } else if (selectedAIProvider === 'api') {
      // Save API settings, clear Ollama
      settings.apiProvider = document.getElementById('apiProvider').value;
      settings.apiKey = document.getElementById('apiKey').value.trim();
      
      // Get model - either from dropdown or custom input
      const modelSelect = document.getElementById('apiModelSelect').value;
      const modelCustom = document.getElementById('apiModelCustom').value.trim();
      settings.apiModel = modelSelect === 'custom' ? modelCustom : modelSelect;
      
      settings.ollamaUrl = '';
      settings.ollamaModel = '';
    } else {
      // Nothing selected, save both (for backward compatibility)
      settings.ollamaUrl = document.getElementById('ollamaUrl').value.trim();
      settings.ollamaModel = document.getElementById('ollamaModel').value.trim();
      settings.apiProvider = document.getElementById('apiProvider').value;
      settings.apiKey = document.getElementById('apiKey').value.trim();
      settings.apiModel = document.getElementById('apiModel').value.trim();
    }
  }

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

// Model options for each provider
const providerModels = {
  openai: [
    { value: 'gpt-4', label: 'GPT-4 (Recommended)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Default)' },
    { value: 'custom', label: '✏️ Custom Model...' }
  ],
  anthropic: [
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Recommended)' },
    { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku (Default)' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
    { value: 'custom', label: '✏️ Custom Model...' }
  ],
  google: [
    { value: 'gemini-pro', label: 'Gemini Pro (Default)' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { value: 'custom', label: '✏️ Custom Model...' }
  ],
  xai: [
    { value: 'grok-beta', label: 'Grok Beta (Default)' },
    { value: 'custom', label: '✏️ Custom Model...' }
  ],
  groq: [
    { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B (Default)' },
    { value: 'llama-3.1-70b-versatile', label: 'Llama 3.1 70B' },
    { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
    { value: 'custom', label: '✏️ Custom Model...' }
  ],
  together: [
    { value: 'mistralai/Mixtral-8x7B-Instruct-v0.1', label: 'Mixtral 8x7B (Default)' },
    { value: 'meta-llama/Llama-3-70b-chat-hf', label: 'Llama 3 70B' },
    { value: 'custom', label: '✏️ Custom Model...' }
  ],
  fireworks: [
    { value: 'accounts/fireworks/models/llama-v3p1-8b-instruct', label: 'Llama 3.1 8B (Default)' },
    { value: 'accounts/fireworks/models/llama-v3p1-70b-instruct', label: 'Llama 3.1 70B' },
    { value: 'custom', label: '✏️ Custom Model...' }
  ],
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek Chat (Default)' },
    { value: 'deepseek-coder', label: 'DeepSeek Coder' },
    { value: 'custom', label: '✏️ Custom Model...' }
  ],
  perplexity: [
    { value: 'llama-3.1-sonar-small-128k-online', label: 'Sonar Small (Default)' },
    { value: 'llama-3.1-sonar-large-128k-online', label: 'Sonar Large' },
    { value: 'custom', label: '✏️ Custom Model...' }
  ],
  cohere: [
    { value: 'command', label: 'Command (Default)' },
    { value: 'command-light', label: 'Command Light' },
    { value: 'custom', label: '✏️ Custom Model...' }
  ],
  mistral: [
    { value: 'mistral-tiny', label: 'Mistral Tiny (Default)' },
    { value: 'mistral-small', label: 'Mistral Small' },
    { value: 'mistral-medium', label: 'Mistral Medium' },
    { value: 'custom', label: '✏️ Custom Model...' }
  ],
  ai21: [
    { value: 'jamba-instruct', label: 'Jamba Instruct (Default)' },
    { value: 'custom', label: '✏️ Custom Model...' }
  ],
  huggingface: [
    { value: 'mistralai/Mistral-7B-Instruct-v0.2', label: 'Mistral 7B (Default)' },
    { value: 'meta-llama/Llama-2-7b-chat-hf', label: 'Llama 2 7B' },
    { value: 'custom', label: '✏️ Custom Model...' }
  ],
  anyscale: [
    { value: 'meta-llama/Llama-2-7b-chat-hf', label: 'Llama 2 7B (Default)' },
    { value: 'meta-llama/Llama-2-13b-chat-hf', label: 'Llama 2 13B' },
    { value: 'custom', label: '✏️ Custom Model...' }
  ],
  openrouter: [
    { value: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B Free (Default)' },
    { value: 'google/gemini-pro-1.5', label: 'Gemini Pro 1.5' },
    { value: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku' },
    { value: 'custom', label: '✏️ Custom Model...' }
  ],
  novita: [
    { value: 'meta-llama/llama-3.1-8b-instruct', label: 'Llama 3.1 8B (Default)' },
    { value: 'custom', label: '✏️ Custom Model...' }
  ],
  lepton: [
    { value: 'llama2-7b', label: 'Llama 2 7B (Default)' },
    { value: 'custom', label: '✏️ Custom Model...' }
  ],
  azure: [
    { value: 'custom', label: '✏️ Enter your deployment endpoint' }
  ],
  cloudflare: [
    { value: 'custom', label: '✏️ Enter your account ID' }
  ]
};

// Update model dropdown when provider changes
document.getElementById('apiProvider').addEventListener('change', (e) => {
  const provider = e.target.value;
  const modelSelect = document.getElementById('apiModelSelect');
  const modelCustom = document.getElementById('apiModelCustom');
  
  // Reset
  modelSelect.innerHTML = '<option value="">Select model...</option>';
  modelCustom.style.display = 'none';
  modelCustom.value = '';
  
  if (provider && providerModels[provider]) {
    // Populate model options
    providerModels[provider].forEach(model => {
      const option = document.createElement('option');
      option.value = model.value;
      option.textContent = model.label;
      modelSelect.appendChild(option);
    });
    
    // Select first non-custom option by default
    const defaultModel = providerModels[provider].find(m => m.value !== 'custom');
    if (defaultModel) {
      modelSelect.value = defaultModel.value;
    }
  }
  
  // Show info modal for complex providers
  if (providerInstructions[provider]) {
    const modal = document.getElementById('infoModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    modalTitle.textContent = providerInstructions[provider].title;
    modalBody.innerHTML = providerInstructions[provider].body;
    
    modal.classList.add('active');
  }
});

// Show custom input when "Custom Model" is selected
document.getElementById('apiModelSelect').addEventListener('change', (e) => {
  const modelCustom = document.getElementById('apiModelCustom');
  
  if (e.target.value === 'custom') {
    modelCustom.style.display = 'block';
    modelCustom.focus();
  } else {
    modelCustom.style.display = 'none';
    modelCustom.value = '';
  }
  
  // Check verification status when model changes
  checkAPIVerification();
});

// Check API verification status
async function checkAPIVerification() {
  const provider = document.getElementById('apiProvider').value;
  const modelSelect = document.getElementById('apiModelSelect').value;
  const modelCustom = document.getElementById('apiModelCustom').value.trim();
  const apiKey = document.getElementById('apiKey').value.trim();
  const statusDiv = document.getElementById('apiVerificationStatus');
  const statusIcon = statusDiv.querySelector('.verify-icon');
  const statusText = statusDiv.querySelector('.verify-text');
  
  if (!provider || !apiKey) {
    statusDiv.style.display = 'none';
    return;
  }
  
  const model = modelSelect === 'custom' ? modelCustom : modelSelect;
  if (!model) {
    statusDiv.style.display = 'none';
    return;
  }
  
  statusDiv.style.display = 'flex';
  
  // Create verification key
  const verificationKey = `api_verified_${provider}_${model}`;
  
  // Check if already verified
  chrome.storage.local.get([verificationKey], async (data) => {
    if (data[verificationKey] === 'verified') {
      statusDiv.className = 'api-verification-status verified';
      statusIcon.textContent = '✅';
      statusText.textContent = 'Verified - Ready to use';
      return;
    } else if (data[verificationKey] === 'failed') {
      statusDiv.className = 'api-verification-status failed';
      statusIcon.textContent = '❌';
      statusText.textContent = 'Verification failed';
      return;
    }
    
    // Not verified yet - run verification
    statusDiv.className = 'api-verification-status checking';
    statusIcon.textContent = '⏳';
    statusText.textContent = 'Verifying...';
    
    // Send verification request to background
    chrome.runtime.sendMessage(
      {
        action: 'verifyAPI',
        provider: provider,
        apiKey: apiKey,
        model: model
      },
      (response) => {
        if (response.success) {
          statusDiv.className = 'api-verification-status verified';
          statusIcon.textContent = '✅';
          statusText.textContent = 'Verified - Ready to use';
          
          // Save verification result
          chrome.storage.local.set({ [verificationKey]: 'verified' });
        } else {
          statusDiv.className = 'api-verification-status failed';
          statusIcon.textContent = '❌';
          statusText.textContent = `Failed: ${response.error}`;
          
          // Save failure (but allow retry later)
          chrome.storage.local.set({ [verificationKey]: 'failed' });
        }
      }
    );
  });
}

// Check verification when API key changes (with debounce)
let apiKeyTimeout;
document.getElementById('apiKey').addEventListener('input', () => {
  clearTimeout(apiKeyTimeout);
  apiKeyTimeout = setTimeout(() => {
    checkAPIVerification();
  }, 1000); // Wait 1 second after user stops typing
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
  
  // Set initial selected provider based on saved settings
  chrome.storage.local.get(['ollamaModel', 'apiProvider'], (data) => {
    if (data.apiProvider) {
      selectedAIProvider = 'api';
      document.querySelector('[data-target="apiContent"]').parentElement.classList.add('selected');
    } else if (data.ollamaModel) {
      selectedAIProvider = 'ollama';
      document.querySelector('[data-target="ollamaContent"]').parentElement.classList.add('selected');
    }
  });
}, 500);
