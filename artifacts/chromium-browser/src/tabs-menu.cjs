"use strict";
function tabMenuEntries(tabs, activeId, workspaceId, { isCurrent, activate }) {
  return tabs.filter(tab => tab.workspaceId === workspaceId).map(tab => ({
    label: `${tab.ephemeral ? "Fugaz · " : ""}${String(tab.title || "Nueva pestaña").replace(/\s+/g, " ").trim().slice(0, 140) || "Nueva pestaña"}`,
    type: "radio",
    checked: tab.id === activeId,
    click: () => { if (isCurrent(tab.id, workspaceId)) activate(tab.id); },
  }));
}
module.exports = { tabMenuEntries };
