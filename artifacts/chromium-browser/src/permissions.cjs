const { randomUUID } = require("node:crypto");
const SUPPORTED = new Set(["media", "geolocation", "notifications"]);

class ExpiringPermissions {
  constructor(onChange, fullscreenAllowed, protectedMediaAllowed = () => false) {
    this.onChange = onChange;
    this.fullscreenAllowed = fullscreenAllowed;
    this.protectedMediaAllowed = protectedMediaAllowed;
    this.pending = new Map();
    this.grants = new Map();
  }
  origin(url) { try { return new URL(url).origin; } catch { return ""; } }
  granted(contents, permission, origin) {
    return [...this.grants.values()].some((grant) =>
      grant.permission === permission && grant.origin === origin &&
      grant.session === contents?.session && (grant.scope === "session" || grant.contentsId === contents?.id));
  }
  bind(browserSession) {
    browserSession.setPermissionCheckHandler((contents, permission, origin, details = {}) => {
      if (permission === "fullscreen") return this.fullscreenAllowed(contents, details, origin);
      if (permission === "mediaKeySystem") return this.protectedMediaAllowed(contents, origin, details);
      // A valid request must be same-origin, from a real remote page. Never
      // grant partition/storage access or treat an adblock exception as consent.
      return SUPPORTED.has(permission) && this.origin(contents?.getURL()) === this.origin(origin) &&
        this.granted(contents, permission, this.origin(origin));
    });
    browserSession.setPermissionRequestHandler((contents, permission, callback, details = {}) => {
      if (permission === "fullscreen") return callback(this.fullscreenAllowed(contents, details, ""));
      if (permission === "mediaKeySystem") return callback(this.protectedMediaAllowed(
        contents, details.requestingUrl || contents?.getURL(), details,
      ));
      const origin = this.origin(details.requestingUrl || contents?.getURL());
      if (!contents || contents.isDestroyed() || !SUPPORTED.has(permission) ||
          !origin.startsWith("https://") || this.origin(contents.getURL()) !== origin ||
          details.isMainFrame === false) return callback(false);
      if (this.granted(contents, permission, origin)) return callback(true);
      if (this.pending.size >= 10) return callback(false);
      const id = randomUUID();
      const timer = setTimeout(() => this.respond(id, "deny"), 60000);
      timer.unref();
      this.pending.set(id, { id, origin, permission, contentsId: contents.id, contents, callback, timer });
      this.onChange(true);
    });
  }
  respond(id, decision) {
    if (!["deny", "once", "tab", "session"].includes(decision)) throw new Error("Permiso no válido.");
    const entry = this.pending.get(id);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(id);
    const live = !entry.contents.isDestroyed() && this.origin(entry.contents.getURL()) === entry.origin;
    if (live && ["tab", "session"].includes(decision)) {
      this.grants.set(id, {
        id, origin: entry.origin, permission: entry.permission,
        contentsId: entry.contentsId, session: entry.contents.session, scope: decision,
        expiresAt: decision === "tab" ? "Al cerrar la pestaña o cambiar de sitio" : "Al cerrar Slate",
      });
    }
    entry.callback(live && decision !== "deny");
    this.onChange();
    return true;
  }
  revoke(id) {
    const entry = this.grants.get(id);
    if (entry) {
      this.grants.delete(id);
      // Revocation prevents new requests, but capture already running must
      // stop by closing/reloading the page; UI explicitly explains this.
      this.onChange();
    }
  }
  forgetSession(browserSession) {
    for (const grant of this.grants.values()) {
      if (grant.session === browserSession) this.grants.delete(grant.id);
    }
  }
  forget(contentsId, navigationOrigin = null) {
    for (const entry of this.pending.values()) {
      if (entry.contentsId === contentsId) this.respond(entry.id, "deny");
    }
    for (const grant of this.grants.values()) {
      if (grant.contentsId === contentsId && grant.scope !== "session" &&
          (!navigationOrigin || navigationOrigin !== grant.origin)) this.grants.delete(grant.id);
    }
  }
  snapshot(contentsIds) {
    const allowed = new Set(contentsIds);
    const clean = ({ id, origin, permission, expiresAt }) => ({ id, origin, permission, expiresAt });
    return {
      pendingPermissions: [...this.pending.values()].filter((p) => allowed.has(p.contentsId)).map(clean),
      grants: [...this.grants.values()].filter((p) => allowed.has(p.contentsId)).map(clean),
    };
  }
}
module.exports = { ExpiringPermissions };
