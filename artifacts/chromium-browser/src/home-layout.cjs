(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SlateHomeLayout = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
  const point = (value) => ({
    x: clamp(Number(value?.x), 0, 1),
    y: clamp(Number(value?.y), 0, 1),
  });
  function fromNormalized(position, bounds, size) {
    const p = point(position);
    return {
      x: p.x * Math.max(0, bounds.width - size.width),
      y: p.y * Math.max(0, bounds.height - size.height),
      width: size.width,
      height: size.height,
    };
  }
  function toNormalized(rect, bounds) {
    return point({
      x: rect.x / Math.max(1, bounds.width - rect.width),
      y: rect.y / Math.max(1, bounds.height - rect.height),
    });
  }
  const intersects = (a, b, gap = 12) =>
    a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;

  function resolveCollisions(items, bounds, gap = 12, obstacles = []) {
    const placed = [];
    const occupied = obstacles.map((item) => ({
      x: clamp(item.x, 0, bounds.width), y: Math.max(0, item.y),
      width: Math.min(Math.max(0, item.width), bounds.width),
      height: Math.max(0, item.height),
    }));
    const step = Math.max(16, Math.min(48, Math.round(Math.min(bounds.width, bounds.height) / 24)));
    for (const item of items) {
      const width = Math.min(Math.max(0, item.width), bounds.width);
      const height = Math.max(0, item.height);
      const desired = {
        x: clamp(item.x, 0, Math.max(0, bounds.width - width)),
        y: Math.max(0, item.y),
        width,
        height,
      };
      if (!occupied.some((other) => intersects(desired, other, gap))) {
        const next = { ...desired, id: item.id };
        placed.push(next); occupied.push(next);
        continue;
      }
      let found = null;
      const maxRadius = Math.max(bounds.width, bounds.height);
      for (let radius = step; radius <= maxRadius && !found; radius += step) {
        for (let angle = 0; angle < 360; angle += 22.5) {
          const radians = angle * Math.PI / 180;
          const candidate = {
            ...desired,
            x: clamp(desired.x + Math.cos(radians) * radius, 0, Math.max(0, bounds.width - width)),
            y: clamp(desired.y + Math.sin(radians) * radius, 0, Math.max(0, bounds.height - height)),
          };
          if (!occupied.some((other) => intersects(candidate, other, gap))) {
            found = candidate;
            break;
          }
        }
      }
      if (!found) {
        let y = desired.y;
        for (let index = 0; index < occupied.length + 2 && !found; index++) {
          const candidate = { ...desired, x: desired.x, y };
          const conflicts = occupied.filter((other) => intersects(candidate, other, gap));
          if (!conflicts.length) found = candidate;
          else y = Math.max(y + gap, ...conflicts.map((other) => other.y + other.height + gap));
        }
      }
      if (!found) {
        const bottom = occupied.reduce((max, other) => Math.max(max, other.y + other.height), 0);
        found = { ...desired, x: 0, y: bottom + gap };
      }
      const next = { ...found, id: item.id };
      placed.push(next);
      occupied.push(next);
    }
    placed.contentHeight = Math.max(0, ...placed.map((item) => item.y + item.height));
    return placed;
  }
  const ZONES = ["top-left", "top-center", "top-right", "middle-left", "middle-center", "middle-right", "bottom-left", "bottom-center", "bottom-right"];
  function nearestZone(position) {
    const p = point(position);
    return ZONES[Math.round(p.y * 2) * 3 + Math.round(p.x * 2)];
  }
  // A bounded, linear packing pass. Scroll height is output only.
  function arrangeZones(items, bounds, obstacles = [], gap = 18) {
    const narrow = bounds.width < 760;
    const columns = narrow ? 1 : 3;
    const width = Math.max(0, (bounds.width - gap * (columns + 1)) / columns);
    const placed = [];
    const occupied = [...obstacles];
    const ordered = [...items].sort((a, b) =>
      Math.floor(ZONES.indexOf(a.zone) / 3) - Math.floor(ZONES.indexOf(b.zone) / 3));
    for (const item of ordered) {
      const index = Math.max(0, ZONES.indexOf(item.zone));
      const column = narrow ? 0 : index % 3;
      const row = Math.floor(index / 3);
      const itemWidth = Math.min(item.width, width);
      const x = gap + column * (width + gap) + Math.max(0, width - itemWidth) * (column === 2 ? 1 : column === 1 ? .5 : 0);
      let rect = { id: item.id, x, y: narrow ? gap : gap + row * Math.max(100, (bounds.height - item.height - gap * 2) / 2), width: itemWidth, height: item.height };
      // Each iteration passes at least one obstacle; no radial search on pointermove.
      for (let pass = 0; pass <= occupied.length; pass++) {
        const conflicts = occupied.filter(other => intersects(rect, other, gap));
        if (!conflicts.length) break;
        rect.y = Math.max(...conflicts.map(other => other.y + other.height + gap));
      }
      placed.push(rect);
      occupied.push(rect);
    }
    placed.contentHeight = Math.max(bounds.height, ...placed.map(item => item.y + item.height + gap));
    return placed;
  }
  return { clamp, point, fromNormalized, toNormalized, intersects, resolveCollisions, ZONES, nearestZone, arrangeZones };
});
