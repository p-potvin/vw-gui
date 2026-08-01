/* ==========================================================================
   vw-gui :: jobs
   --------------------------------------------------------------------------
   The foreground session is persistent and serial: one command at a time, in a
   live pwsh you can also type into. Ticking "Run in background" gives the job
   its own session so a long pipeline never blocks the next quick command.

   Clicking a background job swaps the visible terminal to its session; clicking
   again returns to the foreground.
   ========================================================================== */

(function () {
  const sourceTag = document.getElementById("console-source");
  const jobsSection = document.getElementById("jobs-section");
  const jobsList = document.getElementById("jobs-list");
  const jobsCount = document.getElementById("jobs-count");

  /** jobId -> job record */
  const jobs = new Map();

  let foregroundJobId = null;
  let bgCounter = 0;
  let tickTimer = null;
  let foregroundExitHandler = null;

  /* ---- Session helpers -------------------------------------------------- */

  async function ensureForeground(cwd) {
    await term.ensure(term.FOREGROUND, { cwd });
    if (!term.visibleId) term.show(term.FOREGROUND);
  }

  function nextBackgroundSessionId() {
    return `session-bg-${++bgCounter}`;
  }

  /* ---- Lifecycle -------------------------------------------------------- */

  function add(handle, { commandName, background, cwd, sessionId }) {
    const job = {
      id: handle.jobId,
      sessionId,
      commandName,
      background: !!background,
      cwd,
      startedAt: handle.startedAt || Date.now(),
      exitCode: null,
    };
    jobs.set(job.id, job);

    if (job.background) {
      render();
      ensureTicker();
    } else {
      foregroundJobId = job.id;
    }
    return job;
  }

  function onExit({ id, exitCode, durationMs }) {
    const job = jobs.get(id);
    if (!job) return;

    job.exitCode = exitCode;
    job.durationMs = durationMs;
    job.endedAt = Date.now();

    const wasForeground = id === foregroundJobId;
    if (wasForeground) foregroundJobId = null;
    if (wasForeground && typeof foregroundExitHandler === "function") {
      foregroundExitHandler({ id, exitCode, durationMs });
    }

    render();
    if (!hasRunningBackground()) stopTicker();

    if (job.background) {
      const label = `${job.commandName} · ${U.fmtDuration(durationMs)}`;
      if (exitCode === 0) toast.success(`${label} · ${i18n.t("run.done")}`);
      else toast.error(`${label} · ${i18n.t("run.failed", { code: exitCode })}`);

      // Keep the finished job listed long enough to read the result, then
      // retire its session so idle shells do not accumulate.
      setTimeout(async () => {
        jobs.delete(id);
        if (term.visibleId === job.sessionId) term.show(term.FOREGROUND);
        await term.dispose(job.sessionId);
        updateSourceTag();
        render();
      }, 45000);
    }
  }

  function hasRunningBackground() {
    for (const j of jobs.values()) if (j.background && j.exitCode === null) return true;
    return false;
  }

  function isForegroundBusy() {
    return foregroundJobId !== null;
  }

  function foregroundJob() {
    return foregroundJobId ? jobs.get(foregroundJobId) : null;
  }

  async function stop(jobId) {
    const job = jobs.get(jobId);
    if (!job) return;
    await window.vwg.stopJob({ sessionId: job.sessionId });
  }

  /* ---- Watching --------------------------------------------------------- */

  function updateSourceTag() {
    const watching = Array.from(jobs.values()).find(
      (j) => j.background && j.sessionId === term.visibleId
    );
    sourceTag.textContent = watching ? watching.commandName : "";
    sourceTag.hidden = !watching;
  }

  function toggleWatch(jobId) {
    const job = jobs.get(jobId);
    if (!job) return;
    term.show(term.visibleId === job.sessionId ? term.FOREGROUND : job.sessionId);
    updateSourceTag();
    render();
  }

  /* ---- Rail rendering --------------------------------------------------- */

  function render() {
    const list = Array.from(jobs.values()).filter((j) => j.background);
    jobsSection.hidden = list.length === 0;
    jobsCount.textContent = String(list.filter((j) => j.exitCode === null).length);

    jobsList.innerHTML = "";

    for (const job of list) {
      const running = job.exitCode === null;
      const watching = term.visibleId === job.sessionId;

      const led = U.el("span", {
        class: "vwsq-led" + (running ? " vwsq-led--live" : ""),
      });
      led.style.background = running
        ? "var(--vwsq-signal-sync)"
        : job.exitCode === 0
        ? "var(--vwsq-signal-online)"
        : "var(--vwsq-signal-alert)";

      const elapsed = running
        ? U.fmtDuration(Date.now() - job.startedAt)
        : U.fmtDuration(job.durationMs);

      const meta = running
        ? elapsed + (watching ? " · " + i18n.t("jobs.watching") : "")
        : job.exitCode === 0
        ? `${i18n.t("run.done")} · ${elapsed}`
        : `${i18n.t("run.failed", { code: job.exitCode })} · ${elapsed}`;

      jobsList.appendChild(
        U.el(
          "li",
          {
            class: "job" + (watching ? " job--watching" : ""),
            tabindex: "0",
            role: "button",
            "aria-label": `${job.commandName}, ${meta}`,
            onclick: () => toggleWatch(job.id),
            onkeydown: (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleWatch(job.id);
              }
            },
          },
          [
            led,
            U.el("div", { class: "job__body" }, [
              U.el("div", { class: "job__name", text: job.commandName }),
              U.el("div", { class: "job__meta", text: meta }),
            ]),
            running
              ? U.el(
                  "button",
                  {
                    class: "job__stop",
                    type: "button",
                    title: i18n.t("jobs.stop"),
                    "aria-label": `Stop ${job.commandName}`,
                    onclick: (e) => {
                      e.stopPropagation();
                      stop(job.id);
                    },
                  },
                  [U.icon(U.ICONS.stop)]
                )
              : null,
          ]
        )
      );
    }
  }

  function ensureTicker() {
    if (tickTimer) return;
    tickTimer = setInterval(render, 1000);
  }

  function stopTicker() {
    if (!tickTimer) return;
    clearInterval(tickTimer);
    tickTimer = null;
  }

  /* ---- Console tools ---------------------------------------------------- */

  document.getElementById("btn-clear-output").addEventListener("click", () => term.clear());

  document.getElementById("btn-copy-output").addEventListener("click", async () => {
    await navigator.clipboard.writeText(term.selectionOrAll());
    toast.success(i18n.t("console.copied"));
  });

  window.vwg.onJobExit(onExit);

  window.jobs = {
    add,
    stop,
    render,
    ensureForeground,
    nextBackgroundSessionId,
    updateSourceTag,
    isForegroundBusy,
    foregroundJob,
    set onForegroundExit(fn) { foregroundExitHandler = fn; },
  };
})();
