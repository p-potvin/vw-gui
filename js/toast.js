/* ==========================================================================
   vw-gui :: toasts
   ========================================================================== */

(function () {
  const host = document.getElementById("toasts");

  function show(message, kind, ms) {
    const node = U.el("div", {
      class: `toast toast--${kind || "info"}`,
      role: kind === "error" ? "alert" : "status",
      text: message,
    });
    host.appendChild(node);

    const life = ms || (kind === "error" ? 7000 : 3800);
    setTimeout(() => {
      node.style.transition = "opacity 200ms ease";
      node.style.opacity = "0";
      setTimeout(() => node.remove(), 220);
    }, life);
  }

  window.toast = {
    success: (m, ms) => show(m, "success", ms),
    error: (m, ms) => show(m, "error", ms),
    info: (m, ms) => show(m, "info", ms),
    warning: (m, ms) => show(m, "warning", ms),
  };
})();
