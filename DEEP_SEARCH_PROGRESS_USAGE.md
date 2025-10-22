# Deep Search Progress - Usage Guide

## Overview
This module provides real-time progress tracking for Deep Search operations with visual feedback.

## How to Use

### 1. Initialize Progress
When starting a Deep Search, initialize the progress tracker:

```javascript
// Get total number of bookmarks to process
const bookmarks = [...]; // Your bookmarks array
const totalBookmarks = bookmarks.length;

// Check if Pre Markdown is enabled
const isPreMarkdownEnabled = document.getElementById('preMarkdownCheckbox').checked;

// Initialize progress
deepSearchProgress.init(totalBookmarks, isPreMarkdownEnabled);
```

### 2. Update Progress During Bookmark Processing

#### With Pre Markdown Enabled:
```javascript
for (const bookmark of bookmarks) {
  // Check cache
  deepSearchProgress.updateBookmarkProgress(bookmark.url, 'checking_cache');
  
  const cachedContent = await checkCache(bookmark.url);
  
  if (cachedContent) {
    // Found in cache
    deepSearchProgress.updateBookmarkProgress(bookmark.url, 'found_in_cache');
  } else {
    // Download content
    deepSearchProgress.updateBookmarkProgress(bookmark.url, 'downloading');
    const html = await downloadPage(bookmark.url);
    
    // Convert to Markdown
    deepSearchProgress.updateBookmarkProgress(bookmark.url, 'converting');
    const markdown = await convertToMarkdown(html);
    
    // Save to cache
    deepSearchProgress.updateBookmarkProgress(bookmark.url, 'saving_cache');
    await saveToCache(bookmark.url, markdown);
  }
}
```

#### Without Pre Markdown:
```javascript
for (const bookmark of bookmarks) {
  // Download content
  deepSearchProgress.updateBookmarkProgress(bookmark.url, 'downloading');
  const content = await downloadPage(bookmark.url);
  
  // Process content
  deepSearchProgress.updateBookmarkProgress(bookmark.url, 'processing');
  await processContent(content);
}
```

### 3. Update Progress During AI Batch Processing

```javascript
const batches = createBatches(bookmarks, BATCH_SIZE);

for (let i = 0; i < batches.length; i++) {
  const currentBatch = i + 1;
  const totalBatches = batches.length;
  
  // Sending to AI
  deepSearchProgress.updateBatchProgress(currentBatch, totalBatches);
  
  // Waiting for AI response
  deepSearchProgress.updateAIResponse(currentBatch, totalBatches);
  
  const results = await sendToAI(batches[i]);
  // Process results...
}
```

### 4. Complete or Handle Errors

#### On Success:
```javascript
const resultsCount = results.length;
deepSearchProgress.complete(resultsCount);
```

#### On Error:
```javascript
try {
  // ... deep search code
} catch (error) {
  deepSearchProgress.error(error.message);
}
```

### 5. Reset (Optional)
If you need to manually reset the progress:

```javascript
deepSearchProgress.reset();
```

## Progress Phases

### Phase 1: Bookmark Processing (0-50%)
- **With Pre Markdown:**
  - 💾 Checking cache
  - ⚡ Found in cache
  - 📥 Downloading content
  - 🔄 Converting to Markdown
  - 💾 Saving to cache

- **Without Pre Markdown:**
  - 📥 Downloading content
  - ⏳ Processing content

### Phase 2: AI Processing (50-100%)
- 🤖 Sending batch to AI
- ⏳ Waiting for AI response
- ✅ Completion

## Visual Feedback

The progress UI shows:
1. **Icon + Message**: Current operation (e.g., "📥 מוריד תוכן מ-example.com...")
2. **Progress Bar**: Visual percentage (0-100%)
3. **Details**: Statistics (e.g., "15 מ-cache, 5 הורדו")
4. **Percentage**: Numeric progress (e.g., "45%")

## Example: Complete Integration

```javascript
async function performDeepSearch(query, bookmarks) {
  try {
    // 1. Initialize
    const isPreMarkdown = document.getElementById('preMarkdownCheckbox').checked;
    deepSearchProgress.init(bookmarks.length, isPreMarkdown);
    
    // 2. Process bookmarks
    const processedBookmarks = [];
    for (const bookmark of bookmarks) {
      if (isPreMarkdown) {
        deepSearchProgress.updateBookmarkProgress(bookmark.url, 'checking_cache');
        const cached = await checkCache(bookmark.url);
        
        if (cached) {
          deepSearchProgress.updateBookmarkProgress(bookmark.url, 'found_in_cache');
          processedBookmarks.push({ ...bookmark, content: cached });
        } else {
          deepSearchProgress.updateBookmarkProgress(bookmark.url, 'downloading');
          const html = await fetch(bookmark.url).then(r => r.text());
          
          deepSearchProgress.updateBookmarkProgress(bookmark.url, 'converting');
          const markdown = convertToMarkdown(html);
          
          deepSearchProgress.updateBookmarkProgress(bookmark.url, 'saving_cache');
          await saveCache(bookmark.url, markdown);
          
          processedBookmarks.push({ ...bookmark, content: markdown });
        }
      } else {
        deepSearchProgress.updateBookmarkProgress(bookmark.url, 'downloading');
        const content = await fetch(bookmark.url).then(r => r.text());
        processedBookmarks.push({ ...bookmark, content });
      }
    }
    
    // 3. Send to AI in batches
    const batches = createBatches(processedBookmarks, 10);
    const allResults = [];
    
    for (let i = 0; i < batches.length; i++) {
      deepSearchProgress.updateBatchProgress(i + 1, batches.length);
      
      deepSearchProgress.updateAIResponse(i + 1, batches.length);
      const results = await sendToAI(query, batches[i]);
      
      allResults.push(...results);
    }
    
    // 4. Complete
    deepSearchProgress.complete(allResults.length);
    
    return allResults;
    
  } catch (error) {
    deepSearchProgress.error(error.message);
    throw error;
  }
}
```

## Notes

- Progress automatically hides after 3 seconds on completion
- Progress hides after 5 seconds on error
- URLs are automatically truncated to show only hostname
- All messages are in Hebrew for consistency with the UI
