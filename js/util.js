/* ==========================================================================
   vw-gui :: shared helpers
   ========================================================================== */

(function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k === "html") node.innerHTML = v;
        else if (k.startsWith("on") && typeof v === "function") {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (v === true) node.setAttribute(k, "");
        else node.setAttribute(k, v);
      }
    }
    for (const child of [].concat(children || [])) {
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
  }

  /** Inline SVG icon. Paths are drawn on a 16x16 grid. */
  function icon(paths, size) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    if (size) {
      svg.style.width = size + "px";
      svg.style.height = size + "px";
    }
    svg.innerHTML = paths;
    return svg;
  }

  const ICONS = {
    folder: '<path d="M2 12.5v-9h4l1.5 2h6.5v7z"/>',
    file: '<path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3"/>',
    edit: '<path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3z"/>',
    trash: '<path d="M3 4h10M6.5 4V2.5h3V4M4.5 4l.5 9h6l.5-9"/>',
    external: '<path d="M9 3h4v4M13 3L7.5 8.5M12 9.5V13H3V4h3.5"/>',
    copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 00-1-1h-6a1 1 0 00-1 1v6a1 1 0 001 1h2"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    chevron: '<path d="M6 3.5L10.5 8 6 12.5"/>',
    stop: '<rect x="4" y="4" width="8" height="8" rx="1"/>',
    refresh: '<path d="M13 8a5 5 0 11-1.6-3.7M13 2.5V6h-3.5"/>',
    grip: '<circle cx="6" cy="4" r="1.15"/><circle cx="10" cy="4" r="1.15"/><circle cx="6" cy="8" r="1.15"/><circle cx="10" cy="8" r="1.15"/><circle cx="6" cy="12" r="1.15"/><circle cx="10" cy="12" r="1.15"/>',
    gear: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7L3.6 3.6"/>',
    check: '<path d="M3.5 8.5l3 3 6-7"/>',
  };

  /**
   * Does this parameter name look like it wants a path?
   * Substring match, not word-boundary: camelCase names like "InputFile" and
   * "OutputFile" are the most obvious path params and a boundary rule misses
   * every one of them.
   */
  const PATH_RE = /(path|dir|directory|root|file|folder|input|output|source|dest|destination|target|location)/i;

  function isPathParam(name) {
    return PATH_RE.test(String(name || ""));
  }

  /** Folder vs file picker, guessed from the name. */
  function wantsFolder(name) {
    return /(dir|directory|root|folder|location|targetdir|workspace)/i.test(String(name || ""));
  }

  /**
   * Names that mean "the working directory". These render as a dimmed
   * placeholder showing the picked targetDir and are never sent, so the
   * script's own default resolves against cwd.
   */
  function isCwdParam(name) {
    return /^(targetdir|directory|location|d)$/i.test(String(name || "").trim());
  }

  /** Examples are shown as CLI lines, so they always lead with "vw ". */
  function normalizeExample(text) {
    const s = String(text || "").trim();
    if (!s) return s;
    return /^vw\s/i.test(s) ? s : `vw ${s}`;
  }

  function fmtDuration(ms) {
    if (ms === null || ms === undefined) return "";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }

  function fmtClock(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function fmtStamp(ts) {
    const d = new Date(ts);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const pad = (n) => String(n).padStart(2, "0");
    return `${days[d.getDay()]}, ${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function debounce(fn, wait) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  window.U = {
    $, $$, el, icon, ICONS,
    isPathParam, wantsFolder, isCwdParam, normalizeExample,
    fmtDuration, fmtClock, fmtStamp, escapeHtml, debounce,
  };
})();
