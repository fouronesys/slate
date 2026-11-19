(function(root,factory){const api=factory(typeof module==="object"&&module.exports?require("./theme-tokens.cjs"):root.SlateTheme);if(typeof module==="object"&&module.exports)module.exports=api;else root.SlateCompanionTheme=api;})(typeof globalThis==="object"?globalThis:this,function(theme){
  function palette(appearance, dark, highContrast) {
    const background = highContrast ? dark ? "#000000" : "#ffffff" :
      appearance.colorMode === "propio" ? appearance.canvasColor : dark ? "#202124" : "#f4f4f6";
    return theme.palette(background);
  }
  function apply(element, colors) {
    for (const [key, value] of Object.entries({ paper:colors.background, ink:colors.ink, muted:colors.muted, line:colors.line, accent:colors.ink })) {
      element.style.setProperty(`--companion-${key}`,value);
    }
  }
  return { palette, apply };
});
