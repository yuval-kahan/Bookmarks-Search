// Open settings page
document.getElementById("settingsBtn").addEventListener("click", () => {
  window.location.href = "settings.html";
});

// Search functionality
document.getElementById("searchBtn").addEventListener("click", async () => {
  const query = document.getElementById("query").value.trim();
  const errorDiv = document.getElementById("error");
  const statusDiv = document.getElementById("status");
  const list = document.getElementById("results");

  errorDiv.textContent = "";
  errorDiv.className = "";
  statusDiv.textContent = "";
  list.innerHTML = "";

  if (!query) {
    errorDiv.textContent = "Please enter a search term";
    errorDiv.className = "error";
    return;
  }

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
            if (chrome.runtime.lastError) {
              errorDiv.textContent =
                "Error: " + chrome.runtime.lastError.message;
              errorDiv.className = "error";
              return;
            }

            if (!response || !response.results) {
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
        ["ollamaUrl", "ollamaModel", "apiProvider", "apiKey", "apiModel"],
        (settings) => {
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
            },
            (response) => {
              statusDiv.textContent = "";

              if (chrome.runtime.lastError) {
                errorDiv.textContent =
                  "Error: " + chrome.runtime.lastError.message;
                errorDiv.className = "error";
                return;
              }

              if (response.error) {
                errorDiv.textContent = "AI Error: " + response.error;
                errorDiv.className = "error";
                return;
              }

              if (!response || !response.results) {
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
