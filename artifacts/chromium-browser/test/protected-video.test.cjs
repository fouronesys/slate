const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ProtectedVideo, allowProtectedMedia } = require("../src/protected-video.cjs");

function manager(whenReady = async () => [{id:"widevine",version:"4.10.1.2"}], options = {}) {
  const writes = [];
  let calls = 0;
  const components = { WIDEVINE_CDM_ID:"widevine", updatesEnabled:true,
    whenReady: (...args) => { calls++; return whenReady(...args); }, status:()=>({}) };
  const video = new ProtectedVideo({ components, persist:value=>writes.push(value), changed:()=>{}, ...options });
  return {video,components,writes,calls:()=>calls};
}
test("protected video requires consent before any component installation", async () => {
  const {video,components,writes,calls}=manager();
  video.start();
  assert.equal(components.updatesEnabled,false);
  assert.equal(calls(),1);
  assert.equal(video.snapshot().status,"consent");
  video.setEnabled(true);
  assert.equal(video.status,"restart");
  assert.equal(calls(),1,"enabling cannot reuse the readiness promise initialized with downloads disabled");
  const restarted=manager(undefined,{enabled:true}).video;
  restarted.start();await restarted.busy;
  assert.equal(components.updatesEnabled,true);
  assert.equal(restarted.snapshot().version,"4.10.1.2");
  assert.equal(restarted.snapshot().status,"installed");
  assert.deepEqual(writes,[{enabled:true}]);
});
test("saved consent initializes asynchronously without blocking startup", async () => {
  let resolve;
  const {video}=manager(()=>new Promise(done=>resolve=done),{enabled:true});
  assert.equal(video.start(),undefined);
  assert.equal(video.status,"installing");
  await Promise.resolve();
  resolve([{id:"widevine",version:"4.10.1"}]);
  await video.busy;
  assert.equal(video.status,"installed");
});
test("errors and timeouts never masquerade as installed CDM", async () => {
  for(const operation of [async()=>{throw new Error("offline");},()=>new Promise(()=>{})]){
    const {video}=manager(operation,{timeout:10});
    video.setEnabled(true);await video.busy;
    assert.equal(video.snapshot().status,"error");
    assert.equal(video.snapshot().version,null);
  }
});
test("disabling during installation ignores stale results and stops future updates", async () => {
  let resolve;
  const {video,components}=manager(()=>new Promise(done=>resolve=done));
  video.setEnabled(true);await Promise.resolve();
  video.setEnabled(false);
  resolve([{id:"widevine",version:"4.10.1"}]);await video.busy;
  assert.equal(components.updatesEnabled,false);
  assert.equal(video.status,"offline");
  assert.equal(video.version,null);
});
test("failure to save consent cannot start the updater", () => {
  const {video,components,calls}=manager(undefined,{persist:()=>{throw new Error("disk");}});
  video.start();
  assert.throws(()=>video.setEnabled(true),/disk/);
  assert.equal(video.enabled,false);assert.equal(components.updatesEnabled,false);assert.equal(calls(),1);
  assert.throws(()=>video.setEnabled("true"),/no válida/);
});
test("standard Electron cannot claim CDM support", () => {
  const video=new ProtectedVideo({persist:()=>{},changed:()=>{}});
  video.start();assert.equal(video.snapshot().status,"unsupported");
  assert.throws(()=>video.setEnabled(true),/no incluye/);
});
test("protected media permission is opt-in and confined to the HTTPS main origin", () => {
  const contents={isDestroyed:()=>false,getURL:()=>"https://stream.test/watch"};
  assert.equal(allowProtectedMedia(contents,"https://stream.test",{},true),true);
  for(const [wc,origin,details,enabled] of [
    [contents,"https://stream.test",{},false],
    [contents,"https://third-party.test",{},true],
    [contents,"https://stream.test",{isMainFrame:false},true],
    [{...contents,getURL:()=>"http://stream.test"},"http://stream.test",{},true],
    [{...contents,isDestroyed:()=>true},"https://stream.test",{},true],
    [null,"https://stream.test",{},true],
  ])assert.equal(allowProtectedMedia(wc,origin,details,enabled),false);
});
test("both Mac packagers use the pinned ECS distribution and preserve app identity", () => {
  const pkg=require("../package.json");
  const {installerConfiguration}=require("../scripts/package-mac-assisted.cjs");
  assert.equal(pkg.build.appId,"com.brujula.browser");
  assert.equal(pkg.devDependencies.electron,`github:castlabs/electron-releases#v${pkg.build.electronVersion}`);
  assert.equal(pkg.build.electronDownload.mirror,"https://github.com/castlabs/electron-releases/releases/download/");
  assert.equal(pkg.build.electronDownload.customDir,"v{{ version }}");
  assert.deepEqual(installerConfiguration("/tmp/stage","/tmp/payload","arm64").electronDownload,pkg.build.electronDownload);
});
test("the installed downloader resolves real Mac ECS URLs with exactly one version prefix", async () => {
  const {createRequire}=require("node:module");
  const pkg=require("../package.json");
  const {installerConfiguration}=require("../scripts/package-mac-assisted.cjs");
  const builderEntry=require.resolve("app-builder-lib/out/util/electronGet",{
    paths:[require.resolve("electron-builder")],
  });
  const {buildElectronArtifactConfig}=require(builderEntry);
  const {getArtifactVersion,getArtifactRemoteURL}=createRequire(builderEntry)("@electron/get/dist/cjs/artifact-utils");
  for(const arch of ["x64","arm64"]){
    for(const electronDownload of [pkg.build.electronDownload,installerConfiguration("/tmp/stage","/tmp/payload",arch).electronDownload]){
      const details=await buildElectronArtifactConfig({
        electronDownload,version:pkg.build.electronVersion,arch,platformName:"darwin",artifactName:"electron",
      });
      details.version=getArtifactVersion(details);
      const url=await getArtifactRemoteURL(details);
      assert.equal(url,`https://github.com/castlabs/electron-releases/releases/download/v${pkg.build.electronVersion}/electron-v${pkg.build.electronVersion}-darwin-${arch}.zip`);
    }
  }
});
