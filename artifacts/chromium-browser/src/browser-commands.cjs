function commandsFor(platform) {
  const mod = platform === "darwin" ? "⌘" : "Ctrl+";
  return [
    { id: "new-tab", label: "Nueva pestaña", shortcut: `${mod}T` },
    { id: "close-tab", label: "Cerrar pestaña", shortcut: `${mod}W` },
    { id: "restore-tab", label: "Reabrir pestaña cerrada", shortcut: `${mod}${platform === "darwin" ? "⇧" : "Shift+"}T` },
    { id: "focus-address", label: "Buscar o introducir dirección", shortcut: `${mod}L` },
    { id: "reload", label: "Recargar página", shortcut: `${mod}R` },
    { id: "pip", label: "Video en imagen en imagen", shortcut: `${mod}${platform === "darwin" ? "⇧" : "Shift+"}P` },
    { id: "home", label: "Ir al inicio", shortcut: "" },
    { id: "back", label: "Atrás", shortcut: "" },
    { id: "forward", label: "Adelante", shortcut: "" },
    { id: "stop", label: "Detener carga", shortcut: "" },
    { id: "quit", label: "Salir de Slate", shortcut: "" },
  ];
}
module.exports = { commandsFor };
