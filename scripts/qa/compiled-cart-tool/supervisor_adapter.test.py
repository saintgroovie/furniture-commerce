"""NEW adapter fault tests. Fake Docker only; tiny owned Python children for Popen faults."""
import copy, datetime, json, pathlib, re, subprocess, sys, tempfile, time, unittest
from unittest.mock import patch
import supervisor_adapter as a

def permit():
    now=time.time()
    return {'scope':'ONE_LOCAL_COMPLETE_TOOL_ACQUIRE_PROBE','recipe_sha256':a.recipe(),'adapter_sha256':a.sha(a.__file__),
        'nonce':'a'*32,'image':'ghcr.io/saintgroovie/woodright-cart-probe@sha256:'+'b'*64,'issued_epoch':now,'hard_epoch':now+360,
        'authenticated_hosted_receipt_sha256':'d'*64,'engine_ID':'engine',
        'hosted_receipt_path':str(a.HERE/'verified-hosted-artifacts/UNIT_FIXTURE_NOT_REAL.json'),
        'resources':{'at_epoch':now,'VM_available_bytes':2304*a.MiB,'host_available_bytes':1024*a.MiB,'disk_free_bytes':8192*a.MiB,'docker_clock_offset_ms':0}}

class Fake:
    def __init__(self,p,fault=None):
        self.hard=time.monotonic()+360;self.work=self.hard-35;self.p=p;self.fault=fault;self.calls=[];self.row=None
    def command(self,argv,seconds,check=True,cleanup=False):
        v=argv[3:];self.calls.append(v)
        if v[0]=='info':return 0,b'engine\n',b''
        if v[:2]==['image','pull']:
            if self.fault=='pull':raise a.UnknownWork('injected daemon pull unknown')
            return 0,b'',b''
        if v[:2]==['image','inspect']:
            return 0,json.dumps([{'RepoDigests':[self.p['image']],'Architecture':'arm64','Os':'linux','Size':100,'Config':{'Labels':{'io.woodright.qa.recipe-sha256':a.recipe()}}}]).encode(),b''
        if v[0]=='create':
            self.row={'Id':'c'*64,'Name':'/wr-tool-probe-'+self.p['nonce'],'Created':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'Config':{'Image':self.p['image'],'User':'10001:10001','Labels':{'woodright.cart-tool-nonce':self.p['nonce'],'woodright.cart-tool-role':'offline-probe'}},
                'HostConfig':{'Memory':1152*a.MiB,'MemorySwap':1152*a.MiB,'PidsLimit':128,'NanoCpus':1000000000,'Privileged':False,'ReadonlyRootfs':True,'PidMode':'','IpcMode':'private','Init':False,'NetworkMode':'none','PortBindings':{},'CapDrop':['ALL'],'SecurityOpt':['no-new-privileges']},
                'Mounts':[],'State':{'Running':False,'ExitCode':0,'OOMKilled':False},'RestartCount':0}
            if self.fault=='create':raise a.UnknownWork('created but response lost')
            if self.fault=='foreign':self.row['Config']['Labels']['woodright.cart-tool-nonce']='foreign'
            return 0,('c'*64+'\n').encode(),b''
        if v[:2]==['container','inspect']:return 0,json.dumps([self.row]).encode(),b''
        if v[:2]==['start','--attach']:
            if self.fault=='probe':raise a.UnknownWork('stalled attach')
            return 0,json.dumps({'pass':True,'nonce':self.p['nonce'],'privatePID1':True,'withinHardDeadline':True,'SDK':'1.64.1','browser':'156.0.8078.4','uid':10001,'networkRequests':0,'sandboxRequested':True}).encode(),b''
        if v[0]=='stop':self.row['State']['Running']=False;return 0,b'',b''
        if v[0]=='rm':
            if self.fault=='cleanup':raise a.UnknownWork('rm result unknown')
            self.row=None;return 0,b'',b''
        if v[0]=='ps':return 0,('c'*64 if self.row else '').encode(),b''
        raise AssertionError(v)

class Adapter(unittest.TestCase):
    def test_workflow_job_env_context_availability_and_runtime_bind_order(self):
        file=a.HERE.parents[2]/'.github/workflows/build-compiled-cart-tool.yml'
        raw=subprocess.check_output(['ruby','-rpsych','-rjson','-e','puts JSON.generate(Psych.safe_load(File.read(ARGV[0]), aliases: false))',str(file)])
        doc=json.loads(raw)
        allowed={'github','needs','strategy','matrix','vars','secrets','inputs'}
        def guard(value):
            for job in value['jobs'].values():
                for text in job.get('env',{}).values():
                    for expr in re.findall(r'\$\{\{(.*?)\}\}',str(text)):
                        roots=re.findall(r'(?<![.\w])([A-Za-z_]\w*)\s*\.',expr)
                        self.assertTrue(set(roots)<=allowed,'context unavailable at jobs.<id>.env')
        guard(doc)
        for forbidden in ['runner','env','steps','job']:
            bad=copy.deepcopy(doc);bad['jobs']['build-tool']['env']['UNIT_BAD']='${{ '+forbidden+'.temp }}'
            with self.subTest(context=forbidden),self.assertRaises(AssertionError):guard(bad)
        build=doc['jobs']['build-tool'];self.assertNotIn('TOOL_RUN',build['env']);self.assertNotIn('DOCKER_CONFIG',build['env'])
        names=[s.get('name','') for s in build['steps']];i=names.index('Bind owned paths on the runner')
        self.assertLess(i,names.index('Record exact reviewed recipe and absent own builder name'))
        script=build['steps'][i]['run']
        self.assertIn('TOOL_RUN=$RUNNER_TEMP/wr-tool-$GITHUB_RUN_ID-1',script)
        self.assertIn('DOCKER_CONFIG=$RUNNER_TEMP/wr-tool-docker-config-$GITHUB_RUN_ID-1',script)
        self.assertEqual(script.count('>> "$GITHUB_ENV"'),2)
    def invoke(self,fault=None):
        p=permit();s=Fake(p,fault)
        with tempfile.TemporaryDirectory() as d,patch.object(a,'load_hosted_receipt',return_value={'UNIT_TEST_FAKE_ONLY':True}),patch.object(a.os,'statvfs',return_value=type('Disk',(),{'f_bavail':10000000,'f_frsize':4096})()):r=a.local_probe(p,pathlib.Path(d),s)
        return r,s
    def test_success_own_cleanup_only(self):
        r,s=self.invoke();self.assertTrue(r['qualified']);self.assertTrue(r['FREE']);self.assertEqual(sum(x[:2]==['image','pull'] for x in s.calls),1)
        self.assertEqual([x for x in s.calls if x[0]=='rm'],[['rm','c'*64]])
        self.assertFalse(any('prune' in x for x in s.calls))
    def test_unknown_pull_never_starts_container_or_retries(self):
        r,s=self.invoke('pull');self.assertEqual(r['status'],'UNKNOWN_BUSY');self.assertFalse(r['FREE']);self.assertFalse(any(x[0]=='create' for x in s.calls));self.assertEqual(sum(x[:2]==['image','pull'] for x in s.calls),1)
    def test_unknown_create_no_false_free(self):
        r,s=self.invoke('create');self.assertFalse(r['FREE']);self.assertEqual(r['status'],'UNKNOWN_BUSY');self.assertFalse(any(x[0] in ['rm','stop'] for x in s.calls))
    def test_foreign_identity_never_stopped_or_removed(self):
        r,s=self.invoke('foreign');self.assertFalse(r['FREE']);self.assertFalse(any(x[0] in ['rm','stop'] for x in s.calls))
    def test_cleanup_unknown_not_free(self):
        r,s=self.invoke('cleanup');self.assertFalse(r['FREE']);self.assertFalse(r['qualified'])
    def test_timeout_attach_cleanup_but_unknown_retained(self):
        r,s=self.invoke('probe');self.assertEqual(r['status'],'UNKNOWN_BUSY');self.assertFalse(r['FREE']);self.assertIn(['rm','c'*64],s.calls)
    def test_permit_expiry_and_contract_rejection(self):
        for key,value in [('scope','OTHER'),('recipe_sha256','wrong'),('adapter_sha256','wrong'),('nonce','foreign'),('image','mcr.microsoft.com/playwright:latest'),('issued_epoch',time.time()-60),('hard_epoch',time.time()+400)]:
            p=permit();p[key]=value
            with self.subTest(key=key),self.assertRaises(AssertionError):a.validate_permit(p,time.time())
    def test_builder_worker_scope_identity_and_bounds(self):
        now=time.time();s={'builder':'wr-cart-tool-123-1','issued_epoch':now};infra=a.read(a.HERE/'HOSTED-BUILD-INFRA.lock.json')
        row={'Name':'/buildx_buildkit_wr-cart-tool-123-10','Config':{'Image':infra['buildkit']['image']},'Created':datetime.datetime.fromtimestamp(now,datetime.timezone.utc).isoformat().replace('+00:00','789Z'),
            'HostConfig':{'Privileged':True,'Memory':768*a.MiB,'MemorySwap':768*a.MiB,'CpuQuota':100000,'CpuPeriod':100000,'CgroupnsMode':'private'}}
        self.assertTrue(a.builder_identity(row,s))
        for key,value in [('Memory',0),('CpuQuota',0),('CgroupnsMode','host'),('Privileged',False)]:
            q=copy.deepcopy(row);q['HostConfig'][key]=value;self.assertFalse(a.builder_identity(q,s))
    def test_unbound_receipt_cannot_admit_local_acquisition(self):
        p=permit();p['hosted_receipt_path']='/tmp/unrelated-receipt.json'
        with self.assertRaises(AssertionError):a.load_hosted_receipt(p)
    def test_authenticated_receipt_source_recipe_cleanup_bindings(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(a,'HERE',pathlib.Path(tmp)),patch.object(a,'recipe',return_value='e'*64):
            d=pathlib.Path(tmp)/'verified-hosted-artifacts';d.mkdir();f=d/'UNIT_FIXTURE_NOT_REAL.json';p=permit()
            p.update(hosted_receipt_path=str(f),hosted_source_sha='a'*40,reviewed_workflow_sha256='b'*64)
            r={'status':'AUTHENTICATED_HOSTED_TOOL_BUILD','immutable_ref':p['image'],'recipe_sha256':'e'*64,'source_sha':'a'*40,'workflow_sha256':'b'*64,
                'event':'workflow_dispatch','ref':'main','attempt':1,'conclusion':'success','workflow_path':'.github/workflows/build-compiled-cart-tool.yml',
                'API_job_check_artifact_identity_verified':True,'raw_ZIP_digest_verified_before_extract':True,'own_hosted_builder_cleanup_confirmed':True,'hosted_job_terminal':True}
            a.save(f,r);p['authenticated_hosted_receipt_sha256']=a.sha(f);self.assertEqual(a.load_hosted_receipt(p),r)
            for key,value in [('source_sha','f'*40),('recipe_sha256','f'*64),('immutable_ref','foreign'),('raw_ZIP_digest_verified_before_extract',False),('own_hosted_builder_cleanup_confirmed',False)]:
                bad=copy.deepcopy(r);bad[key]=value;a.save(f,bad);p['authenticated_hosted_receipt_sha256']=a.sha(f)
                with self.subTest(key=key),self.assertRaises(AssertionError):a.load_hosted_receipt(p)
    def test_postspawn_logging_failure_reaps_owned_child(self):
        registry=[];hard=time.monotonic()+2
        def fail(c):self.assertIs(registry[0],c);raise OSError('injected log failure')
        with self.assertRaises(OSError):a.Client([sys.executable,'-c','import time;time.sleep(10)'],None,registry,hard,fail)
        self.assertIsNotNone(registry[0].p.poll())
    def test_stalled_host_client_timeout_killed_and_reaped(self):
        with tempfile.TemporaryDirectory() as d:
            s=a.Supervisor(time.monotonic()+4,d)
            with self.assertRaises(a.UnknownWork):s.command([sys.executable,'-c','import time;time.sleep(10)'],.03)
            self.assertTrue(s.close());self.assertTrue(all(x.p.poll() is not None for x in s.clients))
    def test_abort_blocks_new_work_but_allows_bounded_cleanup(self):
        with tempfile.TemporaryDirectory() as d:
            s=a.Supervisor(time.monotonic()+4,d);s.abort=True
            with self.assertRaises(a.UnknownWork):s.command([sys.executable,'-c','pass'],.1)
            self.assertEqual(len(s.clients),0)
            rc,out,err=s.command([sys.executable,'-c','print("owned cleanup")'],.3,cleanup=True)
            self.assertEqual(rc,0);self.assertIn(b'owned cleanup',out);self.assertTrue(s.close())
    def test_plugin_wrapper_that_would_launch_persistent_child_is_never_spawned(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);plugins=root/'cli-plugins';plugins.mkdir();wrapper=plugins/'docker-buildx'
            marker=root/'CHILD_WOULD_HAVE_STARTED'
            wrapper.write_text('#!'+sys.executable+'\nimport pathlib,subprocess,sys\npathlib.Path('+repr(str(marker))+').touch()\nsubprocess.Popen([sys.executable,"-c","import time;time.sleep(30)"])\n')
            wrapper.chmod(0o755)
            class NeverSpawn:
                def command(self,*args,**kwargs):raise AssertionError('unverified wrapper must never be invoked')
            with patch.object(a,'require_hosted',return_value='unit'),patch.dict(a.os.environ,{'DOCKER_CONFIG':d}):
                with self.assertRaisesRegex(AssertionError,'substituted Buildx'):a.direct_buildx(NeverSpawn())
            self.assertFalse(marker.exists())
    def test_valid_short_permit_stalled_pull_preserves_full_cleanup_reserve(self):
        p=permit();p['hard_epoch']=time.time()+100
        with patch.object(a,'load_hosted_receipt',return_value={'UNIT_ONLY':True}):a.validate_permit(p,time.time())
        clock={'now':0};stopped=[]
        class P:
            pid=12345;done=False
            def poll(self):return 0 if self.done else None
        class Stall:
            def __init__(self,argv,env,registry,hard,after_spawn=None):
                self.p=P();self.streams={};registry.append(self)
                if after_spawn:after_spawn(self)
            def drain(self):clock['now']=65
            def stop(self,hard):stopped.append(hard-clock['now']);self.p.done=True;return True
        with tempfile.TemporaryDirectory() as d,patch.object(a.time,'monotonic',side_effect=lambda:clock['now']):
            s=a.Supervisor(100,d,work=65)
            self.assertEqual(s.command_deadline(240),65)
            with patch.object(a,'Client',Stall),self.assertRaises(a.UnknownWork):s.command(['docker','image','pull','unit-only'],240)
            self.assertEqual(stopped,[35]);self.assertEqual(s.command_deadline(6,cleanup=True),71)

if __name__=='__main__':unittest.main()
