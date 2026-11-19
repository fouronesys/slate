(() => {
  "use strict";

  const api = window.slateInstaller;
  const demo = !api;
  const $ = (selector) => document.querySelector(selector);
  const scene = $("#scene");
  const nextButton = $("#nextButton");
  const repeatButton = $("#repeatButton");
  const pauseButton = $("#pauseButton");
  const reducedMotionToggle = $("#reducedMotionToggle");
  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const guideSteps = ["welcome", "move", "complete"];
  let guideIndex = 0;
  let manuallySetMotion = false;
  let paused = false;
  let currentPhase = "idle";
  let unsubscribe = null;

  const labels = {
    idle: "Listo para instalar",
    preparing: "Preparando la instalación",
    copying: "Copiando Slate Privacy",
    verifying: "Comprobando la instalación",
    committing: "Finalizando",
    done: "Instalación completada",
    cancelled: "Instalación cancelada",
    error: "No se pudo completar la instalación",
  };

  function setGuideStep(index) {
    guideIndex = Math.max(0, Math.min(index, guideSteps.length - 1));
    const step = guideSteps[guideIndex];
    scene.dataset.step = step;
    document.querySelectorAll("[data-step-indicator]").forEach((indicator, i) => {
      indicator.classList.toggle("is-current", i === guideIndex);
      indicator.classList.toggle("is-complete", i < guideIndex);
      if (i === guideIndex) indicator.setAttribute("aria-current", "step");
      else indicator.removeAttribute("aria-current");
    });
    const captions = {
      welcome: "Hola. Soy Miso.",
      move: "Vamos juntos a Aplicaciones.",
      complete: "Una guía amable, hasta el final.",
    };
    $("#sceneCaption").textContent = captions[step];
    $("#confirmation").setAttribute("aria-hidden", String(step !== "complete"));
    nextButton.innerHTML = step === "welcome"
      ? 'Conocer la guía <span aria-hidden="true">→</span>'
      : step === "move" ? "Ver confirmación" : "Terminar";
    $("#announcement").textContent = captions[step];
    syncPausedAnimations();
  }

  function syncPausedAnimations() {
    // Flush new CSS transitions before pausing them, including the icon journey.
    void scene.offsetWidth;
    for (const animation of document.getAnimations()) {
      const target = animation.effect?.target;
      if (!target?.closest?.(".miso-wrap, .slate-wrap, .arrival-mark, .scene-wash, .destination")) continue;
      if (paused) animation.pause();
      else if (animation.playState === "paused") animation.play();
    }
  }

  function setReducedMotion(value) {
    document.body.classList.toggle("reduce-motion", value);
    reducedMotionToggle.checked = value;
  }

  function setupMotionControls() {
    setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener?.("change", (event) => {
      if (!manuallySetMotion) setReducedMotion(event.matches);
    });
    reducedMotionToggle.addEventListener("change", () => {
      manuallySetMotion = true;
      document.body.classList.toggle("motion-full", !reducedMotionToggle.checked);
      setReducedMotion(reducedMotionToggle.checked);
    });
    pauseButton.addEventListener("click", () => {
      paused = !paused;
      document.body.classList.toggle("motion-paused", paused);
      pauseButton.setAttribute("aria-pressed", String(paused));
      pauseButton.textContent = paused ? "Reanudar animación" : "Pausar animación";
      syncPausedAnimations();
    });
  }

  function setupDemo() {
    $("#modeLabel").textContent = "Demostración";
    $("#modePill").classList.remove("is-real");
    $("#guideActions").hidden = false;
    $("#realActions").hidden = true;
    $("#guideFinePrint").hidden = false;
    $("#realFinePrint").hidden = true;
    $("#preferences").hidden = false;
    nextButton.addEventListener("click", () => {
      if (guideIndex < guideSteps.length - 1) setGuideStep(guideIndex + 1);
      else setGuideStep(0);
    });
    repeatButton.addEventListener("click", () => setGuideStep(0));
    setGuideStep(0);
  }

  function renderState(state) {
    if (!state || typeof state.phase !== "string") return;
    const phase = state.phase;
    currentPhase = phase;
    const isDone = phase === "done";
    const isError = phase === "error";
    const canInstall = ["idle", "error", "cancelled"].includes(phase);
    const canCancel = ["preparing", "copying", "verifying"].includes(phase);
    const working = ["preparing", "copying", "verifying", "committing"].includes(phase);
    const stepIndex = isDone ? 2 : working ? 1 : 0;
    setGuideStep(stepIndex);
    scene.dataset.phase = phase;
    $("#sceneCaption").textContent = isError ? "Aquí sigo. Sin cambiar tus datos." : isDone ? "Listo. Te acompaño hasta aquí." : working ? "Te acompaño mientras se comprueba la copia." : "Hola. Soy Miso.";
    $("#confirmation > span:not(.confirmation-mark)").textContent = "Slate está verificado en Aplicaciones";
    $("#confirmation small").textContent = "Instalación real comprobada";
    $("#closeButton").disabled = phase === "committing";
    $("#statusPanel").hidden = false;
    $("#statusTitle").textContent = labels[phase] || "Estado de la instalación";
    $("#statusMessage").textContent = typeof state.message === "string" && state.message
      ? state.message
      : "";
    $("#statusIndicator").classList.toggle("is-working", working);
    $("#statusIndicator").classList.toggle("is-error", isError);
    $("#statusIndicator").classList.toggle("is-done", isDone);
    $("#installButton").hidden = !canInstall;
    $("#installButton").disabled = false;
    $("#openButton").hidden = !isDone;
    $("#cancelButton").hidden = !canCancel;
    $("#installButton").textContent = isError || phase === "cancelled"
      ? "Intentar de nuevo"
      : "Instalar Slate";
    $("#errorHelp").hidden = !isError;
    $("#guideActions").hidden = true;
    $("#realActions").hidden = false;
    $("#guideFinePrint").hidden = true;
    $("#realFinePrint").hidden = false;
    $("#preferences").hidden = false;
    $("#eyebrow").textContent = "INSTALADOR DE SLATE PRIVACY";
    $("#pageTitle").innerHTML = isDone
      ? "Tu espacio ya está<br><em>preparado.</em>"
      : "Un pequeño paso<br><em>hacia más calma.</em>";
    $("#introCopy").textContent = isError
      ? "Puedes volver a intentarlo cuando todo esté listo."
      : isDone ? "Slate Privacy está listo para que lo abras."
      : "La instalación se realiza solo cuando tú la inicias.";
  }

  async function refreshState() {
    try {
      renderState(await api.getState());
    } catch {
      renderState({
        phase: "error",
        message: "No se pudo consultar el estado del instalador. Inténtalo de nuevo.",
      });
    }
  }

  async function invoke(method) {
    const button = method === "install" ? $("#installButton")
      : method === "cancel" ? $("#cancelButton") : $("#openButton");
    if (!button || button.disabled) return;
    button.disabled = true;
    try {
      await api[method]();
      await refreshState();
    } catch (error) {
      // An error opening an already installed app must not turn installation
      // into a fictitious failed copy or offer to reinstall it.
      await refreshState();
      $("#errorHelp").hidden = false;
      $("#errorHelp p").textContent = error?.message || "No se pudo completar la acción. Inténtalo de nuevo.";
    } finally {
      button.disabled = false;
    }
  }

  function setupReal() {
    $("#modeLabel").textContent = "Instalador";
    $("#modePill").classList.add("is-real");
    $("#guideActions").hidden = true;
    $("#realActions").hidden = false;
    $("#guideFinePrint").hidden = true;
    $("#realFinePrint").hidden = false;
    $("#preferences").hidden = false;
    $("#eyebrow").textContent = "INSTALADOR DE SLATE PRIVACY";
    $("#introCopy").textContent = "La instalación se realiza solo cuando tú la inicias.";
    $("#installButton").addEventListener("click", () => invoke("install"));
    $("#cancelButton").addEventListener("click", () => invoke("cancel"));
    $("#openButton").addEventListener("click", () => invoke("open"));
    $("#statusPanel").hidden = false;
    $("#statusMessage").textContent = "Consultando el estado del instalador…";
    try {
      const result = api.onState((state) => renderState(state));
      if (typeof result === "function") unsubscribe = result;
    } catch {
      renderState({ phase: "error", message: "No se pudo conectar con el instalador." });
    }
    refreshState();
  }

  $("#closeButton").addEventListener("click", async () => {
    if (!demo && typeof api.close === "function") {
      try { await api.close(); } catch { /* A close failure must not obscure the installer. */ }
    } else {
      window.close();
    }
  });

  window.addEventListener("beforeunload", () => {
    if (typeof unsubscribe === "function") unsubscribe();
  });

  setupMotionControls();
  if (demo) setupDemo();
  else setupReal();
})();
