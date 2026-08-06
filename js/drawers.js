/* ==========================================================================
   vw-gui :: rail drawers
   --------------------------------------------------------------------------
   History and Settings live at the bottom of the rail as drawers. Opening one
   closes the other. The command tree is never a drawer — it stays visible and
   simply yields height, because it is the thing you are always navigating.

   The rail is a flex column with the tree at flex:1, so a drawer growing
   pushes the tree up: the drawer appears to expand toward the top.
   ========================================================================== */

(function () {
  const registry = new Map();
  let openId = null;
  const listeners = new Map();

  function register(id, { onOpen } = {}) {
    const root = document.getElementById(id);
    if (!root) return;

    const head = root.querySelector(".drawer__head");
    const body = root.querySelector(".drawer__body");

    registry.set(id, { root, head, body });
    if (onOpen) listeners.set(id, onOpen);

    head.addEventListener("click", () => toggle(id));
    head.setAttribute("aria-expanded", "false");
    head.setAttribute("aria-controls", `${id}-body`);
    body.id = `${id}-body`;
    body.hidden = true;
  }

  function open(id) {
    for (const [otherId, d] of registry) {
      const on = otherId === id;
      d.root.classList.toggle("drawer--open", on);
      d.head.setAttribute("aria-expanded", String(on));
      d.body.hidden = !on;
    }
    openId = id;

    const cb = listeners.get(id);
    if (cb) cb();

    // The terminal shares the viewport with the rail; a drawer changing the
    // layout can change its size.
    if (window.term) setTimeout(() => term.refit(), 180);
  }

  function close() {
    for (const [, d] of registry) {
      d.root.classList.remove("drawer--open");
      d.head.setAttribute("aria-expanded", "false");
      d.body.hidden = true;
    }
    openId = null;
    if (window.term) setTimeout(() => term.refit(), 180);
  }

  function toggle(id) {
    if (openId === id) close();
    else open(id);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openId && !modal.isOpen()) close();
  });

  window.drawers = {
    register,
    open,
    close,
    toggle,
    get openId() { return openId; },
  };
})();
