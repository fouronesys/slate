(() => {
  "use strict";
  const remarks = [
    "¿Pausa breve? Hasta las ideas bostezan.",
    "Ese marcador merece una segunda oportunidad.",
    "Podrías estirar los hombros. Yo vigilo.",
    "Una pestaña menos y el día parece más ligero.",
    "¿Guardamos esto para encontrarlo sin drama?",
    "Respira. Internet puede esperar un segundo.",
    "Hoy tienes cara de descubrir algo bueno.",
    "Te acompaño. Sin prisa y sin preguntas.",
  ];
  const safeColor = (value) => /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#63795e";
  const svgFor = (kind) => kind === "robot"
    ? `<svg class="companion-figure robot-figure" viewBox="0 0 180 170" role="img" aria-label="Pequeño robot"><g class="figure-shadow"><ellipse cx="91" cy="155" rx="44" ry="7"/></g><g class="companion-tail"><path d="M128 103q29-8 27 15t-17 12" fill="none" stroke="var(--pet-color)" stroke-width="7" stroke-linecap="round"/><circle cx="138" cy="130" r="5" fill="var(--pet-light)"/></g><g class="companion-body"><path d="M64 126 57 146q-2 8 8 8h17l5-21m25-7 8 20q3 8-7 8h-17l-5-21" fill="var(--pet-color)" stroke="var(--pet-outline)" stroke-width="3" stroke-linejoin="round"/><rect x="48" y="61" width="85" height="71" rx="27" fill="var(--pet-color)" stroke="var(--pet-outline)" stroke-width="3"/><g class="companion-arms"><path d="M51 83 40 99q-5 8 2 12l8-3 9-13m72-12 11 16q5 8-2 12l-8-3-9-13" fill="none" stroke="var(--pet-outline)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="m41 110 5 4m91-4-5 4" stroke="var(--pet-light)" stroke-width="3" stroke-linecap="round"/></g><path d="M57 66q-14-18-9-27 4-8 13-1l18 17m43 11q14-18 9-27-4-8-13-1l-18 17" fill="var(--pet-light)" stroke="var(--pet-outline)" stroke-width="3" stroke-linejoin="round"/><rect x="60" y="76" width="61" height="39" rx="17" fill="var(--face-bg)" stroke="var(--pet-outline)" stroke-width="2"/><g class="eyes"><ellipse class="eye" cx="78" cy="94" rx="5" ry="7" fill="var(--pet-outline)"/><ellipse class="eye" cx="103" cy="94" rx="5" ry="7" fill="var(--pet-outline)"/><path class="blink" d="M72 95h12m13 0h12" stroke="var(--pet-outline)" stroke-width="4" stroke-linecap="round"/></g><path class="mouth" d="M83 105q7 7 14 0" fill="none" stroke="var(--pet-outline)" stroke-width="2.5" stroke-linecap="round"/><circle cx="90" cy="45" r="7" fill="var(--pet-light)" stroke="var(--pet-outline)" stroke-width="2"/><path d="M90 38V27" stroke="var(--pet-outline)" stroke-width="3" stroke-linecap="round"/><circle cx="90" cy="24" r="4" fill="var(--pet-color)"/><path d="M42 92h7m84 0h7" stroke="var(--pet-outline)" stroke-width="4" stroke-linecap="round"/></g><g class="orbit-spark"><circle cx="142" cy="48" r="4"/><path d="M144 35v-8m-4 4h8"/></g></svg>`
    : `<svg class="companion-figure cat-figure" viewBox="0 0 150 170" role="img" aria-label="Miso, pequeño gato negro">
      <g class="companion-tail">
        <path d="M54 139c-15 13-34 11-40-2-7-15 0-34 12-32 11 1 7 20 17 24 5 2 10 0 15-5l7 12Z" fill="var(--cat-fur)" stroke="var(--cat-contour)" stroke-width="1.4" stroke-linejoin="round"/>
      </g>
      <g class="companion-body">
        <path d="M54 80c-13 8-21 25-21 45 0 21 13 34 42 34s42-13 42-34c0-20-8-37-21-45-10-6-32-6-42 0Z" fill="var(--cat-fur)" stroke="var(--cat-contour)" stroke-width="1.4" stroke-linejoin="round"/>
        <g class="companion-arms cat-paws">
          <g class="cat-paw cat-paw-left"><path d="M47 126c-2 9-1 20 7 23 6 2 11-1 12-7l1-14Z" fill="var(--cat-fur)" stroke="var(--cat-contour)" stroke-width="1.25" stroke-linejoin="round"/></g>
          <g class="cat-paw cat-paw-right"><path d="M83 128l1 14c1 6 6 9 12 7 8-3 9-14 7-23Z" fill="var(--cat-fur)" stroke="var(--cat-contour)" stroke-width="1.25" stroke-linejoin="round"/></g>
        </g>
        <g class="cat-head">
        <path d="M32 47 20 9q0-3 3-1l27 26h50l27-26q3-2 3 1l-2 38c8 12 9 26 5 41-5 19-23 31-53 31S32 107 27 88c-4-15-3-29 5-41Z" fill="var(--cat-fur)" stroke="var(--cat-contour)" stroke-width="1.4" stroke-linejoin="round"/>
        <path d="m27 23 6 23 9-8m75-15-14 15 12 8" fill="#9e7887" opacity=".38" stroke-linejoin="round"/>
        <path d="M40 50q29-13 65-2" fill="none" stroke="#fffdf8" stroke-opacity=".07" stroke-width="4" stroke-linecap="round"/>
        <g class="eyes">
          <g class="eye">
            <ellipse cx="54" cy="73" rx="12" ry="15" fill="#fffdf8"/>
            <ellipse cx="57" cy="74" rx="5.4" ry="8.2" fill="#111114"/>
            <circle cx="54.5" cy="69.5" r="2.3" fill="#fffdf8"/>
          </g>
          <g class="eye">
            <ellipse cx="96" cy="73" rx="12" ry="15" fill="#fffdf8"/>
            <ellipse cx="99" cy="74" rx="5.4" ry="8.2" fill="#111114"/>
            <circle cx="96.5" cy="69.5" r="2.3" fill="#fffdf8"/>
          </g>
          <path class="blink" d="M43 74q11 7 22 0m20 0q11 7 22 0" fill="none" stroke="#fffdf8" stroke-width="3" stroke-linecap="round"/>
        </g>
        <path d="M72 91q3-2 6 0l-3 3Z" fill="#f0a8b3"/>
        <path class="mouth" d="M75 94v3m0 0q-4 4-8 0m8 0q4 4 8 0" fill="none" stroke="#fff4ed" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M63 94 49 92m14 6-14 2m37-6 14-2m-14 6 14 2" fill="none" stroke="var(--cat-contour)" stroke-width="1" stroke-linecap="round"/>
        </g>
      </g>
      <g class="companion-delight" fill="#e9a6b9"><path d="M122 58c-9-8 5-18 10-8 6-10 19 1 9 9l-9 8Z"/></g>
      <g class="orbit-spark"><circle cx="137" cy="31" r="3.5"/><path d="M139 19v-7m-3.5 3.5h7"/></g>
    </svg>`;

  function mount(container, companion = {}, options = {}) {
    if (!container) return () => {};
    const mode = options.mode || "home";
    const parked = mode === "home-parked";
    const model = {
      name: String(companion.name || "Miso").slice(0, 40),
      kind: companion.kind === "robot" ? "robot" : "cat",
      color: safeColor(companion.color),
      cosmic: Boolean(companion.cosmic),
      unlocked: Boolean(companion.secretUnlocked),
      follow: companion.followCursor !== false,
      ...companion,
    };
    container.replaceChildren();
    container.classList.add("slate-companion-app");
    container.dataset.cosmic = String(model.cosmic);
    container.style.setProperty("--pet-color", model.color);
    const colorMix = `color-mix(in srgb, ${model.color} 43%, var(--companion-ink))`;
    container.style.setProperty("--pet-outline", colorMix);
    container.style.setProperty("--pet-light", `color-mix(in srgb, ${model.color} 24%, var(--companion-paper))`);
    const card = document.createElement("div");
    card.className = `companion-card${parked ? " is-parked" : ""}${mode === "floating" ? " is-floating" : ""}`;
    const art = document.createElement("button");
    art.className = "companion-art";
    art.type = "button";
    art.setAttribute("aria-label", `Saludar a ${model.name}`);
    art.innerHTML = svgFor(model.kind);
    const speech = document.createElement("div");
    speech.className = "companion-speech";
    speech.setAttribute("aria-live", "polite");
    speech.innerHTML = `<span class="companion-name"></span><p class="companion-remark"></p>`;
    speech.querySelector(".companion-name").textContent = model.name;
    const remark = speech.querySelector(".companion-remark");
    const suggestion = options.suggestion;
    if (suggestion) {
      const actions = document.createElement("div");
      actions.className = "companion-suggestion-actions";
      for (const [type, label] of [["accept", suggestion.label], ["dismiss", "Ahora no"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "companion-action";
        button.dataset.suggestionAction = type;
        button.textContent = label;
        button.addEventListener("click", async () => {
          button.disabled = true;
          try { await options.onAction?.({ type, id: suggestion.id }); }
          finally { button.disabled = false; }
        });
        actions.append(button);
      }
      speech.append(actions);
    }
    const controls = document.createElement("div");
    controls.className = "companion-controls";
    const makeAction = (label, action, title = label) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "companion-action";
      button.textContent = label;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.dataset.companionAction = action;
      button.addEventListener("click", () => options.onAction?.(action, action === "cosmic" ? !model.cosmic : undefined));
      controls.append(button);
      return button;
    };
    if (mode === "floating") {
      makeAction("Inicio", "home", "Devolver a Miso al inicio");
      const pause = makeAction(model.follow ? "Parar" : "Seguir", "pause", model.follow ? "Detener el paseo de Miso" : "Reanudar el paseo de Miso");
      pause.dataset.role = "pause";
      makeAction("Cerrar", "hide", "Ocultar a Miso");
    } else if (parked) {
      makeAction("Traer aquí", "home", "Traer a Miso al inicio");
      makeAction("Cerrar", "hide", "Ocultar a Miso");
    } else {
      makeAction("Pasear", "float", "Dejar que Miso pasee por el navegador");
      const pause = makeAction(model.follow ? "Parar" : "Seguir", "pause", model.follow ? "Detener el paseo de Miso" : "Reanudar el paseo de Miso");
      pause.dataset.role = "pause";
      makeAction("Cerrar", "hide", "Ocultar a Miso");
    }
    if (model.unlocked && mode !== "floating") {
      const orbit = makeAction(model.cosmic ? "Órbita: sí" : "Órbita: no", "cosmic", "Alternar Modo Órbita");
      orbit.classList.add("companion-orbit-toggle");
      orbit.setAttribute("aria-pressed", String(model.cosmic));
    }
    card.append(art, speech, controls);
    container.append(card);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    let gestureTimer = 0;
    let idleTimer = 0;
    const gesture = (name) => {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || parked) return;
      clearTimeout(gestureTimer);
      container.dataset.gesture = name;
      gestureTimer = window.setTimeout(() => { container.dataset.gesture = "rest"; }, 1800);
    };
    const idle = () => {
      idleTimer = window.setTimeout(() => {
        if (!document.hidden && container.dataset.moving !== "true") gesture(["stretch", "curious", "sleepy"][Math.floor(Math.random() * 3)]);
        idle();
      }, 9500 + Math.random() * 8000);
    };
    if (!parked && !reduced) idle();
    art.addEventListener("pointerenter", () => gesture("curious"));
    let remarkIndex = Math.floor(Math.random() * remarks.length);
    const speak = (text) => { remark.textContent = text; card.classList.remove("is-speaking"); void card.offsetWidth; card.classList.add("is-speaking"); };
    speak(suggestion?.text || options.feedback || (parked ? "Estoy por aquí, guardando mi sitio." : remarks[remarkIndex]));
    let timer = 0;
    const scheduleRemark = () => {
      if (suggestion || parked || document.hidden) return;
      timer = window.setTimeout(() => {
        remarkIndex = (remarkIndex + 1 + Math.floor(Math.random() * (remarks.length - 1))) % remarks.length;
        speak(remarks[remarkIndex]);
        scheduleRemark();
      }, 19000 + Math.random() * 14000);
    };
    scheduleRemark();
    art.addEventListener("click", () => {
      gesture("happy");
      card.classList.remove("is-bopping");
      void card.offsetWidth;
      card.classList.add("is-bopping");
      remarkIndex = (remarkIndex + 1) % remarks.length;
      speak(suggestion?.text || ["¡Te vi!", "¿Qué hacemos ahora?", "Me gusta este rincón."][Math.floor(Math.random() * 3)]);
    });
    const pointerMove = (event) => {
      if (!model.follow) return;
      const rect = card.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (event.clientX - (rect.left + rect.width / 2)) / Math.max(1, rect.width / 2)));
      const y = Math.max(-1, Math.min(1, (event.clientY - (rect.top + rect.height / 2)) / Math.max(1, rect.height / 2)));
      container.style.setProperty("--look-x", `${x * 3}px`);
      container.style.setProperty("--look-y", `${y * 2}px`);
      container.style.setProperty("--head-tilt", `${x * 5}deg`);
    };
    const pointerLeave = () => {
      container.style.setProperty("--look-x", "0px");
      container.style.setProperty("--look-y", "0px");
      container.style.setProperty("--head-tilt", "0deg");
    };
    card.addEventListener("pointermove", pointerMove);
    card.addEventListener("pointerleave", pointerLeave);
    if (reduced) container.dataset.reducedMotion = "true";
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(gestureTimer);
      window.clearTimeout(idleTimer);
      delete container.dataset.gesture;
      card.removeEventListener("pointermove", pointerMove);
      card.removeEventListener("pointerleave", pointerLeave);
      container.replaceChildren();
      container.classList.remove("slate-companion-app");
    };
  }
  window.SlateCompanion = { mount, catMarkup: () => svgFor("cat") };
})();
