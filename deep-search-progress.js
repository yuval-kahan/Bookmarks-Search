// Deep Search Progress Tracker
// This module handles real-time progress updates for Deep Search operations

class DeepSearchProgress {
  constructor() {
    this.totalBookmarks = 0;
    this.processedBookmarks = 0;
    this.cachedBookmarks = 0;
    this.downloadedBookmarks = 0;
    this.currentPhase = '';
    this.isPreMarkdownEnabled = false;
  }

  // Initialize progress tracking
  init(totalBookmarks, isPreMarkdownEnabled) {
    this.totalBookmarks = totalBookmarks;
    this.processedBookmarks = 0;
    this.cachedBookmarks = 0;
    this.downloadedBookmarks = 0;
    this.isPreMarkdownEnabled = isPreMarkdownEnabled;
    this.currentPhase = 'starting';
    this.showProgress();
    this.updateUI();
  }

  // Show progress container
  showProgress() {
    const progressDiv = document.getElementById('batchProgress');
    if (progressDiv) {
      progressDiv.style.display = 'block';
    }
  }

  // Hide progress container
  hideProgress() {
    const progressDiv = document.getElementById('batchProgress');
    if (progressDiv) {
      setTimeout(() => {
        progressDiv.style.display = 'none';
      }, 3000); // Hide after 3 seconds
    }
  }

  // Update progress for bookmark processing
  updateBookmarkProgress(bookmarkUrl, status) {
    this.processedBookmarks++;
    
    const percentage = Math.round((this.processedBookmarks / this.totalBookmarks) * 50); // 0-50% for bookmark processing
    
    let message = '';
    let icon = '';
    
    if (this.isPreMarkdownEnabled) {
      switch (status) {
        case 'checking_cache':
          icon = '💾';
          message = `בודק cache עבור: ${this.truncateUrl(bookmarkUrl)} (${this.processedBookmarks}/${this.totalBookmarks})`;
          break;
        case 'found_in_cache':
          this.cachedBookmarks++;
          icon = '⚡';
          message = `נמצא ב-cache! (${this.cachedBookmarks} cached, ${this.processedBookmarks}/${this.totalBookmarks})`;
          break;
        case 'downloading':
          icon = '📥';
          message = `מוריד תוכן מ-${this.truncateUrl(bookmarkUrl)}... (${this.processedBookmarks}/${this.totalBookmarks})`;
          break;
        case 'converting':
          icon = '🔄';
          message = `ממיר ל-Markdown... (${this.processedBookmarks}/${this.totalBookmarks})`;
          break;
        case 'saving_cache':
          icon = '💾';
          message = `שומר ל-cache... (${this.processedBookmarks}/${this.totalBookmarks})`;
          break;
      }
    } else {
      switch (status) {
        case 'downloading':
          this.downloadedBookmarks++;
          icon = '📥';
          message = `מוריד תוכן מ-${this.truncateUrl(bookmarkUrl)}... (${this.downloadedBookmarks}/${this.totalBookmarks})`;
          break;
        case 'processing':
          icon = '⏳';
          message = `מעבד תוכן... (${this.processedBookmarks}/${this.totalBookmarks})`;
          break;
      }
    }
    
    this.updateUI(percentage, icon + ' ' + message);
  }

  // Update progress for AI batch processing
  updateBatchProgress(currentBatch, totalBatches) {
    const basePercentage = 50; // Bookmark processing is 0-50%
    const batchPercentage = Math.round((currentBatch / totalBatches) * 50); // AI processing is 50-100%
    const totalPercentage = basePercentage + batchPercentage;
    
    const message = `🤖 שולח batch ${currentBatch}/${totalBatches} ל-AI...`;
    this.updateUI(totalPercentage, message);
  }

  // Update progress for AI response
  updateAIResponse(currentBatch, totalBatches) {
    const basePercentage = 50;
    const batchPercentage = Math.round((currentBatch / totalBatches) * 50);
    const totalPercentage = basePercentage + batchPercentage;
    
    const message = `⏳ ממתין לתשובה מ-AI... (batch ${currentBatch}/${totalBatches})`;
    this.updateUI(totalPercentage, message);
  }

  // Update progress for completion
  complete(resultsCount) {
    const message = `✅ חיפוש הושלם! נמצאו ${resultsCount} תוצאות`;
    this.updateUI(100, message);
    this.hideProgress();
  }

  // Update progress for error
  error(errorMessage) {
    const message = `❌ שגיאה: ${errorMessage}`;
    this.updateUI(0, message);
    setTimeout(() => this.hideProgress(), 5000);
  }

  // Update UI elements
  updateUI(percentage, message) {
    // Update title
    const titleElement = document.getElementById('batchProgressTitle');
    if (titleElement && message) {
      titleElement.textContent = message;
    }
    
    // Update progress bar
    const progressBar = document.getElementById('batchProgressBar');
    if (progressBar && percentage !== undefined) {
      progressBar.style.width = percentage + '%';
    }
    
    // Update text
    const textElement = document.getElementById('batchProgressText');
    if (textElement) {
      let detailText = '';
      
      if (this.isPreMarkdownEnabled && this.processedBookmarks > 0) {
        detailText = `${this.cachedBookmarks} מ-cache, ${this.processedBookmarks - this.cachedBookmarks} הורדו`;
      } else if (this.downloadedBookmarks > 0) {
        detailText = `${this.downloadedBookmarks} סימניות הורדו`;
      }
      
      if (percentage !== undefined) {
        textElement.textContent = `${percentage}% - ${detailText}`;
      } else {
        textElement.textContent = detailText;
      }
    }
  }

  // Helper: Truncate URL for display
  truncateUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url.substring(0, 30) + '...';
    }
  }

  // Reset progress
  reset() {
    this.totalBookmarks = 0;
    this.processedBookmarks = 0;
    this.cachedBookmarks = 0;
    this.downloadedBookmarks = 0;
    this.currentPhase = '';
    this.hideProgress();
  }
}

// Create global instance
const deepSearchProgress = new DeepSearchProgress();
