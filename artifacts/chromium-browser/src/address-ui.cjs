(function () {
  "use strict";
  const input = document.getElementById("address");
  const list = document.getElementById("address-suggestions");
  const form = document.getElementById("address-form");
  const bridge = window.brujula;
  const engine = window.SlateAddressSuggestions;
  let state = {};
  let query = "";
  let items = [];
  let selected = -1;
  let composing = false;
  let scope = "";
  let library = "";
  let reportedHeight = 0;
  let dismissed = false;
  let remote = [];
  let onlineStatus = "";
  let timer = 0;
  let generation = 0;

  function cancelOnline(clear = true) {
    generation++;
    clearTimeout(timer);
    timer = 0;
    onlineStatus = "";
    if (clear) remote = [];
    else list.querySelector(".address-suggestion-status")?.remove();
    bridge.cancelSearchSuggestions().catch(() => {});
  }

  function scheduleOnline() {
    cancelOnline();
    const tab = state.tabs?.find(tab => tab.id === state.activeTabId);
    if (dismissed || composing || document.activeElement !== input || !tab || tab.ephemeral ||
        !state.browserPreferences?.onlineSuggestions || !window.SlateSuggestionPolicy.eligibleQuery(query)) return;
    const current = generation;
    const text = query;
    timer = setTimeout(async () => {
      timer = 0;
      onlineStatus = "Consultando sugerencias en línea…";
      refresh();
      let result;
      try { result = await bridge.searchSuggestions({ query: text, tabId: tab.id }); }
      catch { result = { status: "error", message: "No se pudieron consultar las sugerencias en línea." }; }
      if (current !== generation || document.activeElement !== input || dismissed || text !== query) return;
      remote = result.status === "ok" ? result.items.map(value => ({
        kind: "search", query: value, title: value, source: `${result.provider} · En línea`,
      })) : [];
      onlineStatus = result.status === "error" ? result.message : "";
      refresh();
    }, 300);
  }

  function reportHeight() {
    const height = list.hidden ? 0 : Math.max(0,
      Math.ceil(list.getBoundingClientRect().bottom - (state.layout?.bounds?.y || 0)) + 4);
    if (height === reportedHeight) return;
    reportedHeight = height;
    bridge.setAddressPopupHeight(height).catch(error => console.error("Sugerencias:", error));
  }

  function close() {
    cancelOnline();
    list.hidden = true;
    items = [];
    selected = -1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    reportHeight();
  }

  function highlight() {
    [...list.querySelectorAll("[role=option]")].forEach((row, index) => row.setAttribute("aria-selected", String(index === selected)));
    if (selected >= 0) input.setAttribute("aria-activedescendant", `address-option-${selected}`);
    else input.removeAttribute("aria-activedescendant");
  }

  function navigate(item) {
    if (!item) return;
    input.value = item.kind === "search" ? item.query : item.url;
    close();
    input.blur();
    if (item.kind === "search") bridge.search(item.query);
    else bridge.navigate(item.url);
  }

  function refresh(complete = false) {
    if (document.activeElement !== input || composing || dismissed) return close();
    const tab = state.tabs?.find(tab => tab.id === state.activeTabId);
    const previous = items[selected];
    const local = engine.suggest(query, { history: state.history, bookmarks: state.bookmarks, ephemeral: tab?.ephemeral });
    items = [...local.slice(0, remote.length ? 4 : 6), ...remote.slice(0, 4)];
    selected = previous ? items.findIndex(item => item.kind === previous.kind &&
      item.url === previous.url && item.query === previous.query) : -1;
    list.replaceChildren();
    for (const [index, item] of items.entries()) {
      const row = document.createElement("div");
      row.className = "address-suggestion";
      row.id = `address-option-${index}`;
      row.setAttribute("role", "option");
      const label = document.createElement("span");
      label.className = "address-suggestion-label";
      const title = document.createElement("strong");
      title.textContent = item.title;
      const url = document.createElement("span");
      url.textContent = item.kind === "search" ? "Consulta de búsqueda" : item.url;
      label.append(title, url);
      const source = document.createElement("small");
      source.textContent = item.source;
      row.append(label, source);
      row.addEventListener("pointerdown", event => event.preventDefault());
      row.addEventListener("click", () => navigate(item));
      list.append(row);
    }
    if (onlineStatus) {
      const status = document.createElement("div");
      status.className = "address-suggestion-status";
      status.setAttribute("role", "status");
      status.textContent = onlineStatus;
      list.append(status);
    }
    list.hidden = items.length === 0 && !onlineStatus;
    input.setAttribute("aria-expanded", String(!list.hidden));
    const completion = complete && items[0] && engine.completionFor(query, items[0].url);
    if (completion) {
      input.value = query + completion.slice(query.length);
      input.setSelectionRange(query.length, input.value.length);
      selected = 0;
    }
    highlight();
    reportHeight();
  }

  input.addEventListener("focus", () => {
    dismissed = false;
    query = "";
    refresh();
    scheduleOnline();
  });
  input.addEventListener("blur", close);
  input.addEventListener("compositionstart", () => { composing = true; close(); });
  input.addEventListener("compositionend", () => {
    composing = false;
    dismissed = false;
    query = input.value;
    cancelOnline();
    refresh(false);
    scheduleOnline();
  });
  input.addEventListener("input", event => {
    dismissed = false;
    query = input.value;
    cancelOnline();
    const insert = event.inputType === "insertText" && !event.isComposing;
    refresh(insert && input.selectionStart === input.value.length && input.selectionEnd === input.value.length);
    scheduleOnline();
  });
  input.addEventListener("keydown", event => {
    if (composing || event.isComposing) return;
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      cancelOnline(false);
      if (list.hidden) { dismissed = false; query = input.value; refresh(); }
      if (!items.length) return close();
      selected = selected < 0 ? (event.key === "ArrowDown" ? 0 : items.length - 1) :
        (selected + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      input.value = items[selected].kind === "search" ? items[selected].query : items[selected].url;
      input.setSelectionRange(input.value.length, input.value.length);
      highlight();
      list.querySelector(`#address-option-${selected}`)?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && !list.hidden && selected >= 0) {
      event.preventDefault();
      navigate(items[selected]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      input.value = query;
      dismissed = true;
      close();
    } else if (event.key === "Tab") close();
  });
  form.addEventListener("submit", close);
  document.addEventListener("pointerdown", event => { if (!form.contains(event.target)) close(); });
  window.addEventListener("resize", reportHeight);
  bridge.onAddressDismissed(() => { dismissed = true; close(); });

  window.SlateAddressUI = {
    update(next) {
      state = next;
      const nextScope = JSON.stringify([state.activeTabId, state.features?.workspaceId,
        state.tabs?.find(tab => tab.id === state.activeTabId)?.ephemeral]);
      const nextLibrary = JSON.stringify([state.history, state.bookmarks,
        state.features?.settings?.searchEngine, state.browserPreferences?.onlineSuggestions]);
      if (scope && scope !== nextScope) {
        dismissed = true;
        close();
        input.value = state.tabs?.find(tab => tab.id === state.activeTabId)?.url || "";
        query = input.value;
      }
      else if (nextLibrary !== library) { cancelOnline(); refresh(false); scheduleOnline(); }
      scope = nextScope;
      library = nextLibrary;
    },
    close,
  };
})();
