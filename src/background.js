/**
 * Service worker. Seeds defaults on install and keeps the network blocking
 * rules in sync with the bandwidth toggles.
 *
 * Hiding an <img> with CSS still downloads it. Blocking at the request layer
 * with declarativeNetRequest is what actually saves the bandwidth, so the
 * bandwidth toggles drive real block rules and rules.css only stops the
 * blocked elements from rendering as broken placeholders.
 */

importScripts("/src/shared/features.js");

const REG = globalThis.IGD_REGISTRY;

const RULE_IDS = { images: 1, media: 2, mp4: 3 };

const BLOCK_RULES = {
  block_images: [
    {
      id: RULE_IDS.images,
      priority: 1,
      action: { type: "block" },
      condition: {
        resourceTypes: ["image"],
        initiatorDomains: ["instagram.com"],
      },
    },
  ],
  block_videos: [
    {
      id: RULE_IDS.media,
      priority: 1,
      action: { type: "block" },
      condition: {
        resourceTypes: ["media"],
        initiatorDomains: ["instagram.com"],
      },
    },
    {
      // Instagram streams a lot of video over fetch rather than as a media
      // request, which the rule above would miss. Matching the container
      // extension catches those without touching the JSON API traffic.
      id: RULE_IDS.mp4,
      priority: 1,
      action: { type: "block" },
      condition: {
        urlFilter: ".mp4",
        resourceTypes: ["media", "xmlhttprequest", "other"],
        initiatorDomains: ["instagram.com"],
      },
    },
  ],
};

async function syncBlockRules() {
  const stored = await chrome.storage.local.get(REG.STORAGE_KEY);
  const state = REG.resolve(stored[REG.STORAGE_KEY]);

  const addRules = [];
  for (const [feature, rules] of Object.entries(BLOCK_RULES)) {
    if (state[feature]) addRules.push(...rules);
  }

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: Object.values(RULE_IDS),
      addRules,
    });
  } catch (error) {
    console.warn("[instagram-debloat] could not update block rules", error);
  }
}

async function seedDefaults() {
  const stored = await chrome.storage.local.get(REG.STORAGE_KEY);
  if (stored[REG.STORAGE_KEY]) return;
  await chrome.storage.local.set({ [REG.STORAGE_KEY]: { ...REG.DEFAULTS } });
}

chrome.runtime.onInstalled.addListener(async () => {
  await seedDefaults();
  await syncBlockRules();
});

chrome.runtime.onStartup.addListener(syncBlockRules);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[REG.STORAGE_KEY]) return;
  syncBlockRules();
});
