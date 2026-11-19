(() => {
  "use strict";
  const brand = document.getElementById("brand-secret");
  const announcement = document.getElementById("secret-announcement");
  let clicks = 0;
  let latestState = {};
  let unlocking = false;
  const notify = (message) => {
    if (announcement) announcement.textContent = message;
    if (typeof window.showToast === "function") window.showToast(message);
  };
  brand?.addEventListener("click", async () => {
    if (unlocking) return;
    clicks += 1;
    brand.title = `${clicks}/3`;
    brand.classList.remove("brand-secret-tap");
    void brand.offsetWidth;
    brand.classList.add("brand-secret-tap");
    if (clicks < 3) return;
    clicks = 0;
    const saved = latestState.features?.home?.companion || {};
    unlocking = true;
    try {
      const companion = {
        enabled: true, kind: "cat", name: "Miso", color: "#63795e",
        floating: false, followCursor: true, secretUnlocked: false, cosmic: false,
        ...saved,
        secretUnlocked: true, cosmic: saved.secretUnlocked ? !saved.cosmic : true,
        enabled: true, floating: true,
      };
      const result = await window.brujula.featureAction({
        type: "home:update",
        patch: { companion },
      });
      if (result?.error) throw new Error(result.error);
      notify(companion.cosmic
        ? "Secreto activado: Modo Órbita. Miso te acompaña entre pestañas."
        : "Modo Órbita desactivado. Tres clics en el logo lo activan de nuevo.");
    } catch {
      notify("No se pudo activar el secreto. Inténtalo de nuevo.");
    } finally {
      unlocking = false;
      brand.title = "Slate Privacy";
    }
  });
  window.SlateCompanionSecret = {
    updateState(state) { latestState = state || latestState; },
  };
})();
