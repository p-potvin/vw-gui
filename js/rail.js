/* ==========================================================================
   vw-gui :: warm rail — category tree
   ========================================================================== */

(function () {
  const tree = document.getElementById("tree");
  const filterInput = document.getElementById("filter");
  const countLabel = document.getElementById("command-count");

  let commands = [];
  let activeName = null;
  let filterText = "";
  const collapsed = new Set();
  let onSelect = () => {};
  let onContext = () => {};

  function setCommands(list) {
    commands = list || [];
    countLabel.textContent = i18n.t("rail.commandCount", { n: commands.length });
    render();
  }

  function setActive(name) {
    activeName = name;
    U.$$(".cmd", tree).forEach((n) => {
      n.classList.toggle("cmd--active", n.dataset.name === name);
    });
  }

  function matches(cmd) {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    return (
      cmd.Name.toLowerCase().includes(q) ||
      String(cmd.Description || "").toLowerCase().includes(q) ||
      String(cmd.Category || "").toLowerCase().includes(q)
    );
  }

  function render() {
    tree.innerHTML = "";

    const visible = commands.filter(matches);

    if (visible.length === 0) {
      tree.appendChild(U.el("p", { class: "tree__empty", text: i18n.t("rail.noMatches") }));
      return;
    }

    // Group by category, preserving registry order within each.
    const groups = new Map();
    for (const cmd of visible) {
      const cat = cmd.Category || "Uncategorized";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(cmd);
    }

    const cats = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));

    for (const cat of cats) {
      const items = groups.get(cat);
      // A filter implies you want to see what matched.
      const isOpen = filterText ? true : !collapsed.has(cat);

      const chevron = U.icon(U.ICONS.chevron);
      chevron.classList.add("cat__chevron");

      const head = U.el(
        "button",
        {
          class: "cat__head",
          type: "button",
          "aria-expanded": String(isOpen),
          onclick: () => {
            if (collapsed.has(cat)) collapsed.delete(cat);
            else collapsed.add(cat);
            render();
          },
        },
        [
          chevron,
          U.el("span", { class: "cat__label", text: cat }),
          U.el("span", { class: "cat__count", text: String(items.length) }),
        ]
      );

      const itemsWrap = U.el("div", { class: "cat__items", role: "group" });

      items.forEach((cmd, i) => {
        const dotClass = cmd.Destructive
          ? "cmd__dot cmd__dot--destructive"
          : !cmd.Exists
          ? "cmd__dot cmd__dot--missing"
          : null;

        const btn = U.el(
          "button",
          {
            class: "cmd" + (cmd.Name === activeName ? " cmd--active" : ""),
            type: "button",
            role: "treeitem",
            title: cmd.Description || cmd.Name,
            onclick: () => onSelect(cmd),
            oncontextmenu: (e) => {
              e.preventDefault();
              onContext(cmd, e.clientX, e.clientY);
            },
          },
          [
            U.el("span", { class: "cmd__name", text: cmd.Name }),
            dotClass
              ? U.el("span", {
                  class: dotClass,
                  title: cmd.Destructive ? i18n.t("cmd.destructive") : i18n.t("cmd.missing"),
                })
              : null,
          ]
        );

        btn.dataset.name = cmd.Name;
        // Stagger entrance without letting long lists feel laggy.
        btn.style.animationDelay = Math.min(i * 12, 200) + "ms";
        itemsWrap.appendChild(btn);
      });

      tree.appendChild(
        U.el("div", { class: "cat" + (isOpen ? " cat--open" : "") }, [head, itemsWrap])
      );
    }
  }

  filterInput.addEventListener(
    "input",
    U.debounce(() => {
      filterText = filterInput.value.trim();
      render();
    }, 90)
  );

  // Ctrl+K focuses the filter; Escape clears it.
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      filterInput.focus();
      filterInput.select();
    } else if (e.key === "Escape" && document.activeElement === filterInput) {
      filterInput.value = "";
      filterText = "";
      render();
    }
  });

  window.rail = {
    setCommands,
    setActive,
    render,
    set onSelect(fn) { onSelect = fn; },
    set onContext(fn) { onContext = fn; },
  };
})();
