const { test } = require("node:test");
const assert = require("node:assert/strict");
const { categories, sectionLabels, entries, categoryForSection, search } = require("../src/settings-navigation.cjs");

test("settings categories preserve all thirteen destinations exactly once", () => {
  const expected = ["general", "videos", "appearance", "privacy", "bookmarks", "history", "downloads",
    "collections", "workspaces", "feature-privacy", "home", "commands", "legal"];
  const sections = categories.flatMap(category => category.sections);
  assert.equal(categories.length, 5);
  assert.equal(new Set(sections).size, expected.length);
  assert.deepEqual([...sections].sort(), [...expected].sort());
  for (const section of expected) {
    assert.ok(categoryForSection(section).sections.includes(section));
    assert.ok(sectionLabels[section]);
    assert.ok(entries.some(entry => entry.section === section));
  }
  assert.equal(categoryForSection("unknown"), undefined);
});

test("settings search is accent-insensitive, local and matches requested controls", () => {
  for (const [query, target] of [
    ["fondo", "#video-backdrop-option"], ["PiP", "#pip-button-enabled"],
    ["ACTUALIZACIONES", "#automatic-updates"], ["  tipografia  ", '[data-font-preference="fontFamily"]'],
    ["microfono", "#experience-settings"], ["transparencia", "#chrome-opacity"],
  ]) assert.ok(search(query).some(entry => entry.target === target), query);
  assert.deepEqual(search(""), []);
  assert.deepEqual(search(" \n "), []);
  assert.deepEqual(search("no-existe-este-ajuste"), []);
  assert.deepEqual(search("<script>alert(1)</script>"), []);
});

test("search results identify real sections, unique destinations and all query words", () => {
  assert.equal(new Set(entries.map(entry => `${entry.section}:${entry.target}`)).size, entries.length);
  for (const entry of entries) {
    assert.ok(categoryForSection(entry.section));
    assert.ok(entry.target);
    assert.ok(search(entry.label).includes(entry), entry.label);
  }
  for (const result of search("tema paginas")) assert.equal(result.section, "appearance");
  assert.ok(search("tema paginas").length);
  assert.deepEqual(search("pip colecciones"), []);
});

test("settings search does not mutate its catalog", () => {
  const before = JSON.stringify({ categories, sectionLabels, entries });
  for (const query of ["fondo", "PiP", "actualizaciones", "historial", ""]) search(query);
  assert.equal(JSON.stringify({ categories, sectionLabels, entries }), before);
});
