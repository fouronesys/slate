const path = require("node:path");
const { WebContentsView, ipcMain, screen } = require("electron");
const { SIZE, boundedPosition, chooseWaypoint, stepToward } = require("./companion-motion.cjs");
class NativeCompanion {
  constructor(window, { getState, getArea, action, onOutsideClick }) {
    this.window = window;
    this.getState = getState;
    this.getArea = getArea;
    this.action = action;
    this.onOutsideClick = onOutsideClick;
    this.lastState = "";
    this.motion = { moving: false, facing: "left" };
    this.onResume = () => this.sync();
    this.onSuspend = () => this.suspend();
    window.on("focus", this.onResume);
    window.on("restore", this.onResume);
    window.on("blur", this.onSuspend);
    window.on("minimize", this.onSuspend);
    const handle = (channel, callback) => {
      ipcMain.handle(channel, (event, ...args) => {
        if (!this.view || event.sender !== this.view.webContents ||
            event.senderFrame !== this.view.webContents.mainFrame) throw new Error("Origen de compañero no permitido.");
        return callback(...args);
      });
    };
    handle("companion:get-state", getState);
    handle("companion:reduced-motion", (value) => {
      if (typeof value !== "boolean") throw new Error("Preferencia de movimiento no válida.");
      this.reducedMotion = value;
      if (value) this.suspend();
      else this.sync();
      return true;
    });
    handle("companion:action", (value) => {
      const contextual = value && typeof value === "object" &&
        ["accept", "dismiss"].includes(value.type) && typeof value.id === "string" && /^[a-f0-9]{64}$/.test(value.id);
      if (!contextual && !["home", "hide", "pause"].includes(value)) throw new Error("Acción de compañero no válida.");
      return action(value);
    });
  }
  ensure() {
    if (this.view) return;
    this.view = new WebContentsView({ webPreferences: {
      preload: path.join(__dirname, "companion-preload.cjs"),
      contextIsolation: true, sandbox: true, nodeIntegration: false, partition: "slate-companion",
    } });
    this.view.setBackgroundColor("#00000000");
    const contents = this.view.webContents;
    contents.on("before-mouse-event", (_event, input) => {
      if (input.type === "mouseDown") this.onOutsideClick?.();
    });
    contents.session.setPermissionRequestHandler((_web, _permission, callback) => callback(false));
    contents.session.setPermissionCheckHandler(() => false);
    contents.session.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
      (_details, callback) => callback({ cancel: true }));
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event) => event.preventDefault());
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.on("did-finish-load", () => {
      this.lastState = "";
      this.sync();
      this.setMotion(false, this.motion.facing, true);
    });
    contents.loadFile(path.join(__dirname, "companion.html"));
  }
  sync() {
    if (this.window.isDestroyed()) return;
    const state = this.getState();
    const area = this.getArea();
    if (!state.companion.enabled || !state.companion.floating || !area) {
      this.suspend();
      if (this.view && this.window.contentView.children.includes(this.view)) this.window.contentView.removeChildView(this.view);
      return;
    }
    this.ensure();
    const children = this.window.contentView.children;
    if (children.at(-1) !== this.view) {
      if (children.includes(this.view)) this.window.contentView.removeChildView(this.view);
      this.window.contentView.addChildView(this.view);
    }
    const previous = this.position;
    this.position = boundedPosition(this.position || {
      x: area.x + area.width - SIZE.width - 20, y: area.y + area.height - SIZE.height - 20,
    }, area);
    if (previous && (previous.x !== this.position.x || previous.y !== this.position.y)) {
      this.precisePosition = null;
      this.target = null;
    }
    this.view.setBounds(this.position);
    const key = JSON.stringify(state);
    if (key !== this.lastState && !this.view.webContents.isLoadingMainFrame()) {
      this.lastState = key;
      this.view.webContents.send("companion:state", state);
    }
    if (!this.timer && this.window.isFocused() && !this.window.isMinimized() && !this.reducedMotion) {
      this.lastTick = performance.now();
      this.nextWalk = performance.now() + 1200;
      this.timer = setInterval(() => this.tick(), 50);
      this.timer.unref();
    }
  }
  tick() {
    if (!this.view || this.view.webContents.isDestroyed() || this.window.isDestroyed()) return;
    if (!this.window.isFocused() || this.window.isMinimized() || this.reducedMotion) {
      this.suspend();
      return;
    }
    const now = performance.now(), elapsed = now - this.lastTick;
    this.lastTick = now;
    if (!this.lastContextSync || now - this.lastContextSync >= 1000) {
      this.lastContextSync = now;
      this.sync();
    }
    const area = this.getArea();
    if (!area) return;
    const bounds = this.window.getContentBounds(), mouse = screen.getCursorScreenPoint();
    const x = mouse.x - bounds.x, y = mouse.y - bounds.y;
    if (x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height) {
      this.view.webContents.send("companion:cursor", { x: (x - area.x) / area.width, y: (y - area.y) / area.height });
    }
    const p = this.position;
    const hovered = x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height;
    // Pause for controls; otherwise take short, independent strolls with rests.
    if (!this.getState().companion.followCursor || hovered) {
      this.target = null; this.nextWalk = now + 900;
      this.precisePosition = null;
      this.setMotion(false);
      return;
    }
    if (!this.target && now >= this.nextWalk) this.target = chooseWaypoint(p, area);
    if (!this.target) return;
    this.target = boundedPosition(this.target, area);
    const next = stepToward(this.precisePosition || p, this.target, elapsed);
    this.precisePosition = next;
    const placed = boundedPosition(next, area);
    const moving = placed.x !== p.x || placed.y !== p.y;
    if (moving) {
      this.position = placed;
      this.view.setBounds(placed);
    }
    this.setMotion(!next.arrived, this.target.x < p.x ? "left" : "right");
    if (next.arrived) {
      this.target = null;
      this.nextWalk = now + 2200 + Math.random() * 2500;
    }
  }
  setMotion(moving, facing = this.motion.facing, force = false) {
    if (!force && this.motion.moving === moving && this.motion.facing === facing) return;
    this.motion = { moving, facing };
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.send("companion:motion", this.motion);
  }
  suspend() {
    clearInterval(this.timer); this.timer = null;
    this.target = null;
    this.precisePosition = null;
    this.setMotion(false);
  }
  dispose() {
    this.suspend();
    this.window.removeListener("focus", this.onResume);
    this.window.removeListener("restore", this.onResume);
    this.window.removeListener("blur", this.onSuspend);
    this.window.removeListener("minimize", this.onSuspend);
    for (const channel of ["companion:get-state", "companion:action", "companion:reduced-motion"]) ipcMain.removeHandler(channel);
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.close();
    this.view = null;
  }
}
module.exports = { NativeCompanion, boundedPosition };
