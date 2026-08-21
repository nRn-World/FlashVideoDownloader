// Flash Video Downloader - Offscreen DOM Blob Processor

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DOWNLOAD_CHUNKS') {
    const { chunks, filename, mimeType } = message;

    try {
      // 1. Skapa Blob direkt i fullfjädrad DOM-miljö
      const fullBlob = new Blob(chunks, { type: mimeType || 'video/mp4' });
      const blobUrl = URL.createObjectURL(fullBlob);

      // 2. Använd ett dolt <a> ankare för omedelbar och tillförlitlig webbläsarnedladdning utan storleksbegränsning
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // 3. Städa upp ObjectURL efter en stund
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 60000);

      sendResponse({ status: 'ok', size: fullBlob.size });
    } catch (err) {
      console.error('Offscreen download error:', err);
      sendResponse({ status: 'error', error: err.message });
    }
  }
  return true;
});
