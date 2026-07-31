/* ==========================================================================
   vw-gui :: i18n
   English only for now. The lookup layer exists so a QC bundle can be dropped
   in without touching a single template.
   ========================================================================== */

(function () {
  const bundles = { en: window.VWG_STRINGS_EN || {} };
  let current = "en";

  /** t("run.failed", { code: 5 }) */
  function t(key, vars) {
    const raw = bundles[current] && bundles[current][key];
    if (raw === undefined) return key;
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m
    );
  }

  /**
   * Apply translations to static markup.
   *   data-i18n="key"                    -> textContent
   *   data-i18n-attr="placeholder:key"   -> attribute (semicolon-separated)
   */
  function apply(root) {
    const scope = root || document;

    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });

    scope.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      el.getAttribute("data-i18n-attr")
        .split(";")
        .forEach((pair) => {
          const [attr, key] = pair.split(":").map((s) => s.trim());
          if (attr && key) el.setAttribute(attr, t(key));
        });
    });
  }

  window.i18n = { t, apply, get locale() { return current; } };
})();
