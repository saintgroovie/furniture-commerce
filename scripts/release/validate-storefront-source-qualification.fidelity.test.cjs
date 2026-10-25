const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const v=require('./validate-storefront-source-qualification.cjs');
const c=JSON.parse(fs.readFileSync(path.join(__dirname,'storefront-source-qualifications.json'))).qualifications['cart-state-e983-v1'];
const clone=x=>JSON.parse(JSON.stringify(x));let count=0;
const good={sourceSha:c.source_sha,productionBaseSha:c.base_sha,releaseRef:c.release_ref,backendRevision:c.backend_revision,backendDigest:c.backend_digest,productionStorefrontDigest:c.production_storefront_digest,trustedPolicySha:'a'.repeat(40),runId:888};
v.requireInput(c,good);count++;
for(const key of ['sourceSha','productionBaseSha','releaseRef','backendRevision','backendDigest','productionStorefrontDigest','trustedPolicySha']){const x={...good,[key]:'wrong'};assert.throws(()=>v.requireInput(c,x));count++;}
assert(v.recognized(c,good));assert(v.recognized(c,{releaseRef:c.release_ref,sourceSha:'wrong'}));assert(!v.recognized(c,{releaseRef:'release/other',sourceSha:'other'}));count+=3;
function fixture(){
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
const archiveFixtures={"good": "UEsDBBQAAAAAAAAAIQCQX9SnCwAAAAsAAAASAAAAcXVhbGlmaWNhdGlvbi5qc29ueyJvayI6dHJ1ZX1QSwECFAMUAAAAAAAAACEAkF/UpwsAAAALAAAAEgAAAAAAAAAAAAAAgAEAAAAAcXVhbGlmaWNhdGlvbi5qc29uUEsFBgAAAAABAAEAQAAAADsAAAAAAA==", "path": "UEsDBBQAAAAAAAAAIQBDv6ajAgAAAAIAAAAVAAAALi4vcXVhbGlmaWNhdGlvbi5qc29ue31QSwECFAMUAAAAAAAAACEAQ7+mowIAAAACAAAAFQAAAAAAAAAAAAAAgAEAAAAALi4vcXVhbGlmaWNhdGlvbi5qc29uUEsFBgAAAAABAAEAQwAAADUAAAAAAA==", "symlink": "UEsDBBQAAAAAAAAAIQD8L29GBgAAAAYAAAASAAAAcXVhbGlmaWNhdGlvbi5qc29udGFyZ2V0UEsBAhQDFAAAAAAAAAAhAPwvb0YGAAAABgAAABIAAAAAAAAAAAAAAP+hAAAAAHF1YWxpZmljYXRpb24uanNvblBLBQYAAAAAAQABAEAAAAA2AAAAAAA="};
assert.equal(v.extractArchive(Buffer.from(archiveFixtures.good,'base64')).toString(),'{"ok":true}');count++;
for(const key of ['path','symlink']){assert.throws(()=>v.extractArchive(Buffer.from(archiveFixtures[key],'base64')));count++;}
console.log(JSON.stringify({status:'PASS_NEW_QUALIFICATION_VALIDATOR_CASES',cases:count,execution:'synthetic authenticated-metadata model plus static workflow contract only; no old tests, network, Git writes, CI dispatch or applications'},null,2));
