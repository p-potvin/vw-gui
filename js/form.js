/* ==========================================================================
   vw-gui :: dynamic parameter form
   --------------------------------------------------------------------------
   Widgets are derived from registry metadata:
     switch / bool -> toggle
     ValidateSet   -> select
     int / double  -> number input, with any range found in the description
     string[]      -> tag chips
     path-ish      -> text input with an embedded picker
     string        -> text input

   Working-directory parameters (TargetDir / Directory / Location / D) are not
   rendered at all: their value comes from the Working Directory field above.

   Validation fires on blur, marks the field, and blocks Run on errors. Warnings
   are advisory and never block — the vw CLI does the real checking.
   ========================================================================== */

(function () {
  const grid = document.getElementById("params-grid");
  const noneMsg = document.getElementById("params-none");

  let fields = [];
  let currentCwd = "";
  let currentCommand = null;
  let onValidity = () => {};

  function clear() {
    grid.innerHTML = "";
    fields = [];
  }

  function setCwdPlaceholder(cwd) {
    currentCwd = cwd || "";
  }

  function build(command, cwd) {
    clear();
    currentCwd = cwd || "";
    currentCommand = command;

    const all = command.Parameters || [];
    // Hidden: fed from the Working Directory field instead.
    const visible = all.filter((p) => !U.isCwdParam(p.Name));

    noneMsg.hidden = visible.length > 0;

    visible.forEach((p, index) => {
      const field = buildField(p, index);
      fields.push(field);
      grid.appendChild(field.node);
    });

    onValidity(errors().length === 0);
  }

  /* ---- Field construction ---------------------------------------------- */

  function buildField(p, index) {
    const type = String(p.Type || "string").toLowerCase();
    const id = `param-${index}-${String(p.Name).replace(/\W/g, "")}`;
    const fmt = validate.inferFormat(p, currentCommand);

    const field = {
      param: p,
      type,
      fmt,
      input: null,
      getValue: null,
      node: null,
      error: null,
      msgEl: null,
    };

    const labelBits = [
      U.el("span", { text: p.Name }),
      p.Mandatory
        ? U.el("span", { class: "field__req", text: "*", title: i18n.t("params.required") })
        : null,
      U.el("span", { class: "field__type", text: type }),
    ];

    if (p.Aliases && p.Aliases.length) {
      labelBits.push(U.el("span", { class: "field__alias", text: "-" + p.Aliases.join(" -") }));
    }

    const label = U.el("label", { class: "field__label", for: id }, labelBits);

    let control;
    if (type === "switch" || type === "bool") control = buildToggle(field, p, id);
    else if (p.ValidSet && p.ValidSet.length) control = buildSelect(field, p, id);
    else if (type === "string[]") control = buildTags(field, p, id, fmt);
    else if (fmt.attrs && fmt.attrs.type === "number") control = buildNumber(field, p, id, fmt);
    else control = buildText(field, p, id, fmt);

    // Hint line: description, then the format's own guidance, then the default.
    const hints = [];
    if (p.Description) hints.push(p.Description);
    if (fmt.hintKey) hints.push(i18n.t(fmt.hintKey));
    if (p.Default) hints.push(`default: ${p.Default}`);

    const msgEl = U.el("p", { class: "field__msg", hidden: true });
    field.msgEl = msgEl;

    field.node = U.el("div", { class: "field" }, [
      label,
      control,
      hints.length ? U.el("p", { class: "field__desc", text: hints.join(" · ") }) : null,
      msgEl,
    ]);

    return field;
  }

  function applyAttrs(input, fmt, p) {
    for (const [k, v] of Object.entries(fmt.attrs || {})) {
      if (k === "type" && input.tagName !== "INPUT") continue;
      input.setAttribute(k, v);
    }
    if (p.Mandatory) input.setAttribute("required", "");
    if (fmt.hintKey) input.setAttribute("title", i18n.t(fmt.hintKey));
  }

  /** Re-check a field and paint the result. */
  function check(field, { silent } = {}) {
    const value = field.getValue();
    const result = validate.validateValue(value, field.param, currentCommand, field.fmt);
    field.error = result && result.level === "error" ? result : null;

    field.node.classList.toggle("field--invalid", !!(result && result.level === "error"));
    field.node.classList.toggle("field--warn", !!(result && result.level === "warn"));

    if (result && !silent) {
      field.msgEl.textContent = result.message;
      field.msgEl.className = `field__msg field__msg--${result.level}`;
      field.msgEl.hidden = false;
    } else {
      field.msgEl.hidden = true;
    }

    onValidity(errors().length === 0);
    return result;
  }

  function wireValidation(field, input) {
    input.addEventListener("blur", () => check(field));
    // Clearing an error as soon as it is fixed feels better than waiting.
    input.addEventListener("input", () => {
      if (field.node.classList.contains("field--invalid")) check(field, { silent: true });
    });
  }

  /* ---- Widgets ---------------------------------------------------------- */

  function buildToggle(field, p, id) {
    const input = U.el("input", { type: "checkbox", id });
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
    if (!p.Mandatory) select.appendChild(U.el("option", { value: "", text: "—" }));

    for (const v of p.ValidSet) {
      const opt = U.el("option", { value: v, text: v });
      if (p.Default && String(p.Default) === String(v)) opt.selected = true;
      select.appendChild(opt);
    }
    if (p.Mandatory) select.setAttribute("required", "");

    field.input = select;
    field.getValue = () => (select.value === "" ? undefined : select.value);
    select.addEventListener("change", () => check(field));
    return select;
  }

  function buildNumber(field, p, id, fmt) {
    const input = U.el("input", { class: "input", id, placeholder: p.Default || "" });
    applyAttrs(input, fmt, p);

    field.input = input;
    field.getValue = () => {
      if (input.value === "") return undefined;
      const n = Number(input.value);
      return Number.isNaN(n) ? input.value : n;
    };

    wireValidation(field, input);
    return input;
  }

  function buildTags(field, p, id, fmt) {
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
        wrap.insertBefore(
          U.el("span", { class: "tag" }, [
            U.el("span", { text: v }),
            U.el("button", {
              class: "tag__x",
              type: "button",
              "aria-label": `Remove ${v}`,
              text: "×",
              onclick: () => {
                values.splice(i, 1);
                redraw();
                check(field);
              },
            }),
          ]),
          input
        );
      });
    }

    function commit() {
      const v = input.value.trim();
      if (!v) return;
      values.push(v);
      input.value = "";
      redraw();
      check(field);
    }

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        commit();
      } else if (e.key === "Backspace" && input.value === "" && values.length) {
        values.pop();
        redraw();
        check(field);
      }
    });

    // Do not silently lose a half-typed tag.
    input.addEventListener("blur", () => {
      commit();
      check(field);
    });

    wrap.appendChild(input);

    field.input = input;
    field.getValue = () => (values.length ? values.slice() : undefined);
    return wrap;
  }

  function buildText(field, p, id, fmt) {
    const isPath = fmt.id === "path";
    const input = U.el("input", {
      type: "text",
      class: "input input--mono",
      id,
      placeholder: p.Default || "",
    });
    applyAttrs(input, fmt, p);

    field.input = input;
    field.getValue = () => {
      const v = input.value.trim();
      return v === "" ? undefined : v;
    };

    wireValidation(field, input);

    if (!isPath) return input;

    /* Path field: the picker lives inside the input.
       Clicking an empty field opens the browser directly; once there is a
       value, clicking positions the caret and the icon does the browsing. */
    const folder = U.wantsFolder(p.Name);

    const openPicker = async () => {
      const at = currentCwd || undefined;
      const picked = folder
        ? await window.vwg.pickFolder({ defaultPath: at })
        : await window.vwg.pickFile({
            defaultPath: at,
            filters: window.EXT ? EXT.filtersFor(p.Name, currentCommand) : undefined,
          });
      if (picked) {
        input.value = picked;
        check(field);
        input.focus();
      }
    };

    input.classList.add("input--haspick");
    input.addEventListener("click", () => {
      if (input.value.trim() === "") openPicker();
    });
    if (!input.getAttribute("placeholder")) {
      input.setAttribute("placeholder", i18n.t("field.clickToBrowse"));
    }

    const btn = U.el("button", {
      class: "field__pick",
      type: "button",
      tabindex: "-1",
      title: i18n.t(folder ? "field.browseFolder" : "field.browseFile"),
      "aria-label": `Browse for ${p.Name}`,
      onclick: (e) => {
        e.preventDefault();
        openPicker();
      },
    });
    btn.appendChild(U.icon(folder ? U.ICONS.folder : U.ICONS.file));

    return U.el("div", { class: "field__wrap" }, [input, btn]);
  }

  /* ---- Collection ------------------------------------------------------- */

  /** Every field currently holding a blocking error. */
  function errors() {
    return fields.filter((f) => f.error);
  }

  /** Validate everything and paint. Returns the blocking field names. */
  function validateAll() {
    const bad = [];
    for (const f of fields) {
      const result = check(f);
      if (result && result.level === "error") bad.push(f.param.Name);
    }
    return bad;
  }

  /**
   * The hashtable vwg-run.ps1 will splat.
   * Hidden working-directory params are injected here, and relative paths are
   * resolved against the working directory — neither is shown in the form.
   */
  function collect() {
    const out = {};

    for (const p of (currentCommand && currentCommand.Parameters) || []) {
      if (U.isCwdParam(p.Name) && currentCwd) out[p.Name] = currentCwd;
    }

    for (const f of fields) {
      const v = f.getValue();
      if (v === undefined) continue;

      if (f.fmt.id === "path" && typeof v === "string") {
        out[f.param.Name] = validate.resolveAgainstCwd(v, currentCwd);
      } else {
        out[f.param.Name] = v;
      }
    }

    return out;
  }

  function applyValues(values) {
    if (!values) return;
    for (const f of fields) {
      const v = values[f.param.Name];
      if (v === undefined || !f.input) continue;

      if (f.type === "switch" || f.type === "bool") {
        f.input.checked = !!v;
      } else if (f.type === "string[]") {
        [].concat(v).forEach((item) => {
          f.input.value = String(item);
          f.input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        });
      } else {
        f.input.value = String(v);
      }
      check(f, { silent: true });
    }
  }

  window.form = {
    build,
    clear,
    collect,
    validateAll,
    applyValues,
    setCwdPlaceholder,
    get hasErrors() { return errors().length > 0; },
    set onValidity(fn) { onValidity = fn; },
  };
})();
