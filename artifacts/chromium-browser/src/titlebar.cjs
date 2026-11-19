(() => {
  "use strict";
  const header = document.querySelector(".titlebar");
  const sensor = document.getElementById("titlebar-sensor");
  let enabled = false;
  let revealed = true;
  let pending = null;
  let hideTimer;
  function cancelHide() { clearTimeout(hideTimer); hideTimer = null; }
  async function reveal(value) {
    cancelHide();
    if (!enabled || pending === value || (pending === null && revealed === value)) return;
    pending = value;
    try { await window.brujula.setTitlebarRevealed(value); }
    catch { if (typeof showToast === "function") showToast("No se pudo cambiar la barra superior."); }
    finally { pending = null; }
  }
  function scheduleHide() {
    if (hideTimer) return;
    if (!enabled || !revealed) return;
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (!header.contains(document.activeElement) && !header.matches(":hover") && !sensor.matches(":hover")) {
        void reveal(false);
      }
    }, 2400);
  }
  sensor.addEventListener("pointerenter", () => { void reveal(true); });
  sensor.addEventListener("focus", () => { void reveal(true); });
  sensor.addEventListener("click", () => { void reveal(true); });
  header.addEventListener("pointerenter", cancelHide);
  header.addEventListener("pointerleave", scheduleHide);
  header.addEventListener("focusin", () => { void reveal(true); });
  header.addEventListener("focusout", scheduleHide);
  document.addEventListener("pointermove", (event) => {
    if (enabled && revealed && event.clientY > 43) scheduleHide();
  });
  document.documentElement.addEventListener("pointerleave", scheduleHide);
  header.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && enabled) {
      document.getElementById("new-tab").focus();
      void reveal(false);
    }
  });
  window.SlateTitlebar = {
    render(state) {
      const focusWasSensor = document.activeElement === sensor;
      enabled = Boolean(state.appearance?.autoHideTitlebar);
      revealed = !enabled || state.layout.titlebarHeight === 43;
      document.documentElement.dataset.titlebarHidden = String(!revealed);
      sensor.hidden = !enabled || revealed;
      header.inert = !revealed;
      header.setAttribute("aria-hidden", String(!revealed));
      if (!enabled) cancelHide();
      if (focusWasSensor && revealed) header.querySelector("button")?.focus();
    },
  };
})();
