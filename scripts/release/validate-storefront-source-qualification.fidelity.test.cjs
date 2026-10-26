const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const v=require('./validate-storefront-source-qualification.cjs');
const c=JSON.parse(fs.readFileSync(path.join(__dirname,'storefront-source-qualifications.json'))).qualifications['cart-state-e983-v1'];
const clone=x=>JSON.parse(JSON.stringify(x));let count=0;
const good={sourceSha:c.source_sha,productionBaseSha:c.base_sha,releaseRef:c.release_ref,backendRevision:c.backend_revision,backendDigest:c.backend_digest,productionStorefrontDigest:c.production_storefront_digest,trustedPolicySha:'a'.repeat(40),runId:888};
if(process.argv.includes('--retained-backend-context-only')){
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
const temp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'wr-common-contract-'));
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
 passes(()=>v.sourceFacts(x,temp,true,'storefront',()=>{}));
 for(const change of [y=>delete y.paths[Object.keys(y.paths)[0]],y=>y.paths['apps/storefront/src/extra.ts']=clone(Object.values(y.paths)[0]),y=>y.paths[Object.keys(y.paths)[0]].after='0'.repeat(64),y=>y.paths[Object.keys(y.paths)[0]].mode='100755',y=>y.paths[Object.keys(y.paths)[0]].before_blob='0'.repeat(40),y=>y.source_tree='0'.repeat(40),y=>y.base_sha=source,y=>y.backend_tree='0'.repeat(40),y=>y.protected['apps/storefront/src/protected.ts']='0'.repeat(64)]){const y=clone(x);change(y);rejects(()=>v.sourceFacts(y,temp,false,'storefront',()=>{}));}
 write('apps/storefront/src/test-00.ts','dirty\n');rejects(()=>v.sourceFacts(x,temp,false,'storefront',()=>{}));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
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
}

function retainedBackendContextRegression(){
 const {execFileSync}=require('node:child_process');
 const contract=JSON.parse(fs.readFileSync(path.join(__dirname,'storefront-source-qualifications.json'))).qualifications['common-storefront-b461-v1'];
 const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'wr-retained-be-context-'));
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
  v.sourceFacts(x,dir,true,'storefront',()=>{});cases++;
  assert.throws(()=>v.sourceFacts({...x,backend_tree:'0'.repeat(40)},dir,false,'storefront',()=>{}),/retained backend tree/);cases++;
  assert.throws(()=>v.sourceFacts({...x,backend_revision:base},dir,false,'storefront',()=>{}),/retained backend tree/);cases++;
  const same={...x,backend_revision:base,backend_tree:g('rev-parse',base+':apps/backend')};v.sourceFacts(same,dir,false,'storefront',()=>{});cases++;
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
 return {status:'PASS_DISTINCT_SOURCE_BASE_VS_RETAINED_BACKEND_CONTEXT',cases,scope:'new bounded Git fixture only; unchanged historical source/base backend and distinct retained component, wrong retained tree/revision rejected; no app/network/CI'};
}
