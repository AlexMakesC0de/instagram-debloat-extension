/**
 * Runs in the page's own JavaScript world so it can see Instagram's calls to
 * the History API.
 *
 * Content scripts live in an isolated world with their own wrappers for
 * `history`, so patching pushState from there intercepts nothing. Patching it
 * here and forwarding a DOM event is what lets the redirect guard react to
 * client side navigation the moment it happens, instead of polling
 * location.href on a timer the way most Instagram extensions do.
 *
 * The event is the only thing this script exposes. It reads no page state and
 * touches nothing else.
 */

(() => {
  "use strict";

  const EVENT = "igd:navigated";
  const notify = () => {
    try {
      window.dispatchEvent(new CustomEvent(EVENT));
    } catch (_) {
      /* the page is going away */
    }
  };

  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    if (typeof original !== "function") continue;
    history[method] = function patched(...args) {
      const result = original.apply(this, args);
      notify();
      return result;
    };
  }

  window.addEventListener("popstate", notify);
  window.addEventListener("hashchange", notify);
})();
