// Content script for RAW data modal
// This script is injected into the active tab to show the modal

function showRawModal(rawData) {
  // Remove existing modal if any
  const existingModal = document.getElementById('bookmark-search-raw-modal');
  if (existingModal) {
    existingModal.remove();
  }

  // Create modal HTML
  const modalHTML = `
    <div id="bookmark-search-raw-modal" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.8);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    ">
      <div style="
        background: white;
        border-radius: 12px;
        width: 800px;
        max-width: 90vw;
        height: 600px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      ">
        <div style="
          padding: 20px;
          border-bottom: 2px solid #f0f0f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        ">
          <div style="font-size: 18px; font-weight: 600; color: #667eea;">
            📤 RAW Data View
          </div>
          <div id="bookmark-search-raw-close" style="
            cursor: pointer;
            font-size: 32px;
            color: #999;
            line-height: 1;
            transition: color 0.2s ease;
          ">×</div>
        </div>
        <div style="
          padding: 20px;
          overflow-y: auto;
          flex: 1;
        ">
          <div style="margin-bottom: 25px;">
            <div style="
              font-size: 14px;
              font-weight: 600;
              color: #667eea;
              margin-bottom: 10px;
              display: flex;
              align-items: center;
              gap: 5px;
            ">📨 Sent to AI:</div>
            <div style="
              background: #f8f9fa;
              padding: 15px;
              border-radius: 8px;
              border-left: 4px solid #667eea;
              font-family: 'Courier New', monospace;
              font-size: 12px;
              line-height: 1.8;
              white-space: pre-wrap;
              word-break: break-word;
              max-height: 250px;
              overflow-y: auto;
              color: #333;
            ">${rawData.sent || 'No data sent yet'}</div>
          </div>
          <div>
            <div style="
              font-size: 14px;
              font-weight: 600;
              color: #667eea;
              margin-bottom: 10px;
              display: flex;
              align-items: center;
              gap: 5px;
            ">📥 Received from AI:</div>
            <div style="
              background: #f8f9fa;
              padding: 15px;
              border-radius: 8px;
              border-left: 4px solid #48bb78;
              font-family: 'Courier New', monospace;
              font-size: 12px;
              line-height: 1.8;
              white-space: pre-wrap;
              word-break: break-word;
              max-height: 150px;
              overflow-y: auto;
              color: #333;
            ">${rawData.received || 'No data received yet'}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Insert modal into page
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // Add close handlers
  const modal = document.getElementById('bookmark-search-raw-modal');
  const closeBtn = document.getElementById('bookmark-search-raw-close');

  closeBtn.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target.id === 'bookmark-search-raw-modal') {
      modal.remove();
    }
  });

  // Close on Escape key
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showRawModal') {
    showRawModal(request.rawData);
    sendResponse({ success: true });
  }
});
