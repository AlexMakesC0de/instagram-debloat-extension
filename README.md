# Instagram Debloat

A Chrome extension that removes the parts of Instagram designed to keep you
scrolling: Reels, Explore, stories, suggested posts, and like and follower
counts. What is left is the chronological feed of people you actually follow,
plus Direct.

No account, no sign in, no analytics, no network requests of its own. Settings
live in `chrome.storage.local` on your machine and nowhere else.

## Install

There is no build step. Clone the repository and load it directly:

1. Open `chrome://extensions`
2. Turn on Developer mode
3. Choose Load unpacked and select this folder
4. Open Instagram and click the extension icon to configure it

Editing a file and pressing reload on the extensions page is the whole
development loop. Chromium browsers (Chrome, Edge, Brave, Arc, Opera) all work.
Firefox needs `browser_specific_settings` added to the manifest, and its support
for `world: "MAIN"` content scripts starts at version 128.

## Features

### Feed and navigation

| Toggle | Default | What it does |
| --- | --- | --- |
| Hide Reels | on | Removes the Reels nav entry, the Reels tab on profiles, and reels in the feed. Redirects away from `/reels`. |
| Hide Explore | on | Removes the Explore nav entry and redirects away from `/explore`. |
| Hide the stories tray | on | Removes the row of stories above the feed. |
| Hide stories everywhere | off | Also removes story rings from avatars site-wide and redirects away from `/stories`. |
| Force the Following feed | on | Rewrites home links to `?variant=following` so you land on the chronological feed. |
| Hide suggested posts and accounts | on | Removes anything captioned Suggested for you, including sidebar suggestions. |
| Hide the feed entirely | off | Leaves the home page blank. Search, profiles and Direct still work. |
| Open Direct instead of home | off | Redirects the home page straight to your inbox. |

### Interface clutter

| Toggle | Default | What it does |
| --- | --- | --- |
| Hide Notes | on | Removes the note bubbles above the Direct conversation list. |
| Hide the Threads button | on | Removes every Threads cross-promotion link. |
| Hide vanity metrics | on | Removes like counts, view counts, and follower and following totals. |
| Gray out notification badges | on | Keeps unread indicators but drops the red. |
| Hide notification badges | off | Removes unread counts and dots completely. |
| Hide comments | off | Removes comment buttons, threads and the composer. |

### Bandwidth

| Toggle | Default | What it does |
| --- | --- | --- |
| Block videos | off | Blocks video requests at the network layer. |
| Block images | off | Blocks image requests at the network layer. Text only Instagram. |

### Appearance

| Toggle | Default | What it does |
| --- | --- | --- |
| Grayscale media | off | Drains the colour out of photos, videos and avatars. |
| Square corners | off | Removes every border radius. |
| Font | Instagram default | Overrides the typeface with one already installed on your machine. |

Focus mode in the popup switches on the ten toggles that do the most work, and
the master switch at the top turns everything off without losing your settings.

## How it works

Four moving parts, in the order they matter.

**One static stylesheet.** `src/content/rules.css` is injected at
`document_start` and holds every rule the extension can apply. Each rule is
gated behind an `html.igd-<feature>` class, so the stylesheet is inert until
`content.js` sets the classes. Toggling a feature is a `classList` change with
no stylesheet to fetch, rebuild or re-inject.

**Settings mirrored to `localStorage`.** `chrome.storage` is asynchronous, which
means a page can paint before the first value arrives, which is why extensions
in this space usually hide the whole page and fade it back in. The content
script keeps a synchronous mirror in `localStorage` on the Instagram origin, so
the classes land on `<html>` in the same tick the script starts and there is
nothing to blank out. `chrome.storage` remains the source of truth and corrects
the mirror as soon as it resolves.

**Navigation as an event, not a poll.** Instagram is a single page app, so the
URL changes without a page load. Content scripts run in an isolated world and
cannot see the page's `history.pushState` calls, so `src/content/main-world.js`
runs in the page's own world, patches `pushState` and `replaceState`, and
dispatches an `igd:navigated` DOM event. The redirect guard reacts to that
instead of checking `location.href` on a timer.

**One coalesced observer.** Everything CSS cannot express, such as "the block
whose heading reads Suggested for you", is handled by a scanner. A single
`MutationObserver` drives all of them, coalesced to at most one pass per
animation frame with a 120 ms floor between passes, and only the scanners whose
feature is switched on run at all. The observer detaches during a pass so its
own attribute writes cannot retrigger it.

Blocking requests is done with `declarativeNetRequest` rules in the service
worker rather than with CSS, because hiding an `<img>` still downloads it. The
CSS side only keeps blocked elements from rendering as broken placeholders.

## Layout

```
manifest.json
src/
  background.js            service worker: defaults, network blocking rules
  shared/features.js       feature registry, shared by all three contexts
  content/
    selectors.js           every anchor the scanners use
    rules.css              every CSS rule, gated behind igd-* classes
    content.js             classes, redirect guard, observer, scanners
    main-world.js          history patch, runs in the page's own world
  popup/                   builds itself from the registry
tools/
  test.js                  consistency tests
  make-icons.py            icon generator
```

## Keeping it working

Instagram ships obfuscated, build-generated class names such as `.x1iyjqo2` and
`._a9ze`. They change on Instagram's release cadence, and any extension pinned
to them breaks every few weeks. Nothing here depends on one. Selectors are
picked from the most durable anchor available, roughly in this order:

1. URLs on real anchors, such as `a[href="/reels/"]`
2. ARIA and role attributes, such as `svg[aria-label="Comment"]`
3. Meta's own data attributes, such as `[data-pagelet="story_tray"]`
4. Structural shape, such as the `<canvas>` ring rendered next to an avatar
5. Visible text, such as "Suggested for you"

Tiers 2 and 5 depend on interface language, so both carry translations for the
languages Instagram is most used in rather than a single English string.

When something does break, it breaks in one of two files:

- `src/content/rules.css` for anything hidden with CSS
- `src/content/selectors.js` for anything the scanners look for

Nothing else contains a selector. Adding a feature means an entry in
`src/shared/features.js` and a gated block in `rules.css`. The popup builds
itself from the registry and needs no edit.

## Tests

```
node tools/test.js
```

Twenty one checks covering settings resolution, the dependency rules between
features, agreement between the feature registry and the stylesheet, and the
manifest's file references and script ordering.

These cover the pure logic. Behaviour that needs a real Instagram DOM, meaning
whether each selector still matches, is not covered and has to be checked by
loading the extension.

Icons are generated rather than committed by hand:

```
python3 tools/make-icons.py
```

## Limitations

- Video blocking is best effort. `declarativeNetRequest` catches media requests
  and anything ending in `.mp4`, but Instagram also streams through Media Source
  Extensions, where segments arrive as ordinary fetches that cannot be blocked
  without breaking the rest of the app. The scanner pauses and unloads any
  player that gets through, so the visible result is right even when a few bytes
  are not saved.
- Hiding vanity metrics uses a text heuristic for counters that have no
  semantic anchor. A comment shorter than 32 characters that begins with a
  number and contains a word like "likes" can be caught by it.
- Blocking images removes avatars and post images but keeps Instagram's icons,
  which are inline SVG rather than images.
- Redirects use `location.replace`, which is a full page load. The guard stops
  itself after five redirects in five seconds so a fight with Instagram's
  router cannot pin a tab in a loop.

## Credit

The feature set was mapped from [IGPlus](https://github.com/ptjaworski/igplus-extension)
by Patryk Jaworski, which is CC BY-NC-ND 4.0 licensed. This is an independent
implementation: no code, CSS or assets were copied from it. The redirect guard
idea and the `?variant=following` trick for forcing the chronological feed both
come from that project.

## License

MIT. See [LICENSE](LICENSE).
