/**
 * Feature registry. Single source of truth for the popup, the service worker
 * and the content script.
 *
 * Loaded as a classic script in all three contexts, so everything is exported
 * by assigning to globalThis rather than with ES module syntax.
 *
 * Each feature id becomes an `igd-<id>` class on <html> when it is active, and
 * every rule in src/content/rules.css is gated behind one of those classes.
 * Adding a purely cosmetic feature is therefore a two file change: an entry
 * here, and a gated block in rules.css.
 *
 *   id       stable key, used in storage, as a CSS class, and as an input name
 *   type     "toggle" (default) or "select"
 *   default  initial value
 *   implies  ids force-enabled while this one is on
 *   mutes    ids force-disabled while this one is on
 *   js       true when a scanner in content.js backs the feature
 */

const IGD_GROUPS = [
  { id: "feed", label: "Feed and navigation" },
  { id: "clutter", label: "Interface clutter" },
  { id: "bandwidth", label: "Bandwidth" },
  { id: "look", label: "Appearance" },
];

const IGD_FONTS = [
  { id: "default", label: "Instagram default", stack: "" },
  {
    id: "system",
    label: "System UI",
    stack:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  },
  {
    id: "serif",
    label: "Serif",
    stack: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  },
  {
    id: "mono",
    label: "Monospace",
    stack: '"SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  },
  {
    id: "rounded",
    label: "Rounded",
    stack: '"SF Pro Rounded", "Nunito", "Varela Round", system-ui, sans-serif',
  },
  {
    id: "condensed",
    label: "Condensed",
    stack:
      '"Roboto Condensed", "Avenir Next Condensed", "Helvetica Neue", sans-serif',
  },
  {
    id: "readable",
    label: "High legibility",
    stack: '"Atkinson Hyperlegible", Verdana, Tahoma, sans-serif',
  },
];

const IGD_FEATURES = [
  {
    id: "hide_reels",
    group: "feed",
    default: true,
    js: true,
    label: "Hide Reels",
    desc: "Removes the Reels nav entry, the Reels tab on profiles, reels in the feed, and redirects away from /reels.",
  },
  {
    id: "hide_explore",
    group: "feed",
    default: true,
    js: true,
    label: "Hide Explore",
    desc: "Removes the Explore nav entry and redirects away from /explore.",
  },
  {
    id: "hide_stories_home",
    group: "feed",
    default: true,
    js: true,
    label: "Hide the stories tray",
    desc: "Removes the row of stories above the feed.",
  },
  {
    id: "hide_stories_all",
    group: "feed",
    default: false,
    js: true,
    implies: ["hide_stories_home"],
    label: "Hide stories everywhere",
    desc: "Also removes story rings from avatars site-wide and redirects away from /stories.",
  },
  {
    id: "following_feed",
    group: "feed",
    default: true,
    js: true,
    label: "Force the Following feed",
    desc: "Rewrites home links to ?variant=following so you get the chronological feed of accounts you follow.",
  },
  {
    id: "hide_suggested",
    group: "feed",
    default: true,
    js: true,
    label: "Hide suggested posts and accounts",
    desc: "Removes anything captioned Suggested for you, including the sidebar suggestions.",
  },
  {
    id: "hide_feed",
    group: "feed",
    default: false,
    label: "Hide the feed entirely",
    desc: "Leaves the home page blank. Search, profiles and Direct still work.",
  },
  {
    id: "dm_first",
    group: "feed",
    default: false,
    js: true,
    implies: ["following_feed"],
    label: "Open Direct instead of home",
    desc: "Redirects the home page straight to your inbox.",
  },

  {
    id: "hide_notes",
    group: "clutter",
    default: true,
    js: true,
    label: "Hide Notes",
    desc: "Removes the note bubbles above the Direct conversation list.",
  },
  {
    id: "hide_threads",
    group: "clutter",
    default: true,
    label: "Hide the Threads button",
    desc: "Removes every Threads cross-promotion link.",
  },
  {
    id: "hide_vanity",
    group: "clutter",
    default: true,
    js: true,
    label: "Hide vanity metrics",
    desc: "Removes like counts, view counts, and follower and following totals.",
  },
  {
    id: "gray_badges",
    group: "clutter",
    default: true,
    js: true,
    label: "Gray out notification badges",
    desc: "Keeps the unread indicators but drops the red so they stop pulling your eye.",
  },
  {
    id: "hide_badges",
    group: "clutter",
    default: false,
    js: true,
    mutes: ["gray_badges"],
    label: "Hide notification badges",
    desc: "Removes unread counts and dots completely.",
  },
  {
    id: "hide_comments",
    group: "clutter",
    default: false,
    js: true,
    label: "Hide comments",
    desc: "Removes comment buttons, comment threads and the comment composer.",
  },

  {
    id: "block_videos",
    group: "bandwidth",
    default: false,
    js: true,
    label: "Block videos",
    desc: "Blocks video requests at the network layer and stops any player that slips through.",
  },
  {
    id: "block_images",
    group: "bandwidth",
    default: false,
    label: "Block images",
    desc: "Blocks image requests at the network layer. Text only Instagram.",
  },

  {
    id: "grayscale",
    group: "look",
    default: false,
    label: "Grayscale media",
    desc: "Drains the colour out of photos, videos and avatars.",
  },
  {
    id: "square",
    group: "look",
    default: false,
    label: "Square corners",
    desc: "Removes every border radius.",
  },
  {
    id: "font",
    group: "look",
    type: "select",
    default: "default",
    options: IGD_FONTS,
    label: "Font",
    desc: "Overrides Instagram's typeface with one already installed on your machine.",
  },
];

/** Ids switched on by the Focus mode button in the popup. */
const IGD_FOCUS_PRESET = [
  "hide_reels",
  "hide_explore",
  "hide_stories_all",
  "hide_stories_home",
  "following_feed",
  "hide_suggested",
  "hide_notes",
  "hide_threads",
  "hide_vanity",
  "gray_badges",
];

const IGD_DEFAULTS = (() => {
  const out = { enabled: true };
  for (const f of IGD_FEATURES) out[f.id] = f.default;
  return out;
})();

/**
 * Fills in missing keys, then applies `implies` and `mutes` so that consumers
 * never have to reason about feature interactions themselves.
 *
 * @param {object} raw stored settings, possibly partial or empty
 * @returns {object} complete settings with dependencies resolved
 */
function igdResolve(raw) {
  const state = { ...IGD_DEFAULTS, ...(raw || {}) };

  if (!state.enabled) {
    const off = { enabled: false };
    for (const f of IGD_FEATURES) off[f.id] = f.type === "select" ? "default" : false;
    return off;
  }

  for (const f of IGD_FEATURES) {
    if (!state[f.id]) continue;
    for (const id of f.implies || []) state[id] = true;
    for (const id of f.mutes || []) state[id] = false;
  }
  return state;
}

const IGD_REGISTRY = {
  GROUPS: IGD_GROUPS,
  FONTS: IGD_FONTS,
  FEATURES: IGD_FEATURES,
  DEFAULTS: IGD_DEFAULTS,
  FOCUS_PRESET: IGD_FOCUS_PRESET,
  STORAGE_KEY: "settings",
  MIRROR_KEY: "igd.settings",
  resolve: igdResolve,
};

globalThis.IGD_REGISTRY = IGD_REGISTRY;
