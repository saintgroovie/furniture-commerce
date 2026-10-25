// LOCAL proposal. New tool-only qualification; no app/card/cart/schema tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {spawn} = require('node:child_process');
const {performance} = require('node:perf_hooks');
const auth = require('./SDK-INTEGRITY.lock.json');
function isolated() {
  assert.equal(process.getuid(),10001); assert.equal(process.getgid(),10001);
  assert.equal(process.platform,'linux'); assert.equal(process.arch,'arm64');
  const status=fs.readFileSync('/proc/self/status','utf8');
  assert(/^CapEff:\s+0+$/m.test(status)); assert(/^NoNewPrivs:\s+1$/m.test(status)); assert(/^Seccomp:\s+2$/m.test(status));
  assert.equal(fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim(),String(1152*1024*1024));
  assert.equal(fs.readFileSync('/sys/fs/cgroup/pids.max','utf8').trim(),'128');
  assert.equal(fs.readFileSync('/proc/net/route','utf8').trim().split('\n').length,1,'network:none route table');
}
function guardian(c) {
  assert.equal(process.pid,1); isolated();
  assert(/^[0-9a-f]{32}$/.test(c.nonce));
  assert(Number.isFinite(c.issued_epoch)&&Number.isFinite(c.hard_epoch)&&c.hard_epoch-c.issued_epoch>10&&c.hard_epoch-c.issued_epoch<=60);
  assert(Date.now()>=c.issued_epoch*1000-250);
  const end=performance.now()+c.hard_epoch*1000-Date.now()-1000;
  assert(end>1000);
  const timer=setTimeout(()=>process.exit(124),end-performance.now());
  const child=spawn(process.execPath,[__filename,'worker',JSON.stringify(c)],{stdio:['ignore','pipe','ignore']});
  let size=0,parts=[];
  child.once('error',()=>process.exit(125));
  child.stdout.on('data',b=>{size+=b.length;if(size>16384)process.exit(126);parts.push(b);});
  child.once('exit',code=>{let value;try{value=JSON.parse(Buffer.concat(parts).toString());}catch{process.exit(127);}
    value.nonce=c.nonce;value.privatePID1=true;value.withinHardDeadline=performance.now()<end;
    // Keep the independent deadline alive until the bounded receipt is flushed.
    process.stdout.write(JSON.stringify(value)+'\n',()=>{clearTimeout(timer);process.exit(code===0&&value.pass&&performance.now()<end?0:1);});
  });
}
async function worker() {
  assert.equal(process.ppid,1); assert.notEqual(process.pid,1,'worker requires private PID1 guardian');
  isolated();
  const sdk=await import(auth.module_path);
  assert.equal(require('./node_modules/playwright-core/package.json').version,'1.64.1');
  assert.equal(sdk.chromium.executablePath(),auth.chromium_path);
  let browser;let requests=0;
  try {
    browser=await sdk.chromium.launch({executablePath:auth.chromium_path,headless:true,chromiumSandbox:true,
      args:['--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--disable-quic','--force-webrtc-ip-handling-policy=disable_non_proxied_udp']});
    assert.equal(browser.version(),auth.chromium_version);
    const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
    assert.equal(typeof context.routeWebSocket,'function');await context.routeWebSocket('**/*',socket=>socket.close());
    await context.route('**/*',route=>{requests++;return route.abort();});
    const page=await context.newPage();page.setDefaultTimeout(5000);await page.goto('about:blank');
    assert.equal(await page.evaluate(()=>2+2),4);assert.equal(requests,0);
    await context.close();await browser.close();browser=null;
    process.stdout.write(JSON.stringify({pass:true,SDK:'1.64.1',browser:auth.chromium_version,module:auth.module_path,executable:auth.chromium_path,node:process.version,platform:process.platform+'/'+process.arch,uid:process.getuid(),sandboxRequested:true,networkRequests:requests,appOrProductionAccess:false})+'\n');
  } finally {if(browser)await browser.close();}
}
if(process.argv[2]==='guard')guardian(JSON.parse(process.argv[3]));
else if(process.argv[2]==='worker')worker().catch(e=>{process.stdout.write(JSON.stringify({pass:false,errorClass:e.constructor.name})+'\n');process.exitCode=1;});
else {process.stderr.write('Explicit nonce/time-bound guard required; inert without START\n');process.exitCode=2;}
