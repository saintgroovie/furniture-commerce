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
  if(c.paths===undefined)return {[c.path]:{before:c.before,after:c.after}};
  const names=Object.keys(c.paths);
  if(c.kind!=='common-storefront-b461-v1'||names.length!==79||JSON.stringify(names)!==JSON.stringify([...names].sort()))fail('closed common path map');
  for(const file of names){
    const p=c.paths[file];
    if(!/^apps\/storefront\/(src|public|docs|scripts)\/[A-Za-z0-9._/\[\]()-]+$/.test(file)||file.split('/').includes('..')||!p||!/^([0-9a-f]{64})$/.test(p.after)||!(p.before===null||/^[0-9a-f]{64}$/.test(p.before))||!['100644','100755'].includes(p.mode)||!(/^[0-9a-f]{40}$/.test(p.after_blob))||!(p.before_blob===null||/^[0-9a-f]{40}$/.test(p.before_blob)))fail('common path contract');
  }
  if(Object.keys(c.test_overlays).length)fail('common source must contain sealed tests');
  return c.paths;
}
function workflowEnvironment(id,c){
  const values={POLICY_ID:id,RELEASE_REF:c.release_ref,BASE_SHA:c.base_sha,BE_REVISION:c.backend_revision,BE_DIGEST:c.backend_digest,SF_BASE_DIGEST:c.production_storefront_digest,TEST_OVERLAY_MODE:Object.keys(c.test_overlays).length?'sealed':'none'};
  if(!/^[a-z0-9-]+$/.test(id)||!/^release\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(c.release_ref)||c.release_ref.includes('..')||![c.source_sha,c.source_tree,c.base_sha,c.base_tree,c.backend_revision,c.backend_tree].every(x=>/^[0-9a-f]{40}$/.test(x))||![c.backend_digest,c.production_storefront_digest].every(x=>/^sha256:[0-9a-f]{64}$/.test(x)))fail('unsafe registered workflow identity');
  sourcePaths(c);
  return Object.entries(values).map(([k,v])=>`${k}=${v}\n`).join('');
}
function requireInput(c,i){
  for(const [field,key] of [['sourceSha','source_sha'],['productionBaseSha','base_sha'],['releaseRef','release_ref'],['backendRevision','backend_revision'],['backendDigest','backend_digest'],['productionStorefrontDigest','production_storefront_digest']])if(i[field]!==c[key])fail('contract mismatch: '+field);
  if(!/^[0-9a-f]{40}$/.test(i.trustedPolicySha||''))fail('trusted policy SHA');
}
function sourceFacts(c,repo,post,job,checkExtra=null){
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
  return {sourceSha:c.source_sha,sourceTree:c.source_tree,baseSha:c.base_sha,releaseRef:c.release_ref,backendTree:c.backend_tree,overlay:post&&job==='storefront'?c.test_overlays:{}};
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
    receipts.push({name,jobId:job.id,checkId:id,artifactId:found[0].id,artifactDigest:found[0].digest,artifactArchiveDigestVerified:true,sealSha256:hash(bytes),sourceSha:c.source_sha,contextSha:input.trustedPolicySha,origin:seal.context});
  }
  return {schema:1,sourceSha:c.source_sha,sourceTree:c.source_tree,policySha:input.trustedPolicySha,runId:input.runId,attempt:1,workflow:c.workflow,receipts};
}
function recognized(c,input){return input.releaseRef===c.release_ref||input.sourceSha===c.source_sha;}
function args(argv){const out={};for(let n=0;n<argv.length;n++){const x=argv[n];if(['--qualification-only','--github-output','--post-checks','--admit-build','--resolve-contract'].includes(x))out[x]=true;else{if(!x.startsWith('--')||n+1>=argv.length)fail('CLI');out[x]=argv[++n];}}return out;}
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
  requireInput(c,input);trustedContext(c,input.trustedPolicySha);
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
module.exports={requireInput,sourceFacts,validateSeal,collectRun,extractArchive,recognized,selectContract,sourcePaths,workflowEnvironment,JOBS};
if(require.main===module){try{main(process.argv.slice(2));}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}}
