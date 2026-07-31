/* ==========================================================================
   vw-gui :: jobs and output console
   --------------------------------------------------------------------------
   The foreground slot is serial: one command at a time, streamed live.
   Ticking "Run in background" diverts a job to the rail queue so a long media
   pipeline does not block the next quick command. Clicking a background job
   swaps the console to its stream; clicking it again returns to foreground.
   ========================================================================== */

(function () {
  const out = document.getElementById("console-out");
  const sourceTag = document.getElementById("console-source");
  const followBox = document.getElementById("follow-output");
  const jobsSection = document.getElementById("jobs-section");
  const jobsList = document.getElementById("jobs-list");
  const jobsCount = document.getElementById("jobs-count");

  const MAX_NODES = 4000; // scrollback ceiling

  /** id -> job record */
  const jobs = new Map();

  let foregroundId = null;   // the serial slot
  let watchingId = null;     // whose stream the console shows
  let tickTimer = null;
  let foregroundExitHandler = null;

  out.setAttribute("data-empty", i18n.t("console.empty"));

  /* ---- Console --------------------------------------------------------- */

  function clearConsole() {
    out.innerHTML = "";
  }

  function trim() {
    while (out.childNodes.length > MAX_NODES) out.removeChild(out.firstChild);
  }

  function append(text, stream) {
    const job = jobs.get(watchingId);
    const state = job
      ? stream === "stderr"
        ? job.errState
        : job.outState
      : ANSI.newState({ stderr: stream === "stderr" });

    const atBottom = out.scrollTop + out.clientHeight >= out.scrollHeight - 40;
    out.appendChild(ANSI.render(text, state));
    trim();
    if (followBox.checked && atBottom) out.scrollTop = out.scrollHeight;
  }

  /** Repaint the console from a job's replay buffer. */
  async function watch(id) {
    watchingId = id;
    clearConsole();

    const job = jobs.get(id);
    sourceTag.textContent = job && job.background ? job.commandName : "";
    sourceTag.hidden = !(job && job.background);

    if (!job) return;

    const { buffer } = await window.vwg.jobBuffer({ id });
    const state = ANSI.newState();
    if (buffer) {
      out.appendChild(ANSI.render(buffer, state));
      trim();
      out.scrollTop = out.scrollHeight;
    }
    job.outState = state;
    render();
  }

  /* ---- Job lifecycle --------------------------------------------------- */

  function add(handle) {
    const job = {
      id: handle.id,
      commandName: handle.commandName,
      background: handle.background,
      cwd: handle.cwd,
      startedAt: handle.startedAt,
      exitCode: null,
      outState: ANSI.newState(),
      errState: ANSI.newState({ stderr: true }),
    };
    jobs.set(job.id, job);

    if (job.background) {
      render();
      ensureTicker();
    } else {
      foregroundId = job.id;
      clearConsole();
      watchingId = job.id;
      sourceTag.hidden = true;
    }
    return job;
  }

  function onOutput({ id, stream, text }) {
    if (id === watchingId) append(text, stream);
    // Background jobs the console is not watching keep buffering in main.
  }

  function onExit({ id, exitCode, durationMs }) {
    const job = jobs.get(id);
    if (!job) return;

    job.exitCode = exitCode;
    job.durationMs = durationMs;
    job.endedAt = Date.now();

    // Capture ownership before clearing, so the run bar only reacts to its
    // own job and not to a background one finishing.
    const wasForeground = id === foregroundId;
    if (wasForeground) foregroundId = null;
    if (wasForeground && typeof foregroundExitHandler === "function") {
      foregroundExitHandler({ id, exitCode, durationMs });
    }

    render();
    if (!hasRunningBackground()) stopTicker();

    // Background completions are easy to miss; surface them.
    if (job.background) {
      const label = `${job.commandName} · ${U.fmtDuration(durationMs)}`;
      if (exitCode === 0) toast.success(`${label} · ${i18n.t("run.done")}`);
      else toast.error(`${label} · ${i18n.t("run.failed", { code: exitCode })}`);
    }

    // Keep finished background jobs listed briefly so the result is readable.
    if (job.background) {
      setTimeout(() => {
        jobs.delete(id);
        if (watchingId === id) {
          watchingId = foregroundId;
          sourceTag.hidden = true;
          sourceTag.textContent = "";
        }
        render();
      }, 30000);
    }
  }

  function hasRunningBackground() {
    for (const j of jobs.values()) if (j.background && j.exitCode === null) return true;
    return false;
  }

  function isForegroundBusy() {
    return foregroundId !== null;
  }

  function foregroundJob() {
    return foregroundId ? jobs.get(foregroundId) : null;
  }

  async function stop(id) {
    await window.vwg.stopJob({ id });
  }

  /* ---- Rail rendering -------------------------------------------------- */

  function render() {
    const list = Array.from(jobs.values()).filter((j) => j.background);
    jobsSection.hidden = list.length === 0;
    jobsCount.textContent = String(list.filter((j) => j.exitCode === null).length);

    jobsList.innerHTML = "";

    for (const job of list) {
      const running = job.exitCode === null;
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
        ? elapsed + (watchingId === job.id ? " · " + i18n.t("jobs.watching") : "")
        : job.exitCode === 0
        ? `${i18n.t("run.done")} · ${elapsed}`
        : `${i18n.t("run.failed", { code: job.exitCode })} · ${elapsed}`;

      const row = U.el(
        "li",
        {
          class: "job" + (watchingId === job.id ? " job--watching" : ""),
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
      );

      jobsList.appendChild(row);
    }
  }

  function toggleWatch(id) {
    if (watchingId === id) watch(foregroundId);
    else watch(id);
  }

  /* ---- Elapsed ticker -------------------------------------------------- */

  function ensureTicker() {
    if (tickTimer) return;
    tickTimer = setInterval(render, 1000);
  }

  function stopTicker() {
    if (!tickTimer) return;
    clearInterval(tickTimer);
    tickTimer = null;
  }

  /* ---- Console tools --------------------------------------------------- */

  document.getElementById("btn-clear-output").addEventListener("click", clearConsole);

  document.getElementById("btn-copy-output").addEventListener("click", async () => {
    await navigator.clipboard.writeText(ANSI.strip(out.textContent || ""));
    toast.success(i18n.t("console.copied"));
  });

  window.vwg.onJobOutput(onOutput);
  window.vwg.onJobExit(onExit);

  window.jobs = {
    add,
    stop,
    render,
    watch,
    isForegroundBusy,
    foregroundJob,
    clearConsole,
    set onForegroundExit(fn) { foregroundExitHandler = fn; },
    get watchingId() { return watchingId; },
  };
})();
