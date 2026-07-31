/* ==========================================================================
   vw-gui :: run history
   Persisted to disk by the main process. Distinct from the background job
   list, which is session-only.
   ========================================================================== */

(function () {
  let onReuse = () => {};

  async function open() {
    const entries = await window.vwg.listHistory();

    const body = U.el("div", { class: "hist" });

    if (entries.length === 0) {
      body.appendChild(U.el("p", { class: "field__desc", text: i18n.t("history.empty") }));
    } else {
      for (const entry of entries) {
        const ok = entry.exitCode === 0;
        const paramCount = Object.keys(entry.params || {}).length;

        const meta = [
          U.fmtStamp(entry.startedAt),
          U.fmtDuration(entry.durationMs),
          entry.cwd,
          paramCount ? `${paramCount} param${paramCount === 1 ? "" : "s"}` : null,
          entry.background ? "background" : null,
        ]
          .filter(Boolean)
          .join("  ·  ");

        body.appendChild(
          U.el(
            "div",
            {
              class: "hist__row",
              tabindex: "0",
              role: "button",
              title: i18n.t("history.reuse"),
              onclick: () => {
                modal.close();
                onReuse(entry);
              },
              onkeydown: (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  modal.close();
                  onReuse(entry);
                }
              },
            },
            [
              U.el("span", { class: "hist__name", text: entry.commandName }),
              U.el("span", { class: "hist__meta", text: meta }),
              U.el("span", {
                class: "hist__code " + (ok ? "hist__code--ok" : "hist__code--fail"),
                text: ok ? "0" : String(entry.exitCode),
              }),
            ]
          )
        );
      }
    }

    const footer = U.el("div", { class: "modal__foot", style: "padding:0;border:0;width:100%" }, [
      U.el("button", {
        class: "btn btn--ghost",
        type: "button",
        text: i18n.t("history.clear"),
        onclick: async () => {
          await window.vwg.clearHistory();
          modal.close();
          toast.success(i18n.t("history.cleared"));
        },
      }),
      U.el("div", { class: "modal__spacer" }),
      U.el("button", {
        class: "btn btn--primary",
        type: "button",
        text: i18n.t("history.close"),
        onclick: () => modal.close(),
      }),
    ]);

    modal.open({ title: i18n.t("history.title"), body, footer, wide: true });
  }

  window.history_ui = {
    open,
    set onReuse(fn) { onReuse = fn; },
  };
})();
