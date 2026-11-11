#!/usr/bin/env node
/**
 * Consistency tests. No dependencies, no DOM.
 *
 *     node tools/test.js
 *
 * These cover the parts that are pure logic: how settings resolve, and whether
 * the feature registry and the stylesheet still agree with each other. The
 * behaviour that needs a real Instagram DOM is not covered here and has to be
 * checked by loading the extension.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
require(path.join(ROOT, "src/shared/features.js"));

const REG = globalThis.IGD_REGISTRY;
const css = fs.readFileSync(path.join(ROOT, "src/content/rules.css"), "utf8");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")
);

let failures = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.log(`FAIL  ${name}`);
    console.log(`      got ${JSON.stringify(actual)}`);
    console.log(`      want ${JSON.stringify(expected)}`);
  } else {
    console.log(`pass  ${name}`);
  }
}

/* --------------------------------------------------- settings resolution */

check("defaults apply to empty settings", REG.resolve({}).hide_reels, true);
check(
  "defaults cover every feature plus the master switch",
  Object.keys(REG.DEFAULTS).length,
  REG.FEATURES.length + 1
);
check(
  "hide_stories_all implies hide_stories_home",
  REG.resolve({ hide_stories_all: true, hide_stories_home: false })
    .hide_stories_home,
  true
);
check(
  "hide_badges mutes gray_badges",
  REG.resolve({ hide_badges: true, gray_badges: true }).gray_badges,
  false
);
check(
  "dm_first implies following_feed",
  REG.resolve({ dm_first: true, following_feed: false }).following_feed,
  true
);
check(
  "master switch off disables every feature",
  REG.resolve({ enabled: false, hide_reels: true }).hide_reels,
  false
);
check(
  "master switch off clears the font override",
  REG.resolve({ enabled: false, font: "serif" }).font,
  "default"
);
check("null settings fall back to defaults", REG.resolve(null).enabled, true);
check(
  "resolving does not mutate the input",
  (() => {
    const input = { hide_stories_all: true, hide_stories_home: false };
    REG.resolve(input);
    return input.hide_stories_home;
  })(),
  false
);

/* ------------------------------------------------------ registry shape */

const ids = REG.FEATURES.map((f) => f.id);
check("feature ids are unique", new Set(ids).size, ids.length);

const groupIds = new Set(REG.GROUPS.map((g) => g.id));
check(
  "every feature belongs to a declared group",
  REG.FEATURES.filter((f) => !groupIds.has(f.group)).map((f) => f.id),
  []
);
check(
  "focus preset only names real features",
  REG.FOCUS_PRESET.filter((id) => !ids.includes(id)),
  []
);
check(
  "implies and mutes only name real features",
  REG.FEATURES.flatMap((f) => [...(f.implies || []), ...(f.mutes || [])]).filter(
    (id) => !ids.includes(id)
  ),
  []
);

/* ------------------------------------------- registry against stylesheet */

const gated = new Set(
  [...css.matchAll(/\.igd-([a-z0-9_-]+)/g)].map((m) => m[1])
);

check(
  "every feature is either styled or backed by a scanner",
  REG.FEATURES.filter(
    (f) => f.type !== "select" && !gated.has(f.id) && !f.js
  ).map((f) => f.id),
  []
);

const fontIds = REG.FONTS.filter((f) => f.id !== "default").map(
  (f) => `font-${f.id}`
);
const routeClasses = ["route-home", "route-direct", "route-profile"];
const known = new Set([...ids, ...fontIds, ...routeClasses, "on"]);

check(
  "stylesheet has no rules for features that no longer exist",
  [...gated].filter((name) => !known.has(name)),
  []
);
check(
  "every non-default font has a stylesheet rule",
  fontIds.filter((name) => !gated.has(name)),
  []
);

/* ---------------------------------------------------------- manifest ---- */

const listed = [
  ...manifest.content_scripts.flatMap((cs) => cs.js || []),
  ...manifest.content_scripts.flatMap((cs) => cs.css || []),
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...Object.values(manifest.icons),
];
check(
  "every file the manifest references exists",
  listed.filter((rel) => !fs.existsSync(path.join(ROOT, rel))),
  []
);

const isolated = manifest.content_scripts.find((cs) => cs.world !== "MAIN");
check(
  "the registry loads before the content script that reads it",
  isolated.js.indexOf("src/shared/features.js") <
    isolated.js.indexOf("src/content/content.js"),
  true
);
check(
  "selectors load before the content script that reads them",
  isolated.js.indexOf("src/content/selectors.js") <
    isolated.js.indexOf("src/content/content.js"),
  true
);
check(
  "content scripts run before Instagram paints",
  manifest.content_scripts.every((cs) => cs.run_at === "document_start"),
  true
);
check(
  "bandwidth blocking has the permission it needs",
  manifest.permissions.includes("declarativeNetRequest"),
  true
);

console.log(
  failures ? `\n${failures} failing check(s)` : "\nall checks passed"
);
process.exit(failures ? 1 : 0);
