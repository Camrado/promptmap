// ============================================================
//  PromptMap — content.js
//  Injected into ChatGPT, Claude, and Gemini
// ============================================================

(function () {
  "use strict";

  const PLATFORMS = {
    "chatgpt.com": {
      name: "ChatGPT",
      messageSelector: '[data-message-author-role="user"]',
      textSelector: null,
      // The element that scrolls the conversation
      scrollContainer: () =>
        document.querySelector('[class*="react-scroll-to-bottom"]') ||
        document.querySelector('main') ||
        document.documentElement,
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
      scrollContainer: () =>
        document.querySelector('[class*="overflow-y-auto"]') ||
        document.querySelector('[class*="scrollable"]') ||
        document.querySelector('main') ||
        document.documentElement,
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
      scrollContainer: () =>
        document.querySelector('infinite-scroller') ||
        document.querySelector('[class*="conversation"]') ||
        document.querySelector('main') ||
        document.documentElement,
    },
  };

  // ── Helpers ──────────────────────────────────────────────────

  function getPlatform() {
    const host = location.hostname.replace(/^www\./, "");
    return PLATFORMS[host] || null;
  }

  const NOISE_PATTERNS = [
    /^(claude )?(opus|sonnet|haiku)[\s\d.]*$/i,
    /^(gpt-?4?o?[\s\d.]*)$/i,
    /^gemini[\s\d.]*(pro|flash|ultra)?$/i,
    /^(new chat|start new|clear)$/i,
    /^(send|submit|enter)$/i,
  ];
  function isNoise(text) {
    return NOISE_PATTERNS.some((re) => re.test(text.trim()));
  }

  function extractText(el, textSel) {
    let target = el;
    if (textSel) {
      const inner = el.querySelector(textSel);
      if (inner) target = inner;
    }
    const clone = target.cloneNode(true);
    clone.querySelectorAll(
      '[aria-hidden="true"], .sr-only, [class*="visually-hidden"], ' +
      '[class*="visuallyHidden"], [class*="hiddenText"]'
    ).forEach((n) => n.remove());

    const raw = (clone.innerText || clone.textContent || "").trim();
    const full = raw.replace(/\s+/g, " ").replace(/^you said[:\s]*/i, "").trim();
    if (!full) return null;
    const short = full.length > 60 ? full.slice(0, 60) + "…" : full;
    return { short, full };
  }

  let idCounter = 0;
  function stampId(el) {
    if (!el.dataset.extensionId) {
      idCounter++;
      el.dataset.extensionId = `promptmap-${idCounter}`;
    }
    return el.dataset.extensionId;
  }

  function removeNestedDuplicates(nodes) {
    return nodes.filter(
      (el) => !nodes.some((other) => other !== el && other.contains(el))
    );
  }

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
      if (isNoise(text)) continue;
      if (el.closest('button, select, [role="listbox"], [role="option"], [role="combobox"]')) continue;
      const role = el.getAttribute('role');
      if (role && ['button','option','menuitem','combobox','listbox'].includes(role)) continue;

      const style = window.getComputedStyle(el);
      const isRightAligned =
        style.marginLeft === "auto" || style.alignSelf === "flex-end" ||
        style.float === "right" ||
        (parseInt(style.marginLeft) > 40 && parseInt(style.marginRight) === 0);
      const bg = style.backgroundColor;
      const hasDistinctBg =
        bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent" &&
        bg !== "rgb(255, 255, 255)" && bg !== bodyBg;

      const alreadyCovered = results.some(r => r.contains(el) || el.contains(r));
      if ((isRightAligned || hasDistinctBg) && !alreadyCovered) results.push(el);
    }
    return results;
  }

  // ── Snapshot: read whatever is in the DOM right now ──────────

  function snapshotMessages(platform) {
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

    return nodes
      .map((el) => {
        const texts = extractText(el, platform.textSelector);
        if (!texts || isNoise(texts.full)) return null;
        const id = stampId(el);
        return { id, short: texts.short, full: texts.full };
      })
      .filter(Boolean);
  }

  // ── Load all messages by scrolling to top, waiting, collecting

  async function loadAllMessages(platform) {
    const scroller = platform.scrollContainer
      ? platform.scrollContainer()
      : document.documentElement;

    // Save where the user was so we can restore it after
    const savedScrollTop = scroller.scrollTop;

    // 1. Jump to the very top instantly (no smooth — we want it fast)
    scroller.scrollTop = 0;
    // Also try the window itself in case the scroller isn't the right element
    window.scrollTo(0, 0);

    // 2. Poll until no new messages appear for two consecutive checks
    //    (means the site has finished rendering older messages)
    const POLL_INTERVAL = 400;   // ms between checks
    const STABLE_NEEDED = 3;     // how many identical counts in a row = done
    const MAX_WAIT      = 12000; // bail out after 12 s no matter what

    let lastCount  = -1;
    let stableRuns = 0;
    const start    = Date.now();

    await new Promise((resolve) => {
      const timer = setInterval(() => {
        const msgs = snapshotMessages(platform);
        if (msgs.length === lastCount) {
          stableRuns++;
        } else {
          lastCount  = msgs.length;
          stableRuns = 0;
          // Keep nudging the scroll to top in case lazy-loader needs it
          scroller.scrollTop = 0;
          window.scrollTo(0, 0);
        }
        if (stableRuns >= STABLE_NEEDED || Date.now() - start > MAX_WAIT) {
          clearInterval(timer);
          resolve();
        }
      }, POLL_INTERVAL);
    });

    // 3. Collect the final full list
    const messages = snapshotMessages(platform);

    // Deduplicate by id
    const seen = new Set();
    const unique = messages.filter(({ id }) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    // 4. Restore the user's original scroll position
    //    (use requestAnimationFrame so the DOM has settled first)
    requestAnimationFrame(() => {
      scroller.scrollTop = savedScrollTop;
    });

    return unique;
  }

  // ── Scroll to a specific message ─────────────────────────────

  function scrollToMessage(id) {
    const el = document.querySelector(`[data-extension-id="${id}"]`);
    if (!el) return false;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.style.transition = "outline 0.2s ease";
    el.style.outline = "2px solid rgba(99,102,241,0.8)";
    el.style.outlineOffset = "4px";
    setTimeout(() => { el.style.outline = ""; el.style.outlineOffset = ""; }, 1500);
    return true;
  }

  // ── Message listener ─────────────────────────────────────────

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === "getMessages") {
      const platform = getPlatform();
      if (!platform) {
        sendResponse({ supported: false, messages: [] });
        return true;
      }
      // Run async, keep message channel open
      loadAllMessages(platform).then((messages) => {
        sendResponse({ supported: true, platform: platform.name, messages });
      });
      return true; // keep channel open for async response
    }

    if (request.action === "scrollToMessage") {
      const ok = scrollToMessage(request.id);
      sendResponse({ success: ok });
      return true;
    }
  });
})();
