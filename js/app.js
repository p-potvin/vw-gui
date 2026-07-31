/* ==========================================================================
   vw-gui :: application
   ========================================================================== */

(function () {
  const els = {
    surface: document.getElementById("surface"),
    empty: document.getElementById("empty-state"),
    name: document.getElementById("cmd-name"),
    category: document.getElementById("cmd-category"),
    destructive: document.getElementById("cmd-destructive"),
    missing: document.getElementById("cmd-missing"),
    desc: document.getElementById("cmd-desc"),
    path: document.getElementById("cmd-path"),
    targetDir: document.getElementById("targetdir-input"),
    pickDir: document.getElementById("btn-pick-dir"),
    examplesSection: document.getElementById("examples-section"),
    examplesList: document.getElementById("examples-list"),
    run: document.getElementById("btn-run"),
    stop: document.getElementById("btn-stop"),
    background: document.getElementById("run-background"),
    status: document.getElementById("run-status"),
    rootIndicator: document.getElementById("root-indicator"),
    editBtn: document.getElementById("btn-edit-command"),
    menuBtn: document.getElementById("btn-cmd-menu"),
    newBtn: document.getElementById("btn-new-command"),
    historyBtn: document.getElementById("btn-history"),
  };

  let commands = [];
  let current = null;
  let vwRoot = "";
  let prefs = { targetDir: "", lastCommand: "" };

  /* ---- Boot ------------------------------------------------------------ */

  async function boot() {
    i18n.apply();

    try {
      prefs = (await window.vwg.getPrefs()) || {};
    } catch { /* first run */ }

    await loadRegistry();

    if (prefs.targetDir) setTargetDir(prefs.targetDir);
    if (prefs.lastCommand) {
      const cmd = commands.find((c) => c.Name === prefs.lastCommand);
      if (cmd) select(cmd);
    }

    wire();
  }

  async function loadRegistry(selectName) {
    try {
      const res = await window.vwg.loadRegistry();
      commands = res.commands;
      vwRoot = res.vwRoot;

      els.rootIndicator.textContent = res.registryPath;
      els.rootIndicator.title = res.registryPath;

      rail.setCommands(commands);

      const target = selectName || (current && current.Name);
      if (target) {
        const cmd = commands.find((c) => c.Name === target);
        if (cmd) select(cmd);
        else clearSelection();
      }
    } catch (err) {
      toast.error(i18n.t("common.loadFailed", { err: err.message }), 12000);
    }
  }

  /* ---- Selection ------------------------------------------------------- */

  function select(cmd) {
    current = cmd;
    rail.setActive(cmd.Name);

    els.empty.hidden = true;
    els.surface.hidden = false;

    els.name.textContent = cmd.Name;
    els.category.textContent = cmd.Category || "";
    els.destructive.hidden = !cmd.Destructive;
    els.missing.hidden = cmd.Exists !== false;
    els.desc.textContent = cmd.Description || "";
    els.path.textContent = cmd.ScriptPath || "";

    // Examples
    const examples = cmd.Examples || [];
    els.examplesSection.hidden = examples.length === 0;
    els.examplesList.innerHTML = "";
    for (const ex of examples) {
      els.examplesList.appendChild(
        U.el("li", { class: "example" }, [
          U.el("code", { class: "example__text", text: ex }),
          U.el(
            "button",
            {
              class: "iconbtn",
              type: "button",
              "aria-label": "Copy example",
              title: i18n.t("ctx.copyPath"),
              onclick: async () => {
                await navigator.clipboard.writeText(ex);
                toast.success(i18n.t("common.copied"));
              },
            },
            [U.icon(U.ICONS.copy)]
          ),
        ])
      );
    }

    form.build(cmd, els.targetDir.value);
    setRunEnabled();

    els.status.textContent = "";
    els.status.className = "runbar__status";

    prefs.lastCommand = cmd.Name;
    savePrefs();
  }

  function clearSelection() {
    current = null;
    els.surface.hidden = true;
    els.empty.hidden = false;
    form.clear();
  }

  /* ---- Working directory ----------------------------------------------- */

  function setTargetDir(dir) {
    els.targetDir.value = dir || "";
    form.setCwdPlaceholder(dir);
    prefs.targetDir = dir || "";
    savePrefs();
    setRunEnabled();
  }

  const savePrefs = U.debounce(() => {
    window.vwg.setPrefs(prefs).catch(() => {});
  }, 300);

  function setRunEnabled() {
    const ready = !!current && !!els.targetDir.value.trim();
    els.run.disabled = !ready;
    els.run.title = ready ? "" : i18n.t("targetdir.required");
  }

  /* ---- Running --------------------------------------------------------- */

  async function run() {
    if (!current) return;

    const cwd = els.targetDir.value.trim();
    if (!cwd) return toast.error(i18n.t("targetdir.required"));

    if (current.Exists === false) return toast.error(i18n.t("run.scriptMissing"));

    const background = els.background.checked;
    if (!background && jobs.isForegroundBusy()) {
      return toast.error(i18n.t("run.alreadyRunning"), 6000);
    }

    const missing = form.missingRequired();
    if (missing.length) {
      return toast.error(i18n.t("run.missingRequired", { names: missing.join(", ") }));
    }

    const params = form.collect();

    if (current.Destructive) {
      const allowed = await destructiveGate(current);
      if (!allowed) return;
    }

    await launch({ params, cwd, background });
  }

  async function launch({ params, cwd, background }) {
    const handle = await window.vwg.startJob({
      scriptPath: current.ScriptPath,
      params,
      cwd,
      background,
      commandName: current.Name,
    });

    jobs.add(handle);

    if (background) {
      toast.info(`${current.Name} · ${i18n.t("run.queuedBackground")}`);
    } else {
      els.run.hidden = true;
      els.stop.hidden = false;
      els.status.textContent = i18n.t("run.busy");
      els.status.className = "runbar__status runbar__status--busy";
    }
  }

  /**
   * The destructive gate.
   *
   * vw.ps1's own gate cannot be used here: it calls Read-Host and refuses
   * outright when [Console]::IsInputRedirected is true, which it always is
   * under piped Electron stdio. So the GUI re-implements the same three
   * checks — AI-environment refusal, Administrator requirement, and explicit
   * human confirmation — and then invokes the target script directly.
   */
  async function destructiveGate(cmd) {
    const agent = await window.vwg.agentEnv();
    if (agent.blocked) {
      const flags = Object.entries(agent.flags)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(", ");
      toast.error(i18n.t("destructive.agentBlocked", { flags }), 10000);
      return false;
    }

    if (!(await window.vwg.isAdmin())) {
      toast.error(i18n.t("destructive.needAdmin"), 10000);
      return false;
    }

    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };

      const warn = U.el("div", { class: "modal__warn" });
      warn.innerHTML = i18n.t("destructive.warn", { name: U.escapeHtml(cmd.Name) });

      const prompt = U.el("label", { class: "modal__label", for: "destr-confirm" });
      prompt.innerHTML = i18n.t("destructive.typeToConfirm", { name: U.escapeHtml(cmd.Name) });

      const input = U.el("input", {
        class: "input input--mono",
        id: "destr-confirm",
        spellcheck: "false",
        autocomplete: "off",
      });

      const goBtn = U.el("button", {
        class: "btn btn--danger",
        type: "button",
        disabled: true,
        text: i18n.t("destructive.confirm"),
        onclick: () => {
          modal.close();
          done(true);
        },
      });

      input.addEventListener("input", () => {
        goBtn.disabled = input.value.trim() !== cmd.Name;
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !goBtn.disabled) {
          modal.close();
          done(true);
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
        goBtn,
      ]);

      modal.open({
        title: i18n.t("destructive.title"),
        body: U.el("div", { style: "display:flex;flex-direction:column;gap:12px" }, [
          warn,
          U.el("div", {}, [prompt, input]),
        ]),
        footer,
        onClose: () => done(false),
      });
    });
  }

  async function stop() {
    const job = jobs.foregroundJob();
    if (job) await jobs.stop(job.id);
  }

  // jobs.js decides ownership, so a background job finishing never touches
  // the foreground run bar.
  jobs.onForegroundExit = ({ exitCode }) => {
    els.run.hidden = false;
    els.stop.hidden = true;
    if (exitCode === 0) {
      els.status.textContent = i18n.t("run.done");
      els.status.className = "runbar__status runbar__status--ok";
    } else {
      els.status.textContent = i18n.t("run.failed", { code: exitCode });
      els.status.className = "runbar__status runbar__status--fail";
    }
  };

  /* ---- Context menu ---------------------------------------------------- */

  function commandMenu(cmd, x, y) {
    modal.menu(x, y, [
      {
        label: i18n.t("ctx.openEditor"),
        icon: U.ICONS.external,
        onClick: () => window.vwg.openPath({ target: cmd.ScriptPath }),
      },
      {
        label: i18n.t("ctx.showInFolder"),
        icon: U.ICONS.folder,
        onClick: () => window.vwg.showInFolder({ target: cmd.ScriptPath }),
      },
      {
        label: i18n.t("ctx.copyPath"),
        icon: U.ICONS.copy,
        onClick: async () => {
          await navigator.clipboard.writeText(cmd.ScriptPath);
          toast.success(i18n.t("common.copied"));
        },
      },
      "sep",
      {
        label: i18n.t("ctx.edit"),
        icon: U.ICONS.edit,
        onClick: () => editor.open(cmd, commands),
      },
      {
        label: i18n.t("ctx.delete"),
        icon: U.ICONS.trash,
        danger: true,
        onClick: () =>
          editor.confirmDelete(cmd, () => {
            if (current && current.Name === cmd.Name) clearSelection();
            loadRegistry();
          }),
      },
    ]);
  }

  /* ---- Wiring ---------------------------------------------------------- */

  function wire() {
    rail.onSelect = select;
    rail.onContext = commandMenu;

    editor.onSaved = (name) => loadRegistry(name);

    history_ui.onReuse = (entry) => {
      const cmd = commands.find((c) => c.Name === entry.commandName);
      if (!cmd) return toast.error(i18n.t("history.empty"));
      select(cmd);
      if (entry.cwd) setTargetDir(entry.cwd);
      form.applyValues(entry.params);
    };

    els.pickDir.addEventListener("click", async () => {
      const picked = await window.vwg.pickFolder({
        defaultPath: els.targetDir.value || vwRoot,
      });
      if (picked) setTargetDir(picked);
    });

    els.targetDir.addEventListener("input", () => setTargetDir(els.targetDir.value));

    els.run.addEventListener("click", run);
    els.stop.addEventListener("click", stop);

    els.editBtn.addEventListener("click", () => current && editor.open(current, commands));

    els.menuBtn.addEventListener("click", (e) => {
      if (!current) return;
      const r = e.currentTarget.getBoundingClientRect();
      commandMenu(current, r.left, r.bottom + 4);
    });

    els.newBtn.addEventListener("click", () => editor.open(null, commands));
    els.historyBtn.addEventListener("click", () => history_ui.open());

    document.getElementById("win-min").addEventListener("click", () => window.vwg.win.minimize());
    document.getElementById("win-max").addEventListener("click", () => window.vwg.win.maximize());
    document.getElementById("win-close").addEventListener("click", () => window.vwg.win.close());

    // Ctrl+Enter runs the selected command.
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !modal.isOpen()) {
        e.preventDefault();
        if (!els.run.disabled && !els.run.hidden) run();
      }
    });
  }

  boot();
})();
