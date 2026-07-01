/**
 * ============================================================
 * SUDURPASCHIM GHAR JAGGA KAAROBAAR
 * सुदूरपश्चिम घर जग्गा कारोबार
 *
 * Main JavaScript — js/script.js
 * Dhangadhi, Kailali, Nepal
 * ============================================================
 *
 * ARCHITECTURE
 * ─────────────────────────────────────────────────────────
 *  1.  CONFIG      — API endpoint, limits, constants
 *  2.  DOM         — Safe element access utilities
 *  3.  API         — Fetch + in-memory cache
 *  4.  Formatters  — Price, date, HTML escaping
 *  5.  Icons       — Inline SVG library (currentColor)
 *  6.  Helpers     — Image selection, URL params, status
 *  7.  Filters     — Featured, available, sort, search
 *  8.  Templates   — Card HTML, empty & error states
 *  9.  Renderer    — Grid injection + post-render hooks
 * 10.  UI          — Nav, scroll reveal, hero, footer
 * 11.  Pages       — Per-page orchestrators
 *       ├─ home()      index.html
 *       ├─ listings()  listings.html  (future)
 *       ├─ featured()  featured.html  (future)
 *       └─ property()  property.html  (future)
 * 12.  detectPage  — Route detection
 * 13.  init        — Entry point
 * ─────────────────────────────────────────────────────────
 *
 * GOOGLE SHEET COLUMNS (exact, case-sensitive)
 *   id · title · type · price · location · area
 *   roadAccess · district · phone · description
 *   featured · status · image1 · image2 · image3 · image4
 *   mapLink · postedDate · propertyCode · facebookPost · remarks
 * ============================================================
 */

'use strict';

/* ============================================================
   1. CONFIGURATION
   ============================================================ */

const CONFIG = Object.freeze({

  /** Live Google Sheets Apps Script endpoint — single source of truth */
  API_URL:
    'https://script.google.com/macros/s/' +
    'AKfycbyfmNFHwyseJy1Y9s1vA18F-lXFZWuU6VUf-C9swZYE5bxFmSDpWG9ni0hOIPTPVPCo' +
    '/exec',

  /** Maximum cards displayed in each homepage section */
  FEATURED_LIMIT : 6,
  LATEST_LIMIT   : 6,

  /** Cards per page on listings.html (for future pagination) */
  LISTINGS_PAGE_SIZE: 9,

  /**
   * Property status values — must match Google Sheet exactly.
   * Used for filtering and CSS class generation.
   */
  STATUS: Object.freeze({
    AVAILABLE : 'Available',
    SOLD      : 'Sold',
    RESERVED  : 'Reserved',
  }),

  /** IntersectionObserver threshold for scroll-reveal */
  REVEAL_THRESHOLD  : 0.08,
  REVEAL_ROOT_MARGIN: '0px 0px -40px 0px',

  /** Delay between page-exit animation and navigation (ms) */
  EXIT_ANIM_DURATION: 150,
});


/* ============================================================
   2. DOM UTILITIES
   Safe wrappers that never throw when elements are absent.
   All functions accept IDs (strings) unless noted.
   ============================================================ */

const DOM = {

  /** getElementById — returns null if not found */
  get(id) {
    return document.getElementById(id);
  },

  /** querySelector with optional context element */
  query(selector, ctx = document) {
    return ctx.querySelector(selector);
  },

  /** querySelectorAll → real Array */
  queryAll(selector, ctx = document) {
    return Array.from(ctx.querySelectorAll(selector));
  },

  /**
   * Safely set innerHTML on an element by ID.
   * @returns {boolean} true when element was found
   */
  setHTML(id, html) {
    const el = document.getElementById(id);
    if (!el) return false;
    el.innerHTML = html;
    return true;
  },

  /**
   * Safely set textContent on an element by ID.
   * @returns {boolean} true when element was found
   */
  setText(id, value) {
    const el = document.getElementById(id);
    if (!el) return false;
    el.textContent = String(value ?? '');
    return true;
  },

  /**
   * Toggle a class on an element (accepts element or null).
   * @param {Element|null} el
   */
  toggle(el, className, force) {
    el?.classList.toggle(className, force);
  },

  /** Set an attribute safely */
  setAttr(el, attr, value) {
    el?.setAttribute(attr, String(value));
  },

  /** Read an attribute safely */
  getAttr(el, attr) {
    return el?.getAttribute(attr) ?? null;
  },
};


/* ============================================================
   3. API
   Single fetch function with in-memory cache.
   Subsequent calls return the cached array without hitting
   the network again.
   ============================================================ */

const API = {

  /** Cached array from first successful fetch */
  _cache: null,

  /**
   * Fetch all properties from Google Sheets.
   * Returns cached data on subsequent calls within the same session.
   *
   * @returns {Promise<Object[]>} Array of property objects
   * @throws  {Error} on network failure or unexpected response shape
   */
  async fetchAll() {
    if (this._cache) return this._cache;

    const response = await fetch(CONFIG.API_URL);

    if (!response.ok) {
      throw new Error(
        `API responded with ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error(
        'Unexpected API response: expected a JSON array of properties'
      );
    }

    this._cache = data;
    return data;
  },

  /** Force next fetchAll() to re-request from the network */
  clearCache() {
    this._cache = null;
  },
};


/* ============================================================
   4. FORMATTERS
   All user-supplied data must pass through Formatters.escape()
   before being embedded in innerHTML to prevent XSS.
   ============================================================ */

const Formatters = {

  /**
   * Format a property price for display.
   * Handles pre-formatted strings ("25 Lakh") and raw integers.
   * Outputs prices in Nepali units: Lakh / Crore.
   *
   * @param {string|number} price
   * @returns {string}
   */
  price(price) {
    if (price === null || price === undefined || price === '' || price === '-') {
      return 'Price on Request';
    }

    const raw = String(price).trim();

    // Already contains letters — normalise prefix and return as-is
    if (/[a-zA-Z]/.test(raw)) {
      return raw
        .replace(/rs\.?\s*/i, 'Rs. ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Pure numeric string → convert to Nepali units
    const num = parseFloat(raw.replace(/,/g, ''));
    if (isNaN(num) || num === 0) return 'Price on Request';

    if (num >= 1_00_00_000) {
      const crore = (num / 1_00_00_000)
        .toFixed(2)
        .replace(/\.?0+$/, '');
      return `Rs. ${crore} Crore`;
    }

    if (num >= 1_00_000) {
      const lakh = (num / 1_00_000)
        .toFixed(2)
        .replace(/\.?0+$/, '');
      return `Rs. ${lakh} Lakh`;
    }

    if (num >= 1_000) {
      return `Rs. ${(num / 1_000).toFixed(1).replace(/\.?0+$/, '')}K`;
    }

    return `Rs. ${num.toLocaleString('en-IN')}`;
  },

  /**
   * Format a date string for display (e.g. "15 Jan 2024").
   * Returns empty string on invalid / missing dates.
   *
   * @param {string} dateStr
   * @returns {string}
   */
  date(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return d.toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
    } catch {
      return String(dateStr);
    }
  },

  /**
   * Escape a value for safe HTML insertion.
   * Every piece of API data embedded in innerHTML must go through this.
   *
   * @param {*} value
   * @returns {string}
   */
  escape(value) {
    return String(value ?? '')
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#039;');
  },

  /**
   * Truncate a string to a maximum length, appending an ellipsis.
   *
   * @param {string} str
   * @param {number} max
   * @returns {string}
   */
  truncate(str, max = 120) {
    if (!str) return '';
    const s = String(str).trim();
    return s.length <= max ? s : `${s.slice(0, max).trimEnd()}…`;
  },
};


/* ============================================================
   5. ICONS
   Inline SVG strings — all use currentColor so they inherit
   whatever CSS color is applied to their parent element.
   aria-hidden="true" on every icon (they are decorative).
   ============================================================ */

const Icons = {

  pin: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,

  ruler: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 20L20 2"/><path d="M8.5 14.5l1.5-1.5M11.5 11.5l1.5-1.5M5.5 17.5l1.5-1.5"/></svg>`,

  road: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22V12"/><path d="M5 12H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3a1 1 0 0 1 .8.4L9 8h6l2.2-2.6A1 1 0 0 1 18 5h3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2"/></svg>`,

  home: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,

  star: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,

  arrow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,

  arrowLeft: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,

  phone: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5 19.8 19.8 0 0 1 1.62 4.87 2 2 0 0 1 3.6 2.69h3a2 2 0 0 1 2 1.72 12.8 12.8 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 10.4a16 16 0 0 0 6 6l.91-.86a2 2 0 0 1 2.11-.45 12.8 12.8 0 0 0 2.81.7A2 2 0 0 1 21.5 18v-.08z"/></svg>`,

  map: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>`,

  facebook: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>`,

  warning: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,

  grid: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,

  refresh: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
};


/* ============================================================
   6. HELPERS
   Pure utility functions with no side effects.
   ============================================================ */

const Helpers = {

  /**
   * Return the first non-empty image URL from a property object.
   * Checks image1 → image2 → image3 → image4 in order.
   *
   * @param {Object} property
   * @returns {string|null}
   */
  getImage(property) {
    for (const field of ['image1', 'image2', 'image3', 'image4']) {
      const val = String(property[field] ?? '').trim();
      if (val) return val;
    }
    return null;
  },

  /**
   * Return all non-empty image URLs from a property (up to 4).
   *
   * @param {Object} property
   * @returns {string[]}
   */
  getImages(property) {
    return ['image1', 'image2', 'image3', 'image4']
      .map(f => String(property[f] ?? '').trim())
      .filter(Boolean);
  },

  /**
   * Walk every .property-card__image-wrap img inside a container
   * and attach an error listener that swaps to the placeholder SVG.
   * Must be called after innerHTML is set (not before).
   *
   * @param {HTMLElement} container
   */
  attachImageFallbacks(container) {
    DOM.queryAll('.property-card__image-wrap img', container).forEach(img => {
      img.addEventListener('error', function onImgError() {
        this.removeEventListener('error', onImgError);
        const wrap = this.closest('.property-card__image-wrap');
        if (!wrap) return;
        const placeholder = document.createElement('div');
        placeholder.className    = 'property-card__image-placeholder';
        placeholder.innerHTML    = Icons.home;
        placeholder.setAttribute('aria-hidden', 'true');
        this.replaceWith(placeholder);
      });
    });
  },

  /**
   * Parse a single URL query parameter by name.
   *
   * @param {string} name
   * @returns {string|null}
   */
  getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  },

  /**
   * Check whether a property is marked as featured.
   * The Google Sheet stores "TRUE" / "FALSE" as strings.
   *
   * @param {Object} property
   * @returns {boolean}
   */
  isFeatured(property) {
    return String(property.featured ?? '').trim().toUpperCase() === 'TRUE';
  },

  /**
   * Return the CSS modifier class for a given status string.
   *
   * @param {string} status  e.g. "Available", "Sold", "Reserved"
   * @returns {string}
   */
  statusClass(status) {
    const map = {
      available : 'property-card__status--available',
      sold      : 'property-card__status--sold',
      reserved  : 'property-card__status--reserved',
    };
    return map[String(status).trim().toLowerCase()]
      ?? 'property-card__status--available';
  },

  /**
   * Normalise a type string for use as a CSS class or filter key.
   * "Residential Land" → "residential-land"
   *
   * @param {string} type
   * @returns {string}
   */
  slugifyType(type) {
    return String(type || '').toLowerCase().replace(/\s+/g, '-');
  },
};


/* ============================================================
   7. FILTERS
   All functions return new arrays — original data is never mutated.
   ============================================================ */

const Filters = {

  /** Return properties where featured === "TRUE" */
  featured(properties) {
    return properties.filter(Helpers.isFeatured);
  },

  /** Return properties where status === "Available" (case-insensitive) */
  available(properties) {
    return properties.filter(p =>
      String(p.status ?? '').trim().toLowerCase() ===
      CONFIG.STATUS.AVAILABLE.toLowerCase()
    );
  },

  /** Filter by property type */
  byType(properties, type) {
    if (!type) return properties;
    const t = type.toLowerCase().trim();
    return properties.filter(
      p => String(p.type ?? '').toLowerCase().trim() === t
    );
  },

  /** Filter by district */
  byDistrict(properties, district) {
    if (!district) return properties;
    const d = district.toLowerCase().trim();
    return properties.filter(
      p => String(p.district ?? '').toLowerCase().trim() === d
    );
  },

  /** Filter by status */
  byStatus(properties, status) {
    if (!status) return properties;
    const s = status.toLowerCase().trim();
    return properties.filter(
      p => String(p.status ?? '').toLowerCase().trim() === s
    );
  },

  /**
   * Full-text search across title, location, description, type.
   *
   * @param {Object[]} properties
   * @param {string}   query
   * @returns {Object[]}
   */
  search(properties, query) {
    if (!query) return properties;
    const q = query.toLowerCase().trim();
    return properties.filter(p =>
      [p.title, p.location, p.description, p.type, p.district]
        .some(f => String(f ?? '').toLowerCase().includes(q))
    );
  },

  /**
   * Sort by postedDate descending (newest first).
   * Falls back to id descending when dates are absent or invalid.
   *
   * @param {Object[]} properties
   * @returns {Object[]} new array — does not mutate input
   */
  sortByNewest(properties) {
    return [...properties].sort((a, b) => {
      const dA = a.postedDate ? new Date(a.postedDate) : null;
      const dB = b.postedDate ? new Date(b.postedDate) : null;

      const validA = dA && !isNaN(dA.getTime());
      const validB = dB && !isNaN(dB.getTime());

      if (validA && validB) return dB - dA;
      if (validA)           return -1;
      if (validB)           return  1;

      // Both missing: fall back to id (higher id = newer)
      return Number(b.id ?? 0) - Number(a.id ?? 0);
    });
  },

  /**
   * Return the N most-recently-listed properties.
   *
   * @param {Object[]} properties
   * @param {number}   limit
   * @returns {Object[]}
   */
  latest(properties, limit = 6) {
    return this.sortByNewest(properties).slice(0, limit);
  },
};


/* ============================================================
   8. TEMPLATES
   Returns HTML strings. All API data is escaped before embedding.
   No event attributes (onclick, etc.) — handlers attached via JS.
   ============================================================ */

const Templates = {

  /**
   * Build a complete property card HTML string.
   * The whole card is an <a> element linking to property.html?id=N.
   * The .property-card__cta is a visual <span> (not a nested <a>)
   * since the parent card already provides the link.
   *
   * @param {Object} property
   * @returns {string}
   */
  propertyCard(property) {
    const e   = Formatters.escape;
    const id  = e(property.id ?? '');
    const url = `property.html?id=${id}`;

    const title    = e(property.title    ?? 'Untitled Property');
    const type     = e(property.type     ?? 'Property');
    const location = e(property.location ?? property.district ?? 'Kailali, Nepal');
    const status   = e(property.status   ?? 'Available');
    const area     = property.area      ? e(property.area)      : null;
    const road     = property.roadAccess ? e(property.roadAccess) : null;

    const price     = Formatters.escape(Formatters.price(property.price));
    const isFeat    = Helpers.isFeatured(property);
    const statusCls = Helpers.statusClass(property.status);
    const imageUrl  = Helpers.getImage(property);

    // ── Image block ──
    const imageBlock = imageUrl
      ? `<img src="${e(imageUrl)}" alt="${title}" loading="lazy">`
      : `<div class="property-card__image-placeholder" aria-hidden="true">${Icons.home}</div>`;

    // ── Overlay badges ──
    const statusBadge = `<span class="property-card__status ${statusCls}"
        aria-label="Status: ${status}">${status}</span>`;

    const featuredBadge = isFeat
      ? `<span class="property-card__featured-badge"
             aria-label="Featured property">${Icons.star}</span>`
      : '';

    // ── Meta row (area + road access) ──
    const metaParts = [
      area ? `<span class="property-card__meta-item">${Icons.ruler}${area}</span>` : '',
      road ? `<span class="property-card__meta-item">${Icons.road}${road}</span>`  : '',
    ].filter(Boolean);

    const metaBlock = metaParts.length
      ? `<div class="property-card__meta">${metaParts.join('')}</div>`
      : '';

    return `<a href="${url}"
   class="property-card"
   role="listitem"
   aria-label="${title} — ${price}">
  <div class="property-card__image-wrap">
    ${imageBlock}
    ${statusBadge}
    ${featuredBadge}
  </div>
  <div class="property-card__body">
    <span class="property-card__type">${type}</span>
    <h3 class="property-card__title">${title}</h3>
    <span class="property-card__location">
      ${Icons.pin}${location}
    </span>
    ${metaBlock}
  </div>
  <div class="property-card__footer">
    <div class="property-card__price">
      <strong class="property-card__price-value">${price}</strong>
      <span class="property-card__price-label">Asking Price</span>
    </div>
    <span class="property-card__cta" aria-hidden="true">
      View Details${Icons.arrow}
    </span>
  </div>
</a>`;
  },

  /**
   * Empty state — shown when a grid has data but no results after filtering.
   *
   * @param {string} [message]
   * @returns {string}
   */
  emptyState(message = 'No properties found. Check back soon.') {
    return `<div class="empty-state" role="status" aria-live="polite">
  <div class="empty-state__icon">${Icons.grid}</div>
  <p class="empty-state__title">Nothing here yet</p>
  <p class="empty-state__text">${Formatters.escape(message)}</p>
</div>`;
  },

  /**
   * Error state — shown when the API fetch fails.
   * Includes a reload button (no inline event — wired up by Renderer).
   *
   * @param {string} [message]
   * @returns {string}
   */
  errorState(message = 'Unable to load properties. Please try again.') {
    return `<div class="error-state" role="alert">
  <div class="error-state__icon">${Icons.warning}</div>
  <p class="error-state__title">Something went wrong</p>
  <p class="error-state__text">${Formatters.escape(message)}</p>
  <button class="btn btn--outline error-state__retry" type="button">
    ${Icons.refresh}Try Again
  </button>
</div>`;
  },

  /**
   * Build a single image slide for the property detail gallery.
   *
   * @param {string}  src
   * @param {string}  alt
   * @param {boolean} active  — true for the first slide
   * @param {number}  index
   * @returns {string}
   */
  gallerySlide(src, alt, active, index) {
    const e = Formatters.escape;
    return `<div class="gallery__slide${active ? ' gallery__slide--active' : ''}"
     data-index="${index}">
  <img
    src="${e(src)}"
    alt="${e(alt)} — photo ${index + 1}"
    loading="${index === 0 ? 'eager' : 'lazy'}"
  >
</div>`;
  },
};


/* ============================================================
   9. RENDERER
   Injects templates into the DOM; runs post-render hooks.
   Every function guards against missing containers.
   ============================================================ */

const Renderer = {

  /**
   * Render a filtered/sorted array of properties into a container.
   * Replaces skeleton loaders and sets aria-busy="false".
   *
   * @param {string}   containerId
   * @param {Object[]} properties
   * @param {number}   [limit]      — optional display cap
   */
  grid(containerId, properties, limit) {
    const container = DOM.get(containerId);
    if (!container) return; // Not present on this page — silently skip

    const subset =
      limit && limit > 0 ? properties.slice(0, limit) : properties;

    if (subset.length === 0) {
      container.innerHTML = Templates.emptyState();
      container.setAttribute('aria-busy', 'false');
      return;
    }

    container.innerHTML = subset
      .map(p => Templates.propertyCard(p))
      .join('\n');

    container.setAttribute('aria-busy', 'false');

    // Attach image fallback handlers after DOM insertion
    Helpers.attachImageFallbacks(container);
  },

  /**
   * Render an error state inside a container.
   * Also wires the "Try Again" button to reload the page.
   *
   * @param {string} containerId
   * @param {string} [message]
   */
  error(containerId, message) {
    const container = DOM.get(containerId);
    if (!container) return;

    container.innerHTML = Templates.errorState(message);
    container.setAttribute('aria-busy', 'false');

    // Wire retry button without inline events
    const retryBtn = container.querySelector('.error-state__retry');
    retryBtn?.addEventListener('click', () => window.location.reload());
  },
};


/* ============================================================
  10. UI
   Navigation, scroll reveal, hero population, footer year,
   page-transition animation, and reveal-class initialisation.
   ============================================================ */

const UI = {

  /**
   * Initialise the sticky header and mobile navigation menu.
   * Element IDs: siteHeader, navToggle, navMenu
   */
  initNav() {
    const header = DOM.get('siteHeader');
    const toggle = DOM.get('navToggle');
    const menu   = DOM.get('navMenu');

    // ── Sticky header: add/remove .site-header--scrolled ──
    if (header) {
      const onScroll = () => {
        DOM.toggle(header, 'site-header--scrolled', window.scrollY > 20);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll(); // Evaluate immediately in case page is pre-scrolled
    }

    if (!toggle || !menu) return;

    // ── Mobile menu open / close ──
    const openMenu  = () => {
      menu.classList.add('is-open');
      toggle.classList.add('is-open');
      DOM.setAttr(toggle, 'aria-expanded', 'true');
      DOM.setAttr(menu,   'aria-hidden',   'false');
    };

    const closeMenu = () => {
      menu.classList.remove('is-open');
      toggle.classList.remove('is-open');
      DOM.setAttr(toggle, 'aria-expanded', 'false');
      DOM.setAttr(menu,   'aria-hidden',   'true');
    };

    toggle.addEventListener('click', () => {
      menu.classList.contains('is-open') ? closeMenu() : openMenu();
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && !toggle.contains(e.target)) {
        closeMenu();
      }
    });

    // Close on Escape key, return focus to toggle
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) {
        closeMenu();
        toggle.focus();
      }
    });
  },

  /**
   * Activate IntersectionObserver-based scroll reveal.
   * All elements with class `.reveal` (added by UI.initRevealClasses)
   * receive `.is-visible` when they enter the viewport.
   *
   * Falls back to immediate-show for browsers without IO support.
   */
  initScrollReveal() {
    const elements = DOM.queryAll('.reveal');
    if (!elements.length) return;

    if (!('IntersectionObserver' in window)) {
      // Graceful fallback: reveal everything now
      elements.forEach(el => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target); // Reveal once only
        });
      },
      {
        threshold  : CONFIG.REVEAL_THRESHOLD,
        rootMargin : CONFIG.REVEAL_ROOT_MARGIN,
      }
    );

    elements.forEach(el => observer.observe(el));
  },

  /**
   * Programmatically add .reveal (and variant) classes to
   * below-the-fold elements. Called after page data is rendered
   * so newly injected property cards are also included.
   *
   * We only target elements that are reliably below the fold
   * to prevent a flash of invisible content on above-fold items.
   */
  initRevealClasses() {
    /**
     * Each entry: { selector, extra[] }
     * extra[] = additional classes to add alongside 'reveal'
     */
    const targets = [
      // Stats bar items
      { selector: '.stats-bar__item', extra: ['reveal', 'reveal--fade'] },

      // Section headers (featured + latest grids are always below fold)
      { selector: '#featuredSection .section__header', extra: ['reveal'] },
      { selector: '#featuredSection .section__footer', extra: ['reveal'] },
      { selector: '#latestSection .section__header',   extra: ['reveal'] },
      { selector: '#latestSection .section__footer',   extra: ['reveal'] },

      // Trust section
      { selector: '#trustSection .section__header',    extra: ['reveal', 'reveal--slow'] },
      { selector: '.trust-card',                       extra: ['reveal'] },

      // CTA strip (component-specific rules in animations.css
      //            drive the direction, just need .reveal class)
      { selector: '.cta-strip__content',               extra: ['reveal'] },
      { selector: '.cta-strip__actions',               extra: ['reveal'] },

      // Footer
      { selector: '.footer-brand',                     extra: ['reveal'] },
      { selector: '.footer-nav__group',                extra: ['reveal'] },
      { selector: '.site-footer__bottom',              extra: ['reveal', 'reveal--fade'] },
    ];

    targets.forEach(({ selector, extra }) => {
      DOM.queryAll(selector).forEach(el => {
        extra.forEach(cls => el.classList.add(cls));
      });
    });
  },

  /**
   * Set the copyright year in the footer.
   * Target: <span id="footerYear">
   */
  setFooterYear() {
    DOM.setText('footerYear', new Date().getFullYear());
  },

  /**
   * Inject a hero frame image from the most prominent property.
   * The HTML already has a placeholder SVG; this appends a real
   * <img> that fades in via animations.css on load.
   *
   * @param {Object|null} property
   */
  setHeroImage(property) {
    const frameEl = DOM.get('heroFrameImage');
    if (!frameEl || !property) return;

    const imageUrl = Helpers.getImage(property);
    if (!imageUrl) return;

    const img    = document.createElement('img');
    img.src      = imageUrl;
    img.alt      = Formatters.escape(property.title ?? 'Featured Property');
    img.loading  = 'eager'; // Hero image is above the fold
    img.className = '';     // animations.css targets via parent class

    img.addEventListener('error', () => img.remove());

    img.addEventListener('load', () => {
      // Remove placeholder once real image is ready
      const placeholder = DOM.query('.hero__frame-placeholder', frameEl);
      placeholder?.remove();
    });

    frameEl.appendChild(img);
  },

  /**
   * Write live listing counts into the hero stats block.
   * Target IDs: statTotal · statAvailable · statFeatured
   *
   * @param {Object[]} data — full property array
   */
  updateHeroStats(data) {
    const available = Filters.available(data);
    const featured  = Filters.featured(data);

    DOM.setText('statTotal',     data.length      || '0');
    DOM.setText('statAvailable', available.length || '0');
    DOM.setText('statFeatured',  featured.length  || '0');
  },

  /**
   * Write live counts into the stats bar strip below the hero.
   * Target IDs: sbTotal · sbAvailable · sbFeatured
   *
   * @param {Object[]} data
   */
  updateStatsBar(data) {
    const available = Filters.available(data);
    const featured  = Filters.featured(data);

    DOM.setText('sbTotal',     data.length      || '0');
    DOM.setText('sbAvailable', available.length || '0');
    DOM.setText('sbFeatured',  featured.length  || '0');
  },

  /**
   * Populate the floating "Latest Listing" card in the hero visual.
   * Target IDs: heroFloatTitle · heroFloatPrice
   *
   * @param {Object|null} property — the single most recent property
   */
  updateHeroFloatCard(property) {
    if (!property) return;
    DOM.setText('heroFloatTitle', property.title ?? 'New Property');
    DOM.setText('heroFloatPrice', Formatters.price(property.price));
  },

  /**
   * Update the "Available Now" count inside the hero badge.
   * Target ID: heroBadgeCount
   *
   * @param {number} count
   */
  updateHeroBadge(count) {
    DOM.setText('heroBadgeCount', count);
  },

  /**
   * Add a page-exit animation and then navigate.
   * Called on internal link clicks via initPageTransitions().
   *
   * @param {string} href
   */
  navigateTo(href) {
    document.body.classList.add('page-is-exiting');
    setTimeout(() => {
      window.location.href = href;
    }, CONFIG.EXIT_ANIM_DURATION);
  },

  /**
   * Intercept internal link clicks to animate the page exit.
   * External links, anchors, tel:, mailto:, and _blank targets
   * are left to the browser's default behaviour.
   */
  initPageTransitions() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;

      const href   = link.getAttribute('href') ?? '';
      const target = link.getAttribute('target') ?? '';

      // Skip: external, anchor, special protocols, new-tab
      if (
        !href              ||
        href.startsWith('#')       ||
        href.startsWith('http')    ||
        href.startsWith('//')      ||
        href.startsWith('tel:')    ||
        href.startsWith('mailto:') ||
        target === '_blank'
      ) return;

      e.preventDefault();
      this.navigateTo(href);
    });
  },
};


/* ============================================================
  11. PAGE RENDERERS
   Each function orchestrates data rendering for one HTML page.
   Functions check for their expected containers before writing;
   missing containers are silently skipped — no crashes.
   ============================================================ */

const Pages = {

  /* ──────────────────────────────────────────────────────────
     HOME  —  index.html
     ────────────────────────────────────────────────────────
     Containers used:
       statTotal · statAvailable · statFeatured   (hero stats)
       sbTotal · sbAvailable · sbFeatured         (stats bar)
       heroBadgeCount                             (available pill)
       heroFloatTitle · heroFloatPrice            (float card)
       heroFrameImage                             (hero visual)
       featuredGrid                               (featured cards)
       latestGrid                                 (latest cards)
  ────────────────────────────────────────────────────────── */
  async home(data) {
    const featured  = Filters.featured(data);
    const available = Filters.available(data);
    const latest    = Filters.latest(data, CONFIG.LATEST_LIMIT);
    const latestOne = latest[0] ?? null;

    // ── Hero stats panel ──
    UI.updateHeroStats(data);

    // ── Stats bar strip ──
    UI.updateStatsBar(data);

    // ── Available-now badge pill ──
    UI.updateHeroBadge(available.length);

    // ── Floating latest-listing card ──
    UI.updateHeroFloatCard(latestOne);

    // ── Hero frame background image ──
    // Prefer first featured property; fall back to most recent listing
    UI.setHeroImage(featured[0] ?? latestOne);

    // ── Featured properties grid ──
    Renderer.grid('featuredGrid', featured, CONFIG.FEATURED_LIMIT);

    // ── Latest properties grid ──
    Renderer.grid('latestGrid', latest, CONFIG.LATEST_LIMIT);
  },

  /* ──────────────────────────────────────────────────────────
     LISTINGS  —  listings.html  (ready for when page is built)
     ────────────────────────────────────────────────────────
     Containers expected:
       listingsGrid    — main property grid
       listingsCount   — "X properties found" label
       listingsTotal   — total available count

     URL params supported:
       ?type=house&status=available&district=kailali&q=search
  ────────────────────────────────────────────────────────── */
  async listings(data) {
    const typeParam     = Helpers.getParam('type');
    const statusParam   = Helpers.getParam('status');
    const districtParam = Helpers.getParam('district');
    const searchParam   = Helpers.getParam('q');

    // Apply filters in sequence
    let filtered = [...data];
    if (typeParam)     filtered = Filters.byType(filtered,     typeParam);
    if (statusParam)   filtered = Filters.byStatus(filtered,   statusParam);
    if (districtParam) filtered = Filters.byDistrict(filtered, districtParam);
    if (searchParam)   filtered = Filters.search(filtered,     searchParam);

    // Sort newest first
    filtered = Filters.sortByNewest(filtered);

    // Update count labels
    const countLabel = filtered.length === 1
      ? '1 property found'
      : `${filtered.length} properties found`;

    DOM.setText('listingsCount', countLabel);
    DOM.setText('listingsTotal', data.length);

    // Render grid
    Renderer.grid('listingsGrid', filtered);

    // Wire live search input if present on the page
    const searchInput = DOM.get('listingsSearch');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const q       = searchInput.value;
        const results = Filters.search(filtered, q);
        DOM.setText(
          'listingsCount',
          results.length === 1
            ? '1 property found'
            : `${results.length} properties found`
        );
        Renderer.grid('listingsGrid', results);
      });
    }
  },

  /* ──────────────────────────────────────────────────────────
     FEATURED  —  featured.html  (ready for when page is built)
     ────────────────────────────────────────────────────────
     Containers expected:
       featuredGridAll  — full featured property grid
       featuredCount    — "X featured properties" label
  ────────────────────────────────────────────────────────── */
  async featured(data) {
    const featured = Filters.featured(data);

    DOM.setText(
      'featuredCount',
      featured.length === 1
        ? '1 featured property'
        : `${featured.length} featured properties`
    );

    Renderer.grid('featuredGridAll', featured);
  },

  /* ──────────────────────────────────────────────────────────
     PROPERTY DETAIL  —  property.html  (ready for when page is built)
     ────────────────────────────────────────────────────────
     URL: property.html?id=N
     Containers expected (all optional — missing = skip):
       propertyGallery       — image gallery
       propertyTitle         — heading
       propertyPrice         — formatted price
       propertyLocation      — location string
       propertyArea          — land/floor area
       propertyType          — property type
       propertyStatus        — Available / Sold / Reserved
       propertyStatusBadge   — coloured status badge element
       propertyRoad          — road access description
       propertyDistrict      — district name
       propertyCode          — internal property code
       propertyDate          — formatted listed date
       propertyDescription   — full description paragraph
       propertyRemarks       — additional remarks
       propertyFeaturedBadge — star badge (hidden when not featured)
       propertyPhone         — tel: link
       propertyMapBtn        — external map link
       propertyFbBtn         — facebook post link
       relatedGrid           — related properties grid
  ────────────────────────────────────────────────────────── */
  async property(data) {
    const id = Helpers.getParam('id');

    if (!id) {
      Renderer.error(
        'propertyDetail',
        'No property ID was provided in the URL.'
      );
      return;
    }

    const property = data.find(p => String(p.id) === String(id));

    if (!property) {
      Renderer.error(
        'propertyDetail',
        `Property #${Formatters.escape(id)} could not be found. It may have been removed.`
      );
      return;
    }

    const e = Formatters.escape;

    // ── Browser tab title ──
    document.title =
      `${property.title ?? 'Property'} — Sudurpaschim Ghar Jagga Kaarobaar`;

    // ── Text content fields ──
    const textFields = {
      propertyTitle       : property.title,
      propertyPrice       : Formatters.price(property.price),
      propertyLocation    : property.location,
      propertyArea        : property.area,
      propertyType        : property.type,
      propertyStatus      : property.status,
      propertyRoad        : property.roadAccess,
      propertyDistrict    : property.district,
      propertyCode        : property.propertyCode,
      propertyDate        : Formatters.date(property.postedDate),
      propertyDescription : property.description,
      propertyRemarks     : property.remarks,
    };

    Object.entries(textFields).forEach(([id, value]) => {
      DOM.setText(id, value ?? '');
    });

    // ── Featured badge ──
    const featBadge = DOM.get('propertyFeaturedBadge');
    if (featBadge) {
      featBadge.hidden = !Helpers.isFeatured(property);
    }

    // ── Status badge class ──
    const statusBadge = DOM.get('propertyStatusBadge');
    if (statusBadge && property.status) {
      statusBadge.className =
        `property-detail__status ${Helpers.statusClass(property.status)}`;
      statusBadge.textContent = property.status;
    }

    // ── Image gallery ──
    const galleryEl = DOM.get('propertyGallery');
    if (galleryEl) {
      const images = Helpers.getImages(property);

      if (images.length > 0) {
        galleryEl.innerHTML = images
          .map((src, i) =>
            Templates.gallerySlide(src, property.title ?? 'Property', i === 0, i)
          )
          .join('\n');

        // Attach fallback handlers for gallery images
        DOM.queryAll('.gallery__slide img', galleryEl).forEach(img => {
          img.addEventListener('error', function onGalleryError() {
            this.removeEventListener('error', onGalleryError);
            this.closest('.gallery__slide')?.remove();
          });
        });

        // Simple gallery keyboard navigation
        this._initGallery(galleryEl, images.length);

      } else {
        galleryEl.innerHTML = `
          <div class="gallery__placeholder" aria-hidden="true">
            ${Icons.home}
            <p>No images available for this property</p>
          </div>`;
      }
    }

    // ── Action: Phone ──
    const phoneEl = DOM.get('propertyPhone');
    if (phoneEl) {
      if (property.phone) {
        phoneEl.href        = `tel:${String(property.phone).replace(/\s/g, '')}`;
        phoneEl.textContent = property.phone;
        phoneEl.hidden      = false;
      } else {
        phoneEl.hidden = true;
      }
    }

    // ── Action: Map ──
    const mapBtn = DOM.get('propertyMapBtn');
    if (mapBtn) {
      mapBtn.hidden = !property.mapLink;
      if (property.mapLink) mapBtn.href = property.mapLink;
    }

    // ── Action: Facebook post ──
    const fbBtn = DOM.get('propertyFbBtn');
    if (fbBtn) {
      fbBtn.hidden = !property.facebookPost;
      if (property.facebookPost) fbBtn.href = property.facebookPost;
    }

    // ── Related properties (same type, excluding current) ──
    const related = Filters.sortByNewest(
      data.filter(p =>
        String(p.id) !== String(id) &&
        String(p.type).toLowerCase() === String(property.type ?? '').toLowerCase()
      )
    ).slice(0, 3);

    Renderer.grid('relatedGrid', related);
  },

  /**
   * Basic gallery keyboard/click navigation for property.html.
   * Moves .gallery__slide--active forward/backward.
   *
   * @param {HTMLElement} galleryEl
   * @param {number}      total
   * @private
   */
  _initGallery(galleryEl, total) {
    if (total <= 1) return;

    let current = 0;

    const goTo = (index) => {
      const slides = DOM.queryAll('.gallery__slide', galleryEl);
      slides[current]?.classList.remove('gallery__slide--active');
      current = (index + total) % total;
      slides[current]?.classList.add('gallery__slide--active');
    };

    // Buttons may be outside #propertyGallery (placed in parent wrapper so
    // they survive innerHTML replacement). Check inside first, then wrapper.
    const wrapCtx = galleryEl.closest('.property-detail__gallery-wrap') ?? galleryEl;
    const prevBtn = DOM.query('.gallery__prev', galleryEl) ?? DOM.query('.gallery__prev', wrapCtx);
    const nextBtn = DOM.query('.gallery__next', galleryEl) ?? DOM.query('.gallery__next', wrapCtx);

    prevBtn?.addEventListener('click', () => goTo(current - 1));
    nextBtn?.addEventListener('click', () => goTo(current + 1));

    // Keyboard navigation when gallery is focused
    galleryEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft')  goTo(current - 1);
      if (e.key === 'ArrowRight') goTo(current + 1);
    });
  },
};


/* ============================================================
  12. PAGE DETECTION
   Identifies the current page from the URL pathname.
   Returns a string key used to select the correct renderer.
   ============================================================ */

/**
 * @returns {'home'|'listings'|'featured'|'property'|'about'|'contact'|'unknown'}
 */
const detectPage = () => {
  const parts    = window.location.pathname.split('/').filter(Boolean);
  const filename = parts[parts.length - 1] ?? '';

  // Root path or index.html
  if (!filename || filename === 'index.html') return 'home';

  // Strip query string from filename before matching
  const base = filename.split('?')[0].split('#')[0];

  if (base.startsWith('listings'))  return 'listings';
  if (base.startsWith('featured'))  return 'featured';
  if (base.startsWith('property'))  return 'property';
  if (base.startsWith('about'))     return 'about';
  if (base.startsWith('contact'))   return 'contact';

  return 'unknown';
};


/* ============================================================
  13. INIT
   Application entry point.
   Runs on DOMContentLoaded.

   Sequence:
   1. Always: nav, footer year, page transitions
   2. Skip API fetch for static pages (about, contact)
   3. Fetch property data
   4. Run page-specific renderer
   5. Add .reveal classes to below-fold elements
   6. Start IntersectionObserver
   ============================================================ */

const init = async () => {

  // ── Step 1: Always-on UI ──
  UI.initNav();
  UI.setFooterYear();
  UI.initPageTransitions();

  // ── Step 2: Detect page ──
  const page = detectPage();

  // Static pages need no API data
  if (page === 'about' || page === 'contact' || page === 'unknown') {
    UI.initRevealClasses();
    UI.initScrollReveal();
    return;
  }

  // ── Step 3: Fetch data ──
  try {
    const data = await API.fetchAll();

    // ── Step 4: Run page renderer ──
    switch (page) {
      case 'home'     : await Pages.home(data);     break;
      case 'listings' : await Pages.listings(data); break;
      case 'featured' : await Pages.featured(data); break;
      case 'property' : await Pages.property(data); break;
      default         : break;
    }

  } catch (error) {
    console.error('[SGKJ] Property data could not be loaded:', error.message);

    // Show graceful error states in every possible grid on this page
    [
      'featuredGrid',
      'latestGrid',
      'listingsGrid',
      'featuredGridAll',
      'propertyDetail',
    ].forEach(id => {
      Renderer.error(id, 'Unable to load properties. Please refresh the page.');
    });
  }

  // ── Step 5–6: Reveal system (runs whether data loaded or not) ──
  UI.initRevealClasses();
  UI.initScrollReveal();
};

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', init);