/* ==========================================================================
   vw-gui :: modals and context menu
   Focus is trapped while a modal is open and restored to the trigger on close.
   ========================================================================== */

(function () {
  const host = document.getElementById("modal-host");
  const ctx = document.getElementById("ctxmenu");
  let openModal = null;
  let lastFocus = null;

  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /**
   * open({ title, body, footer, wide, onClose })
   *   body/footer receive the modal element so callers can wire buttons.
   * Returns { close }.
   */
  function open({ title, body, footer, wide, onClose, labelledBy }) {
    close();
    lastFocus = document.activeElement;

    const titleId = labelledBy || "modal-title-" + Date.now();
    const modal = U.el("div", {
      class: "modal" + (wide ? " modal--wide" : ""),
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": titleId,
      tabindex: "-1",
    });

    const head = U.el("div", { class: "modal__head" }, [
      U.el("h2", { class: "modal__title", id: titleId, text: title }),
    ]);

    const bodyEl = U.el("div", { class: "modal__body" });
    if (body) bodyEl.appendChild(body);

    modal.appendChild(head);
    modal.appendChild(bodyEl);

    if (footer) {
      const footEl = U.el("div", { class: "modal__foot" });
      footEl.appendChild(footer);
      modal.appendChild(footEl);
    }

    host.innerHTML = "";
    host.appendChild(modal);
    host.hidden = false;

    openModal = { modal, onClose };

    // Focus the first meaningful control, else the dialog itself.
    const first = modal.querySelector(FOCUSABLE);
    (first || modal).focus();

    return { close, modal };
  }

  function close() {
    if (!openModal) return;
    const { onClose } = openModal;
    openModal = null;
    host.hidden = true;
    host.innerHTML = "";
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
    if (typeof onClose === "function") onClose();
  }

  function isOpen() {
    return !!openModal;
  }

  // Escape closes; Tab cycles inside.
  document.addEventListener("keydown", (e) => {
    if (!openModal) return;

    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }

    if (e.key === "Tab") {
      const items = U.$$(FOCUSABLE, openModal.modal).filter(
        (n) => n.offsetParent !== null || n === document.activeElement
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // Clicking the scrim closes.
  host.addEventListener("mousedown", (e) => {
    if (e.target === host) close();
  });

  /* ---- Context menu ---------------------------------------------------- */

  /** menu(x, y, [{ label, icon, danger, onClick } | "sep"]) */
  function menu(x, y, items) {
    ctx.innerHTML = "";

    for (const item of items) {
      if (item === "sep") {
        ctx.appendChild(U.el("div", { class: "ctxmenu__sep" }));
        continue;
      }
      const btn = U.el(
        "button",
        {
          class: "ctxmenu__item" + (item.danger ? " ctxmenu__item--danger" : ""),
          role: "menuitem",
          type: "button",
          onclick: () => {
            hideMenu();
            item.onClick();
          },
        },
        [item.icon ? U.icon(item.icon) : null, U.el("span", { text: item.label })]
      );
      ctx.appendChild(btn);
    }

    ctx.hidden = false;
    // Clamp inside the viewport.
    const rect = ctx.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    ctx.style.left = Math.max(8, left) + "px";
    ctx.style.top = Math.max(8, top) + "px";

    const firstItem = ctx.querySelector(".ctxmenu__item");
    if (firstItem) firstItem.focus();
  }

  function hideMenu() {
    ctx.hidden = true;
    ctx.innerHTML = "";
  }

  document.addEventListener("mousedown", (e) => {
    if (!ctx.hidden && !ctx.contains(e.target)) hideMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !ctx.hidden) hideMenu();
  });
  window.addEventListener("blur", hideMenu);

  window.modal = { open, close, isOpen, menu, hideMenu };
})();
