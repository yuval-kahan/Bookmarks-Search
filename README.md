# AI Bookmark Search - Chrome Extension

Search your Chrome bookmarks using simple text search or AI-powered natural language queries with Ollama.

## Features

- **Simple Search**: Fast keyword-based search through your bookmarks
- **AI Search**: Natural language queries powered by local Ollama models
- Search includes all bookmarks from all folders and subfolders

## Installation

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `chrome-bookmark-search` folder
5. The extension icon will appear in your toolbar

## Usage

### Simple Search
1. Click the extension icon
2. Keep "Simple Search" selected
3. Type a keyword (e.g., "github")
4. Click Search or press Enter

### AI Search with Ollama

#### Prerequisites
1. Install Ollama from https://ollama.ai
2. Pull a model: `ollama pull llama2` (or any other model)
3. Make sure Ollama is running: `ollama serve`

#### Using AI Search
1. Click the extension icon
2. Select **AI Search (Ollama)**
3. (Optional) Configure Ollama URL and model name
   - Default URL: `http://localhost:11434`
   - Default model: `llama2`
4. Type a natural language query like:
   - "websites about artificial intelligence"
   - "where did I save that recipe?"
   - "programming tutorials"
5. Click Search

The AI will analyze all your bookmarks and return the most relevant ones based on your query.

## How It Works

- **Simple Search**: Uses Chrome's built-in bookmark search API
- **AI Search**: 
  1. Retrieves ALL your bookmarks (including folder structure)
  2. Sends them to your local Ollama instance
  3. AI analyzes the query and returns relevant bookmark numbers
  4. Extension displays the matching bookmarks

## Privacy

- All data stays local on your machine
- No external servers are contacted (except your local Ollama instance)
- Your bookmarks are never sent to the cloud

## Troubleshooting

**AI Search not working?**
- Make sure Ollama is running: `ollama serve`
- Check if the model is installed: `ollama list`
- Verify the Ollama URL is correct (default: http://localhost:11434)

**No results found?**
- Try a different query
- Make sure you have bookmarks saved
- For AI search, try a more specific or different phrasing

## Supported Ollama Models

Any Ollama model should work, but recommended:
- `llama2` (default)
- `llama3`
- `mistral`
- `phi`

## License

CC0-1.0 license

#
# Deep Bookmarks Search 🔍

Deep Bookmarks Search is an advanced feature that searches not just bookmark metadata (title, URL, folder), but also the actual content of the webpages.

### How It Works

1. **Enable Deep Search**: Check the "Deep Bookmarks Search" checkbox in the main popup
2. **Optional Pre-Processing**: Enable "Pre Markdown" to convert all bookmarks ahead of time for faster searches
3. **Search**: The system will:
   - Fetch webpage content
   - Convert to clean Markdown (text only, no images)
   - Send to AI for more accurate matching
   - Cache results for future searches

### Configuration

Go to Settings → Bookmarks Batch → Deep Search Settings:

- **Batch Size**: Number of bookmarks per batch (1-10, default: 3)
  - Smaller batches recommended due to larger data size
- **Cache Duration**: How long to keep converted pages (1-168 hours, default: 24)
- **Max Page Size**: Maximum page size to process (50-1000 KB, default: 500)
- **Clear Cache**: Remove all cached Markdown content

### Benefits

- **More Accurate Results**: Find bookmarks based on page content, not just titles
- **Better Context**: AI understands what the page is actually about
- **Cached Performance**: Once converted, searches are fast

### Limitations

- **Slower First Search**: Initial conversion takes time
- **Storage**: Cached content uses local storage
- **CORS Restrictions**: Some websites may block content fetching
- **Smaller Batches**: Processes fewer bookmarks at once due to data size

### Troubleshooting

**Problem**: "Failed to convert" errors
- **Solution**: Some websites block content fetching. The system will fall back to metadata-only search for those bookmarks.

**Problem**: Slow performance
- **Solution**: Enable "Pre Markdown" to convert all bookmarks ahead of time, or reduce batch size in settings.

**Problem**: Storage quota exceeded
- **Solution**: Clear the Markdown cache in Settings → Bookmarks Batch → Deep Search Settings.
