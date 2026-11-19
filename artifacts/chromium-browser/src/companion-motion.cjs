const SIZE = { width: 250, height: 240 };
function boundedPosition(point, area) {
  const width = Math.min(SIZE.width, Math.max(1, area.width));
  const height = Math.min(SIZE.height, Math.max(1, area.height));
  return {
    x: Math.round(Math.max(area.x, Math.min(point.x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(point.y, area.y + area.height - height))),
    width, height,
  };
}
function chooseWaypoint(position, area, random = Math.random) {
  const distance = 90 + random() * 150;
  const angle = random() * Math.PI * 2;
  let target = boundedPosition({
    x: position.x + Math.cos(angle) * distance,
    y: position.y + Math.sin(angle) * distance,
  }, area);
  if (Math.hypot(target.x - position.x, target.y - position.y) < 30) {
    target = boundedPosition({
      x: area.x + Math.max(0, area.width - SIZE.width) / 2,
      y: area.y + Math.max(0, area.height - SIZE.height) / 2,
    }, area);
  }
  return target;
}
function stepToward(position, target, elapsedMs, speed = 42) {
  const dx = target.x - position.x, dy = target.y - position.y;
  const distance = Math.hypot(dx, dy);
  const step = Math.max(0, Math.min(100, elapsedMs)) / 1000 * speed;
  if (distance <= step || distance < .25) return { ...position, x: target.x, y: target.y, arrived: true };
  return { ...position, x: position.x + dx / distance * step, y: position.y + dy / distance * step, arrived: false };
}
module.exports = { SIZE, boundedPosition, chooseWaypoint, stepToward };
