/* ==========================================================================
   vw-gui :: command editor (add / edit / delete)
   --------------------------------------------------------------------------
   Adding a command: pick a .ps1, its param() block is read via the PowerShell
   AST, the detected parameters land in an editable table, and the result is
   surgically inserted into vw-commands.ps1 — which registers it with the CLI
   itself, not just this GUI.
   ========================================================================== */

(function () {
  const NAME_RE = /^[a-z0-9][a-z0-9-]*$/i;
  let onSaved = () => {};

  /* ---- Add / edit ------------------------------------------------------ */

  function open(existing, allCommands) {
    const isEdit = !!existing;

    const state = {
      scriptPath: existing ? existing.ScriptPath : "",
      params: existing ? JSON.parse(JSON.stringify(existing.Parameters || [])) : [],
    };

    const categories = Array.from(
      new Set(allCommands.map((c) => c.Category).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));

    /* -- Script row -- */
    const scriptInput = U.el("input", {
      class: "input input--mono",
      id: "ed-script",
      readonly: true,
      value: state.scriptPath,
      placeholder: "…\\vw-cli\\My-Script.ps1",
    });

    const pickBtn = U.el("button", {
      class: "btn btn--ghost",
      type: "button",
      text: i18n.t("editor.pickScript"),
      onclick: async () => {
        const picked = await window.vwg.pickFile({
          filters: [{ name: "PowerShell", extensions: ["ps1"] }],
        });
        if (!picked) return;
        state.scriptPath = picked;
        scriptInput.value = picked;
        if (!nameInput.value) {
          // Seed a kebab-case name from the file name.
          const base = picked.split(/[\\/]/).pop().replace(/\.ps1$/i, "");
          nameInput.value = base
            .replace(/[_\s]+/g, "-")
            .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
            .toLowerCase();
        }
        await reparse();
      },
    });

    const reparseBtn = U.el("button", {
      class: "btn btn--ghost",
      type: "button",
      text: i18n.t("editor.reparse"),
      onclick: () => reparse(),
    });

    /* -- Meta fields -- */
    const nameInput = U.el("input", {
      class: "input input--mono",
      id: "ed-name",
      value: existing ? existing.Name : "",
      placeholder: i18n.t("editor.namePlaceholder"),
      spellcheck: "false",
    });

    const descInput = U.el("textarea", {
      class: "input",
      id: "ed-desc",
      rows: "3",
      text: existing ? existing.Description || "" : "",
    });

    const catSelect = U.el("select", { class: "input", id: "ed-cat" });
    for (const c of categories) {
      const opt = U.el("option", { value: c, text: c });
      if (existing && existing.Category === c) opt.selected = true;
      catSelect.appendChild(opt);
    }
    catSelect.appendChild(U.el("option", { value: "__new__", text: i18n.t("editor.categoryNew") }));

    const newCatInput = U.el("input", {
      class: "input",
      placeholder: i18n.t("editor.categoryPlaceholder"),
      hidden: true,
    });

    catSelect.addEventListener("change", () => {
      newCatInput.hidden = catSelect.value !== "__new__";
      if (!newCatInput.hidden) newCatInput.focus();
    });

    const destrInput = U.el("input", { type: "checkbox", id: "ed-destr" });
    if (existing && existing.Destructive) destrInput.checked = true;

    const examplesInput = U.el("textarea", {
      class: "input input--mono",
      id: "ed-examples",
      rows: "2",
      text: existing ? (existing.Examples || []).join("\n") : "",
    });

    /* -- Parameter table -- */
    const paramCount = U.el("span", { class: "field__type", text: "" });
    const ptable = U.el("div", { class: "ptable" });

    function renderParams() {
      ptable.innerHTML = "";
      paramCount.textContent = i18n.t("editor.paramsDetected", { n: state.params.length });

      ptable.appendChild(
        U.el("div", { class: "ptable__row ptable__head" }, [
          U.el("span", { text: i18n.t("editor.paramName") }),
          U.el("span", { text: i18n.t("editor.paramType") }),
          U.el("span", { text: i18n.t("editor.paramReq") }),
          U.el("span", { text: i18n.t("editor.paramDesc") }),
          U.el("span", { text: "" }),
        ])
      );

      state.params.forEach((p, i) => {
        const nameF = U.el("input", {
          class: "input input--mono",
          value: p.Name || "",
          oninput: (e) => (p.Name = e.target.value),
        });

        const typeF = U.el("select", {
          class: "input",
          onchange: (e) => (p.Type = e.target.value),
        });
        for (const t of ["string", "int", "double", "bool", "switch", "string[]"]) {
          const opt = U.el("option", { value: t, text: t });
          if ((p.Type || "string") === t) opt.selected = true;
          typeF.appendChild(opt);
        }

        const reqF = U.el("input", {
          type: "checkbox",
          onchange: (e) => (p.Mandatory = e.target.checked),
        });
        reqF.checked = !!p.Mandatory;

        const descF = U.el("input", {
          class: "input",
          value: p.Description || "",
          placeholder: "What it does",
          oninput: (e) => (p.Description = e.target.value),
        });

        const delF = U.el(
          "button",
          {
            class: "iconbtn",
            type: "button",
            "aria-label": `Remove ${p.Name}`,
            onclick: () => {
              state.params.splice(i, 1);
              renderParams();
            },
          },
          [U.icon(U.ICONS.trash)]
        );

        ptable.appendChild(
          U.el("div", { class: "ptable__row" }, [nameF, typeF, reqF, descF, delF])
        );
      });

      ptable.appendChild(
        U.el(
          "button",
          {
            class: "btn btn--ghost",
            type: "button",
            style: "align-self:flex-start;margin-top:4px",
            onclick: () => {
              state.params.push({
                Name: "", Type: "string", Mandatory: false,
                Default: null, ValidSet: [], Aliases: [], Description: "",
              });
              renderParams();
            },
          },
          [U.icon(U.ICONS.plus), U.el("span", { text: i18n.t("editor.addParam") })]
        )
      );
    }

    async function reparse() {
      if (!state.scriptPath) return;
      try {
        const res = await window.vwg.parseParams({ scriptPath: state.scriptPath });

        if (res.ParseErrors && res.ParseErrors.length) {
          toast.warning(i18n.t("editor.parseErrors", { errs: res.ParseErrors.join("; ") }));
        }

        // Keep descriptions the user already typed for same-named params.
        const previous = new Map(state.params.map((p) => [String(p.Name).toLowerCase(), p]));
        state.params = (res.Parameters || []).map((p) => {
          const prior = previous.get(String(p.Name).toLowerCase());
          return { ...p, Description: (prior && prior.Description) || p.Description || "" };
        });

        if (!descInput.value && res.Synopsis) descInput.value = res.Synopsis;
        renderParams();
      } catch (err) {
        toast.error(i18n.t("editor.parseFailed", { err: err.message }));
      }
    }

    renderParams();

    /* -- Layout -- */
    const body = U.el("div", { class: "modal__grid" }, [
      U.el("div", { class: "modal__full" }, [
        U.el("label", { class: "modal__label", for: "ed-script", text: i18n.t("editor.script") }),
        U.el("div", { class: "field__row" }, [scriptInput, pickBtn, reparseBtn]),
      ]),
      U.el("div", {}, [
        U.el("label", { class: "modal__label", for: "ed-name", text: i18n.t("editor.name") }),
        nameInput,
      ]),
      U.el("div", {}, [
        U.el("label", { class: "modal__label", for: "ed-cat", text: i18n.t("editor.category") }),
        catSelect,
        newCatInput,
      ]),
      U.el("div", { class: "modal__full" }, [
        U.el("label", { class: "modal__label", for: "ed-desc", text: i18n.t("editor.description") }),
        descInput,
      ]),
      U.el("div", { class: "modal__full" }, [
        U.el("label", { class: "modal__label", for: "ed-examples", text: i18n.t("editor.examples") }),
        examplesInput,
      ]),
      U.el("div", { class: "modal__full" }, [
        U.el("label", { class: "toggle", for: "ed-destr" }, [
          destrInput,
          U.el("span", { class: "toggle__track" }, [U.el("span", { class: "toggle__thumb" })]),
          U.el("span", { class: "toggle__label", text: i18n.t("editor.destructive") }),
        ]),
      ]),
      U.el("div", { class: "modal__full" }, [
        U.el("label", { class: "modal__label" }, [
          U.el("span", { text: i18n.t("editor.params") }),
          paramCount,
        ]),
        ptable,
      ]),
    ]);

    /* -- Footer -- */
    const saveBtn = U.el("button", {
      class: "btn btn--primary",
      type: "button",
      text: i18n.t("editor.save"),
      onclick: save,
    });

    const footer = U.el("div", { class: "modal__foot", style: "padding:0;border:0;width:100%" }, [
      U.el("div", { class: "modal__spacer" }),
      U.el("button", {
        class: "btn btn--ghost",
        type: "button",
        text: i18n.t("editor.cancel"),
        onclick: () => modal.close(),
      }),
      saveBtn,
    ]);

    modal.open({
      title: isEdit ? i18n.t("editor.titleEdit") : i18n.t("editor.titleNew"),
      body,
      footer,
      wide: true,
    });

    /* -- Save -- */
    async function save() {
      const name = nameInput.value.trim();
      const category = catSelect.value === "__new__" ? newCatInput.value.trim() : catSelect.value;

      if (!state.scriptPath) return toast.error(i18n.t("editor.needScript"));
      if (!name) return toast.error(i18n.t("editor.needName"));
      if (!NAME_RE.test(name)) return toast.error(i18n.t("editor.nameInvalid"));
      if (!category) return toast.error(i18n.t("editor.needCategory"));

      const clashes = allCommands.some(
        (c) => c.Name.toLowerCase() === name.toLowerCase() && (!isEdit || c.Name !== existing.Name)
      );
      if (clashes) return toast.error(i18n.t("editor.nameTaken", { name }));

      saveBtn.disabled = true;
      try {
        // 1. Copy the script next to the other command scripts.
        let imported = await window.vwg.importScript({ sourcePath: state.scriptPath });
        if (!imported.ok && imported.reason === "exists") {
          const fileName = state.scriptPath.split(/[\\/]/).pop();
          const ok = await confirmDialog(
            i18n.t("editor.overwritePrompt", { name: fileName })
          );
          if (!ok) {
            saveBtn.disabled = false;
            return;
          }
          imported = await window.vwg.importScript({
            sourcePath: state.scriptPath,
            overwrite: true,
          });
        }

        // 2. Write the registry entry.
        const entry = {
          Name: name,
          ScriptPath: imported.dest,
          Description: descInput.value.trim(),
          Category: category,
          Destructive: destrInput.checked,
          Parameters: state.params
            .filter((p) => String(p.Name || "").trim())
            .map((p) => ({
              Name: String(p.Name).trim(),
              Type: p.Type || "string",
              Mandatory: !!p.Mandatory,
              Default: p.Default || null,
              ValidSet: p.ValidSet || [],
              Aliases: p.Aliases || [],
              Description: p.Description || "",
            })),
          Examples: examplesInput.value
            .split("\n")
            .map((s) => U.normalizeExample(s))
            .filter(Boolean),
        };

        await window.vwg.writeRegistry({
          action: isEdit ? "update" : "insert",
          name: isEdit ? existing.Name : name,
          newName: isEdit && existing.Name !== name ? name : "",
          entry,
        });

        modal.close();
        toast.success(
          isEdit ? i18n.t("editor.savedEdit", { name }) : i18n.t("editor.savedNew", { name })
        );
        onSaved(name);
      } catch (err) {
        toast.error(i18n.t("common.error", { err: err.message }));
      } finally {
        saveBtn.disabled = false;
      }
    }
  }

  /* ---- Simple yes/no --------------------------------------------------- */

  function confirmDialog(message) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => {
        if (settled) return;
        settled = true;
        modal.close();
        resolve(v);
      };

      const footer = U.el("div", { class: "modal__foot", style: "padding:0;border:0;width:100%" }, [
        U.el("div", { class: "modal__spacer" }),
        U.el("button", {
          class: "btn btn--ghost",
          type: "button",
          text: i18n.t("common.cancel"),
          onclick: () => done(false),
        }),
        U.el("button", {
          class: "btn btn--primary",
          type: "button",
          text: "OK",
          onclick: () => done(true),
        }),
      ]);

      modal.open({
        title: i18n.t("editor.titleNew"),
        body: U.el("p", { text: message }),
        footer,
        onClose: () => done(false),
      });
    });
  }

  /* ---- Delete ---------------------------------------------------------- */

  /**
   * Removes the registry entry AND the .ps1 from disk.
   * Gated by a 1s cooldown before the confirm button arms, per the design
   * contract. The registry is backed up by the writer; the script is not.
   */
  function confirmDelete(command, done) {
    const warn = U.el("div", { class: "modal__warn" });
    warn.innerHTML = i18n.t("delete.warn", { name: U.escapeHtml(command.Name) });

    const pathLine = U.el("p", {
      class: "cmdhead__path",
      text: command.ScriptPath,
    });

    const note = U.el("p", { class: "field__desc", text: i18n.t("delete.irreversible") });

    const delBtn = U.el("button", {
      class: "btn btn--danger",
      type: "button",
      disabled: true,
      text: i18n.t("delete.wait"),
    });

    // 1 second cooldown, then arm.
    setTimeout(() => {
      delBtn.disabled = false;
      delBtn.textContent = i18n.t("delete.confirm");
    }, 1000);

    delBtn.addEventListener("click", async () => {
      delBtn.disabled = true;
      try {
        await window.vwg.writeRegistry({ action: "delete", name: command.Name });
        await window.vwg.deleteScript({ scriptPath: command.ScriptPath });
        modal.close();
        toast.success(i18n.t("delete.done", { name: command.Name }));
        done();
      } catch (err) {
        toast.error(i18n.t("common.error", { err: err.message }));
        delBtn.disabled = false;
      }
    });

    const footer = U.el("div", { class: "modal__foot", style: "padding:0;border:0;width:100%" }, [
      U.el("div", { class: "modal__spacer" }),
      U.el("button", {
        class: "btn btn--ghost",
        type: "button",
        text: i18n.t("common.cancel"),
        onclick: () => modal.close(),
      }),
      delBtn,
    ]);

    modal.open({
      title: i18n.t("delete.title"),
      body: U.el("div", { style: "display:flex;flex-direction:column;gap:12px" }, [warn, pathLine, note]),
      footer,
    });
  }

  window.editor = {
    open,
    confirmDelete,
    set onSaved(fn) { onSaved = fn; },
  };
})();
