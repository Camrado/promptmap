# PromptMap — Chrome Extension

A Manifest V3 Chrome extension that adds a **Table of Contents** panel to
ChatGPT, Claude, and Gemini. Click the extension icon to see every prompt
you've sent, then click any item to jump directly to it.

---

## Installation Guide

### Step 1 — Download / unzip the extension

Place the `chat-toc-extension/` folder somewhere permanent on your computer
(e.g. `~/extensions/chat-toc-extension`). Don't move or delete it — Chrome
loads the extension directly from this folder.

### Step 2 — Open Chrome Extensions

1. Open **Google Chrome**.
2. In the address bar, type:

   ```
   chrome://extensions
   ```

   and press **Enter**.

### Step 3 — Enable Developer Mode

In the top-right corner of the Extensions page, toggle **Developer mode** ON.

### Step 4 — Load the unpacked extension

1. Click the **"Load unpacked"** button that appears in the top-left.
2. In the file-picker dialog, navigate to and **select the `chat-toc-extension` folder** (the one that contains `manifest.json`).
3. Click **"Select Folder"** (or **"Open"** on macOS).

The extension will appear in your list with the name **"Chat Table of Contents"**.

### Step 5 — Pin the extension (optional but handy)

1. Click the **puzzle-piece icon** (🧩) in the Chrome toolbar.
2. Find **Chat Table of Contents** and click the **pin icon** (📌) next to it.

The extension icon will now be permanently visible in your toolbar.

---

## How to Use

1. Open **ChatGPT** (`chatgpt.com`), **Claude** (`claude.ai`), or **Gemini** (`gemini.google.com`).
2. Have a conversation with at least one message sent.
3. Click the **Chat Contents** icon in your toolbar.
4. A popup shows all your prompts, numbered in order.
5. Click any prompt → the page smoothly scrolls to that message and a brief
   highlight appears around it.

---

## File Structure

```
chat-toc-extension/
├── manifest.json     — Extension configuration (MV3)
├── content.js        — Injected into AI chat pages; parses DOM & handles scroll
├── popup.html        — Extension popup UI
├── popup.css         — Dark-mode styling
├── popup.js          — Popup logic: requests messages, renders list
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Updating Selectors

AI chat sites frequently change their DOM. If messages stop being detected,
open `content.js` and update the selectors in the **`PLATFORMS`** object at the
top of the file. No other changes are needed.

```js
const PLATFORMS = {
  "chatgpt.com": {
    messageSelector: '[data-message-author-role="user"]',
    ...
  },
  "claude.ai": {
    messageSelector: '[data-testid="user-human-turn"]',
    ...
  },
  "gemini.google.com": {
    messageSelector: 'user-query, [data-test-id="user-query"]',
    ...
  },
};
```

After editing, go back to `chrome://extensions` and click the **↺ reload**
button on the extension card.
