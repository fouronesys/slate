(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.SlateFonts=api;})(typeof globalThis==="object"?globalThis:this,function(){
  const stacks = {
    system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    sans: '"DM Sans", sans-serif',
    editorial: 'Fraunces, Georgia, serif',
    mono: '"IBM Plex Mono", monospace',
    georgia: 'Georgia, serif',
    avenir: '"Avenir Next", "DM Sans", sans-serif',
    palatino: '"Palatino Linotype", Palatino, Georgia, serif',
  };
  return { stacks, stack: id => stacks[id] || stacks.system };
});
