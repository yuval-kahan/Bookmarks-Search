// Load saved settings
function loadSettings() {
  chrome.storage.local.get(
    [
      "searchMode",
      "simpleSearchType",
      "ollamaUrl",
      "ollamaModel",
      "apiProvider",
      "apiKey",
      "apiModel",
    ],
    (data) => {
      // Set search mode
      if (data.searchMode === "ai") {
        document.getElementById("aiMode").checked = true;
        document.getElementById("aiSettings").style.display = "block";
        document.getElementById("simpleSettings").style.display = "none";
      } else {
        document.getElementById("simpleMode").checked = true;
        document.getElementById("simpleSettings").style.display = "block";
        document.getElementById("aiSettings").style.display = "none";
      }

      // Set simple search type
      if (data.simpleSearchType === "fuzzy") {
        document.getElementById("fuzzySearch").checked = true;
      } else {
        document.getElementById("exactSearch").checked = true;
      }

      // Load AI settings
      if (data.ollamaUrl)
        document.getElementById("ollamaUrl").value = data.ollamaUrl;
      // ollamaModel will be loaded from the models list
      if (data.apiProvider) {
        document.getElementById("apiProvider").value = data.apiProvider;

        // Load API key for this provider
        loadAPIKeyForProvider(data.apiProvider);

        // Load saved model
        setTimeout(() => {
          updateModelDropdown(data.apiProvider, data.apiModel);

          const modelSelect = document.getElementById("apiModelSelect");
          const modelCustom = document.getElementById("apiModelCustom");

          if (data.apiModel) {
            // Check if it's in the dropdown
            const optionExists = Array.from(modelSelect.options).some(
              (opt) => opt.value === data.apiModel
            );

            if (optionExists) {
              modelSelect.value = data.apiModel;
            } else {
              // It's a custom model that's not in the list yet
              modelSelect.value = "custom";
              modelCustom.style.display = "block";
              modelCustom.value = data.apiModel;
            }
          }
        }, 100);
      }
    }
  );
}

// Back button
document.getElementById("backBtn").addEventListener("click", () => {
  const searchMode = document.querySelector(
    'input[name="searchMode"]:checked'
  ).value;

  // If AI mode with failed API, switch to Simple mode before going back
  if (searchMode === "ai" && selectedAIProvider === "api") {
    const verificationStatus = getAPIVerificationStatus();

    if (verificationStatus === "failed") {
      // Switch to Simple mode and then navigate
      chrome.storage.local.set({ searchMode: "simple" }, () => {
        window.location.href = "popup.html";
      });
      return;
    }
  }

  // Normal navigation
  window.location.href = "popup.html";
});

// Toggle search mode
document.querySelectorAll('input[name="searchMode"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    const aiSettings = document.getElementById("aiSettings");
    const simpleSettings = document.getElementById("simpleSettings");

    if (e.target.value === "ai") {
      aiSettings.style.display = "block";
      simpleSettings.style.display = "none";
    } else {
      aiSettings.style.display = "none";
      simpleSettings.style.display = "block";
    }
  });
});

// Track selected AI provider (Ollama or API)
let selectedAIProvider = null;

// Helper function to get API verification status
function getAPIVerificationStatus() {
  const statusDiv = document.getElementById("apiVerificationStatus");

  if (!statusDiv || statusDiv.style.display === "none") {
    return "hidden";
  }

  if (statusDiv.classList.contains("verified")) {
    return "verified";
  }

  if (statusDiv.classList.contains("failed")) {
    return "failed";
  }

  if (statusDiv.classList.contains("checking")) {
    return "checking";
  }

  return "unknown";
}

// Collapsible functionality
document.querySelectorAll(".collapsible-header").forEach((header) => {
  header.addEventListener("click", () => {
    const targetId = header.getAttribute("data-target");
    const content = document.getElementById(targetId);
    const parentCollapsible = header.parentElement;

    // Toggle active state (open/close)
    header.classList.toggle("active");
    content.classList.toggle("active");

    // For AI settings (Ollama and API), handle selection
    if (targetId === "ollamaContent" || targetId === "apiContent") {
      // Remove selected from all AI collapsibles
      document.querySelectorAll("#aiSettings .collapsible").forEach((c) => {
        c.classList.remove("selected");
      });

      // If opening, mark as selected
      if (content.classList.contains("active")) {
        parentCollapsible.classList.add("selected");
        selectedAIProvider = targetId === "ollamaContent" ? "ollama" : "api";
      } else {
        selectedAIProvider = null;
      }
    }
  });
});

// Save settings
document.getElementById("saveBtn").addEventListener("click", () => {
  let searchMode = document.querySelector(
    'input[name="searchMode"]:checked'
  ).value;
  const simpleSearchType = document.querySelector(
    'input[name="simpleSearchType"]:checked'
  ).value;
  const saveStatus = document.getElementById("saveStatus");

  // Check if AI mode with API provider has issues
  if (searchMode === "ai" && selectedAIProvider === "api") {
    const apiKey = document.getElementById("apiKey").value.trim();
    const apiProvider = document.getElementById("apiProvider").value;
    const verificationStatus = getAPIVerificationStatus();

    // Block if no API key provided
    if (!apiKey || !apiProvider) {
      showErrorModal(
        "Missing API Key",
        "Cannot save settings. Please enter an API key for the selected provider."
      );
      return; // Do not save, do not navigate
    }

    // Block if verification explicitly failed
    if (verificationStatus === "failed") {
      showErrorModal(
        "API Configuration Failed",
        "Cannot save settings because the API configuration failed. Please check your API key and try again."
      );
      return; // Do not save, do not navigate
    }
  }

  // Check if AI mode has errors (no provider selected)
  if (searchMode === "ai") {
    let hasError = false;
    let errorMessage = "";

    if (selectedAIProvider === null) {
      // No provider selected
      hasError = true;
      errorMessage = "No AI provider selected. Switching to Simple Search.";
    }

    if (hasError) {
      // Show warning and switch to Simple
      saveStatus.className = "error";
      saveStatus.style.background = "#fff5f5";
      saveStatus.style.color = "#e53e3e";
      saveStatus.style.borderLeft = "3px solid #e53e3e";
      saveStatus.style.padding = "10px";
      saveStatus.style.borderRadius = "6px";
      saveStatus.textContent = `⚠️ ${errorMessage}`;

      // Switch to Simple mode
      searchMode = "simple";
      document.getElementById("simpleMode").checked = true;

      setTimeout(() => {
        saveStatus.textContent = "";
        saveStatus.style.background = "";
        saveStatus.style.color = "";
        saveStatus.style.borderLeft = "";
      }, 3000);
    }
  }

  const settings = {
    searchMode: searchMode,
    simpleSearchType: simpleSearchType,
  };

  // Save AI settings based on what's selected
  if (searchMode === "ai") {
    if (selectedAIProvider === "ollama") {
      // Save Ollama settings, clear API
      settings.ollamaUrl = document.getElementById("ollamaUrl").value.trim();
      settings.ollamaModel = document
        .getElementById("ollamaModel")
        .value.trim();
      settings.apiProvider = "";
      settings.apiKey = "";
      settings.apiModel = "";
    } else if (selectedAIProvider === "api") {
      // Save API settings, clear Ollama
      const provider = document.getElementById("apiProvider").value;
      const apiKey = document.getElementById("apiKey").value.trim();

      settings.apiProvider = provider;

      // Save API key for this provider
      if (provider && apiKey) {
        saveAPIKeyForProvider(provider, apiKey);
      }

      // Get model - either from dropdown or custom input
      const modelSelect = document.getElementById("apiModelSelect").value;
      const modelCustom = document
        .getElementById("apiModelCustom")
        .value.trim();
      settings.apiModel = modelSelect === "custom" ? modelCustom : modelSelect;

      settings.ollamaUrl = "";
      settings.ollamaModel = "";
    } else {
      // Nothing selected, save both (for backward compatibility)
      settings.ollamaUrl = document.getElementById("ollamaUrl").value.trim();
      settings.ollamaModel = document
        .getElementById("ollamaModel")
        .value.trim();
      settings.apiProvider = document.getElementById("apiProvider").value;
      settings.apiKey = document.getElementById("apiKey").value.trim();
      settings.apiModel = document.getElementById("apiModel").value.trim();
    }
  }

  chrome.storage.local.set(settings, () => {
    if (
      searchMode === "simple" &&
      document.querySelector('input[name="searchMode"]:checked').value === "ai"
    ) {
      // Was switched to simple due to error
      saveStatus.className = "success";
      saveStatus.textContent = "✓ Saved - Using Simple Search (AI had errors)";
    } else {
      saveStatus.className = "success";
      saveStatus.textContent = "✓ Settings saved successfully!";
    }

    // Keep the success message visible, don't navigate away
    setTimeout(() => {
      saveStatus.textContent = "";
    }, 3000);
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
    
    <strong>Note:</strong> Make sure your deployment is active in Azure Portal.`,
  },
  cloudflare: {
    title: "Cloudflare Workers AI Setup",
    body: `<strong>Cloudflare Workers AI configuration:</strong>
    
    1. Get your Cloudflare Account ID from dashboard
    2. In the <strong>Model</strong> field, enter your Account ID:
    <code>YOUR-ACCOUNT-ID</code>
    
    3. In the <strong>API Key</strong> field, enter your Cloudflare API Token
    
    <strong>Tip:</strong> Create an API token with "Workers AI" permissions.`,
  },
  huggingface: {
    title: "Hugging Face Setup",
    body: `<strong>Hugging Face Inference API:</strong>
    
    1. Get your API token from huggingface.co/settings/tokens
    2. In the <strong>Model</strong> field, enter the model path:
    <code>mistralai/Mistral-7B-Instruct-v0.2</code>
    
    3. In the <strong>API Key</strong> field, enter your HF token
    
    <strong>Note:</strong> Free tier has rate limits. Some models may be slow.`,
  },
  lepton: {
    title: "Lepton AI Setup",
    body: `<strong>Lepton AI configuration:</strong>
    
    1. Create a deployment at lepton.ai
    2. In the <strong>Model</strong> field, enter your deployment name:
    <code>your-deployment-name</code>
    
    3. In the <strong>API Key</strong> field, enter your Lepton API key
    
    <strong>Note:</strong> The URL will be: <code>your-deployment-name.lepton.run</code>`,
  },
};

// Model options for each provider
const providerModels = {
  openai: [
    { value: "gpt-4", label: "GPT-4 (Recommended)" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Default)" },
    { value: "custom", label: "✏️ Custom Model..." },
  ],
  anthropic: [
    {
      value: "claude-3-5-sonnet-20241022",
      label: "Claude 3.5 Sonnet (Recommended)",
    },
    { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku (Default)" },
    { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    { value: "custom", label: "✏️ Custom Model..." },
  ],
  google: [
    { value: "gemini-pro", label: "Gemini Pro (Default)" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    { value: "custom", label: "✏️ Custom Model..." },
  ],
  xai: [
    { value: "grok-beta", label: "Grok Beta (Default)" },
    { value: "custom", label: "✏️ Custom Model..." },
  ],
  groq: [
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B (Default)" },
    { value: "llama-3.1-70b-versatile", label: "Llama 3.1 70B" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B" },
    { value: "custom", label: "✏️ Custom Model..." },
  ],
  together: [
    {
      value: "mistralai/Mixtral-8x7B-Instruct-v0.1",
      label: "Mixtral 8x7B (Default)",
    },
    { value: "meta-llama/Llama-3-70b-chat-hf", label: "Llama 3 70B" },
    { value: "custom", label: "✏️ Custom Model..." },
  ],
  fireworks: [
    {
      value: "accounts/fireworks/models/llama-v3p1-8b-instruct",
      label: "Llama 3.1 8B (Default)",
    },
    {
      value: "accounts/fireworks/models/llama-v3p1-70b-instruct",
      label: "Llama 3.1 70B",
    },
    { value: "custom", label: "✏️ Custom Model..." },
  ],
  deepseek: [
    { value: "deepseek-chat", label: "DeepSeek Chat (Default)" },
    { value: "deepseek-coder", label: "DeepSeek Coder" },
    { value: "custom", label: "✏️ Custom Model..." },
  ],
  perplexity: [
    {
      value: "llama-3.1-sonar-small-128k-online",
      label: "Sonar Small (Default)",
    },
    { value: "llama-3.1-sonar-large-128k-online", label: "Sonar Large" },
    { value: "custom", label: "✏️ Custom Model..." },
  ],
  cohere: [
    { value: "command", label: "Command (Default)" },
    { value: "command-light", label: "Command Light" },
    { value: "custom", label: "✏️ Custom Model..." },
  ],
  mistral: [
    { value: "mistral-tiny", label: "Mistral Tiny (Default)" },
    { value: "mistral-small", label: "Mistral Small" },
    { value: "mistral-medium", label: "Mistral Medium" },
    { value: "custom", label: "✏️ Custom Model..." },
  ],
  ai21: [
    { value: "jamba-instruct", label: "Jamba Instruct (Default)" },
    { value: "custom", label: "✏️ Custom Model..." },
  ],
  huggingface: [
    {
      value: "mistralai/Mistral-7B-Instruct-v0.2",
      label: "Mistral 7B (Default)",
    },
    { value: "meta-llama/Llama-2-7b-chat-hf", label: "Llama 2 7B" },
    { value: "custom", label: "✏️ Custom Model..." },
  ],
  anyscale: [
    { value: "meta-llama/Llama-2-7b-chat-hf", label: "Llama 2 7B (Default)" },
    { value: "meta-llama/Llama-2-13b-chat-hf", label: "Llama 2 13B" },
    { value: "custom", label: "✏️ Custom Model..." },
  ],
  openrouter: [
    {
      value: "meta-llama/llama-3.1-8b-instruct:free",
      label: "Llama 3.1 8B Free (Default)",
    },
    { value: "google/gemini-pro-1.5", label: "Gemini Pro 1.5" },
    { value: "anthropic/claude-3-haiku", label: "Claude 3 Haiku" },
    { value: "custom", label: "✏️ Custom Model..." },
  ],
  novita: [
    {
      value: "meta-llama/llama-3.1-8b-instruct",
      label: "Llama 3.1 8B (Default)",
    },
    { value: "custom", label: "✏️ Custom Model..." },
  ],
  lepton: [
    { value: "llama2-7b", label: "Llama 2 7B (Default)" },
    { value: "custom", label: "✏️ Custom Model..." },
  ],
  azure: [{ value: "custom", label: "✏️ Enter your deployment endpoint" }],
  cloudflare: [{ value: "custom", label: "✏️ Enter your account ID" }],
};

// Update model dropdown when provider changes
document.getElementById("apiProvider").addEventListener("change", (e) => {
  const provider = e.target.value;
  const modelCustom = document.getElementById("apiModelCustom");

  // Reset
  modelCustom.style.display = "none";
  modelCustom.value = "";

  // Load API key for this provider
  loadAPIKeyForProvider(provider);

  if (provider && providerModels[provider]) {
    // Update dropdown with default + custom models
    updateModelDropdown(provider);
  }

  // Show info modal for complex providers
  if (providerInstructions[provider]) {
    const modal = document.getElementById("infoModal");
    const modalTitle = document.getElementById("modalTitle");
    const modalBody = document.getElementById("modalBody");

    modalTitle.textContent = providerInstructions[provider].title;
    modalBody.innerHTML = providerInstructions[provider].body;

    modal.classList.add("active");
  }
});

// Show custom input when "Custom Model" is selected
document.getElementById("apiModelSelect").addEventListener("change", (e) => {
  const modelCustom = document.getElementById("apiModelCustom");

  if (e.target.value === "custom") {
    modelCustom.style.display = "block";
    modelCustom.focus();
  } else {
    modelCustom.style.display = "none";
    modelCustom.value = "";
  }

  // Check verification status when model changes
  checkAPIVerification();
});

// Check API verification status
async function checkAPIVerification() {
  const provider = document.getElementById("apiProvider").value;
  const modelSelect = document.getElementById("apiModelSelect").value;
  const modelCustom = document.getElementById("apiModelCustom").value.trim();
  const apiKey = document.getElementById("apiKey").value.trim();
  const statusDiv = document.getElementById("apiVerificationStatus");
  const statusIcon = statusDiv.querySelector(".verify-icon");
  const statusText = statusDiv.querySelector(".verify-text");

  if (!provider || !apiKey) {
    statusDiv.style.display = "none";
    return;
  }

  const model = modelSelect === "custom" ? modelCustom : modelSelect;
  if (!model) {
    statusDiv.style.display = "none";
    return;
  }

  statusDiv.style.display = "flex";

  // Create verification key
  const verificationKey = `api_verified_${provider}_${model}`;

  // Check if already verified
  chrome.storage.local.get([verificationKey], async (data) => {
    if (data[verificationKey] === "verified") {
      statusDiv.className = "api-verification-status verified";
      statusIcon.textContent = "✅";
      statusText.textContent = "Verified - Ready to use";
      return;
    } else if (data[verificationKey] === "failed") {
      statusDiv.className = "api-verification-status failed";
      statusIcon.textContent = "❌";
      statusText.textContent = "Verification failed";
      return;
    }

    // Not verified yet - run verification
    statusDiv.className = "api-verification-status checking";
    statusIcon.textContent = "⏳";
    statusText.textContent = "Verifying...";

    // Set timeout for verification
    const verificationTimeout = setTimeout(() => {
      statusDiv.className = "api-verification-status failed";
      statusIcon.textContent = "❌";
      statusText.textContent = "Verification timeout - Check your API key";
    }, 15000); // 15 second timeout

    // Send verification request to background
    chrome.runtime.sendMessage(
      {
        action: "verifyAPI",
        provider: provider,
        apiKey: apiKey,
        model: model,
      },
      (response) => {
        clearTimeout(verificationTimeout);

        if (chrome.runtime.lastError) {
          statusDiv.className = "api-verification-status failed";
          statusIcon.textContent = "❌";
          statusText.textContent = `Error: ${chrome.runtime.lastError.message}`;
          return;
        }

        if (!response) {
          statusDiv.className = "api-verification-status failed";
          statusIcon.textContent = "❌";
          statusText.textContent = "No response from background script";
          return;
        }

        if (response.success) {
          statusDiv.className = "api-verification-status verified";
          statusIcon.textContent = "✅";
          statusText.textContent = "Verified - Ready to use";

          // Save verification result
          chrome.storage.local.set({ [verificationKey]: "verified" });

          // If it's a custom model that was verified, add it to the list
          if (modelSelect === "custom" && modelCustom) {
            addCustomModelToList(provider, modelCustom);
          }
        } else {
          statusDiv.className = "api-verification-status failed";
          statusIcon.textContent = "❌";
          statusText.textContent = `Failed: ${
            response.error || "Unknown error"
          }`;

          // Don't save failure - allow retry
        }
      }
    );
  });
}

// Add custom model to the provider's model list
function addCustomModelToList(provider, customModel) {
  // Get saved custom models
  chrome.storage.local.get(["customModels"], (data) => {
    const customModels = data.customModels || {};

    // Initialize provider array if doesn't exist
    if (!customModels[provider]) {
      customModels[provider] = [];
    }

    // Add model if not already in list
    if (!customModels[provider].includes(customModel)) {
      customModels[provider].push(customModel);

      // Save updated list
      chrome.storage.local.set({ customModels }, () => {
        // Refresh the model dropdown to show the new model
        const currentProvider = document.getElementById("apiProvider").value;
        if (currentProvider === provider) {
          updateModelDropdown(provider, customModel);
        }
      });
    }
  });
}

// Update model dropdown with custom models
function updateModelDropdown(provider, selectModel = null) {
  const modelSelect = document.getElementById("apiModelSelect");

  // Clear current options
  modelSelect.innerHTML = '<option value="">Select model...</option>';

  if (!provider || !providerModels[provider]) return;

  // Get saved custom models
  chrome.storage.local.get(["customModels"], (data) => {
    const customModels = data.customModels || {};
    const providerCustomModels = customModels[provider] || [];

    // Add default models
    providerModels[provider].forEach((model) => {
      if (model.value !== "custom") {
        const option = document.createElement("option");
        option.value = model.value;
        option.textContent = model.label;
        modelSelect.appendChild(option);
      }
    });

    // Add custom models (if any)
    if (providerCustomModels.length > 0) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = "Your Custom Models";

      providerCustomModels.forEach((customModel) => {
        const option = document.createElement("option");
        option.value = customModel;
        option.textContent = `${customModel} ✅`;
        optgroup.appendChild(option);
      });

      modelSelect.appendChild(optgroup);
    }

    // Add "Custom Model..." option at the end
    const customOption = document.createElement("option");
    customOption.value = "custom";
    customOption.textContent = "✏️ Custom Model...";
    modelSelect.appendChild(customOption);

    // Select the specified model if provided
    if (selectModel) {
      modelSelect.value = selectModel;
    } else {
      // Select first non-custom option by default
      const defaultModel = providerModels[provider].find(
        (m) => m.value !== "custom"
      );
      if (defaultModel) {
        modelSelect.value = defaultModel.value;
      }
    }
  });
}

// Toggle API Key visibility
document.getElementById("toggleApiKeyBtn").addEventListener("click", () => {
  const apiKeyInput = document.getElementById("apiKey");
  const toggleBtn = document.getElementById("toggleApiKeyBtn");
  const eyeIcon = toggleBtn.querySelector(".eye-icon");
  const eyeOffIcon = toggleBtn.querySelector(".eye-off-icon");

  if (apiKeyInput.type === "password") {
    apiKeyInput.type = "text";
    eyeIcon.style.display = "none";
    eyeOffIcon.style.display = "block";
    toggleBtn.title = "Hide password";
  } else {
    apiKeyInput.type = "password";
    eyeIcon.style.display = "block";
    eyeOffIcon.style.display = "none";
    toggleBtn.title = "Show password";
  }
});

// Load API key for selected provider
function loadAPIKeyForProvider(provider) {
  if (!provider) {
    document.getElementById("apiKey").value = "";
    return;
  }

  chrome.storage.local.get(["apiKeys"], (data) => {
    const apiKeys = data.apiKeys || {};
    document.getElementById("apiKey").value = apiKeys[provider] || "";
  });
}

// Save API key for current provider
function saveAPIKeyForProvider(provider, apiKey) {
  if (!provider) return;

  chrome.storage.local.get(["apiKeys"], (data) => {
    const apiKeys = data.apiKeys || {};
    apiKeys[provider] = apiKey;
    chrome.storage.local.set({ apiKeys });
  });
}

// Check verification when API key changes (with debounce)
let apiKeyTimeout;
document.getElementById("apiKey").addEventListener("input", () => {
  const provider = document.getElementById("apiProvider").value;
  const apiKey = document.getElementById("apiKey").value.trim();

  // Save API key for this provider
  if (provider && apiKey) {
    saveAPIKeyForProvider(provider, apiKey);
  }

  clearTimeout(apiKeyTimeout);
  apiKeyTimeout = setTimeout(() => {
    checkAPIVerification();
  }, 1000); // Wait 1 second after user stops typing
});

// Close modal
document.getElementById("modalOkBtn").addEventListener("click", () => {
  document.getElementById("infoModal").classList.remove("active");
});

// Close modal on overlay click
document.getElementById("infoModal").addEventListener("click", (e) => {
  if (e.target.id === "infoModal") {
    document.getElementById("infoModal").classList.remove("active");
  }
});

// Load available Ollama models
async function loadOllamaModels() {
  const modelSelect = document.getElementById("ollamaModel");
  const refreshBtn = document.getElementById("refreshModelsBtn");
  const recommendationDiv = document.getElementById("ollamaRecommendation");
  const ollamaUrl =
    document.getElementById("ollamaUrl").value.trim() ||
    "http://localhost:11434";

  // Save current selection
  const currentModel = modelSelect.value;

  // Disable refresh button
  refreshBtn.disabled = true;
  modelSelect.innerHTML = '<option value="">Loading models...</option>';

  try {
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const data = await response.json();

      if (data.models && data.models.length > 0) {
        modelSelect.innerHTML = "";

        // Check if recommended model exists
        const hasRecommended = data.models.some(
          (m) => m.name.includes("llama3.1:8b") || m.name.includes("llama3.1")
        );

        // Add models to dropdown
        data.models.forEach((model) => {
          const option = document.createElement("option");
          option.value = model.name;

          // Mark recommended models
          if (
            model.name.includes("llama3.1:8b") ||
            model.name.includes("llama3.1")
          ) {
            option.textContent = `⭐ ${model.name} (${formatSize(model.size)})`;
          } else {
            option.textContent = `${model.name} (${formatSize(model.size)})`;
          }

          modelSelect.appendChild(option);
        });

        // Show recommendation if no good model installed
        if (!hasRecommended) {
          recommendationDiv.style.display = "block";
        } else {
          recommendationDiv.style.display = "none";
        }

        // Restore previous selection or select first model
        if (currentModel && data.models.some((m) => m.name === currentModel)) {
          modelSelect.value = currentModel;
        } else if (data.models.length > 0) {
          modelSelect.value = data.models[0].name;
        }

        // Save the selected model
        chrome.storage.local.set({ ollamaModel: modelSelect.value });
      } else {
        modelSelect.innerHTML = '<option value="">No models installed</option>';
        recommendationDiv.style.display = "block";
      }
    } else {
      throw new Error("Failed to fetch models");
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
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024)
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

// Check Ollama CORS configuration
async function checkOllamaCors() {
  const corsStatusDiv = document.getElementById("ollamaCorsStatus");
  const corsStatusText = corsStatusDiv.querySelector(".status-text");
  const setupWarning = document.getElementById("ollamaSetupWarning");
  const ollamaUrl =
    document.getElementById("ollamaUrl").value.trim() ||
    "http://localhost:11434";
  const ollamaModel = document.getElementById("ollamaModel").value;

  if (!ollamaModel) {
    corsStatusDiv.style.display = "none";
    setupWarning.style.display = "block";
    return;
  }

  corsStatusDiv.style.display = "flex";
  corsStatusDiv.className = "status-indicator checking";
  corsStatusText.textContent = "Checking CORS...";

  // Send quick test to background
  chrome.runtime.sendMessage(
    {
      action: "testOllamaCors",
      ollamaUrl: ollamaUrl,
      ollamaModel: ollamaModel,
    },
    (response) => {
      if (response.success) {
        corsStatusDiv.className = "status-indicator active";
        corsStatusText.textContent = "✓ CORS configured - Ready to use";
        // Hide setup warning if CORS is working
        setupWarning.style.display = "none";
      } else {
        corsStatusDiv.className = "status-indicator inactive";
        corsStatusText.textContent =
          "✗ First init needed - Run setup command above";
        // Show setup warning if CORS is not working
        setupWarning.style.display = "block";
      }
    }
  );
}

// Check Ollama status
async function checkOllamaStatus() {
  const statusDiv = document.getElementById("ollamaStatus");
  const statusText = statusDiv.querySelector(".status-text");

  statusDiv.className = "status-indicator checking";
  statusText.textContent = "Checking...";

  try {
    const ollamaUrl =
      document.getElementById("ollamaUrl").value.trim() ||
      "http://localhost:11434";

    // Check if Ollama is running
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });

    if (response.ok) {
      const data = await response.json();
      const modelName = document.getElementById("ollamaModel").value;

      if (data.models && data.models.length > 0) {
        const modelExists = data.models.some((m) => m.name === modelName);

        if (modelExists) {
          statusDiv.className = "status-indicator active";
          statusText.textContent = `✓ Active - ${data.models.length} model(s) available`;

          // Check CORS after confirming Ollama is active
          checkOllamaCors();
        } else if (modelName) {
          statusDiv.className = "status-indicator inactive";
          statusText.textContent = `⚠ Model "${modelName}" not found`;
        } else {
          statusDiv.className = "status-indicator active";
          statusText.textContent = `✓ Active - ${data.models.length} model(s) available`;

          // Check CORS
          checkOllamaCors();
        }
      } else {
        statusDiv.className = "status-indicator inactive";
        statusText.textContent = "⚠ No models installed";
      }
    } else {
      statusDiv.className = "status-indicator inactive";
      statusText.textContent = "✗ Ollama not responding";
    }
  } catch (error) {
    statusDiv.className = "status-indicator inactive";
    statusText.textContent = "✗ Ollama not running";
  }
}

// Refresh models list
document.getElementById("refreshModelsBtn").addEventListener("click", () => {
  loadOllamaModels();
});

// Show error modal
function showErrorModal(title, message) {
  const modal = document.getElementById("infoModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");

  modalTitle.textContent = title;
  modalBody.innerHTML = message;
  modal.classList.add("active");
}

// Test Ollama connection
document.getElementById("testOllamaBtn").addEventListener("click", async () => {
  const btn = document.getElementById("testOllamaBtn");
  const ollamaUrl =
    document.getElementById("ollamaUrl").value.trim() ||
    "http://localhost:11434";
  const ollamaModel = document.getElementById("ollamaModel").value;

  if (!ollamaModel) {
    showErrorModal(
      "⚠️ No Model Selected",
      "<strong>Please select a model first.</strong><br><br>If no models appear in the list, install one using:<br><code>ollama pull llama2</code>"
    );
    return;
  }

  btn.disabled = true;
  btn.textContent = "🔄 Testing...";

  // Send test request to background script
  chrome.runtime.sendMessage(
    {
      action: "testOllama",
      ollamaUrl: ollamaUrl,
      ollamaModel: ollamaModel,
    },
    (response) => {
      if (response.success) {
        btn.textContent = "✓ Test Successful!";
        btn.style.background = "#48bb78";

        // Update status
        checkOllamaStatus();

        setTimeout(() => {
          btn.textContent = "🧪 Test Connection";
          btn.style.background = "#667eea";
          btn.disabled = false;
        }, 2000);
      } else {
        btn.textContent = "✗ Test Failed";
        btn.style.background = "#e53e3e";

        setTimeout(() => {
          btn.textContent = "🧪 Test Connection";
          btn.style.background = "#667eea";
          btn.disabled = false;
        }, 2000);

        let errorMessage = `<strong>Error:</strong> ${response.error}<br><br>`;

        if (response.error.includes("CORS")) {
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

        showErrorModal("❌ Test Failed", errorMessage);
      }
    }
  );
});

// Load models when Ollama section is opened
document
  .querySelector('[data-target="ollamaContent"]')
  .addEventListener("click", () => {
    setTimeout(() => {
      if (
        document.getElementById("ollamaContent").classList.contains("active")
      ) {
        loadOllamaModels();
      }
    }, 100);
  });

// Reload models when URL changes
document
  .getElementById("ollamaUrl")
  .addEventListener("change", loadOllamaModels);

// Update status when model changes
document.getElementById("ollamaModel").addEventListener("change", () => {
  checkOllamaStatus();
  // Save selected model
  chrome.storage.local.set({
    ollamaModel: document.getElementById("ollamaModel").value,
  });
});

// Install recommended model button
document.getElementById("installModelBtn").addEventListener("click", () => {
  const modal = document.getElementById("infoModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");

  modalTitle.textContent = "📥 Install Recommended Model";
  modalBody.innerHTML = `
    <strong>To install llama3.1:8b, follow these steps:</strong><br><br>
    
    <strong>1. Open CMD (Command Prompt):</strong><br>
    Press <code>Win + R</code>, type <code>cmd</code>, press Enter<br><br>
    
    <strong>2. Run this command:</strong><br>
    <code style="display: block; background: #f0f0f0; padding: 8px; margin: 8px 0; border-radius: 4px; user-select: all;">ollama pull llama3.1:8b</code>
    <button id="copyCommandBtn" 
            style="padding: 6px 12px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; margin-bottom: 10px;">
      📋 Copy Command
    </button><br>
    
    <strong>3. Wait for download to complete</strong><br>
    This will download ~4.7GB<br><br>
    
    <strong>4. Click the refresh button (🔄)</strong><br>
    The new model will appear in the list<br><br>
    
    <strong>Why llama3.1:8b?</strong><br>
    • Better accuracy than smaller models<br>
    • Fast enough for real-time search<br>
    • Good balance of speed and quality
  `;

  modal.classList.add("active");

  // Add event listener to copy button after it's created
  setTimeout(() => {
    const copyBtn = document.getElementById("copyCommandBtn");
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText("ollama pull llama3.1:8b");
          copyBtn.textContent = "✓ Copied!";
          copyBtn.style.background = "#48bb78";
          setTimeout(() => {
            copyBtn.textContent = "📋 Copy Command";
            copyBtn.style.background = "#667eea";
          }, 2000);
        } catch (err) {
          copyBtn.textContent = "✗ Failed";
          copyBtn.style.background = "#e53e3e";
          setTimeout(() => {
            copyBtn.textContent = "📋 Copy Command";
            copyBtn.style.background = "#667eea";
          }, 2000);
        }
      });
    }
  }, 100);
});

// Load settings on page open
loadSettings();

// Load models when settings page opens (if Ollama section is already open)
setTimeout(() => {
  if (document.getElementById("ollamaContent").classList.contains("active")) {
    loadOllamaModels();
  }

  // Set initial selected provider based on saved settings
  chrome.storage.local.get(["ollamaModel", "apiProvider"], (data) => {
    if (data.apiProvider) {
      selectedAIProvider = "api";
      document
        .querySelector('[data-target="apiContent"]')
        .parentElement.classList.add("selected");
    } else if (data.ollamaModel) {
      selectedAIProvider = "ollama";
      document
        .querySelector('[data-target="ollamaContent"]')
        .parentElement.classList.add("selected");
    }
  });
}, 500);

// Error Modal Functions
function showErrorModal(title, message) {
  const modal = document.getElementById("errorModal");
  const modalTitle = document.getElementById("errorModalTitle");
  const modalBody = document.getElementById("errorModalBody");

  modalTitle.textContent = title;
  modalBody.textContent = message;

  modal.classList.add("active");
}

function closeErrorModal() {
  const modal = document.getElementById("errorModal");
  modal.classList.remove("active");
}

// Error Modal Event Listeners
document
  .getElementById("errorModalOkBtn")
  .addEventListener("click", closeErrorModal);

// Close error modal on overlay click
document.getElementById("errorModal").addEventListener("click", (e) => {
  if (e.target.id === "errorModal") {
    closeErrorModal();
  }
});

// Info Modal Event Listeners (if not already defined)
document.getElementById("modalOkBtn")?.addEventListener("click", () => {
  document.getElementById("infoModal").classList.remove("active");
});

// Close info modal on overlay click
document.getElementById("infoModal")?.addEventListener("click", (e) => {
  if (e.target.id === "infoModal") {
    document.getElementById("infoModal").classList.remove("active");
  }
});

// Default Prompt Template
const DEFAULT_PROMPT = `You are a bookmark search assistant. Here are all the user's bookmarks:

[BOOKMARKS_WILL_BE_INSERTED_HERE]

User query: "{SEARCH}"

Based on the query, return ONLY the numbers of the most relevant bookmarks (comma-separated). For example: 1,5,12
If no bookmarks match, return: NONE

Your response:`;

// Prompt Editor Functions
function openPromptEditor() {
  const mainContainer = document.querySelector(".container");
  const promptScreen = document.getElementById("promptEditorScreen");

  // Hide main settings
  mainContainer.style.display = "none";
  promptScreen.style.display = "block";

  // Load current prompt
  chrome.storage.local.get(["customPrompt"], (data) => {
    const currentPrompt = data.customPrompt || DEFAULT_PROMPT;
    loadPromptIntoEditor(currentPrompt);
  });
}

function closePromptEditor() {
  const mainContainer = document.querySelector(".container");
  const promptScreen = document.getElementById("promptEditorScreen");

  mainContainer.style.display = "block";
  promptScreen.style.display = "none";
}

function createDraggablePlaceholder(text, placeholder, icon) {
  const btn = document.createElement("span");
  btn.className = "search-placeholder";
  btn.textContent = `${icon} ${text}`;
  btn.draggable = true;
  btn.contentEditable = false;
  btn.dataset.placeholder = placeholder;

  // Prevent deletion and editing
  btn.addEventListener("keydown", (e) => {
    e.preventDefault();
  });

  // Drag events
  btn.addEventListener("dragstart", (e) => {
    btn.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", placeholder);
  });

  btn.addEventListener("dragend", () => {
    btn.classList.remove("dragging");
  });

  return btn;
}

function loadPromptIntoEditor(promptText) {
  const editorArea = document.getElementById("promptEditorArea");

  // Clear editor
  editorArea.innerHTML = "";

  // Process text and replace placeholders with buttons
  let remainingText = promptText;
  
  while (remainingText.length > 0) {
    // Find next placeholder
    const searchIndex = remainingText.indexOf("{SEARCH}");
    const bookmarksIndex = remainingText.indexOf("[BOOKMARKS_WILL_BE_INSERTED_HERE]");
    
    let nextIndex = -1;
    let nextPlaceholder = null;
    
    // Determine which placeholder comes first
    if (searchIndex !== -1 && (bookmarksIndex === -1 || searchIndex < bookmarksIndex)) {
      nextIndex = searchIndex;
      nextPlaceholder = "search";
    } else if (bookmarksIndex !== -1) {
      nextIndex = bookmarksIndex;
      nextPlaceholder = "bookmarks";
    }
    
    if (nextIndex === -1) {
      // No more placeholders, add remaining text
      if (remainingText) {
        editorArea.appendChild(document.createTextNode(remainingText));
      }
      break;
    }
    
    // Add text before placeholder
    if (nextIndex > 0) {
      editorArea.appendChild(document.createTextNode(remainingText.substring(0, nextIndex)));
    }
    
    // Add placeholder button
    if (nextPlaceholder === "search") {
      const searchBtn = createDraggablePlaceholder("search word", "{SEARCH}", "🔍");
      editorArea.appendChild(searchBtn);
      remainingText = remainingText.substring(nextIndex + "{SEARCH}".length);
    } else {
      const bookmarksBtn = createDraggablePlaceholder("bookmarks list", "[BOOKMARKS_WILL_BE_INSERTED_HERE]", "📚");
      editorArea.appendChild(bookmarksBtn);
      remainingText = remainingText.substring(nextIndex + "[BOOKMARKS_WILL_BE_INSERTED_HERE]".length);
    }
  }

  // Setup drop zone
  setupDropZone(editorArea);
}

function setupDropZone(editorArea) {
  let draggedElement = null;

  editorArea.addEventListener("dragstart", (e) => {
    if (e.target.classList.contains("search-placeholder")) {
      draggedElement = e.target;
      // Add visual feedback
      draggedElement.style.opacity = "0.5";
    }
  });

  editorArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    if (!draggedElement) return;

    // Get drop position and show preview
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (!range) return;

    // Create a temporary clone for preview
    const existingPreview = editorArea.querySelector(".drag-preview");
    if (existingPreview) {
      existingPreview.remove();
    }

    // Only show preview if not hovering over the dragged element itself
    if (range.startContainer !== draggedElement && !draggedElement.contains(range.startContainer)) {
      const preview = draggedElement.cloneNode(true);
      preview.classList.add("drag-preview");
      preview.style.opacity = "0.3";
      preview.style.pointerEvents = "none";
      preview.draggable = false;

      try {
        range.insertNode(preview);
      } catch (e) {
        // Ignore errors if insertion fails
      }
    }
  });

  editorArea.addEventListener("drop", (e) => {
    e.preventDefault();

    // Remove any preview
    const preview = editorArea.querySelector(".drag-preview");
    if (preview) {
      preview.remove();
    }

    if (!draggedElement) return;

    // Restore opacity
    draggedElement.style.opacity = "1";

    // Get drop position
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (!range) return;

    // Remove dragged element from current position
    draggedElement.remove();

    // Insert at new position
    range.insertNode(draggedElement);

    // Place cursor after the button
    const newRange = document.createRange();
    newRange.setStartAfter(draggedElement);
    newRange.collapse(true);

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(newRange);

    draggedElement = null;
  });

  editorArea.addEventListener("dragend", () => {
    // Clean up
    const preview = editorArea.querySelector(".drag-preview");
    if (preview) {
      preview.remove();
    }
    if (draggedElement) {
      draggedElement.style.opacity = "1";
    }
    draggedElement = null;
  });

  editorArea.addEventListener("dragleave", (e) => {
    // Remove preview when leaving the editor area
    if (e.target === editorArea) {
      const preview = editorArea.querySelector(".drag-preview");
      if (preview) {
        preview.remove();
      }
    }
  });
}

function getPromptFromEditor() {
  const editorArea = document.getElementById("promptEditorArea");
  let promptText = "";

  // Iterate through all child nodes
  editorArea.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      promptText += node.textContent;
    } else if (
      node.classList &&
      node.classList.contains("search-placeholder")
    ) {
      // Use the data-placeholder attribute to get the correct placeholder
      const placeholder = node.dataset.placeholder;
      promptText += placeholder || "{SEARCH}";
    } else if (node.textContent) {
      promptText += node.textContent;
    }
  });

  return promptText;
}

function savePrompt() {
  const promptText = getPromptFromEditor();

  // Verify {SEARCH} exists
  if (!promptText.includes("{SEARCH}")) {
    showErrorModal(
      "Invalid Prompt",
      "Prompt must contain the {SEARCH} placeholder. It cannot be removed."
    );
    return;
  }

  // Save to storage
  chrome.storage.local.set({ customPrompt: promptText }, () => {
    // Show success message
    const saveBtn = document.getElementById("promptSaveBtn");
    const originalText = saveBtn.textContent;
    saveBtn.textContent = "✓ Saved!";
    saveBtn.style.background = "#48bb78";

    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.style.background = "";
      closePromptEditor();
    }, 1500);
  });
}

function resetPromptToDefault() {
  if (confirm("Are you sure you want to reset the prompt to default?")) {
    loadPromptIntoEditor(DEFAULT_PROMPT);
  }
}

// Event Listeners for Prompt Editor
document
  .getElementById("promptBtn")
  .addEventListener("click", openPromptEditor);
document
  .getElementById("promptBackBtn")
  .addEventListener("click", closePromptEditor);
document.getElementById("promptSaveBtn").addEventListener("click", savePrompt);
document
  .getElementById("promptResetBtn")
  .addEventListener("click", resetPromptToDefault);

// Prevent {SEARCH} button deletion
document.getElementById("promptEditorArea").addEventListener("keydown", (e) => {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const searchBtn = document.querySelector(".search-placeholder");

  if (!searchBtn) return;

  // Check if trying to delete the search button
  if (e.key === "Backspace" || e.key === "Delete") {
    if (range.intersectsNode(searchBtn)) {
      e.preventDefault();
    }
  }
});

// Bookmark Fields Editor Functions
function openFieldsEditor() {
  const mainContainer = document.querySelector(".container");
  const fieldsScreen = document.getElementById("fieldsEditorScreen");

  // Hide main settings
  mainContainer.style.display = "none";
  fieldsScreen.style.display = "block";

  // Load saved field settings
  loadFieldSettings();
}

function closeFieldsEditor() {
  const mainContainer = document.querySelector(".container");
  const fieldsScreen = document.getElementById("fieldsEditorScreen");

  // Show main settings
  mainContainer.style.display = "block";
  fieldsScreen.style.display = "none";
}

function loadFieldSettings() {
  chrome.storage.local.get(['bookmarkFields'], (data) => {
    const fields = data.bookmarkFields || {
      includeTitle: true,
      includeUrl: true,
      includeFolder: true
    };
    
    document.getElementById('includeTitle').checked = fields.includeTitle;
    document.getElementById('includeUrl').checked = fields.includeUrl;
    document.getElementById('includeFolder').checked = fields.includeFolder;
  });
}

function saveFieldSettings() {
  const fields = {
    includeTitle: document.getElementById('includeTitle').checked,
    includeUrl: document.getElementById('includeUrl').checked,
    includeFolder: document.getElementById('includeFolder').checked
  };
  
  chrome.storage.local.set({ bookmarkFields: fields }, () => {
    // Show success message
    const saveBtn = document.getElementById('fieldsSaveBtn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = '✓ Saved!';
    saveBtn.style.background = '#48bb78';
    
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.style.background = '';
      closeFieldsEditor();
    }, 1000);
  });
}

// Fields button event listener
document.getElementById('fieldsBtn').addEventListener('click', openFieldsEditor);

// Fields back button
document.getElementById('fieldsBackBtn').addEventListener('click', closeFieldsEditor);

// Fields save button
document.getElementById('fieldsSaveBtn').addEventListener('click', saveFieldSettings);
