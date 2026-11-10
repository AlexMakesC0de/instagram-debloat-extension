/**
 * Popup. Renders itself from the feature registry, so a new toggle needs an
 * entry in features.js and a gated block in rules.css and nothing here.
 *
 * Storage always holds what the user actually chose. Dependencies between
 * features are applied on read by IGD_REGISTRY.resolve, which keeps a forced
 * toggle from silently overwriting the preference underneath it. Turning off
 * "Hide stories everywhere" restores whatever "Hide the stories tray" was set
 * to before, rather than leaving it stuck on.
 */

(() => {
  "use strict";

  const REG = globalThis.IGD_REGISTRY;
  const groupsEl = document.getElementById("groups");
  const masterEl = document.getElementById("master");

  /** Raw user intent, not the resolved view. */
  let settings = { ...REG.DEFAULTS };

  /* ------------------------------------------------------------- storage */

  function save() {
    chrome.storage.local.set({ [REG.STORAGE_KEY]: settings });
  }

  function load() {
    chrome.storage.local.get(REG.STORAGE_KEY, (result) => {
      settings = { ...REG.DEFAULTS, ...(result[REG.STORAGE_KEY] || {}) };
      render();
    });
  }

  /* --------------------------------------------------------- dependencies */

  /**
   * Ids currently pinned on or off by another active feature, with the label
   * of whatever is pinning them so the row can explain itself.
   */
  function forced() {
    const map = new Map();
    for (const feature of REG.FEATURES) {
      if (!settings[feature.id]) continue;
      for (const id of feature.implies || []) {
        map.set(id, { value: true, by: feature.label });
      }
      for (const id of feature.mutes || []) {
        map.set(id, { value: false, by: feature.label });
      }
    }
    return map;
  }

  /* -------------------------------------------------------------- render */

  function makeSwitch(checked, disabled) {
    const label = document.createElement("label");
    label.className = "switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.disabled = disabled;
    const track = document.createElement("span");
    track.className = "track";
    const thumb = document.createElement("span");
    thumb.className = "thumb";
    track.append(thumb);
    label.append(input, track);
    return { label, input };
  }

  function makeRow(feature, pins) {
    const row = document.createElement("div");
    row.className = "row";

    const text = document.createElement("div");
    text.className = "row-text";
    const name = document.createElement("div");
    name.className = "row-label";
    name.textContent = feature.label;
    const desc = document.createElement("div");
    desc.className = "row-desc";
    text.append(name, desc);

    if (feature.type === "select") {
      desc.textContent = feature.desc;
      const select = document.createElement("select");
      for (const option of feature.options) {
        const el = document.createElement("option");
        el.value = option.id;
        el.textContent = option.label;
        select.append(el);
      }
      select.value = settings[feature.id] ?? feature.default;
      select.addEventListener("change", () => {
        settings[feature.id] = select.value;
        save();
      });
      row.append(text, select);
      return row;
    }

    const pin = pins.get(feature.id);
    const checked = pin ? pin.value : !!settings[feature.id];
    desc.textContent = pin
      ? `${pin.value ? "Required" : "Overridden"} by "${pin.by}".`
      : feature.desc;

    const { label, input } = makeSwitch(checked, !!pin);
    if (pin) row.classList.add("forced");

    input.addEventListener("change", () => {
      settings[feature.id] = input.checked;
      save();
      render();
    });

    // The whole row is a hit target, but let the real control handle its own
    // clicks so the change event does not fire twice.
    row.addEventListener("click", (event) => {
      if (pin || event.target.closest(".switch")) return;
      input.checked = !input.checked;
      input.dispatchEvent(new Event("change"));
    });

    row.append(text, label);
    return row;
  }

  function render() {
    masterEl.checked = !!settings.enabled;
    document.body.classList.toggle("off", !settings.enabled);

    const pins = forced();
    groupsEl.replaceChildren();

    for (const group of REG.GROUPS) {
      const features = REG.FEATURES.filter((f) => f.group === group.id);
      if (!features.length) continue;

      const title = document.createElement("div");
      title.className = "group-title";
      title.textContent = group.label;
      groupsEl.append(title);

      for (const feature of features) groupsEl.append(makeRow(feature, pins));
    }
  }

  /* --------------------------------------------------------------- events */

  masterEl.addEventListener("change", () => {
    settings.enabled = masterEl.checked;
    save();
    render();
  });

  document.getElementById("focus").addEventListener("click", () => {
    settings.enabled = true;
    for (const id of REG.FOCUS_PRESET) settings[id] = true;
    save();
    render();
  });

  document.getElementById("reset").addEventListener("click", () => {
    settings = { ...REG.DEFAULTS };
    save();
    render();
  });

  document.getElementById("version").textContent =
    "v" + chrome.runtime.getManifest().version;

  // Keeps the popup honest if a second window changed something.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[REG.STORAGE_KEY]) return;
    settings = { ...REG.DEFAULTS, ...(changes[REG.STORAGE_KEY].newValue || {}) };
    render();
  });

  load();
})();
