/**
 * Content script. Three jobs, in order of how much they matter:
 *
 *   1. Put the right igd-* classes on <html> before the first paint, so the
 *      static stylesheet in rules.css does the bulk of the hiding with no
 *      flash of unwanted content.
 *   2. Guard routes, so /reels, /explore and /stories bounce somewhere useful
 *      and home lands on the Following feed.
 *   3. Run a small set of scanners for the handful of things CSS cannot
 *      express, such as "the block whose heading reads Suggested for you".
 *
 * Two deliberate departures from how this is usually done:
 *
 *   Settings are mirrored into localStorage. chrome.storage is async, which
 *   means a page can paint before the first value arrives. The mirror is
 *   synchronous and same origin, so the classes land on <html> in the same
 *   tick the script starts. No blanking the page and fading it back in.
 *
 *   There is no polling. Navigation arrives as an event from main-world.js,
 *   and DOM changes arrive through one MutationObserver whose callback is
 *   coalesced to at most one pass per frame with a floor between passes.
 */

(() => {
  "use strict";

  const api = globalThis.chrome || globalThis.browser;
  const REG = globalThis.IGD_REGISTRY;
  const S = globalThis.IGD_SELECTORS;
  const M = S.marks;

  if (!api || !REG || !S) return;

  const root = document.documentElement;
  let state = REG.resolve(readMirror());

  /* ------------------------------------------------------------- settings */

  function readMirror() {
    try {
      const raw = localStorage.getItem(REG.MIRROR_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeMirror(value) {
    try {
      localStorage.setItem(REG.MIRROR_KEY, JSON.stringify(value));
    } catch (_) {
      /* private mode or a full quota, the async path still works */
    }
  }

  function applyClasses() {
    const cls = root.classList;
    for (const feature of REG.FEATURES) {
      if (feature.type === "select") continue;
      cls.toggle(`igd-${feature.id}`, !!state[feature.id]);
    }
    for (const font of REG.FONTS) cls.remove(`igd-font-${font.id}`);
    if (state.enabled && state.font && state.font !== "default") {
      cls.add(`igd-font-${state.font}`);
    }
    cls.toggle("igd-on", !!state.enabled);
  }

  function setState(raw) {
    state = REG.resolve(raw);
    writeMirror(state);
    applyClasses();
    applyRouteClasses();
    guardRoute();
    schedule();
  }

  /* --------------------------------------------------------------- routes */

  const RESERVED_SEGMENTS = new Set([
    "explore",
    "reels",
    "reel",
    "direct",
    "stories",
    "accounts",
    "p",
    "tv",
    "about",
    "legal",
    "settings",
    "notifications",
    "your_activity",
    "challenge",
    "emails",
  ]);

  function isRoute(name) {
    const path = location.pathname;
    if (name === "home") return path === "/";
    if (name === "profile") {
      const parts = path.split("/").filter(Boolean);
      return parts.length === 1 && !RESERVED_SEGMENTS.has(parts[0]);
    }
    return S.routes[name] ? S.routes[name].test(path) : false;
  }

  function applyRouteClasses() {
    const cls = root.classList;
    cls.toggle("igd-route-home", isRoute("home"));
    cls.toggle("igd-route-direct", isRoute("direct"));
    cls.toggle("igd-route-profile", isRoute("profile"));
  }

  /**
   * Picks at most one destination so that overlapping redirect rules cannot
   * bounce the tab between two of them.
   */
  function redirectTarget() {
    if (!state.enabled) return null;

    const path = location.pathname;
    const home = state.following_feed ? S.paths.followingFeed : S.paths.home;
    const atHome = path === "/";

    if (state.dm_first) {
      if (atHome || isRoute("reels") || isRoute("explore")) return S.paths.inbox;
    }
    if (state.hide_reels && isRoute("reels")) return home;
    if (state.hide_explore && isRoute("explore")) return home;
    if (state.hide_stories_all && isRoute("stories")) return home;
    if (state.following_feed && atHome) {
      const variant = new URLSearchParams(location.search).get("variant");
      if (variant !== "following") return S.paths.followingFeed;
    }
    return null;
  }

  /**
   * Instagram can rewrite the URL right back at us, and a redirect that fires
   * every time would pin the tab in a reload loop. Five navigations inside
   * five seconds is treated as a loop and stops the guard for that tab.
   */
  function redirectAllowed() {
    try {
      const now = Date.now();
      const recent = JSON.parse(sessionStorage.getItem("igd.redirects") || "[]")
        .filter((t) => now - t < 5000);
      if (recent.length >= 5) {
        console.warn("[instagram-debloat] redirect loop detected, guard paused");
        return false;
      }
      recent.push(now);
      sessionStorage.setItem("igd.redirects", JSON.stringify(recent));
      return true;
    } catch (_) {
      return true;
    }
  }

  function guardRoute() {
    const target = redirectTarget();
    if (!target) return;
    if (location.pathname + location.search === target) return;
    if (!redirectAllowed()) return;
    location.replace(target);
  }

  /* -------------------------------------------------------------- helpers */

  const norm = (text) => (text || "").replace(/\s+/g, " ").trim();

  const COUNT_ONLY = /^\d[\d.,\s ]*(?:[kmb])?$/i;

  function isMetricText(text) {
    const low = text.toLowerCase();
    if (!/^\d/.test(low)) return false;
    return S.vanity.countWords.some((word) => low.includes(word));
  }

  function isReddish(color) {
    const parts = /rgba?\(([^)]+)\)/.exec(color);
    if (!parts) return false;
    const [r, g, b, a] = parts[1].split(",").map((n) => parseFloat(n));
    if (a !== undefined && a < 0.5) return false;
    const t = S.badges.reddishChannels;
    return r >= t.minRed && g <= t.maxGreen && b <= t.maxBlue;
  }

  /**
   * Walks up from a matched label to the block that should be hidden.
   * Stops at an <article>, or as soon as the next step would swallow a page
   * region, whichever comes first.
   */
  function climbToBlock(el, limit) {
    let node = el;
    let best = el;
    for (let i = 0; i < limit; i++) {
      const parent = node.parentElement;
      if (!parent) break;
      if (
        parent === document.body ||
        parent.tagName === "MAIN" ||
        parent.getAttribute("role") === "main"
      ) {
        best = node;
        break;
      }
      node = parent;
      best = node;
      if (node.tagName === "ARTICLE") break;
    }
    return best;
  }

  /* ------------------------------------------------------------- scanners */

  const seen = {
    suggested: new WeakSet(),
    notes: new WeakSet(),
    vanity: new WeakSet(),
    badge: new WeakSet(),
    ring: new WeakSet(),
  };

  function scanSuggested() {
    const candidates = document.querySelectorAll(
      'span, h1, h2, h3, [role="heading"]'
    );
    for (const el of candidates) {
      if (seen.suggested.has(el)) continue;
      seen.suggested.add(el);
      if (el.childElementCount > 0) continue;
      const text = norm(el.textContent).toLowerCase();
      if (!text || text.length > 40) continue;
      if (!S.suggested.labels.some((label) => text.includes(label))) continue;
      const block = climbToBlock(el, S.suggested.climb);
      if (block && block !== document.body) block.setAttribute(M.suggested, "");
    }
  }

  function scanNotes() {
    if (!isRoute("direct")) return;
    const candidates = document.querySelectorAll("[aria-label], span");
    for (const el of candidates) {
      if (seen.notes.has(el)) continue;
      seen.notes.add(el);
      const label = norm(
        el.getAttribute("aria-label") ||
          (el.childElementCount === 0 ? el.textContent : "")
      ).toLowerCase();
      if (!label || label.length > 24) continue;
      if (!S.notes.labels.some((l) => label === l || label.startsWith(l))) continue;

      const block = climbToBlock(el, S.notes.climb);
      if (!block || block === document.body) continue;
      // A block holding the conversation list is the list, not the note tray.
      if (block.querySelectorAll('a[href^="/direct/t/"]').length > 3) continue;
      block.setAttribute(M.notes, "");
    }
  }

  function scanVanity() {
    const profileCounts = document.querySelectorAll(
      `${S.vanity.followers}, ${S.vanity.following}`
    );
    for (const link of profileCounts) {
      if (seen.vanity.has(link)) continue;
      seen.vanity.add(link);
      for (const span of link.querySelectorAll("span")) {
        if (span.childElementCount > 0) continue;
        const text = norm(span.textContent);
        if (text && COUNT_ONLY.test(text)) span.setAttribute(M.vanity, "");
      }
    }

    const loose = document.querySelectorAll('button, span[dir="auto"]');
    for (const el of loose) {
      if (seen.vanity.has(el)) continue;
      seen.vanity.add(el);
      const text = norm(el.textContent);
      if (!text || text.length > 32) continue;
      if (isMetricText(text)) el.setAttribute(M.vanity, "");
    }
  }

  function scanBadges() {
    for (const container of document.querySelectorAll(S.navRoots)) {
      for (const el of container.querySelectorAll("span, div")) {
        if (seen.badge.has(el)) continue;
        seen.badge.add(el);
        if (el.childElementCount > 0) continue;

        const text = norm(el.textContent);
        if (text) {
          if (S.badges.countText.test(text)) el.setAttribute(M.badge, "");
          continue;
        }

        const box = el.getBoundingClientRect();
        if (!box.width || box.width > S.badges.maxDotSize) continue;
        if (Math.abs(box.width - box.height) > 2) continue;
        if (isReddish(getComputedStyle(el).backgroundColor)) {
          el.setAttribute(M.badge, "");
        }
      }
    }
  }

  function scanVideos() {
    for (const video of document.querySelectorAll(S.media.video)) {
      video.setAttribute(M.video, "");
      if (video.paused && !video.currentSrc && !video.getAttribute("src")) continue;
      try {
        video.autoplay = false;
        video.preload = "none";
        video.pause();
        video.removeAttribute("src");
        for (const source of video.querySelectorAll("source")) source.remove();
        video.load();
      } catch (_) {
        /* the element went away mid pass */
      }
    }
  }

  function scanHomeLinks() {
    for (const link of document.querySelectorAll(S.homeLinks)) {
      link.setAttribute("href", S.paths.followingFeed);
    }
  }

  function scanStoryRings() {
    for (const canvas of document.querySelectorAll(S.stories.ring)) {
      if (seen.ring.has(canvas)) continue;
      seen.ring.add(canvas);
      const sibling = canvas.nextElementSibling;
      if (sibling && sibling.querySelector(S.stories.ringNeighbour)) {
        canvas.setAttribute(M.storyRing, "");
      }
    }
  }

  function scanStoryTray() {
    if (!isRoute("home")) return;
    if (document.querySelector(S.stories.tray)) return; // rules.css has it
    const main = document.querySelector("main");
    if (!main || main.querySelector(`[${M.storyTray}]`)) return;

    // Document order, so the first hit is the outermost qualifying wrapper.
    for (const div of main.querySelectorAll("div")) {
      if (div.querySelector("article")) continue;
      if (div.querySelectorAll("canvas").length < 3) continue;
      div.setAttribute(M.storyTray, "");
      return;
    }
  }

  const SCANNERS = [
    { needs: ["hide_suggested"], run: scanSuggested },
    { needs: ["hide_notes"], run: scanNotes },
    { needs: ["hide_vanity"], run: scanVanity },
    { needs: ["hide_badges", "gray_badges"], run: scanBadges },
    { needs: ["block_videos"], run: scanVideos },
    { needs: ["following_feed"], run: scanHomeLinks },
    { needs: ["hide_stories_all"], run: scanStoryRings },
    { needs: ["hide_stories_home"], run: scanStoryTray },
  ];

  /* -------------------------------------------------------------- observer */

  const MIN_GAP_MS = 120;
  let observer = null;
  let scheduled = false;
  let lastPass = 0;
  let lastHref = location.href;

  function activeScanners() {
    return SCANNERS.filter((s) => s.needs.some((id) => state[id]));
  }

  function runPass() {
    lastPass = Date.now();
    if (!state.enabled) return;

    if (location.href !== lastHref) {
      lastHref = location.href;
      applyRouteClasses();
      guardRoute();
    }

    const active = activeScanners();
    if (!active.length) return;

    // Detach first so our own attribute writes cannot retrigger the observer.
    if (observer) observer.disconnect();
    try {
      for (const scanner of active) scanner.run();
    } catch (error) {
      console.warn("[instagram-debloat] scan failed", error);
    } finally {
      connectObserver();
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastPass));
      setTimeout(() => {
        scheduled = false;
        runPass();
      }, wait);
    });
  }

  function connectObserver() {
    if (!observer) observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true });
  }

  /* ------------------------------------------------------------------ init */

  applyClasses();
  applyRouteClasses();
  guardRoute();
  connectObserver();

  window.addEventListener("igd:navigated", () => {
    applyRouteClasses();
    guardRoute();
    schedule();
  });
  window.addEventListener("popstate", schedule);
  document.addEventListener("DOMContentLoaded", schedule);

  api.storage.local.get(REG.STORAGE_KEY, (result) => {
    if (api.runtime.lastError) return;
    setState(result && result[REG.STORAGE_KEY]);
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[REG.STORAGE_KEY]) return;
    setState(changes[REG.STORAGE_KEY].newValue);
  });

  schedule();
})();
