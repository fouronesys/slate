(() => {
  "use strict";
  const root = document.getElementById("companion-root");
  const pet = window.slatePet;
  let state = null;
  let cursor = { x: 0.5, y: 0.5 };
  let motion = { moving: false, facing: "right" };
  let cleanup = null;
  const unsubscribe = [];
  function render() {
    if (!state || !root || !window.SlateCompanion) return;
    cleanup?.();
    document.body.dataset.theme = state.theme === "oscuro" ? "oscuro" : "claro";
    document.body.dataset.contrast = String(Boolean(state.highContrast));
    window.SlateCompanionTheme.apply(document.body, state.palette);
    document.body.style.setProperty("--ui-font", window.SlateFonts.stack(state.fontFamily));
    cleanup = window.SlateCompanion.mount(root, state.companion || {}, {
      mode: "floating",
      suggestion: state.suggestion,
      feedback: state.feedback,
      onAction(action) {
        return pet.action(action).catch(() => {
          const remark = root.querySelector(".companion-remark");
          if (remark) remark.textContent = "No pude guardar ese cambio. Inténtalo otra vez.";
        });
      },
    });
    root.dataset.moving = String(Boolean(motion.moving));
    root.dataset.facing = motion.facing === "left" ? "left" : "right";
    root.style.setProperty("--native-cursor-x", String(cursor.x));
    root.style.setProperty("--native-cursor-y", String(cursor.y));
  }
  if (pet?.getState) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reportMotionPreference = () => pet.setReducedMotion?.(reducedMotion.matches).catch(() => {
      root.textContent = "No se pudo aplicar la preferencia de movimiento.";
    });
    reportMotionPreference();
    reducedMotion.addEventListener("change", reportMotionPreference);
    unsubscribe.push(() => reducedMotion.removeEventListener("change", reportMotionPreference));
    const stopState = pet.onState?.((next) => { state = next; render(); });
    pet.getState().then((next) => { state = next; render(); }).catch(() => {
      root.textContent = "No se pudo cargar el acompañante.";
    });
    const stopCursor = pet.onCursor?.((next) => {
      cursor = { x: Number(next?.x) || 0, y: Number(next?.y) || 0 };
      const card = root?.querySelector(".companion-card");
      if (!card || state?.companion?.followCursor === false) return;
      root.style.setProperty("--look-x", `${(cursor.x - .5) * 6}px`);
      root.style.setProperty("--look-y", `${(cursor.y - .5) * 4}px`);
      root.style.setProperty("--head-tilt", `${(cursor.x - .5) * 10}deg`);
    });
    const stopMotion = pet.onMotion?.((next) => {
      motion = {
        moving: Boolean(next?.moving),
        facing: next?.facing === "left" ? "left" : "right",
      };
      if (root) {
        root.dataset.moving = String(motion.moving);
        root.dataset.facing = motion.facing;
      }
    });
    if (typeof stopState === "function") unsubscribe.push(stopState);
    if (typeof stopCursor === "function") unsubscribe.push(stopCursor);
    if (typeof stopMotion === "function") unsubscribe.push(stopMotion);
  }
  window.addEventListener("beforeunload", () => {
    cleanup?.();
    unsubscribe.forEach((stop) => stop());
  }, { once: true });
})();
