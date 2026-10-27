const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const v=require('./validate-storefront-source-qualification.cjs');
const c=JSON.parse(fs.readFileSync(path.join(__dirname,'storefront-source-qualifications.json'))).qualifications['cart-state-e983-v1'];
const clone=x=>JSON.parse(JSON.stringify(x));let count=0;
const good={sourceSha:c.source_sha,productionBaseSha:c.base_sha,releaseRef:c.release_ref,backendRevision:c.backend_revision,backendDigest:c.backend_digest,productionStorefrontDigest:c.production_storefront_digest,trustedPolicySha:'a'.repeat(40),runId:888};
if(process.argv.includes('--gallery-only')){
 console.log(JSON.stringify(galleryAdmissionRegression(),null,2));
}else if(process.argv.includes('--test-context-only')){
 console.log(JSON.stringify(testContextRegression(),null,2));
}else if(process.argv.includes('--retained-backend-context-only')){
 console.log(JSON.stringify(retainedBackendContextRegression(),null,2));
}else{
v.requireInput(c,good);count++;
for(const key of ['sourceSha','productionBaseSha','releaseRef','backendRevision','backendDigest','productionStorefrontDigest','trustedPolicySha']){const x={...good,[key]:'wrong'};assert.throws(()=>v.requireInput(c,x));count++;}
assert(v.recognized(c,good));assert(v.recognized(c,{releaseRef:c.release_ref,sourceSha:'wrong'}));assert(!v.recognized(c,{releaseRef:'release/other',sourceSha:'other'}));count+=3;
function fixture(contract=c,input=good){
  const c=contract,good=input;
  const policy=good.trustedPolicySha,registrySha='b'.repeat(64),run={id:888,repository:{full_name:'saintgroovie/furniture-commerce'},path:c.workflow,event:'workflow_dispatch',head_branch:'main',head_sha:policy,run_attempt:1,status:'completed',conclusion:'success',check_suite_id:777};
  const jobs=[],artifacts=[],checks={},seals={};
  let id=10;
  for(const [key,name]of Object.entries(v.JOBS)){
    id++;jobs.push({id,name,status:'completed',conclusion:'success',head_sha:policy,run_id:888,run_attempt:1,check_run_url:`https://api.github.com/repos/saintgroovie/furniture-commerce/check-runs/${id}`});
    checks[id]={id,name,app:{slug:'github-actions'},head_sha:policy,check_suite:{id:777},status:'completed',conclusion:'success'};
    const artifactName=`source-qualification-888-1-${key}`;
    artifacts.push({id:id+100,name:artifactName,expired:false,workflow_run:{id:888,head_sha:policy},digest:'sha256:'+'c'.repeat(64)});
    const seal={schema:1,sourceSha:c.source_sha,sourceTree:c.source_tree,baseSha:c.base_sha,releaseRef:c.release_ref,backendTree:c.backend_tree,policySha:policy,registrySha,job:key,runId:888,attempt:1,postChecks:true,context:key==='release-governance'?'trusted-policy':key==='backend-fidelity'?'retained-backend-proof':'candidate-with-sealed-test-context',overlay:key==='storefront'?c.test_overlays:{}};
    if(key==='backend-fidelity')seal.retainedBackend={origin:'authenticated-retained-backend-only',componentRevision:c.backend_revision,componentTree:c.backend_tree,componentDigest:c.backend_digest,qualificationSource:c.retained_backend_proof.source_sha,check:{source_sha:c.retained_backend_proof.source_sha,run_id:c.retained_backend_proof.run_id,name:'Backend fidelity tests',conclusion:'success'}};
    if(c.test_context){seal.testContext=key==='storefront'?v.testContextMap(c):{};seal.testContextDigest=crypto.createHash('sha256').update(JSON.stringify(seal.testContext)).digest('hex');}
    seals[artifactName]=seal;
  }
  const api=key=>key==='actions/runs/888'?run:key.includes('/jobs?')?{jobs}:key.includes('/artifacts?')?{artifacts}:checks[Number(key.split('/').pop())];
  const archives={};
  for(const artifact of artifacts){archives[artifact.id]=Buffer.from(JSON.stringify(seals[artifact.name]));artifact.digest='sha256:'+crypto.createHash('sha256').update(archives[artifact.id]).digest('hex');}
  const load=(_run,id)=>archives[id];
  const extract=bytes=>bytes; // synthetic archive envelope; real ZIP parsing tested separately
  return {run,jobs,artifacts,checks,seals,registrySha,api,load,extract};
}
const collect=f=>v.collectRun(c,good,f.api,f.load,f.registrySha,f.extract);
let f=fixture();assert.equal(collect(f).receipts.length,3);count++;
for(const [key,value]of [['head_sha','wrong'],['head_branch','release/other'],['event','push'],['path','.github/workflows/pr-checks.yml'],['conclusion','failure'],['run_attempt',2],['status','in_progress']]){f=fixture();f.run[key]=value;assert.throws(()=>collect(f));count++;}
for(const mutate of [f=>f.jobs.pop(),f=>f.jobs.push(clone(f.jobs[0])),f=>f.jobs[0].conclusion='failure',f=>f.jobs[0].head_sha='wrong',f=>f.jobs[0].run_id=999,f=>f.checks[11].app.slug='untrusted',f=>f.checks[11].check_suite.id=0,f=>f.artifacts[0].expired=true,f=>f.artifacts[0].workflow_run.id=999,f=>f.artifacts[0].workflow_run.head_sha='wrong',f=>f.artifacts[0].name='other',f=>f.artifacts.push(clone(f.artifacts[0]))]){f=fixture();mutate(f);assert.throws(()=>collect(f));count++;}
const sf='source-qualification-888-1-storefront';
for(const [key,value]of [['sourceSha','wrong'],['sourceTree','wrong'],['policySha','wrong'],['registrySha','wrong'],['runId',999],['attempt',2],['postChecks',false],['context','main-tests-as-candidate'],['overlay',{}]]){f=fixture();f.seals[sf][key]=value;assert.throws(()=>v.validateSeal(c,f.seals[sf],good,'storefront',888,f.registrySha));count++;}
for(const mutate of [p=>p.componentDigest='wrong',p=>p.componentRevision='wrong',p=>p.componentTree='wrong',p=>p.check.source_sha=c.source_sha,p=>p.check.run_id=1]){f=fixture();const seal=f.seals['source-qualification-888-1-backend-fidelity'];mutate(seal.retainedBackend);assert.throws(()=>v.validateSeal(c,seal,good,'backend-fidelity',888,f.registrySha));count++;}
f=fixture();assert.throws(()=>v.collectRun(c,{...good,runId:0},f.api,f.load,f.registrySha,f.extract));count++;
f=fixture();f.load=()=>Buffer.from('download from wrong artifact');let extracted=false;f.extract=()=>{extracted=true;return Buffer.from('{}');};assert.throws(()=>collect(f),/archive digest/);assert.equal(extracted,false);count++;
f=fixture();f.artifacts[0].digest='sha256:'+'0'.repeat(64);assert.throws(()=>collect(f),/archive digest/);count++;
const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/qualify-storefront-source.yml'),'utf8');
for(const name of Object.values(v.JOBS))assert(workflow.includes('name: '+name));
assert(!/packages:\s*write|id-token:\s*write|docker\/build-push-action|docker\/login-action/.test(workflow));
assert(workflow.includes('ref: ${{ inputs.source_sha }}')&&workflow.includes('ref: ${{ github.sha }}'));
assert(workflow.includes('source-qualification-${{ github.run_id }}-${{ github.run_attempt }}-storefront'));
assert(workflow.includes('validate-storefront-source-qualification.fidelity.test.cjs'));
count+=5;
// Event routing is part of the new workflow contract, not an edit to the sealed old PR template.
const {execFileSync}=require('node:child_process');
const parseYaml=text=>JSON.parse(execFileSync('ruby',['-rpsych','-rjson','-e','puts JSON.generate(Psych.safe_load(STDIN.read, permitted_classes: [], permitted_symbols: [], aliases: false))'],{input:text,encoding:'utf8'}));
function routeContract(doc){
 const events=doc.on??doc.true;
 assert.deepEqual(Object.keys(events).sort(),['pull_request','workflow_dispatch']);
 const jobs=doc.jobs, pr=jobs['source-contract-pr'];
 assert.equal(pr.if,"${{ github.event_name == 'pull_request' }}");
 assert.equal(pr.name,'Sealed source validator fidelity');
 assert.equal(pr['timeout-minutes'],5);
 assert.deepEqual(pr.steps,[{uses:'actions/checkout@v4',with:{'persist-credentials':false}},{uses:'actions/setup-node@v4',with:{'node-version':'22'}},{name:'New sealed source validator and event-routing negatives',run:'node scripts/release/validate-storefront-source-qualification.fidelity.test.cjs'}]);
 for(const key of ['qualify-storefront','qualify-backend-fidelity','qualify-release-governance'])assert.equal(jobs[key].if,"${{ github.event_name == 'workflow_dispatch' }}");
 assert.deepEqual(doc.permissions,{contents:'read',actions:'read',checks:'read'});
 assert(!JSON.stringify(pr).includes('secrets.')&&!JSON.stringify(pr).includes('inputs.')&&!JSON.stringify(pr).includes('github.event.pull_request.head'));
}
const routing=parseYaml(workflow);routeContract(routing);count++;
for(const mutate of [x=>delete x.jobs['qualify-storefront'].if,x=>x.jobs['qualify-backend-fidelity'].if="${{ github.event_name == 'pull_request' }}",x=>x.jobs['qualify-release-governance'].if='${{ always() }}',x=>x.jobs['source-contract-pr'].if="${{ github.event_name == 'workflow_dispatch' }}",x=>x.jobs['source-contract-pr'].steps[0].with['persist-credentials']=true,x=>x.jobs['source-contract-pr'].steps[2].run='curl ${{ secrets.TOKEN }}',x=>x.permissions.contents='write']){const q=clone(routing);mutate(q);assert.throws(()=>routeContract(q));count++;}
assert.equal(crypto.createHash('sha256').update(workflow).digest('hex'),c.workflow_sha256);count++;
assert.equal(c.context_hashes['.github/workflows/pr-checks.yml'],'9d67c7ebd33db880a2298f363ddea0a829fdf38921947f6b238f9363df1691c6');count++;
const archiveFixtures={"good": "UEsDBBQAAAAAAAAAIQCQX9SnCwAAAAsAAAASAAAAcXVhbGlmaWNhdGlvbi5qc29ueyJvayI6dHJ1ZX1QSwECFAMUAAAAAAAAACEAkF/UpwsAAAALAAAAEgAAAAAAAAAAAAAAgAEAAAAAcXVhbGlmaWNhdGlvbi5qc29uUEsFBgAAAAABAAEAQAAAADsAAAAAAA==", "path": "UEsDBBQAAAAAAAAAIQBDv6ajAgAAAAIAAAAVAAAALi4vcXVhbGlmaWNhdGlvbi5qc29ue31QSwECFAMUAAAAAAAAACEAQ7+mowIAAAACAAAAFQAAAAAAAAAAAAAAgAEAAAAALi4vcXVhbGlmaWNhdGlvbi5qc29uUEsFBgAAAAABAAEAQwAAADUAAAAAAA==", "symlink": "UEsDBBQAAAAAAAAAIQD8L29GBgAAAAYAAAASAAAAcXVhbGlmaWNhdGlvbi5qc29udGFyZ2V0UEsBAhQDFAAAAAAAAAAhAPwvb0YGAAAABgAAABIAAAAAAAAAAAAAAP+hAAAAAHF1YWxpZmljYXRpb24uanNvblBLBQYAAAAAAQABAEAAAAA2AAAAAAA="};
assert.equal(v.extractArchive(Buffer.from(archiveFixtures.good,'base64')).toString(),'{"ok":true}');count++;
for(const key of ['path','symlink']){assert.throws(()=>v.extractArchive(Buffer.from(archiveFixtures[key],'base64')));count++;}
console.log(JSON.stringify({status:'PASS_NEW_QUALIFICATION_VALIDATOR_CASES',cases:count,execution:'shared validator regressions affected by the new contract; authenticated-metadata model and static workflow, no network/CI dispatch/applications'},null,2));

// Only the changed common contract / shared selector / artifact consumer seams.
const reg=JSON.parse(fs.readFileSync(path.join(__dirname,'storefront-source-qualifications.json')));
const common=reg.qualifications['common-storefront-b461-v1'];
const commonInput={...good,sourceSha:common.source_sha,productionBaseSha:common.base_sha,releaseRef:common.release_ref,productionStorefrontDigest:common.production_storefront_digest};
let commonCases=0;
const passes=fn=>{fn();commonCases++;};
const rejects=fn=>{assert.throws(fn);commonCases++;};
passes(()=>assert.equal(v.selectContract(reg,commonInput).id,'common-storefront-b461-v1'));
passes(()=>assert.equal(v.selectContract(reg,good).id,'cart-state-e983-v1'));
passes(()=>assert.equal(v.selectContract(reg,{sourceSha:'0'.repeat(40),releaseRef:'release/unregistered'}),null));
for(const x of [{...commonInput,sourceSha:c.source_sha},{...commonInput,releaseRef:c.release_ref},{...commonInput,sourceSha:'0'.repeat(40)},{...commonInput,releaseRef:'release/other'}])rejects(()=>v.selectContract(reg,x));
rejects(()=>v.selectContract({...reg,qualifications:{...reg.qualifications,duplicate:clone(common)}},commonInput));
rejects(()=>v.selectContract(reg,commonInput,'cart-state-e983-v1'));
passes(()=>v.requireInput(common,commonInput));
passes(()=>assert.equal(Object.keys(v.sourcePaths(common)).length,79));
passes(()=>assert(v.workflowEnvironment('common-storefront-b461-v1',common).includes('TEST_OVERLAY_MODE=none\n')));
passes(()=>assert(v.workflowEnvironment('cart-state-e983-v1',c).includes('TEST_OVERLAY_MODE=sealed\n')));
for(const change of [x=>x.release_ref+='\nINJECT=1',x=>x.test_overlays.inject='x',x=>delete x.paths[Object.keys(x.paths)[0]],x=>x.paths['apps/backend/src/evil.ts']=clone(Object.values(x.paths)[0])]){const x=clone(common);change(x);rejects(()=>v.workflowEnvironment('common-storefront-b461-v1',x));}
const cf=fixture(common,commonInput);
passes(()=>assert.equal(v.collectRun(common,commonInput,cf.api,cf.load,cf.registrySha,cf.extract).receipts.length,3));
for(const [field,value]of [['sourceSha',c.source_sha],['sourceTree',c.source_tree],['baseSha',c.base_sha],['releaseRef',c.release_ref],['policySha','f'.repeat(40)],['registrySha','f'.repeat(64)],['runId',889],['attempt',2],['job','release-governance'],['overlay',c.test_overlays]]){
 const seal=clone(cf.seals[sf]);seal[field]=value;rejects(()=>v.validateSeal(common,seal,commonInput,'storefront',888,cf.registrySha));
}
passes(()=>assert.equal(cf.seals[sf].overlay&&Object.keys(cf.seals[sf].overlay).length,0));
rejects(()=>v.validateSeal(common,fixture().seals[sf],commonInput,'storefront',888,cf.registrySha));
// A real, disposable Git repository exercises full map and mode checks; no application runs.
const temp=fs.realpathSync(fs.mkdtempSync(path.join(require('node:os').tmpdir(),'wr-common-contract-')));
const markerTemp=fs.realpathSync(fs.mkdtempSync(path.join(require('node:os').tmpdir(),'wr-common-owner-')));
try{
 const admissionOutput=path.join(temp,'admission.json');
 const validator=path.join(__dirname,'validate-storefront-source-qualification.cjs');
 // Exercise the same CLI invoked by build-staging: a partial known identity
 // must fail before trusted context / network, never write NOT_REGISTERED.
 for(const args of [
  ['--source-sha',common.source_sha,'--release-ref','release/wrong'],
  ['--source-sha','0'.repeat(40),'--release-ref',common.release_ref],
  ['--source-sha',c.source_sha,'--release-ref',common.release_ref]
 ]){rejects(()=>execFileSync(process.execPath,[validator,'--admit-build',...args,'--evidence-output',admissionOutput],{stdio:'pipe'}));assert.equal(fs.existsSync(admissionOutput),false);}
 const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_AUTHOR_NAME:'Contract fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'Contract fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'};
 const g=(...args)=>execFileSync('git',['-C',temp,...args],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const write=(file,text)=>{const p=path.join(temp,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);};
 g('init','-q');write('apps/backend/src/retained.ts','retained\n');write('apps/storefront/src/protected.ts','protected\n');
 for(let n=0;n<79;n++)write(`apps/storefront/src/test-${String(n).padStart(2,'0')}.ts`,'before\n');
 g('add','--','apps');g('commit','-qm','baseline');const base=g('rev-parse','HEAD');
 for(let n=0;n<79;n++)write(`apps/storefront/src/test-${String(n).padStart(2,'0')}.ts`,'after\n');
 g('add','--','apps/storefront/src');g('commit','-qm','sealed common fixture');const source=g('rev-parse','HEAD');
 const x={...clone(common),source_sha:source,source_tree:g('rev-parse','HEAD^{tree}'),base_sha:base,base_tree:g('rev-parse',base+'^{tree}'),backend_revision:base,backend_tree:g('rev-parse',base+':apps/backend'),protected:{'apps/storefront/src/protected.ts':crypto.createHash('sha256').update('protected\n').digest('hex')},paths:{}};
 x.protected_before={...x.protected};
 for(const file of g('diff','--name-only',base,source).split('\n')){
  const ls=g('ls-tree',source,'--',file).split(/\s+/),before=g('ls-tree',base,'--',file).split(/\s+/);
  x.paths[file]={before:crypto.createHash('sha256').update('before\n').digest('hex'),after:crypto.createHash('sha256').update('after\n').digest('hex'),mode:ls[0],before_mode:before[0],after_blob:ls[2],before_blob:before[2]};
 }
 g('update-ref','refs/remotes/origin/'+x.release_ref,source);
 passes(()=>v.sourceFacts(x,temp,false,'storefront',()=>{}));
 const ctx={runnerTemp:markerTemp,identity:{runId:888,attempt:1,job:'storefront',sourceSha:x.source_sha,policySha:good.trustedPolicySha}};
 v.contextWorker(x,temp,'install',true,ctx);
 passes(()=>v.sourceFacts(x,temp,true,'storefront',()=>{},ctx));
 v.contextWorker(x,temp,'cleanup',true,ctx);
 for(const change of [y=>delete y.paths[Object.keys(y.paths)[0]],y=>y.paths['apps/storefront/src/extra.ts']=clone(Object.values(y.paths)[0]),y=>y.paths[Object.keys(y.paths)[0]].after='0'.repeat(64),y=>y.paths[Object.keys(y.paths)[0]].mode='100755',y=>y.paths[Object.keys(y.paths)[0]].before_blob='0'.repeat(40),y=>y.source_tree='0'.repeat(40),y=>y.base_sha=source,y=>y.backend_tree='0'.repeat(40),y=>y.protected['apps/storefront/src/protected.ts']='0'.repeat(64)]){const y=clone(x);change(y);rejects(()=>v.sourceFacts(y,temp,false,'storefront',()=>{}));}
 write('apps/storefront/src/test-00.ts','dirty\n');rejects(()=>v.sourceFacts(x,temp,false,'storefront',()=>{}));
}finally{fs.rmSync(temp,{recursive:true,force:true});fs.rmSync(markerTemp,{recursive:true,force:true});}
// Existing build consumer must call this registry-aware admission before publication.
const build=parseYaml(fs.readFileSync(path.join(__dirname,'../../.github/workflows/build-staging-images.yml'),'utf8'));
const buildSteps=Object.values(build.jobs).flatMap(x=>x.steps||[]);
const admission=buildSteps.findIndex(s=>s.name==='Admit sealed non-runtime storefront source qualification');
passes(()=>{assert(admission>=0);assert.equal(buildSteps[admission].if,"${{ inputs.release_mode == 'isolated_storefront' && inputs.storefront_runtime_policy == '' }}");assert(buildSteps[admission].run.includes('trusted-governance/scripts/release/validate-storefront-source-qualification.cjs'));assert(buildSteps[admission].run.includes('--admit-build'));assert(buildSteps[admission].run.includes('--qualification-run-id'));const login=buildSteps.findIndex(s=>s.uses?.startsWith('docker/login-action'));const publish=buildSteps.findIndex(s=>s.uses?.startsWith('docker/build-push-action'));assert(login>admission);assert(publish>admission);assert(buildSteps[admission].run.includes('set -euo pipefail'));});
passes(()=>{for(const key of ['qualify-storefront','qualify-backend-fidelity','qualify-release-governance']){
 const steps=routing.jobs[key].steps,resolvers=steps.filter(s=>s.name==='Resolve closed registered source inputs from trusted policy');assert.equal(resolvers.length,1);assert(resolvers[0].run.includes('--resolve-contract'));assert(resolvers[0].run.includes('--environment-output "${GITHUB_ENV}"'));assert(!steps.some(s=>s.env?.POLICY_ID||s.env?.RELEASE_REF||s.env?.BASE_SHA));
 }const overlay=routing.jobs['qualify-storefront'].steps.find(s=>s.name==='Use registry sealed cache test overlay only when required');assert.equal(overlay.if,"${{ env.TEST_OVERLAY_MODE == 'sealed' }}");});
console.log(JSON.stringify({status:'PASS_COMMON_CLOSED_CONTRACT_AND_ADMISSION_SEAMS',cases:commonCases,scope:'new contract and shared selector/seal regression; isolated Git fixture only, no apps/network/CI/build/runtime'},null,2));
console.log(JSON.stringify(retainedBackendContextRegression(),null,2));
console.log(JSON.stringify(testContextRegression(),null,2));
console.log(JSON.stringify(galleryAdmissionRegression(),null,2));
}

function retainedBackendContextRegression(){
 const {execFileSync}=require('node:child_process');
 const contract=JSON.parse(fs.readFileSync(path.join(__dirname,'storefront-source-qualifications.json'))).qualifications['common-storefront-b461-v1'];
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(require('node:os').tmpdir(),'wr-retained-be-context-')));
 const markerDir=fs.realpathSync(fs.mkdtempSync(path.join(require('node:os').tmpdir(),'wr-retained-context-owner-')));
 let cases=0;
 try{
  const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_AUTHOR_NAME:'Context fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'Context fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'};
  const g=(...args)=>execFileSync('git',['-C',dir,...args],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const write=(f,s)=>{const p=path.join(dir,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);};
  const h=s=>crypto.createHash('sha256').update(s).digest('hex');
  g('init','-q');write('apps/backend/src/identity.ts','retained backend component\n');
  for(let n=0;n<79;n++)write(`apps/storefront/src/context-${String(n).padStart(2,'0')}.ts`,'before\n');
  g('add','--','apps');g('commit','-qm','retained component');const retained=g('rev-parse','HEAD');
  write('apps/backend/src/identity.ts','historical storefront branch context\n');g('add','--','apps/backend');g('commit','-qm','historical storefront base');const base=g('rev-parse','HEAD');
  for(let n=0;n<79;n++)write(`apps/storefront/src/context-${String(n).padStart(2,'0')}.ts`,'after\n');
  g('add','--','apps/storefront');g('commit','-qm','exact storefront only');const source=g('rev-parse','HEAD');
  const x={...clone(contract),source_sha:source,source_tree:g('rev-parse','HEAD^{tree}'),base_sha:base,base_tree:g('rev-parse',base+'^{tree}'),backend_revision:retained,backend_tree:g('rev-parse',retained+':apps/backend'),protected:{},protected_before:{},paths:{}};
  for(const file of g('diff','--name-only',base,source).split('\n')){
   const a=g('ls-tree',source,'--',file).split(/\s+/),b=g('ls-tree',base,'--',file).split(/\s+/);
   x.paths[file]={before:h('before\n'),after:h('after\n'),mode:a[0],before_mode:b[0],after_blob:a[2],before_blob:b[2]};
  }
  g('update-ref','refs/remotes/origin/'+x.release_ref,source);
  assert.notEqual(g('rev-parse',source+':apps/backend'),x.backend_tree);
  assert.equal(g('rev-parse',source+':apps/backend'),g('rev-parse',base+':apps/backend'));
  v.sourceFacts(x,dir,false,'storefront',()=>{});cases++;
  const opts={runnerTemp:markerDir,identity:{runId:889,attempt:1,job:'storefront',sourceSha:x.source_sha,policySha:good.trustedPolicySha}};
  v.contextWorker(x,dir,'install',true,opts);
  v.sourceFacts(x,dir,true,'storefront',()=>{},opts);cases++;
  v.contextWorker(x,dir,'cleanup',true,opts);
  assert.throws(()=>v.sourceFacts({...x,backend_tree:'0'.repeat(40)},dir,false,'storefront',()=>{}),/retained backend tree/);cases++;
  assert.throws(()=>v.sourceFacts({...x,backend_revision:base},dir,false,'storefront',()=>{}),/retained backend tree/);cases++;
  const same={...x,backend_revision:base,backend_tree:g('rev-parse',base+':apps/backend')};v.sourceFacts(same,dir,false,'storefront',()=>{});cases++;
 }finally{fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(markerDir,{recursive:true,force:true});}
 return {status:'PASS_DISTINCT_SOURCE_BASE_VS_RETAINED_BACKEND_CONTEXT',cases,scope:'new bounded Git fixture only; unchanged historical source/base backend and distinct retained component, wrong retained tree/revision rejected; no app/network/CI'};
}

function testContextRegression(){
 const {execFileSync}=require('node:child_process');
 const reg=JSON.parse(fs.readFileSync(path.join(__dirname,'storefront-source-qualifications.json'))),common=reg.qualifications['common-storefront-b461-v1'];
 const file=v.TEST_CONTEXT_FILE,body=fs.readFileSync(path.join(__dirname,'../..',file)),map=v.testContextMap(common),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
 let cases=0;const pass=fn=>{fn();cases++;},reject=fn=>{assert.throws(fn);cases++;};
 function sandbox(fn){
  const root=fs.realpathSync(fs.mkdtempSync(path.join(require('node:os').tmpdir(),'wr-test-context-'))),repo=path.join(root,'repo'),runnerTemp=path.join(root,'runner');
  fs.mkdirSync(repo);fs.mkdirSync(runnerTemp);execFileSync('git',['init','-q',repo],{stdio:'pipe'});
  const target=path.join(repo,file),opts={runnerTemp,identity:{runId:1234,attempt:1,job:'storefront',sourceSha:common.source_sha,policySha:'a'.repeat(40)}};
  try{fn({root,repo,runnerTemp,target,opts});}finally{fs.rmSync(root,{recursive:true,force:true});}
 }
 pass(()=>assert.deepEqual(common.test_overlays,{}));
 pass(()=>assert.equal(v.testContextMap(c),null));
 pass(()=>assert(v.workflowEnvironment('common-storefront-b461-v1',common).includes('TEST_CONTEXT_MODE=sealed\n')));
 pass(()=>assert(v.workflowEnvironment('cart-state-e983-v1',c).includes('TEST_CONTEXT_MODE=none\n')));
 sandbox(f=>{
  pass(()=>assert.deepEqual(v.testContextFacts(common,f.repo,false,'storefront').testContext,{}));
  reject(()=>v.testContextFacts(common,f.repo,true,'storefront',f.opts));
  pass(()=>assert(v.contextWorker(common,f.repo,'install',true,f.opts).owned));
  pass(()=>assert.equal(sha(fs.readFileSync(f.target)),map[file].sha256));
  pass(()=>assert.deepEqual(v.testContextFacts(common,f.repo,true,'storefront',f.opts).testContext,map));
  reject(()=>v.contextWorker(common,f.repo,'install',true,f.opts));
  reject(()=>v.testContextFacts(common,f.repo,false,'storefront')); // same precheck used by build admission
  reject(()=>v.testContextFacts(common,f.repo,true,'backend-fidelity'));
  reject(()=>v.testContextFacts(common,f.repo,true,'release-governance'));
  for(const change of [x=>x.runId++,x=>x.policySha='b'.repeat(40),x=>x.sourceSha='b'.repeat(40),x=>x.attempt=2]){
   const o=clone(f.opts);change(o.identity);reject(()=>v.contextWorker(common,f.repo,'cleanup',true,o));assert(fs.existsSync(f.target));
  }
  fs.appendFileSync(f.target,'\n// changed by fixture\n');reject(()=>v.testContextFacts(common,f.repo,true,'storefront',f.opts));reject(()=>v.contextWorker(common,f.repo,'cleanup',true,f.opts));assert(fs.existsSync(f.target));
  fs.writeFileSync(f.target,body);pass(()=>assert(v.contextWorker(common,f.repo,'cleanup',true,f.opts).clean));
  pass(()=>{assert(!fs.existsSync(f.target));assert(!fs.existsSync(path.join(f.repo,'apps')));assert.equal(fs.readdirSync(f.runnerTemp).length,0);});
  pass(()=>assert(v.contextWorker(common,f.repo,'cleanup',true,f.opts).already_absent));
 });
 sandbox(f=>{const marker=path.join(f.runnerTemp,'woodright-source-context-1234-1-storefront.json');fs.writeFileSync(marker,'foreign',{mode:0o600});reject(()=>v.contextWorker(common,f.repo,'install',true,f.opts));assert.equal(fs.readFileSync(marker,'utf8'),'foreign');assert(!fs.existsSync(f.target));});
 sandbox(f=>{v.contextWorker(common,f.repo,'install',true,f.opts);const marker=path.join(f.runnerTemp,'woodright-source-context-1234-1-storefront.json'),replacement=path.join(f.root,'marker-copy');fs.writeFileSync(replacement,fs.readFileSync(marker),{mode:0o600});fs.renameSync(replacement,marker);reject(()=>v.contextWorker(common,f.repo,'cleanup',true,f.opts));assert(fs.existsSync(f.target));assert(fs.existsSync(marker));});
 sandbox(f=>{v.contextWorker(common,f.repo,'install',true,f.opts);const marker=path.join(f.runnerTemp,'woodright-source-context-1234-1-storefront.json');fs.linkSync(marker,path.join(f.root,'marker-hardlink'));reject(()=>v.contextWorker(common,f.repo,'cleanup',true,f.opts));assert(fs.existsSync(f.target));});
 for(const mutate of [x=>{x.test_context[file].sha256='0'.repeat(64);x.context_hashes[file]='0'.repeat(64);},x=>x.test_context[file].blob='0'.repeat(40),x=>x.test_context[file].mode='100755',x=>x.test_context['apps/workspace/src/server/extra.mjs']=clone(x.test_context[file])])sandbox(f=>{
  const bad=clone(common);mutate(bad);reject(()=>v.contextWorker(bad,f.repo,'install',true,f.opts));assert(!fs.existsSync(f.target));
 });
 sandbox(f=>{fs.mkdirSync(path.dirname(f.target),{recursive:true});fs.writeFileSync(f.target,body);reject(()=>v.contextWorker(common,f.repo,'install',true,f.opts));reject(()=>v.contextWorker(common,f.repo,'cleanup',true,f.opts));assert.equal(sha(fs.readFileSync(f.target)),sha(body));});
 sandbox(f=>{const outside=path.join(f.root,'outside');fs.mkdirSync(outside);fs.mkdirSync(path.join(f.repo,'apps'));fs.symlinkSync(outside,path.join(f.repo,'apps/workspace'),'dir');reject(()=>v.contextWorker(common,f.repo,'install',true,f.opts));assert.equal(fs.readdirSync(outside).length,0);});
 sandbox(f=>{fs.mkdirSync(path.dirname(f.target),{recursive:true});const other=path.join(f.root,'foreign.mjs');fs.writeFileSync(other,body);fs.symlinkSync(other,f.target);reject(()=>v.contextWorker(common,f.repo,'install',true,f.opts));reject(()=>v.contextWorker(common,f.repo,'cleanup',true,f.opts));assert(fs.lstatSync(f.target).isSymbolicLink());assert.equal(sha(fs.readFileSync(other)),sha(body));});
 sandbox(f=>{v.contextWorker(common,f.repo,'install',true,f.opts);const before=fs.statSync(f.target).ino;const replacement=path.join(f.root,'replacement.mjs');fs.writeFileSync(replacement,body);assert.notEqual(fs.statSync(replacement).ino,before);fs.renameSync(replacement,f.target);reject(()=>v.contextWorker(common,f.repo,'cleanup',true,f.opts));assert(fs.existsSync(f.target));});
 sandbox(f=>{v.contextWorker(common,f.repo,'install',true,f.opts);fs.chmodSync(f.target,0o640);reject(()=>v.testContextFacts(common,f.repo,true,'storefront',f.opts));reject(()=>v.contextWorker(common,f.repo,'cleanup',true,f.opts));assert(fs.existsSync(f.target));});
 sandbox(f=>{v.contextWorker(common,f.repo,'install',true,f.opts);const parent=path.dirname(f.target);fs.chmodSync(parent,0o750);reject(()=>v.contextWorker(common,f.repo,'cleanup',true,f.opts));assert(fs.existsSync(parent));assert.equal(fs.statSync(parent).mode&0o777,0o750);});
 sandbox(f=>{v.contextWorker(common,f.repo,'install',true,f.opts);const extra=path.join(path.dirname(f.target),'foreign.mjs');fs.writeFileSync(extra,'foreign');reject(()=>v.testContextFacts(common,f.repo,true,'storefront',f.opts));reject(()=>v.contextWorker(common,f.repo,'cleanup',true,f.opts));assert.equal(fs.readFileSync(extra,'utf8'),'foreign');});
 sandbox(f=>{
  // Partial creation must remove its file/directories if the owner marker cannot be written.
  assert.notEqual(process.getuid(),0,'permission fixture requires ordinary runner user');fs.chmodSync(f.runnerTemp,0o500);
  try{reject(()=>v.contextWorker(common,f.repo,'install',true,f.opts));assert(!fs.existsSync(f.target));assert(!fs.existsSync(path.join(f.repo,'apps')));}finally{fs.chmodSync(f.runnerTemp,0o700);}
 });
 const input={sourceSha:common.source_sha,productionBaseSha:common.base_sha,releaseRef:common.release_ref,backendRevision:common.backend_revision,backendDigest:common.backend_digest,productionStorefrontDigest:common.production_storefront_digest,trustedPolicySha:'a'.repeat(40),runId:888};
 const registrySha='b'.repeat(64),run={id:888,repository:{full_name:'saintgroovie/furniture-commerce'},path:common.workflow,event:'workflow_dispatch',head_branch:'main',head_sha:input.trustedPolicySha,run_attempt:1,status:'completed',conclusion:'success',check_suite_id:777};
 function admission(){
  const jobs=[],artifacts=[],checks={},archives={};let n=10;
  for(const [job,name]of Object.entries(v.JOBS)){
   const id=++n,context=job==='storefront'?map:{};
   jobs.push({id,name,status:'completed',conclusion:'success',head_sha:input.trustedPolicySha,run_id:888,run_attempt:1,check_run_url:`https://api.github.com/repos/saintgroovie/furniture-commerce/check-runs/${id}`});
   checks[id]={id,name,app:{slug:'github-actions'},head_sha:input.trustedPolicySha,check_suite:{id:777},status:'completed',conclusion:'success'};
   const seal={schema:1,sourceSha:common.source_sha,sourceTree:common.source_tree,baseSha:common.base_sha,releaseRef:common.release_ref,backendTree:common.backend_tree,policySha:input.trustedPolicySha,registrySha,job,runId:888,attempt:1,postChecks:true,context:job==='storefront'?'candidate-with-sealed-test-context':job==='backend-fidelity'?'retained-backend-proof':'trusted-policy',overlay:{},testContext:context,testContextDigest:sha(JSON.stringify(context))};
   if(job==='backend-fidelity')seal.retainedBackend={origin:'authenticated-retained-backend-only',componentRevision:common.backend_revision,componentDigest:common.backend_digest,componentTree:common.backend_tree,qualificationSource:common.retained_backend_proof.source_sha,check:{source_sha:common.retained_backend_proof.source_sha,run_id:common.retained_backend_proof.run_id,name:'Backend fidelity tests',conclusion:'success'}};
   const bytes=Buffer.from(JSON.stringify(seal));archives[id+100]=bytes;artifacts.push({id:id+100,name:`source-qualification-888-1-${job}`,expired:false,workflow_run:{id:888,head_sha:input.trustedPolicySha},digest:'sha256:'+sha(bytes)});
  }
  const api=p=>p==='actions/runs/888'?run:p.includes('/jobs?')?{jobs}:p.includes('/artifacts?')?{artifacts}:checks[Number(p.split('/').pop())];
  return {api,artifacts,archives,load:(_run,id)=>archives[id]};
 }
 const collect=f=>v.collectRun(common,input,f.api,f.load,registrySha,b=>b); // mock ZIP envelope, real digest + consumer
 pass(()=>assert.equal(collect(admission()).receipts[0].testContextDigest,sha(JSON.stringify(map))));
 const reordered=admission(),reorderedSeal=JSON.parse(reordered.archives[111]);reorderedSeal.testContext[file]={mode:map[file].mode,sha256:map[file].sha256,blob:map[file].blob};reordered.archives[111]=Buffer.from(JSON.stringify(reorderedSeal));reordered.artifacts[0].digest='sha256:'+sha(reordered.archives[111]);pass(()=>assert.equal(collect(reordered).receipts.length,3));
 for(const change of [x=>delete x.testContext,x=>x.testContext={},x=>x.testContextDigest='0'.repeat(64),x=>x.testContext[file].sha256='0'.repeat(64),x=>x.testContext['apps/workspace/src/server/extra.mjs']=clone(x.testContext[file]),x=>x.sourceSha='0'.repeat(40),x=>x.policySha='0'.repeat(40),x=>x.runId=889,x=>x.attempt=2]){
  const a=admission(),seal=JSON.parse(a.archives[111]);change(seal);a.archives[111]=Buffer.from(JSON.stringify(seal));a.artifacts[0].digest='sha256:'+sha(a.archives[111]);reject(()=>collect(a));
 }
 const mismatch=admission();mismatch.archives[111]=Buffer.from('wrong ZIP bytes');reject(()=>collect(mismatch));
 const legacy=admission(),legacySeal=JSON.parse(legacy.archives[111]);Object.assign(legacySeal,{sourceSha:c.source_sha,sourceTree:c.source_tree,baseSha:c.base_sha,releaseRef:c.release_ref,overlay:c.test_overlays});reject(()=>v.validateSeal(c,legacySeal,input,'storefront',888,registrySha));delete legacySeal.testContext;delete legacySeal.testContextDigest;pass(()=>v.validateSeal(c,legacySeal,input,'storefront',888,registrySha));
 const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/qualify-storefront-source.yml'),'utf8');
 pass(()=>{assert.equal((workflow.match(/--install-test-context/g)||[]).length,1);assert.equal((workflow.match(/--cleanup-test-context/g)||[]).length,1);assert(workflow.includes("always() && env.TEST_CONTEXT_MODE == 'sealed'"));});
 return {status:'PASS_CLOSED_OWNED_TEST_CONTEXT_AND_BUILD_CONSUMER',cases,scope:'new FD/ownership/cleanup/context-digest consumer cases only; synthetic API/ZIP envelope, actual archive parser reused; no old128/191/native/schema/network/install/server'};
}

function galleryAdmissionRegression(){
 const {execFileSync}=require('node:child_process');
 const os=require('node:os'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 const reg=JSON.parse(fs.readFileSync(path.join(__dirname,'storefront-source-qualifications.json')));
 const key='gallery-storefront-01f-exact7-v1',gallery=reg.qualifications[key];
 const names=[
  'apps/storefront/src/app/product/[id]/page.tsx',
  'apps/storefront/src/components/pdp-hinge-side-media-switcher.tsx',
  'apps/storefront/src/lib/data/media-near-dup-collapse.json',
  'apps/storefront/src/lib/oliver-desk-variants.fidelity.test.ts',
  'apps/storefront/src/lib/oliver-desk-variants.ts',
  'apps/storefront/src/lib/pdp-hinge-side-media.fidelity.test.ts',
  'apps/storefront/src/lib/pdp-hinge-side-media.ts',
 ];
 const input={sourceSha:gallery.source_sha,productionBaseSha:gallery.base_sha,releaseRef:gallery.release_ref,backendRevision:gallery.backend_revision,backendDigest:gallery.backend_digest,productionStorefrontDigest:gallery.production_storefront_digest,trustedPolicySha:'a'.repeat(40)};
 let cases=0;const pass=fn=>{fn();cases++;},reject=fn=>{assert.throws(fn);cases++;};
 pass(()=>{assert.equal(gallery.source_sha,'b173e0392b3c901fb1aad04c3eb1759364dee3cb');assert.equal(gallery.source_tree,'c3662ce496f7b772b6a3a596438a557db4dfcee0');assert.equal(gallery.base_sha,'01f0110921527aef5fde9db18e69dabee9a423cd');assert.equal(gallery.base_tree,'eec34c015dd96faef39fb4478131cb2e4b2e780e');assert.equal(gallery.release_ref,'release/gallery-exact7-20261027');});
 pass(()=>assert.deepEqual(Object.keys(v.sourcePaths(gallery)),names));
 pass(()=>assert.equal(v.selectContract(reg,input,key).id,key));
 pass(()=>v.requireInput(gallery,input));
 pass(()=>assert.deepEqual(v.testContextMap(gallery),v.testContextMap(reg.qualifications['common-storefront-b461-v1'])));
 for(const mutate of [x=>x.kind='unregistered-gallery',x=>x.test_context={},x=>x.context_hashes[v.TEST_CONTEXT_FILE]='0'.repeat(64),x=>x.test_context['apps/workspace/src/extra.mjs']=clone(Object.values(x.test_context)[0])]){const changed=clone(gallery);mutate(changed);reject(()=>v.testContextMap(changed));}
 pass(()=>assert(v.workflowEnvironment(key,gallery).includes('POLICY_ID='+key+'\n')));
 pass(()=>assert.deepEqual(gallery.protected,reg.qualifications['common-storefront-b461-v1'].protected));
 pass(()=>{assert.equal(Object.keys(v.sourcePaths(reg.qualifications['common-storefront-b461-v1'])).length,79);assert.equal(gallery.backend_digest,reg.qualifications['common-storefront-b461-v1'].backend_digest);assert.deepEqual(gallery.test_context,reg.qualifications['common-storefront-b461-v1'].test_context);});
 for(const mutate of [x=>delete x.paths,x=>delete x.kind,x=>x.kind='unregistered-gallery',x=>delete x.paths[names[0]],x=>x.paths['apps/backend/src/injected.ts']=clone(x.paths[names[0]]),x=>{const e=x.paths[names[0]];delete x.paths[names[0]];x.paths['apps/storefront/src/unregistered.ts']=e;},x=>x.paths=Object.fromEntries(Object.entries(x.paths).reverse()),x=>x.kind='common-storefront-b461-v1',x=>x.test_overlays[names[0]]='a'.repeat(64)]){
  const changed=clone(gallery);mutate(changed);reject(()=>v.workflowEnvironment(key,changed));
 }
 for(const field of ['sourceSha','productionBaseSha','releaseRef','backendRevision','backendDigest','productionStorefrontDigest','trustedPolicySha'])reject(()=>v.requireInput(gallery,{...input,[field]:'wrong'}));
 for(const mismatch of [{...input,sourceSha:gallery.base_sha},{...input,releaseRef:'release/common-storefront-20261026'}])reject(()=>v.selectContract(reg,mismatch,key));
 // Full candidate evidence must belong to this source, never the parent common run.
 const context=v.testContextMap(gallery),seal={schema:1,sourceSha:gallery.source_sha,sourceTree:gallery.source_tree,baseSha:gallery.base_sha,releaseRef:gallery.release_ref,backendTree:gallery.backend_tree,policySha:input.trustedPolicySha,registrySha:'b'.repeat(64),job:'storefront',runId:999,attempt:1,postChecks:true,context:'candidate-with-sealed-test-context',overlay:{},testContext:context,testContextDigest:hash(JSON.stringify(context))};
 pass(()=>v.validateSeal(gallery,seal,input,'storefront',999,'b'.repeat(64)));
 for(const mutate of [x=>x.sourceSha=gallery.base_sha,x=>x.sourceTree=gallery.base_tree,x=>x.baseSha=reg.qualifications['common-storefront-b461-v1'].base_sha,x=>x.releaseRef='release/common-storefront-20261026',x=>x.testContext={},x=>x.testContextDigest='0'.repeat(64)]){const changed=clone(seal);mutate(changed);reject(()=>v.validateSeal(gallery,changed,input,'storefront',999,'b'.repeat(64)));}
 // Real isolated Git fixture covers seven-file modes/blobs, parent and clean-tree CAS.
 const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'wr-gallery-contract-')));
 const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_AUTHOR_NAME:'Gallery fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'Gallery fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'};
 const g=(...args)=>execFileSync('git',['-C',temp,...args],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const put=(file,text)=>{const p=path.join(temp,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);};
 const newFiles=new Set([names[1],names[5],names[6]]);
 try{
  g('init','-q');put('apps/backend/src/retained.ts','retained\n');put('apps/storefront/src/protected.ts','protected\n');
  for(const file of names)if(!newFiles.has(file))put(file,'before\n');
  g('add','--','apps');g('commit','-qm','gallery fixture baseline');const base=g('rev-parse','HEAD');
  for(const file of names)put(file,'after\n');g('add','--','apps/storefront');g('commit','-qm','exact seven gallery fixture');const source=g('rev-parse','HEAD');
  const contract={...clone(gallery),source_sha:source,source_tree:g('rev-parse','HEAD^{tree}'),base_sha:base,base_tree:g('rev-parse',base+'^{tree}'),backend_revision:base,backend_tree:g('rev-parse',base+':apps/backend'),protected:{'apps/storefront/src/protected.ts':hash('protected\n')},paths:{}};
  delete contract.test_context;contract.protected_before={...contract.protected};
  for(const file of names){const after=g('ls-tree',source,'--',file).split(/\s+/),before=g('ls-tree',base,'--',file).split(/\s+/);contract.paths[file]={before:newFiles.has(file)?null:hash('before\n'),after:hash('after\n'),mode:after[0],after_blob:after[2],before_mode:newFiles.has(file)?null:before[0],before_blob:newFiles.has(file)?null:before[2]};}
  g('update-ref','refs/remotes/origin/'+contract.release_ref,source);
  pass(()=>v.sourceFacts(contract,temp,false,'storefront',()=>{}));
  for(const mutate of [x=>x.source_sha=base,x=>x.source_tree='0'.repeat(40),x=>x.base_sha=source,x=>x.base_tree='0'.repeat(40),x=>x.release_ref='release/wrong',x=>x.backend_tree='0'.repeat(40),x=>x.paths[names[0]].before='0'.repeat(64),x=>x.paths[names[0]].after='0'.repeat(64),x=>x.paths[names[0]].before_blob='0'.repeat(40),x=>x.paths[names[0]].after_blob='0'.repeat(40),x=>x.paths[names[0]].mode='100755',x=>x.protected['apps/storefront/src/protected.ts']='0'.repeat(64)]){const changed=clone(contract);mutate(changed);reject(()=>v.sourceFacts(changed,temp,false,'storefront',()=>{}));}
  put(names[0],'dirty\n');reject(()=>v.sourceFacts(contract,temp,false,'storefront',()=>{}));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
 return {status:'PASS_NEW_GALLERY_EXACT7_ADMISSION_CASES',cases,scope:'Only new gallery admission; isolated Git fixtures, no app/schema/network/CI/build/runtime or old suite rerun'};
}
