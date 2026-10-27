#!/usr/bin/env node
// LOCAL candidate: a sealed non-runtime cart source qualification, not a runtime exception.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const REPO='saintgroovie/furniture-commerce';
const JOBS={'storefront':'Storefront production gates','backend-fidelity':'Backend fidelity tests','release-governance':'Release governance gates'};
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const fail=m=>{throw Error(m);};
const git=(repo,args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const registry=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'storefront-source-qualifications.json')));
const TEST_CONTEXT_FILE='apps/workspace/src/server/catalog-policy.mjs';
function canonicalTestContext(map){
  if(!map||typeof map!=='object'||Array.isArray(map))fail('test context map');
  const keys=Object.keys(map).sort();if(!keys.length)return {};
  if(JSON.stringify(keys)!==JSON.stringify([TEST_CONTEXT_FILE]))fail('closed test context');
  const s=map[TEST_CONTEXT_FILE];
  if(!s||JSON.stringify(Object.keys(s).sort())!==JSON.stringify(['blob','mode','sha256'])||s.mode!=='100644'||!/^[0-9a-f]{64}$/.test(s.sha256)||!/^[0-9a-f]{40}$/.test(s.blob))fail('test context descriptor');
  return {[TEST_CONTEXT_FILE]:{blob:s.blob,mode:s.mode,sha256:s.sha256}};
}
function testContextMap(c){
  if(c.test_context===undefined)return null;
  const map=canonicalTestContext(c.test_context);
  if(!['common-storefront-b461-v1','gallery-storefront-01f-exact7-v1','contacts-roi-storefront-b173-exact8-v1'].includes(c.kind)||!map[TEST_CONTEXT_FILE]||c.context_hashes[TEST_CONTEXT_FILE]!==map[TEST_CONTEXT_FILE].sha256)fail('test context binding');
  return map;
}
function contextOptions(c,opts={}){
  const identity=opts.identity||{runId:Number(process.env.GITHUB_RUN_ID),attempt:Number(process.env.GITHUB_RUN_ATTEMPT),job:'storefront',sourceSha:c.source_sha,policySha:process.env.GITHUB_SHA};
  if(!Number.isSafeInteger(identity.runId)||identity.runId<=0||identity.attempt!==1||identity.job!=='storefront'||identity.sourceSha!==c.source_sha||!/^[0-9a-f]{40}$/.test(identity.policySha||''))fail('context owner identity');
  const runnerTemp=opts.runnerTemp||process.env.RUNNER_TEMP;
  if(!runnerTemp||!path.isAbsolute(runnerTemp))fail('context runner temp');
  return {identity,runnerTemp};
}
// openat/no-follow operations work on both the hosted Linux runner and local
// POSIX fixtures. No arbitrary context path or cleanup target is accepted.
const TEST_CONTEXT_WORKER=String.raw`import os,sys,json,stat,hashlib,base64
r=json.load(sys.stdin); parts=['apps','workspace','src','server']; leaf='catalog-policy.mjs'
D=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW; F=os.O_RDONLY|os.O_NOFOLLOW
def need(ok,msg):
 if not ok: raise RuntimeError(msg)
def absolute_dir(p):
 need(os.path.isabs(p) and os.path.normpath(p)==p,'absolute context directory')
 fd=os.open('/',D)
 try:
  for x in p.split('/')[1:]:
   if x:
    n=os.open(x,D,dir_fd=fd);os.close(fd);fd=n
  return fd
 except:
  os.close(fd);raise
def identity(s):return [s.st_dev,s.st_ino]
def parents(root,create=False,created=None):
 fd=os.dup(root);rel=[]
 try:
  for x in parts:
   rel.append(x);made=False
   if create:
    try:os.mkdir(x,0o755,dir_fd=fd);made=True
    except FileExistsError:pass
   try:n=os.open(x,D,dir_fd=fd)
   except FileNotFoundError:
    os.close(fd);return None
   os.close(fd);fd=n
   if made:
    s=os.fstat(fd);created.append({'parts':list(rel),'id':identity(s),'uid':s.st_uid,'mode':stat.S_IMODE(s.st_mode)})
  return fd
 except:
  os.close(fd);raise
def read_at(fd,name,mode,limit):
 f=os.open(name,F,dir_fd=fd)
 try:
  s=os.fstat(f);need(stat.S_ISREG(s.st_mode) and stat.S_IMODE(s.st_mode)==mode and s.st_uid==os.geteuid() and s.st_nlink==1,'context regular owned file')
  b=os.read(f,limit+1);need(len(b)<=limit,'context size');return s,b
 finally:os.close(f)
def absent(fd,name):
 try:os.stat(name,dir_fd=fd,follow_symlinks=False);return False
 except FileNotFoundError:return True
def remove_dirs(root,created):
 for rec in reversed(created):
  pp=rec['parts'];need(pp in [parts[:i] for i in range(1,len(parts)+1)],'created directory scope')
  fd=os.dup(root)
  try:
   for x in pp[:-1]:
    n=os.open(x,D,dir_fd=fd);os.close(fd);fd=n
   d=os.open(pp[-1],D,dir_fd=fd)
   try:
    s=os.fstat(d);need(identity(s)==rec['id'] and s.st_uid==rec['uid']==os.geteuid() and stat.S_IMODE(s.st_mode)==rec['mode'] and not os.listdir(d),'created directory changed/nonempty')
   finally:os.close(d)
   need(identity(os.stat(pp[-1],dir_fd=fd,follow_symlinks=False))==rec['id'],'created directory replacement')
   os.rmdir(pp[-1],dir_fd=fd)
  finally:os.close(fd)
root=absolute_dir(r['repo']);parent=None;temp=None
try:
 parent=parents(root);present=parent is not None and not absent(parent,leaf)
 if r['op']=='check' and not r['present']:
  need(not present,'unexpected test context');print(json.dumps({'present':False}));sys.exit(0)
 own=r['owner'];temp=absolute_dir(own['runnerTemp']);who=own['identity'];name='woodright-source-context-%s-%s-storefront.json'%(who['runId'],who['attempt'])
 need(who['job']=='storefront' and who['attempt']==1 and isinstance(who['runId'],int) and who['runId']>0,'context marker identity')
 spec=r['spec'];need(spec['mode']=='100644','context mode')
 if r['op']=='install':
  need(not present and absent(temp,name),'preexisting context/owner')
  data=base64.b64decode(r['bytes'],validate=True);need(len(data)<=65536 and hashlib.sha256(data).hexdigest()==spec['sha256'] and hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==spec['blob'],'trusted context bytes')
  created=[];made=None;made_mode=0o600;written=0;marker=None;marker_written=0;record_bytes=b''
  if parent is not None:os.close(parent);parent=None
  try:
   parent=parents(root,True,created);f=os.open(leaf,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=parent)
   try:
    made=identity(os.fstat(f));os.fchmod(f,0o644);made_mode=0o644
    while written<len(data):
     n=os.write(f,data[written:]);need(n>0,'context write');written+=n
    os.fsync(f)
   finally:os.close(f)
   record={'schema':1,'identity':who,'repo':identity(os.fstat(root)),'runner':identity(os.fstat(temp)),'file':made,'spec':spec,'created':created}
   m=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=temp)
   try:
    marker=identity(os.fstat(m));record['marker']=marker;record_bytes=json.dumps(record,sort_keys=True).encode()
    while marker_written<len(record_bytes):
     n=os.write(m,record_bytes[marker_written:]);need(n>0,'marker write');marker_written+=n
    os.fsync(m)
   finally:os.close(m)
  except:
   if marker is not None:
    s,b=read_at(temp,name,0o600,16384);need(identity(s)==marker and b==record_bytes[:marker_written],'changed partial owner');os.unlink(name,dir_fd=temp)
   if made is not None:
    s,b=read_at(parent,leaf,made_mode,65536);need(identity(s)==made and b==data[:written],'changed partial context');os.unlink(leaf,dir_fd=parent)
   remove_dirs(root,created);raise
  print(json.dumps({'installed':True,'owned':True,'created_directories':len(created)}));sys.exit(0)
 if absent(temp,name):
  need(r['op']=='cleanup' and not present,'missing context owner');print(json.dumps({'clean':True,'already_absent':True}));sys.exit(0)
 ms,mb=read_at(temp,name,0o600,16384);record=json.loads(mb)
 need(set(record)=={'schema','identity','repo','runner','marker','file','spec','created'} and record['schema']==1 and record['identity']==who and record['repo']==identity(os.fstat(root)) and record['runner']==identity(os.fstat(temp)) and record['marker']==identity(ms) and record['spec']==spec,'context owner mismatch')
 need(present,'owned context missing');s,b=read_at(parent,leaf,0o644,65536)
 need(identity(s)==record['file'] and hashlib.sha256(b).hexdigest()==spec['sha256'],'owned context changed')
 if r['op']=='cleanup':
  need(identity(os.stat(leaf,dir_fd=parent,follow_symlinks=False))==record['file'],'context replaced');os.unlink(leaf,dir_fd=parent)
  remove_dirs(root,record['created']);need(identity(os.stat(name,dir_fd=temp,follow_symlinks=False))==identity(ms),'marker replaced');os.unlink(name,dir_fd=temp)
  print(json.dumps({'clean':True,'owned_removed':True}));sys.exit(0)
 need(r['op']=='check','context operation');print(json.dumps({'present':True,'owned':True}))
finally:
 if parent is not None:os.close(parent)
 if temp is not None:os.close(temp)
 os.close(root)
`;
function contextWorker(c,repo,op,present,opts){
  const map=testContextMap(c);if(!map)fail('unregistered test context');
  const req={repo:path.resolve(repo),op,present,spec:map[TEST_CONTEXT_FILE]};
  if(present||op!=='check'){
    req.owner=contextOptions(c,opts);
    const rt=path.resolve(req.owner.runnerTemp);
    if(rt===req.repo||rt.startsWith(req.repo+path.sep))fail('context marker must be outside source');
  }
  if(op==='install'){
    if(git(repo,['ls-files','--others','-z','--','apps/workspace/src']))fail('untracked workspace context before install');
    const file=path.join(ROOT,TEST_CONTEXT_FILE),fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    let b;try{const s=fs.fstatSync(fd);if(!s.isFile()||s.size>65536)fail('trusted context file');b=fs.readFileSync(fd);}finally{fs.closeSync(fd);}
    if(hash(b)!==req.spec.sha256||crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b])).digest('hex')!==req.spec.blob)fail('trusted context bytes');
    req.bytes=b.toString('base64');
  }
  return JSON.parse(execFileSync('python3',['-c',TEST_CONTEXT_WORKER],{input:JSON.stringify(req),encoding:'utf8',timeout:15000,maxBuffer:16384,stdio:['pipe','pipe','pipe']}));
}
function testContextFacts(c,repo,post,job,opts){
  const map=testContextMap(c);if(!map)return {};
  const present=post&&job==='storefront',expected=present?map:{};
  const untracked=git(repo,['ls-files','--others','-z','--','apps/workspace/src']).split('\0').filter(Boolean).sort();
  if(JSON.stringify(untracked)!==JSON.stringify(Object.keys(expected).sort()))fail('unsealed workspace test context');
  contextWorker(c,repo,'check',present,opts);
  return {testContext:expected,testContextDigest:hash(JSON.stringify(expected))};
}
function selectContract(reg,input,key){
  if(reg.schema!==1||!reg.qualifications||typeof reg.qualifications!=='object')fail('source qualification registry');
  const matches=Object.entries(reg.qualifications).filter(([,c])=>recognized(c,input));
  if(matches.length>1)fail('ambiguous source qualification');
  if(!matches.length){if(key)fail('unregistered qualification');return null;}
  const [id,c]=matches[0];
  if(key&&key!==id)fail('qualification key mismatch');
  if(input.sourceSha!==c.source_sha||(input.releaseRef!==undefined&&input.releaseRef!==c.release_ref))fail('partial qualification identity');
  return {id,contract:c};
}
function sourcePaths(c){
  if(c.paths===undefined){
    if(c.kind==='gallery-storefront-01f-exact7-v1')fail('missing gallery path map');
    if(c.kind==='contacts-roi-storefront-b173-exact8-v1')fail('missing contacts ROI path map');
    return {[c.path]:{before:c.before,after:c.after}};
  }
  const names=Object.keys(c.paths);
  if(c.kind==='gallery-storefront-01f-exact7-v1'){
    const galleryPaths=[
      'apps/storefront/src/app/product/[id]/page.tsx',
      'apps/storefront/src/components/pdp-hinge-side-media-switcher.tsx',
      'apps/storefront/src/lib/data/media-near-dup-collapse.json',
      'apps/storefront/src/lib/oliver-desk-variants.fidelity.test.ts',
      'apps/storefront/src/lib/oliver-desk-variants.ts',
      'apps/storefront/src/lib/pdp-hinge-side-media.fidelity.test.ts',
      'apps/storefront/src/lib/pdp-hinge-side-media.ts',
    ];
    if(JSON.stringify(names)!==JSON.stringify(galleryPaths))fail('closed gallery path map');
  }else if(c.kind==='contacts-roi-storefront-b173-exact8-v1'){
    const contactsPaths=[
      'apps/storefront/src/components/contacts-page-layout.tsx',
      'apps/storefront/src/components/contacts-showroom-carousel.css',
      'apps/storefront/src/components/contacts-showroom-carousel.tsx',
      'apps/storefront/src/components/product-card-media-gallery-core.tsx',
      'apps/storefront/src/lib/oliver14-fabric-photo-swatch.fidelity.test.cjs',
      'apps/storefront/src/lib/oliver14-fabric-photo-swatch.ts',
      'apps/storefront/src/lib/showroom-carousel-media.ts',
      'apps/storefront/src/lib/woodright-copy.ts',
    ];
    if(JSON.stringify(names)!==JSON.stringify(contactsPaths))fail('closed contacts ROI path map');
  }else if(c.kind!=='common-storefront-b461-v1'||names.length!==79||JSON.stringify(names)!==JSON.stringify([...names].sort()))fail('closed common path map');
  for(const file of names){
    const p=c.paths[file];
    if(!/^apps\/storefront\/(src|public|docs|scripts)\/[A-Za-z0-9._/\[\]()-]+$/.test(file)||file.split('/').includes('..')||!p||!/^([0-9a-f]{64})$/.test(p.after)||!(p.before===null||/^[0-9a-f]{64}$/.test(p.before))||!['100644','100755'].includes(p.mode)||!(/^[0-9a-f]{40}$/.test(p.after_blob))||!(p.before_blob===null||/^[0-9a-f]{40}$/.test(p.before_blob)))fail('common path contract');
  }
  if(Object.keys(c.test_overlays).length)fail('common source must contain sealed tests');
  return c.paths;
}
function workflowEnvironment(id,c){
  const values={POLICY_ID:id,RELEASE_REF:c.release_ref,BASE_SHA:c.base_sha,BE_REVISION:c.backend_revision,BE_DIGEST:c.backend_digest,SF_BASE_DIGEST:c.production_storefront_digest,TEST_OVERLAY_MODE:Object.keys(c.test_overlays).length?'sealed':'none',TEST_CONTEXT_MODE:testContextMap(c)?'sealed':'none'};
  if(!/^[a-z0-9-]+$/.test(id)||!/^release\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(c.release_ref)||c.release_ref.includes('..')||![c.source_sha,c.source_tree,c.base_sha,c.base_tree,c.backend_revision,c.backend_tree].every(x=>/^[0-9a-f]{40}$/.test(x))||![c.backend_digest,c.production_storefront_digest].every(x=>/^sha256:[0-9a-f]{64}$/.test(x)))fail('unsafe registered workflow identity');
  sourcePaths(c);
  return Object.entries(values).map(([k,v])=>`${k}=${v}\n`).join('');
}
function requireInput(c,i){
  for(const [field,key] of [['sourceSha','source_sha'],['productionBaseSha','base_sha'],['releaseRef','release_ref'],['backendRevision','backend_revision'],['backendDigest','backend_digest'],['productionStorefrontDigest','production_storefront_digest']])if(i[field]!==c[key])fail('contract mismatch: '+field);
  if(!/^[0-9a-f]{40}$/.test(i.trustedPolicySha||''))fail('trusted policy SHA');
}
function sourceFacts(c,repo,post,job,checkExtra=null,contextOpts=undefined){
  if(!Object.hasOwn(JOBS,job))fail('job key');
  if(git(repo,['rev-parse','HEAD'])!==c.source_sha||git(repo,['rev-parse',c.source_sha+'^{tree}'])!==c.source_tree)fail('source checkout/tree');
  if(git(repo,['show','-s','--format=%P',c.source_sha])!==c.base_sha)fail('one genuine parent');
  if(git(repo,['rev-parse',c.base_sha+'^{tree}'])!==c.base_tree)fail('base tree');
  if(git(repo,['rev-parse','refs/remotes/origin/'+c.release_ref])!==c.source_sha)fail('release tip');
  const names=git(repo,['diff','--no-renames','--name-only',c.base_sha,c.source_sha]).split('\n').filter(Boolean);
  const paths=sourcePaths(c);
  if(JSON.stringify(names)!==JSON.stringify(Object.keys(paths)))fail('exact source path map');
  const blob=(ref,file)=>execFileSync('git',['-C',repo,'show',ref+':'+file],{stdio:['ignore','pipe','pipe']});
  for(const [file,p]of Object.entries(paths)){
    const before=git(repo,['ls-tree',c.base_sha,'--',file]),after=git(repo,['ls-tree',c.source_sha,'--',file]);
    if(p.before===null?before!=='':hash(blob(c.base_sha,file))!==p.before)fail('source before blob');
    if(hash(blob(c.source_sha,file))!==p.after)fail('source after blob');
    if(c.paths&&(after!==`${p.mode} blob ${p.after_blob}\t${file}`||(p.before_blob===null?before!=='':before!==`${p.before_mode} blob ${p.before_blob}\t${file}`)))fail('source mode/blob identity');
  }
  for(const [file,sha]of Object.entries(c.protected))if(hash(fs.readFileSync(path.join(repo,file)))!==sha||hash(blob(c.source_sha,file))!==sha)fail('protected blob');
  if(c.paths)for(const [file,sha]of Object.entries(c.protected_before))if(hash(blob(c.base_sha,file))!==sha)fail('protected base blob');
  if(git(repo,['rev-parse',c.backend_revision+':apps/backend'])!==c.backend_tree)fail('retained backend tree');
  // SF-only Git context stays equal to its declared base. The retained live
  // backend is a separate component, authenticated above and by retainedBackend.
  if(c.paths&&git(repo,['rev-parse',c.source_sha+':apps/backend'])!==git(repo,['rev-parse',c.base_sha+':apps/backend']))fail('common source backend differs from declared base');
  const delta=git(repo,['diff','--name-only','HEAD']).split('\n').filter(Boolean);
  const expected=post&&job==='storefront'?Object.keys(c.test_overlays):[];
  if(JSON.stringify(delta.sort())!==JSON.stringify(expected.sort()))fail('working source delta');
  for(const file of delta)if(hash(fs.readFileSync(path.join(repo,file)))!==c.test_overlays[file])fail('unsealed overlay');
  (checkExtra||require(path.join(__dirname,'validate-isolated-storefront-bake.cjs')).assertNoExtraProductionSource)(repo);
  return {sourceSha:c.source_sha,sourceTree:c.source_tree,baseSha:c.base_sha,releaseRef:c.release_ref,backendTree:c.backend_tree,overlay:post&&job==='storefront'?c.test_overlays:{},...testContextFacts(c,repo,post,job,contextOpts)};
}
function trustedContext(c,sha){
  if(process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_SHA!==sha||process.env.GITHUB_REPOSITORY!==REPO)fail('trusted main execution');
  if(git(ROOT,['rev-parse','HEAD'])!==sha||git(ROOT,['diff','--name-only','HEAD']))fail('trusted checkout dirty');
  for(const [file,value]of Object.entries(c.context_hashes))if(hash(fs.readFileSync(path.join(ROOT,file)))!==value)fail('trusted template drift');
  if(hash(fs.readFileSync(path.join(ROOT,c.workflow)))!==c.workflow_sha256)fail('qualification workflow bytes');
}
function retainedBackend(c,policySha){
  // Only the retained backend component is reused. This is NOT old-source CI for the new cart SHA.
  const old=require(path.join(__dirname,'validate-isolated-storefront-bake.cjs'));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wr-cart-backend-proof-'));
  try{
    const checks=old.collectSourceChecks({sourceSha:c.retained_backend_proof.source_sha,trustedPolicySha:policySha,
      runtimePolicy:c.retained_backend_proof.runtime_policy,qualificationRunId:c.retained_backend_proof.run_id,
      sourceChecksFile:path.join(dir,'accepted.json')});
    const found=checks.filter(x=>x.name==='Backend fidelity tests');
    if(found.length!==1||found[0].conclusion!=='success')fail('accepted backend check absent');
    return {origin:'authenticated-retained-backend-only',componentRevision:c.backend_revision,componentTree:c.backend_tree,
      componentDigest:c.backend_digest,qualificationSource:c.retained_backend_proof.source_sha,check:found[0]};
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
function validateSeal(c,seal,input,job,runId,registrySha){
  const expected={schema:1,sourceSha:c.source_sha,sourceTree:c.source_tree,baseSha:c.base_sha,releaseRef:c.release_ref,
    backendTree:c.backend_tree,policySha:input.trustedPolicySha,registrySha,job,runId,attempt:1,postChecks:true,
    context:job==='release-governance'?'trusted-policy':job==='backend-fidelity'?'retained-backend-proof':'candidate-with-sealed-test-context'};
  for(const [key,value]of Object.entries(expected))if(seal[key]!==value)fail('seal mismatch: '+key);
  const overlays=job==='storefront'?c.test_overlays:{};
  if(JSON.stringify(seal.overlay)!==JSON.stringify(overlays))fail('seal overlay');
  const tc=testContextMap(c);
  if(tc){const expectedContext=job==='storefront'?tc:{};if(JSON.stringify(canonicalTestContext(seal.testContext))!==JSON.stringify(expectedContext)||seal.testContextDigest!==hash(JSON.stringify(expectedContext)))fail('seal test context/digest');}
  else if(seal.testContext!==undefined||seal.testContextDigest!==undefined)fail('unexpected test context seal');
  if(job==='backend-fidelity'){
    const proof=seal.retainedBackend;
    if(!proof||proof.origin!=='authenticated-retained-backend-only'||proof.componentRevision!==c.backend_revision||proof.componentDigest!==c.backend_digest||proof.componentTree!==c.backend_tree||proof.qualificationSource!==c.retained_backend_proof.source_sha||proof.check?.source_sha!==c.retained_backend_proof.source_sha||proof.check?.run_id!==c.retained_backend_proof.run_id||proof.check?.conclusion!=='success'||proof.check?.name!=='Backend fidelity tests')fail('retained backend provenance');
  }else if(seal.retainedBackend!==undefined)fail('unexpected backend reuse');
}
function extractArchive(bytes){
  const script=`import io,sys,zipfile,stat
b=sys.stdin.buffer.read(8388609)
assert len(b)<=8388608
with zipfile.ZipFile(io.BytesIO(b)) as z:
 a=z.infolist()
 assert len(a)==1 and a[0].filename=='qualification.json' and not a[0].is_dir()
 assert stat.S_IFMT(a[0].external_attr>>16)!=stat.S_IFLNK and a[0].file_size<=65536
 out=z.read(a[0]); assert len(out)<=65536
 sys.stdout.buffer.write(out)
`;
  return execFileSync('python3',['-c',script],{input:bytes,maxBuffer:65536,timeout:15000,stdio:['pipe','pipe','pipe']});
}
function collectRun(c,input,api,loadArchive,registrySha,extract=extractArchive){
  if(!Number.isSafeInteger(input.runId)||input.runId<=0||String(input.runId)===process.env.GITHUB_RUN_ID)fail('separate qualification run');
  const run=api('actions/runs/'+input.runId);
  if(run.id!==input.runId||run.repository?.full_name!==REPO||run.path!==c.workflow||run.event!=='workflow_dispatch'||run.head_branch!=='main'||run.head_sha!==input.trustedPolicySha||run.run_attempt!==1||run.status!=='completed'||run.conclusion!=='success')fail('qualification run identity');
  const jobs=api(`actions/runs/${input.runId}/attempts/1/jobs?per_page=100`).jobs;
  const artifacts=api(`actions/runs/${input.runId}/artifacts?per_page=100`).artifacts;
  const receipts=[];
  for(const [key,name]of Object.entries(JOBS)){
    const matches=jobs.filter(x=>x.name===name);
    if(matches.length!==1)fail('job membership');const job=matches[0];
    if(job.status!=='completed'||job.conclusion!=='success'||job.head_sha!==input.trustedPolicySha||job.run_id!==input.runId||job.run_attempt!==1)fail('job result');
    const prefix=`https://api.github.com/repos/${REPO}/check-runs/`;
    if(!job.check_run_url?.startsWith(prefix))fail('check URL');
    const id=Number(job.check_run_url.slice(prefix.length));if(!Number.isSafeInteger(id)||id<=0)fail('check ID');
    const check=api('check-runs/'+id);
    if(check.id!==id||check.name!==name||check.app?.slug!=='github-actions'||check.head_sha!==input.trustedPolicySha||check.check_suite?.id!==run.check_suite_id||check.status!=='completed'||check.conclusion!=='success')fail('check membership');
    const artifactName=`source-qualification-${input.runId}-1-${key}`;
    const found=artifacts.filter(x=>x.name===artifactName&&x.expired===false);
    if(found.length!==1||!Number.isSafeInteger(found[0].id)||found[0].id<=0||found[0].workflow_run?.id!==input.runId||found[0].workflow_run?.head_sha!==input.trustedPolicySha||!/^sha256:[0-9a-f]{64}$/.test(found[0].digest||''))fail('seal artifact membership');
    const archive=loadArchive(input.runId,found[0].id);
    if(!Buffer.isBuffer(archive)||archive.length>8*1024*1024||'sha256:'+hash(archive)!==found[0].digest)fail('downloaded artifact archive digest mismatch');
    const bytes=extract(archive);if(bytes.length>65536)fail('seal size');
    const seal=JSON.parse(bytes);validateSeal(c,seal,input,key,input.runId,registrySha);
    receipts.push({name,jobId:job.id,checkId:id,artifactId:found[0].id,artifactDigest:found[0].digest,artifactArchiveDigestVerified:true,sealSha256:hash(bytes),sourceSha:c.source_sha,contextSha:input.trustedPolicySha,origin:seal.context,...(c.test_context?{testContext:seal.testContext,testContextDigest:seal.testContextDigest}:{})});
  }
  return {schema:1,sourceSha:c.source_sha,sourceTree:c.source_tree,policySha:input.trustedPolicySha,runId:input.runId,attempt:1,workflow:c.workflow,receipts};
}
function recognized(c,input){return input.releaseRef===c.release_ref||input.sourceSha===c.source_sha;}
function args(argv){const out={};for(let n=0;n<argv.length;n++){const x=argv[n];if(['--qualification-only','--github-output','--post-checks','--admit-build','--resolve-contract','--install-test-context','--cleanup-test-context'].includes(x))out[x]=true;else{if(!x.startsWith('--')||n+1>=argv.length)fail('CLI');out[x]=argv[++n];}}return out;}
function main(argv){
  const a=args(argv),reg=registry();
  const input={repo:a['--repo'],sourceSha:a['--source-sha'],productionBaseSha:a['--production-base-sha'],releaseRef:a['--release-ref'],backendRevision:a['--backend-revision'],backendDigest:a['--backend-digest'],productionStorefrontDigest:a['--production-storefront-digest'],trustedPolicySha:a['--trusted-policy-sha']};
  const selected=selectContract(reg,input,a['--qualification-key']);
  if(a['--resolve-contract']){
    if(!selected)fail('unregistered workflow source');
    trustedContext(selected.contract,input.trustedPolicySha);
    fs.appendFileSync(a['--environment-output'],workflowEnvironment(selected.id,selected.contract));return;
  }
  if(a['--admit-build']&&!selected){
    fs.writeFileSync(a['--evidence-output'],JSON.stringify({status:'NOT_REGISTERED_EXISTING_GATES_UNCHANGED'})+'\n');return;
  }
  if(!selected||(!a['--admit-build']&&a['--qualification-key']!==selected.id))fail('qualification key');
  const c=selected.contract;
  requireInput(c,input);
  if(a['--cleanup-test-context']){
    if(a['--qualification-job']!=='storefront'||a['--admit-build']||a['--install-test-context'])fail('context cleanup mode');
    const cleaned=contextWorker(c,input.repo,'cleanup',true); // ownership cleanup precedes dirty-source reporting
    trustedContext(c,input.trustedPolicySha);sourceFacts(c,input.repo,false,'storefront');console.log(JSON.stringify({testContextCleanup:cleaned,sourceClean:true}));return;
  }
  trustedContext(c,input.trustedPolicySha);
  if(a['--install-test-context']){
    if(a['--qualification-job']!=='storefront'||a['--admit-build'])fail('context install mode');
    sourceFacts(c,input.repo,false,'storefront');const installed=contextWorker(c,input.repo,'install',true);testContextFacts(c,input.repo,true,'storefront');console.log(JSON.stringify({testContextInstalled:installed}));return;
  }
  const registrySha=hash(fs.readFileSync(path.join(__dirname,'storefront-source-qualifications.json')));
  if(a['--admit-build']){
    sourceFacts(c,input.repo,false,'storefront');
    const api=suffix=>JSON.parse(execFileSync('gh',['api',`repos/${REPO}/${suffix}`],{encoding:'utf8',maxBuffer:2*1024*1024}));
    // Select by authenticated artifact ID, not a second name lookup. Verify ZIP bytes before extraction.
    const load=(_run,id)=>execFileSync('gh',['api',`repos/${REPO}/actions/artifacts/${id}/zip`],{maxBuffer:8*1024*1024,timeout:30000,stdio:['ignore','pipe','pipe']});
    const receipt=collectRun(c,{...input,runId:Number(a['--qualification-run-id'])},api,load,registrySha);
    fs.writeFileSync(a['--evidence-output'],JSON.stringify(receipt,null,2)+'\n');return;
  }
  const job=a['--qualification-job'],facts=sourceFacts(c,input.repo,!!a['--post-checks'],job);
  const attempt=Number(process.env.GITHUB_RUN_ATTEMPT),runId=Number(process.env.GITHUB_RUN_ID);
  if(attempt!==1||!Number.isSafeInteger(runId)||runId<=0)fail('workflow attempt');
  const seal={schema:1,...facts,policySha:input.trustedPolicySha,registrySha,job,runId,attempt,postChecks:!!a['--post-checks'],context:job==='release-governance'?'trusted-policy':job==='backend-fidelity'?'retained-backend-proof':'candidate-with-sealed-test-context'};
  if(job==='backend-fidelity')seal.retainedBackend=retainedBackend(c,input.trustedPolicySha);
  fs.writeFileSync(a['--evidence-output'],JSON.stringify(seal,null,2)+'\n');
  if(a['--github-output'])fs.appendFileSync(process.env.GITHUB_OUTPUT,`reused_gates=${job==='backend-fidelity'}\n`);
}
module.exports={requireInput,sourceFacts,validateSeal,collectRun,extractArchive,recognized,selectContract,sourcePaths,workflowEnvironment,testContextMap,testContextFacts,contextWorker,TEST_CONTEXT_FILE,JOBS};
if(require.main===module){try{main(process.argv.slice(2));}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}}
