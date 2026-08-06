/* ==========================================================================
   vw-gui :: settings drawer
   --------------------------------------------------------------------------
   Preferences live in the same prefs.json as the window state. Every control
   writes immediately — there is no Save button, because nothing here is
   destructive enough to warrant one.
   ========================================================================== */

(function () {
  const body = document.getElementById("drawer-settings-content");

  const DEFAULT_MODES = ["none", "lastDir", "all"];

  let prefs = null;
  let onChange = () => {};

  function get() {
    return prefs;
  }

  function normalise(p) {
    const out = p || {};
    out.tray = out.tray || {};
    out.tray.enabled = !!out.tray.enabled;
    out.tray.minimizeToTray = !!out.tray.minimizeToTray;
    if (!DEFAULT_MODES.includes(out.defaultsMode)) out.defaultsMode = "lastDir";
    out.perCommand = out.perCommand || {};
    out.categoryOrder = out.categoryOrder || [];
    return out;
  }

  function init(loadedPrefs, changeHandler) {
    prefs = normalise(loadedPrefs);
    onChange = changeHandler || (() => {});
    render();
    applyTray();
  }

  function save() {
    onChange(prefs);
  }

  function applyTray() {
    window.vwg.applyTray(prefs.tray).catch(() => {});
  }

  /* ---- Controls --------------------------------------------------------- */

  function toggleRow({ label, hint, checked, disabled, onToggle }) {
    const input = U.el("input", { type: "checkbox" });
    input.checked = !!checked;
    input.disabled = !!disabled;
    input.addEventListener("change", () => onToggle(input.checked));

    return U.el("div", { class: "setting" + (disabled ? " setting--disabled" : "") }, [
      U.el("label", { class: "toggle setting__toggle" }, [
        input,
        U.el("span", { class: "toggle__track" }, [U.el("span", { class: "toggle__thumb" })]),
        U.el("span", { class: "toggle__label", text: label }),
      ]),
      hint ? U.el("p", { class: "setting__hint", text: hint }) : null,
    ]);
  }

  function radioRow({ name, value, current, label, hint, onPick }) {
    const input = U.el("input", { type: "radio", name, value });
    input.checked = current === value;
    input.addEventListener("change", () => {
      if (input.checked) onPick(value);
    });

    return U.el("label", { class: "radio" }, [
      input,
      U.el("span", { class: "radio__dot" }),
      U.el("span", { class: "radio__body" }, [
        U.el("span", { class: "radio__label", text: label }),
        hint ? U.el("span", { class: "radio__hint", text: hint }) : null,
      ]),
    ]);
  }

  function render() {
    body.innerHTML = "";

    /* -- Tray -- */
    body.appendChild(U.el("h3", { class: "setting__group", text: i18n.t("settings.trayGroup") }));

    body.appendChild(
      toggleRow({
        label: i18n.t("settings.trayEnabled"),
        hint: i18n.t("settings.trayEnabledHint"),
        checked: prefs.tray.enabled,
        onToggle: (on) => {
          prefs.tray.enabled = on;
          if (!on) prefs.tray.minimizeToTray = false;
          save();
          applyTray();
          render();
        },
      })
    );

    body.appendChild(
      toggleRow({
        label: i18n.t("settings.trayMinimize"),
        hint: i18n.t("settings.trayMinimizeHint"),
        checked: prefs.tray.minimizeToTray,
        disabled: !prefs.tray.enabled,
        onToggle: (on) => {
          prefs.tray.minimizeToTray = on;
          save();
          applyTray();
        },
      })
    );

    /* -- Default values -- */
    body.appendChild(U.el("h3", { class: "setting__group", text: i18n.t("settings.defaultsGroup") }));

    const pick = (mode) => {
      prefs.defaultsMode = mode;
      save();
    };

    body.appendChild(
      U.el("div", { class: "radios" }, [
        radioRow({
          name: "defaults", value: "none", current: prefs.defaultsMode,
          label: i18n.t("settings.defaultsNone"),
          hint: i18n.t("settings.defaultsNoneHint"),
          onPick: pick,
        }),
        radioRow({
          name: "defaults", value: "lastDir", current: prefs.defaultsMode,
          label: i18n.t("settings.defaultsLastDir"),
          hint: i18n.t("settings.defaultsLastDirHint"),
          onPick: pick,
        }),
        radioRow({
          name: "defaults", value: "all", current: prefs.defaultsMode,
          label: i18n.t("settings.defaultsAll"),
          hint: i18n.t("settings.defaultsAllHint"),
          onPick: pick,
        }),
      ])
    );

    const remembered = Object.keys(prefs.perCommand || {}).length;
    body.appendChild(
      U.el("div", { class: "setting" }, [
        U.el("button", {
          class: "btn btn--ghost",
          type: "button",
          disabled: remembered === 0,
          text: i18n.t("settings.forget", { n: remembered }),
          onclick: () => {
            prefs.perCommand = {};
            save();
            render();
            toast.success(i18n.t("settings.forgot"));
          },
        }),
      ])
    );
  }

  /* ---- Remembered values ------------------------------------------------ */

  /** Called after a run so the next visit can restore it. */
  function remember(commandName, cwd, params) {
    if (!prefs || prefs.defaultsMode === "none") return;
    prefs.perCommand = prefs.perCommand || {};
    prefs.perCommand[commandName] =
      prefs.defaultsMode === "all" ? { cwd, params } : { cwd };
    save();
  }

  /** What should be restored when a command is selected. */
  function recall(commandName) {
    if (!prefs || prefs.defaultsMode === "none") return null;
    const saved = prefs.perCommand && prefs.perCommand[commandName];
    if (!saved) return null;
    return prefs.defaultsMode === "all"
      ? { cwd: saved.cwd, params: saved.params }
      : { cwd: saved.cwd, params: null };
  }

  window.settings = { init, get, render, remember, recall, applyTray };
})();
