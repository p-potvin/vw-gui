/* ==========================================================================
   vw-gui :: dynamic parameter form
   --------------------------------------------------------------------------
   Builds widgets from registry metadata:
     switch    -> toggle
     bool      -> toggle
     ValidSet  -> select
     int/double-> number input
     string[]  -> tag chips
     string    -> text input (+ browse button when the name looks path-ish)

   Working-directory params (TargetDir / Directory / Location / D) render as a
   dimmed placeholder showing the picked folder and are NOT sent — the script's
   own "(current dir)" default resolves against the spawn cwd instead.
   ========================================================================== */

(function () {
  const grid = document.getElementById("params-grid");
  const noneMsg = document.getElementById("params-none");

  let fields = [];      // live field descriptors
  let currentCwd = "";

  function clear() {
    grid.innerHTML = "";
    fields = [];
  }

  function setCwdPlaceholder(cwd) {
    currentCwd = cwd || "";
    for (const f of fields) {
      if (f.isCwd && f.input) {
        f.input.placeholder = currentCwd || i18n.t("targetdir.placeholder");
      }
    }
  }

  /** Build the form for one command. */
  function build(command, cwd) {
    clear();
    currentCwd = cwd || "";

    const params = command.Parameters || [];
    noneMsg.hidden = params.length > 0;

    params.forEach((p, index) => {
      const field = buildField(p, index);
      fields.push(field);
      grid.appendChild(field.node);
    });
  }

  function buildField(p, index) {
    const type = String(p.Type || "string").toLowerCase();
    const isCwd = U.isCwdParam(p.Name);
    const id = `param-${index}-${String(p.Name).replace(/\W/g, "")}`;

    const labelBits = [
      U.el("span", { text: p.Name }),
      p.Mandatory ? U.el("span", { class: "field__req", text: "*", title: i18n.t("params.required") }) : null,
      U.el("span", { class: "field__type", text: type }),
    ];

    if (p.Aliases && p.Aliases.length) {
      labelBits.push(U.el("span", { class: "field__alias", text: "-" + p.Aliases.join(" -") }));
    }

    const label = U.el("label", { class: "field__label", for: id }, labelBits);

    const field = { param: p, type, isCwd, input: null, getValue: null, node: null };
    let control;

    if (type === "switch" || type === "bool") {
      control = buildToggle(field, p, id);
    } else if (p.ValidSet && p.ValidSet.length) {
      control = buildSelect(field, p, id);
    } else if (type === "string[]") {
      control = buildTags(field, p, id);
    } else if (type === "int" || type === "double") {
      control = buildNumber(field, p, id, type);
    } else {
      control = buildText(field, p, id, isCwd);
    }

    const desc = [];
    if (isCwd) {
      desc.push(i18n.t("params.usesCwd"));
    } else if (p.Description) {
      desc.push(p.Description);
    }
    if (!isCwd && p.Default) desc.push(`default: ${p.Default}`);

    field.node = U.el("div", { class: "field" }, [
      label,
      control,
      desc.length ? U.el("p", { class: "field__desc", text: desc.join(" · ") }) : null,
    ]);

    return field;
  }

  /* ---- Widgets --------------------------------------------------------- */

  function buildToggle(field, p, id) {
    const input = U.el("input", { type: "checkbox", id });
    // A bool with an explicit $true default starts on.
    if (String(p.Default || "").match(/\$true/i)) input.checked = true;

    field.input = input;
    field.getValue = () => (input.checked ? true : undefined);

    return U.el("label", { class: "toggle", for: id }, [
      input,
      U.el("span", { class: "toggle__track" }, [U.el("span", { class: "toggle__thumb" })]),
    ]);
  }

  function buildSelect(field, p, id) {
    const select = U.el("select", { class: "input", id });
    // Optional params get a blank row so the script default can win.
    if (!p.Mandatory) select.appendChild(U.el("option", { value: "", text: "—" }));

    for (const v of p.ValidSet) {
      const opt = U.el("option", { value: v, text: v });
      if (p.Default && String(p.Default) === String(v)) opt.selected = true;
      select.appendChild(opt);
    }

    field.input = select;
    field.getValue = () => (select.value === "" ? undefined : select.value);
    return select;
  }

  function buildNumber(field, p, id, type) {
    const input = U.el("input", {
      type: "number",
      class: "input",
      id,
      step: type === "double" ? "any" : "1",
      placeholder: p.Default || "",
    });

    field.input = input;
    field.getValue = () => {
      if (input.value === "") return undefined;
      const n = type === "double" ? parseFloat(input.value) : parseInt(input.value, 10);
      return Number.isNaN(n) ? undefined : n;
    };
    return input;
  }

  function buildTags(field, p, id) {
    const values = [];
    const wrap = U.el("div", { class: "tags" });
    const input = U.el("input", {
      class: "tags__input",
      id,
      placeholder: i18n.t("params.tagHint"),
      spellcheck: "false",
    });

    function redraw() {
      U.$$(".tag", wrap).forEach((n) => n.remove());
      values.forEach((v, i) => {
        const chip = U.el("span", { class: "tag" }, [
          U.el("span", { text: v }),
          U.el("button", {
            class: "tag__x",
            type: "button",
            "aria-label": `Remove ${v}`,
            text: "×",
            onclick: () => {
              values.splice(i, 1);
              redraw();
            },
          }),
        ]);
        wrap.insertBefore(chip, input);
      });
    }

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const v = input.value.trim();
        if (v) {
          values.push(v);
          input.value = "";
          redraw();
        }
      } else if (e.key === "Backspace" && input.value === "" && values.length) {
        values.pop();
        redraw();
      }
    });

    // Do not silently lose a half-typed tag on run.
    input.addEventListener("blur", () => {
      const v = input.value.trim();
      if (v) {
        values.push(v);
        input.value = "";
        redraw();
      }
    });

    wrap.appendChild(input);

    field.input = input;
    field.getValue = () => (values.length ? values.slice() : undefined);
    return wrap;
  }

  function buildText(field, p, id, isCwd) {
    const input = U.el("input", {
      type: "text",
      class: "input input--mono",
      id,
      spellcheck: "false",
      placeholder: isCwd ? currentCwd || i18n.t("targetdir.placeholder") : p.Default || "",
    });

    field.input = input;
    field.getValue = () => {
      const v = input.value.trim();
      return v === "" ? undefined : v;
    };

    if (!U.isPathParam(p.Name)) return input;

    // Path-ish name: add a browse affordance next to the field.
    const folder = U.wantsFolder(p.Name);
    const btn = U.el("button", {
      class: "pickbtn",
      type: "button",
      title: folder ? i18n.t("targetdir.browse") : i18n.t("editor.pickScript"),
      "aria-label": `Browse for ${p.Name}`,
      onclick: async () => {
        const picked = folder
          ? await window.vwg.pickFolder({ defaultPath: currentCwd || undefined })
          : await window.vwg.pickFile({ defaultPath: currentCwd || undefined });
        if (picked) {
          input.value = picked;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      },
    });
    btn.appendChild(U.icon(folder ? U.ICONS.folder : U.ICONS.file));

    return U.el("div", { class: "field__row" }, [input, btn]);
  }

  /* ---- Collection ------------------------------------------------------ */

  /** Required params the user left blank. */
  function missingRequired() {
    const missing = [];
    for (const f of fields) {
      if (!f.param.Mandatory) continue;
      if (f.isCwd) continue; // satisfied by cwd
      const v = f.getValue();
      const empty = v === undefined || (Array.isArray(v) && v.length === 0);
      f.node.classList.toggle("field--invalid", empty);
      if (empty) missing.push(f.param.Name);
    }
    return missing;
  }

  /** The hashtable that vwg-run.ps1 will splat. */
  function collect() {
    const out = {};
    for (const f of fields) {
      // Working-directory params are deliberately omitted: cwd carries them.
      if (f.isCwd) continue;
      const v = f.getValue();
      if (v !== undefined) out[f.param.Name] = v;
    }
    return out;
  }

  /** Re-apply a previous run's parameters (history replay). */
  function applyValues(values) {
    if (!values) return;
    for (const f of fields) {
      const v = values[f.param.Name];
      if (v === undefined || !f.input) continue;

      if (f.type === "switch" || f.type === "bool") {
        f.input.checked = !!v;
      } else if (f.type === "string[]") {
        // Rebuild chips by replaying keystrokes through the tag input.
        [].concat(v).forEach((item) => {
          f.input.value = String(item);
          f.input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        });
      } else {
        f.input.value = String(v);
      }
    }
  }

  window.form = { build, clear, collect, missingRequired, applyValues, setCwdPlaceholder };
})();
