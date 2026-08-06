/* ==========================================================================
   vw-gui :: run history drawer
   Persisted to disk by the main process. Distinct from the background job
   list, which is session-only.
   ========================================================================== */

(function () {
  const body = document.getElementById("drawer-history-content");
  let onReuse = () => {};

  async function refresh() {
    const entries = await window.vwg.listHistory();
    body.innerHTML = "";

    if (entries.length === 0) {
      body.appendChild(U.el("p", { class: "drawer__empty", text: i18n.t("history.empty") }));
      return;
    }

    const list = U.el("div", { class: "hist" });

    for (const entry of entries) {
      const ok = entry.exitCode === 0;
      const paramCount = Object.keys(entry.params || {}).length;

      const meta = [
        U.fmtStamp(entry.startedAt),
        U.fmtDuration(entry.durationMs),
        paramCount ? `${paramCount} param${paramCount === 1 ? "" : "s"}` : null,
        entry.background ? "background" : null,
      ]
        .filter(Boolean)
        .join("  ·  ");

      list.appendChild(
        U.el(
          "div",
          {
            class: "hist__row",
            tabindex: "0",
            role: "button",
            title: `${i18n.t("history.reuse")} — ${entry.cwd || ""}`,
            onclick: () => onReuse(entry),
            onkeydown: (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onReuse(entry);
              }
            },
          },
          [
            U.el("span", {
              class: "hist__code " + (ok ? "hist__code--ok" : "hist__code--fail"),
              text: ok ? "0" : String(entry.exitCode),
            }),
            U.el("div", { class: "hist__body" }, [
              U.el("div", { class: "hist__name", text: entry.commandName }),
              U.el("div", { class: "hist__meta", text: meta }),
            ]),
          ]
        )
      );
    }

    body.appendChild(list);

    body.appendChild(
      U.el("button", {
        class: "btn btn--ghost drawer__action",
        type: "button",
        text: i18n.t("history.clear"),
        onclick: async () => {
          await window.vwg.clearHistory();
          await refresh();
          toast.success(i18n.t("history.cleared"));
        },
      })
    );
  }

  window.history_ui = {
    refresh,
    set onReuse(fn) { onReuse = fn; },
  };
})();
