const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const {spawnSync}=require("node:child_process");
const {createClient,buildEnvironment,clientEnvironment,runHook}=require("../scripts/vmp-client.cjs");
const {parseOptions}=require("../scripts/package-mac.cjs");

function fixture(t) {
  // macOS exposes the same temporary directory through /var and /private/var.
  // Match the production client's realpath normalization, including in Python.
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"slate-vmp-test-")));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const app=path.join(root,"Slate Privacy.app");
  const dir=path.join(app,"Contents/Frameworks/Electron Framework.framework/Versions/A");
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,"Electron Framework"),"test fixture, not a real executable");
  return {root,app};
}
function stubClient(results=[]) {
  const calls=[];
  const client=createClient({execute:(python,args,options)=>{
    calls.push({python,args,options});
    if(args.includes("--version"))return {status:0,stdout:"vmp.py 1.3.3"};
    return results.shift()||{status:0,stdout:" - Signature is valid: streaming, 300 days of validity"};
  }});
  return {client,calls};
}
test("packaging requires two explicit signing flags and rejects conflicting modes",()=>{
  assert.equal(parseOptions([]).vmpMode,"off");
  assert.equal(parseOptions(["--vmp-verify"]).vmpMode,"verify");
  assert.equal(parseOptions(["--vmp-sign","--allow-binary-upload"]).vmpMode,"sign");
  for(const args of [["--vmp-sign"],["--allow-binary-upload"],["--vmp-sign","--vmp-verify","--allow-binary-upload"]]){
    assert.throws(()=>parseOptions(args));
  }
});
test("ordinary builds clear inherited signing consent and unsafe EVS overrides",()=>{
  const env=buildEnvironment(parseOptions([]),{PATH:"/bin",SLATE_VMP_MODE:"sign",SLATE_VMP_ALLOW_BINARY_UPLOAD:"yes"});
  assert.equal(env.SLATE_VMP_MODE,"off");assert.equal(env.SLATE_VMP_ALLOW_BINARY_UPLOAD,"no");
  assert.deepEqual(clientEnvironment({PATH:"/bin",EVS_ANY_SKI:"1",EVS_FORCE:"1",EVS_API_URL:"untrusted"}),{PATH:"/bin"});
});
test("disabled hooks never run the client; invalid signing consent fails first",async()=>{
  const calls=[];const client={verify:()=>calls.push("verify"),sign:()=>calls.push("sign")};
  await runHook({}, {client,log:()=>{}});
  await assert.rejects(runHook({}, {client,mode:"sign",log:()=>{}}));
  assert.deepEqual(calls,[]);
});
test("hooks sign before Apple and only verify afterwards",async()=>{
  const calls=[];const client={verify:app=>calls.push(["verify",app]),sign:(app,opts)=>calls.push(["sign",app,opts])};
  const context={electronPlatformName:"darwin",appOutDir:"/build/mac-arm64",packager:{appInfo:{productFilename:"Slate Privacy"}}};
  await runHook(context,{client,mode:"sign",allowBinaryUpload:true,log:()=>{}});
  await runHook(context,{client,mode:"sign",allowBinaryUpload:true,afterSign:true,log:()=>{}});
  assert.equal(calls[0][0],"sign");assert.equal(calls[0][2].allowBinaryUpload,true);
  assert.deepEqual(calls[1],["verify","/build/mac-arm64/Slate Privacy.app"]);
  await assert.rejects(runHook({...context,electronPlatformName:"linux"},{client,mode:"verify",log:()=>{}}));
});
test("local verification uses streaming, exact app targeting and network-disabled Python",t=>{
  const {app}=fixture(t);const {client,calls}=stubClient();
  assert.equal(client.verify(app).verified,true);
  const call=calls.at(-1);
  assert.equal(call.options.shell,false);assert.equal(call.options.stdio[0],"ignore");
  assert.ok(call.args.includes("offline"));assert.ok(call.args.includes("--no-ask"));
  assert.deepEqual(call.args.slice(-8),["--no-ask","verify-pkg","--streaming","--min-days","30","--name-hint","Slate Privacy",path.dirname(app)]);
  assert.ok(!calls.some(c=>c.args.includes("sign-pkg")));
});
test("verification resolves a directory alias before targeting the package",t=>{
  const {root,app}=fixture(t);
  const alias=path.join(root,"via-alias");
  fs.symlinkSync(root,alias,process.platform==="win32"?"junction":"dir");
  const {client,calls}=stubClient();
  const result=client.verify(path.join(alias,path.basename(app)));
  assert.equal(result.app,fs.realpathSync(app));
  assert.equal(calls.at(-1).args.at(-1),root);
  assert.ok(calls.at(-1).args.includes("offline"));
  assert.ok(!calls.some(call=>call.args.includes("sign-pkg")));
});
test("verification rejects client errors, development signatures and empty successful output",t=>{
  const {app}=fixture(t);
  for(const result of [{status:1,stdout:"Certificate is valid for development only"},
    {status:0,stdout:""},{status:null,error:new Error("timeout")},{status:0,stdout:"Signature is valid: persistent"}]){
    assert.throws(()=>stubClient([result]).client.verify(app),/no verificada/);
  }
  assert.throws(()=>stubClient([{status:1,stdout:"Certificate is valid for development only"}]).client.verify(app),/solo de desarrollo/);
  assert.throws(()=>stubClient([{status:1,stdout:"Certificate expires in less than 30 days"}]).client.verify(app),/30 días/);
  assert.throws(()=>stubClient([{status:1,stdout:"Failed to read signature"}]).client.verify(app),/no existe/);
});
test("signing without consent never starts Python or touches a package",()=>{
  const {client,calls}=stubClient();
  assert.throws(()=>client.sign("/not/a/package"),/Subida bloqueada/);assert.deepEqual(calls,[]);
});
test("signing reuses a valid production signature without uploading",t=>{
  const {app}=fixture(t);const {client,calls}=stubClient();
  assert.equal(client.sign(app,{allowBinaryUpload:true}).verified,true);
  assert.equal(calls.filter(c=>c.args.includes("verify-pkg")).length,2);
  assert.equal(calls.filter(c=>c.args.includes("sign-pkg")).length,0);
});
test("invalid signatures request signing once, then must pass a separate verification",t=>{
  const {app}=fixture(t);
  const invalid={status:1,stdout:"development only"},ok={status:0,stdout:"signature request successful"};
  const {client,calls}=stubClient([invalid,ok,{status:0,stdout:"Signature is valid: streaming"}]);
  client.sign(app,{allowBinaryUpload:true});
  assert.deepEqual(calls.filter(c=>!c.args.includes("--version")).map(c=>c.args.includes("sign-pkg")?"sign":"verify"),["verify","sign","verify"]);
  assert.ok(calls.find(c=>c.args.includes("sign-pkg")).args.includes("online"));
  assert.throws(()=>stubClient([invalid,ok,invalid]).client.sign(app,{allowBinaryUpload:true}),/posterior/);
  assert.throws(()=>stubClient([invalid,{status:1,stdout:"private account detail"}]).client.sign(app,{allowBinaryUpload:true}),error=>!error.message.includes("private account detail"));
});
test("missing tools and ambiguous package paths fail explicitly",t=>{
  const {app,root}=fixture(t);
  const client=createClient({execute:()=>({status:1,stdout:""})});
  assert.throws(()=>client.verify(app),/video:setup/);
  assert.throws(()=>stubClient().client.verify(root),/ruta debe corresponder/);
  const {main}=require("../scripts/vmp.cjs");
  assert.throws(()=>main(["sign",app]),/Uso/);
  assert.throws(()=>stubClient().client.account("delete"),/signup o/);
});
test("build configuration installs both hooks but never includes build tools in the app",()=>{
  const {build}=require("../package.json");
  assert.equal(build.afterPack,"./scripts/vmp-after-pack.cjs");
  assert.equal(build.afterSign,"./scripts/vmp-after-sign.cjs");
  assert.equal(typeof require("../scripts/vmp-after-pack.cjs"),"function");
  assert.equal(typeof require("../scripts/vmp-after-sign.cjs"),"function");
  assert.deepEqual(build.files,["src/**/*","package.json"]);
});
test("assisted packaging rechecks the copied browser, never the outer installer",async()=>{
  const {installerConfiguration}=require("../scripts/package-mac-assisted.cjs");
  const calls=[];
  const config=installerConfiguration("/stage","/payload","arm64",{
    verifyVmp:true,validatePayload:app=>calls.push(["apple",app]),verifyPayload:app=>calls.push(["vmp",app]),
  });
  await config.afterSign({appOutDir:"/output"});
  const expected="/output/Instalar Slate Privacy.app/Contents/Resources/payload/Slate Privacy.app";
  assert.deepEqual(calls,[["apple",expected],["vmp",expected]]);
  const failing=installerConfiguration("/stage","/payload","arm64",{
    verifyVmp:true,validatePayload:()=>{},verifyPayload:()=>{throw new Error("invalid copied VMP");},
  });
  await assert.rejects(failing.afterSign({appOutDir:"/output"}),/invalid copied/);
  const invalidApple=installerConfiguration("/stage","/payload","arm64",{
    verifyVmp:true,
    validatePayload:()=>{throw new Error("invalid copied Apple signature");},
    verifyPayload:()=>assert.fail("VMP must not mask Apple failure"),
  });
  await assert.rejects(invalidApple.afterSign({appOutDir:"/output"}),/invalid copied Apple/);
  const asyncFailure=installerConfiguration("/stage","/payload","arm64",{
    verifyVmp:true,validatePayload:async()=>{},
    verifyPayload:async()=>{throw new Error("async VMP failure");},
  });
  await assert.rejects(asyncFailure.afterSign({appOutDir:"/output"}),/async VMP failure/);
});
test("ordinary assisted packaging never requests a VMP check",async()=>{
  const {installerConfiguration}=require("../scripts/package-mac-assisted.cjs");
  await installerConfiguration("/stage","/payload","x64",{
    validatePayload:()=>{},verifyPayload:()=>{throw new Error("unexpected VMP call");},
  }).afterSign({appOutDir:"/output"});
});
test("real Python bootstrap reaches a local test module and blocks network during verification",{
  skip:spawnSync("python3",["--version"],{stdio:"ignore"}).status!==0,
},t=>{
  const {root,app}=fixture(t),moduleDir=path.join(root,"castlabs_evs");
  fs.mkdirSync(moduleDir);fs.writeFileSync(path.join(moduleDir,"__init__.py"),"");
  fs.writeFileSync(path.join(moduleDir,"vmp.py"),`import sys,socket
if "--version" in sys.argv:
  print("vmp.py 1.3.3")
else:
  assert sys.argv[1:]==["--no-ask","verify-pkg","--streaming","--min-days","30","--name-hint","Slate Privacy",${JSON.stringify(path.dirname(app))}]
  try:
    socket.getaddrinfo("must-not-be-contacted.invalid",443)
    raise AssertionError("Network not blocked")
  except RuntimeError:
    print("Signature is valid: streaming")
`);
  assert.equal(createClient({clientDir:root}).verify(app).verified,true);
});
