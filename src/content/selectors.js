/**
 * Every anchor the JavaScript layer uses to find things in Instagram's DOM.
 *
 * Instagram ships obfuscated, build-generated class names (`.x1iyjqo2`,
 * `._a9ze`) that change on their release cadence. Nothing here depends on one.
 * The anchors below are ranked roughly by how long they tend to survive:
 *
 *   1. URLs on real anchors      a[href="/reels/"]           very stable
 *   2. ARIA and role attributes  svg[aria-label="Comment"]   stable, localised
 *   3. Meta data attributes      [data-pagelet="story_tray"] stable
 *   4. Structural shape          canvas next to an avatar    fair
 *   5. Visible text              "Suggested for you"         fair, localised
 *
 * Tiers 2 and 5 are language dependent, so both carry a list of translations
 * for the languages Instagram is most used in rather than a single English
 * string. When something breaks, it breaks here or in rules.css and nowhere
 * else.
 */

const IGD_SELECTORS = {
  /** Route matching for the redirect guard. Tested against location.pathname. */
  routes: {
    home: /^\/(?:$|\?)/,
    reels: /^\/reels?(?:\/|$)/,
    explore: /^\/explore(?:\/|$)/,
    stories: /^\/stories(?:\/|$)/,
    direct: /^\/direct(?:\/|$)/,
  },

  paths: {
    home: "/",
    followingFeed: "/?variant=following",
    inbox: "/direct/inbox/",
  },

  /** Anchors whose href we rewrite so home lands on the Following feed. */
  homeLinks: 'a[href="/"], a[href="/?variant=home"]',

  /** Containers we are willing to search for badges. Keeps scans bounded. */
  navRoots: 'nav, [role="navigation"], header, div:has(> a[href="/direct/inbox/"])',

  reels: {
    /** Feed posts that are reels rather than photo posts. */
    feedPost: 'article:has(a[href*="/reel/"])',
    profileTab: '[role="tablist"] a[href*="/reels"]',
  },

  stories: {
    tray: '[data-pagelet="story_tray"]',
    /** The gradient ring is a <canvas> rendered directly before the avatar. */
    ring: "canvas",
    ringNeighbour: 'img[alt*="profile picture" i]',
    link: 'a[href^="/stories/"]',
  },

  comments: {
    icon: 'svg[aria-label="Comment"]',
    composer: 'textarea[aria-label*="comment" i]',
  },

  vanity: {
    /** "1,234 likes" is a real link to the likers list on every post. */
    likedBy: 'a[href$="/liked_by/"]',
    followers: 'a[href$="/followers/"]',
    following: 'a[href$="/following/"]',
    /** Instagram puts the unrounded number in a title attribute. */
    exactCount: "span[title]",
    /**
     * Buttons and spans whose entire text is a count, such as "12.3K likes",
     * "1,204 views" or a bare "482". Used to catch counters that have no
     * semantic anchor of their own.
     */
    countText:
      /^[\d٠-٩][\d.,\s ٠-٩]*\s*(?:[kmbKMB]|mil|mln|tys|тыс|万|億)?\s*(?:likes?|views?|plays?|comments?|followers?|following)?$/,
    /** Words that mark a number as a metric worth hiding when it stands alone. */
    countWords: [
      "like",
      "likes",
      "view",
      "views",
      "play",
      "plays",
      "follower",
      "followers",
      "following",
      "me gusta",
      "visualizaciones",
      "seguidores",
      "siguiendo",
      "j'aime",
      "vues",
      "abonnés",
      "gefällt",
      "aufrufe",
      "follower",
      "curtidas",
      "visualizações",
      "seguidores",
      "нравится",
      "просмотров",
      "подписчиков",
      "polubienia",
      "wyświetleń",
      "obserwujących",
      "いいね",
      "回視聴",
      "フォロワー",
      "点赞",
      "次观看",
      "位粉丝",
    ],
  },

  suggested: {
    /**
     * Headings above recommendation blocks. Matched case insensitively against
     * trimmed text, so partial phrases are fine.
     */
    labels: [
      "suggested for you",
      "suggested posts",
      "suggested accounts",
      "suggested threads",
      "suggested reels",
      "recommended for you",
      "sugerencias para ti",
      "publicaciones sugeridas",
      "cuentas sugeridas",
      "suggestions pour vous",
      "publications suggérées",
      "vorschläge für dich",
      "vorgeschlagene beiträge",
      "sugestões para você",
      "publicações sugeridas",
      "рекомендации для вас",
      "рекомендуемые публикации",
      "proponowane dla ciebie",
      "proponowane posty",
      "あなたへのおすすめ",
      "おすすめの投稿",
      "为你推荐",
      "推荐帖子",
      "suggeriti per te",
      "post suggeriti",
      "voorgesteld voor jou",
    ],
    /** How far up from the label we climb looking for the block to hide. */
    climb: 8,
  },

  notes: {
    /** The tray only exists inside Direct, so scanning is route gated. */
    labels: [
      "leave a note",
      "your note",
      "note",
      "deja una nota",
      "tu nota",
      "nota",
      "laisser une note",
      "votre note",
      "hinterlasse eine notiz",
      "deine notiz",
      "deixe uma nota",
      "sua nota",
      "оставить заметку",
      "ваша заметка",
      "zostaw notatkę",
      "twoja notatka",
      "ノートを残す",
      "留言",
      "lascia una nota",
    ],
    climb: 6,
  },

  badges: {
    /** A bare unread count, optionally truncated as "99+". */
    countText: /^\d{1,3}\+?$/,
    /** Empty dot indicators are detected by shape instead of text. */
    maxDotSize: 14,
    reddishChannels: { minRed: 120, maxGreen: 120, maxBlue: 120 },
  },

  media: {
    video: "video",
    /** Marks an element the scanners have already handled. */
  },

  /** Attributes the scanners stamp onto the DOM for rules.css to act on. */
  marks: {
    seen: "data-igd-seen",
    suggested: "data-igd-suggested",
    notes: "data-igd-notes",
    badge: "data-igd-badge",
    vanity: "data-igd-vanity",
    storyRing: "data-igd-story-ring",
    storyTray: "data-igd-story-tray",
    video: "data-igd-video",
  },
};

globalThis.IGD_SELECTORS = IGD_SELECTORS;
