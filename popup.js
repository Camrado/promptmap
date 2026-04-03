// ============================================================
//  Chat Table of Contents — popup.js
// ============================================================

(function () {
  "use strict";

  const body          = document.getElementById("body");
  const platformLabel = document.getElementById("platform-label");
  const countBadge    = document.getElementById("count-badge");

  function renderLoader() {
    body.innerHTML = `
      <div class="loader">
        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
      </div>`;
  }

  function renderState(icon, title, desc, showRetry) {
    body.innerHTML = `
      <div class="state-box">
        <div class="state-icon">${icon}</div>
        <div class="state-title">${title}</div>
        <div class="state-desc">${desc}</div>
        ${showRetry ? '<button class="retry-btn" id="retry-btn">Try again</button>' : ''}
      </div>`;
    if (showRetry) {
      document.getElementById("retry-btn").addEventListener("click", () => {
        platformLabel.textContent = "Scanning…";
        countBadge.style.display = "none";
        document.querySelector(".footer")?.remove();
        init();
      });
    }
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderMessages(messages) {
    document.querySelector(".footer")?.remove();

    const list = document.createElement("ul");
    list.className = "msg-list";
    list.setAttribute("role", "list");

    messages.forEach(({ id, short, full }, i) => {
      const hasMore = full && full.length > 60;
      const li = document.createElement("li");
      li.className = "msg-item";
      li.dataset.id = id;
      li.style.animationDelay = `${i * 30}ms`;

      li.innerHTML = `
        <span class="msg-num">${i + 1}</span>
        <div class="msg-body">
          <span class="msg-text">${escapeHtml(short)}</span>
          ${hasMore ? `
            <div class="msg-full hidden">${escapeHtml(full)}</div>
            <button class="expand-btn" aria-label="Show full message">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <polyline points="2,4 6,8 10,4"/>
              </svg>
              <span class="expand-label">show more</span>
            </button>` : ''}
        </div>`;

      // Click on text / number → scroll to message
      li.querySelector('.msg-num').addEventListener('click', () => scrollTo(id));
      li.querySelector('.msg-text').addEventListener('click', () => scrollTo(id));
      li.querySelector('.msg-full')?.addEventListener('click', () => scrollTo(id));

      // Expand button toggles full text
      const expandBtn = li.querySelector('.expand-btn');
      if (expandBtn) {
        expandBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const fullEl   = li.querySelector('.msg-full');
          const shortEl  = li.querySelector('.msg-text');
          const label    = expandBtn.querySelector('.expand-label');
          const arrow    = expandBtn.querySelector('svg');
          const expanded = !fullEl.classList.contains('hidden');

          if (expanded) {
            fullEl.classList.add('hidden');
            shortEl.classList.remove('hidden');
            label.textContent = 'show more';
            arrow.style.transform = '';
          } else {
            fullEl.classList.remove('hidden');
            shortEl.classList.add('hidden');
            label.textContent = 'show less';
            arrow.style.transform = 'rotate(180deg)';
          }
        });
      }

      list.appendChild(li);
    });

    body.innerHTML = "";
    body.appendChild(list);

    const footer = document.createElement("div");
    footer.className = "footer";
    footer.textContent = "click any prompt to jump there";
    body.parentElement.appendChild(footer);
  }

  function scrollTo(id) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) return;
      chrome.tabs.sendMessage(tab.id, { action: "scrollToMessage", id }, () => window.close());
    });
  }

  function ensureContentScript(tabId, callback) {
    chrome.scripting.executeScript(
      { target: { tabId }, func: () => typeof window.__chatTocInjected !== "undefined" },
      (results) => {
        if (results?.[0]?.result === true) { callback(); return; }
        chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }, () => callback());
      }
    );
  }

  function init() {
    renderLoader();
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) { renderState("⚠️", "No active tab", "Could not access the current tab.", false); return; }

      const url      = tab.url || "";
      const isClaude = url.includes("claude.ai");
      const supported = isClaude || url.includes("chatgpt.com") || url.includes("gemini.google.com");

      if (!supported) {
        platformLabel.textContent = "unsupported page";
        renderState("🔍", "Not an AI chat page", "Open this on ChatGPT, Claude, or Gemini.", false);
        return;
      }

      ensureContentScript(tab.id, () => {
        chrome.tabs.sendMessage(tab.id, { action: "getMessages" }, (response) => {
          if (chrome.runtime.lastError) {
            platformLabel.textContent = "error";
            renderState("⚡", "Could not connect", "Refresh the page and try again.", true);
            return;
          }
          if (!response?.supported) {
            platformLabel.textContent = "unsupported";
            renderState("🔍", "Site not recognised", "This page isn't supported yet.", false);
            return;
          }

          platformLabel.textContent = response.platform || "AI Chat";

          if (!response.messages?.length) {
            const desc = isClaude
              ? "No prompts detected. Make sure the conversation has loaded fully, then try again."
              : "Send your first message in the chat, then reopen this panel.";
            renderState("💬", "No messages found", desc, isClaude);
            return;
          }

          countBadge.textContent = `${response.messages.length} prompt${response.messages.length !== 1 ? "s" : ""}`;
          countBadge.style.display = "block";
          renderMessages(response.messages);
        });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
