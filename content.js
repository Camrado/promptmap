// ============================================================
//  Chat Table of Contents — content.js
//  Injected into ChatGPT, Claude, and Gemini
// ============================================================

(function () {
  "use strict";

  const PLATFORMS = {
    "chatgpt.com": {
      name: "ChatGPT",
      messageSelector: '[data-message-author-role="user"]',
      textSelector: null,
    },

    "claude.ai": {
      name: "Claude",
      fallbackSelectors: [
        '[data-testid="user-human-turn"]',
        '[data-testid="human-turn"]',
        '.human-turn',
        '[class*="HumanTurn"]',
        '[class*="human-turn"]',
        '[class*="humanTurn"]',
        '[data-is-user="true"]',
      ],
      textSelector: null,
      useHeuristic: true,
    },

    "gemini.google.com": {
      name: "Gemini",
      messageSelector: 'user-query',
      textSelector: '.query-text',
      fallbackSelectors: [
        '[data-test-id="user-query"]',
        '.user-query-container',
        '.query-text',
      ],
    },
  };

  // ── Helpers ─────────────────────────────────────────────────

  function getPlatform() {
    const host = location.hostname.replace(/^www\./, "");
    return PLATFORMS[host] || null;
  }

  // Known non-message strings that can bleed into results
  const NOISE_PATTERNS = [
    /^(claude )?(opus|sonnet|haiku)[\s\d.]*$/i,  // model names: "Sonnet 4.6", "Claude Opus 4"
    /^(gpt-?4?o?[\s\d.]*)$/i,                    // GPT model names
    /^gemini[\s\d.]*(pro|flash|ultra)?$/i,        // Gemini model names
    /^(new chat|start new|clear)$/i,
    /^(send|submit|enter)$/i,
  ];

  function isNoise(text) {
    return NOISE_PATTERNS.some((re) => re.test(text.trim()));
  }

  /**
   * Extract text from an element, returning { short, full }.
   * short = first 60 chars (for display)
   * full  = entire text (for expand)
   */
  function extractText(el, textSel) {
    let target = el;
    if (textSel) {
      const inner = el.querySelector(textSel);
      if (inner) target = inner;
    }

    const clone = target.cloneNode(true);
    // Remove hidden / decorative nodes
    clone.querySelectorAll(
      '[aria-hidden="true"], .sr-only, [class*="visually-hidden"], ' +
      '[class*="visuallyHidden"], [class*="hiddenText"]'
    ).forEach((n) => n.remove());

    const raw = (clone.innerText || clone.textContent || "").trim();
    const full = raw
      .replace(/\s+/g, " ")
      .replace(/^you said[:\s]*/i, "")
      .trim();

    if (!full) return null;

    const short = full.length > 60 ? full.slice(0, 60) + "…" : full;
    return { short, full };
  }

  let idCounter = 0;
  function stampId(el) {
    if (!el.dataset.extensionId) {
      idCounter++;
      el.dataset.extensionId = `chat-toc-${idCounter}`;
    }
    return el.dataset.extensionId;
  }

  function removeNestedDuplicates(nodes) {
    return nodes.filter(
      (el) => !nodes.some((other) => other !== el && other.contains(el))
    );
  }

  // ── Claude heuristic ────────────────────────────────────────

  function claudeHeuristic() {
    const results = [];
    const candidates = Array.from(document.querySelectorAll('div, article, section'));
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;

    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 10) continue;
      if (el.querySelectorAll('div').length > 30) continue;

      const text = (el.innerText || "").trim();
      if (!text || text.length < 2 || text.length > 4000) continue;

      // ── Key fix: skip model-selector / UI chrome elements ──
      // These are short strings matching known model/button labels
      if (isNoise(text)) continue;
      // Skip elements that are buttons or inside a button/select
      if (el.closest('button, select, [role="listbox"], [role="option"], [role="combobox"]')) continue;
      // Skip elements with button-like roles themselves
      const role = el.getAttribute('role');
      if (role && ['button','option','menuitem','combobox','listbox'].includes(role)) continue;

      const style = window.getComputedStyle(el);
      const isRightAligned =
        style.marginLeft === "auto" ||
        style.alignSelf === "flex-end" ||
        style.float === "right" ||
        (parseInt(style.marginLeft) > 40 && parseInt(style.marginRight) === 0);

      const bg = style.backgroundColor;
      const hasDistinctBg =
        bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent" &&
        bg !== "rgb(255, 255, 255)" && bg !== bodyBg;

      const alreadyCovered = results.some(r => r.contains(el) || el.contains(r));

      if ((isRightAligned || hasDistinctBg) && !alreadyCovered) {
        results.push(el);
      }
    }

    return results;
  }

  // ── Core: collect user messages ─────────────────────────────

  function collectMessages() {
    const platform = getPlatform();
    if (!platform) return { supported: false, messages: [] };

    let nodes = [];

    if (platform.messageSelector) {
      nodes = Array.from(document.querySelectorAll(platform.messageSelector));
    }

    if (nodes.length === 0 && platform.fallbackSelectors) {
      for (const sel of platform.fallbackSelectors) {
        try {
          const found = Array.from(document.querySelectorAll(sel));
          if (found.length > 0) { nodes = found; break; }
        } catch (_) {}
      }
    }

    if (nodes.length === 0 && platform.useHeuristic) {
      nodes = claudeHeuristic();
    }

    nodes = removeNestedDuplicates(nodes);

    const messages = nodes
      .map((el) => {
        const texts = extractText(el, platform.textSelector);
        if (!texts) return null;
        if (isNoise(texts.full)) return null;
        const id = stampId(el);
        return { id, short: texts.short, full: texts.full };
      })
      .filter(Boolean);

    const seen = new Set();
    const unique = messages.filter(({ id }) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    return { supported: true, platform: platform.name, messages: unique };
  }

  // ── Scroll ───────────────────────────────────────────────────

  function scrollToMessage(id) {
    const el = document.querySelector(`[data-extension-id="${id}"]`);
    if (!el) return false;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.style.transition = "outline 0.2s ease";
    el.style.outline = "2px solid rgba(99,102,241,0.8)";
    el.style.outlineOffset = "4px";
    setTimeout(() => {
      el.style.outline = "";
      el.style.outlineOffset = "";
    }, 1500);
    return true;
  }

  // ── Message listener ─────────────────────────────────────────

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === "getMessages") {
      sendResponse(collectMessages());
      return true;
    }
    if (request.action === "scrollToMessage") {
      const ok = scrollToMessage(request.id);
      sendResponse({ success: ok });
      return true;
    }
  });
})();
