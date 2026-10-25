"""LOCAL proposal. Hosted-only builder; local mode acquires/probes a sealed tool.
No action runs on import. Fresh review/Git/START permissions are not granted here.
"""
import datetime, hashlib, json, os, pathlib, re, select, shutil, signal, subprocess, sys, time

HERE = pathlib.Path(__file__).resolve().parent
MiB = 1024 * 1024
REPO = 'saintgroovie/furniture-commerce'
RUNTIME_FILES = ['Dockerfile','.dockerignore','package.json','package-lock.json','SDK-INTEGRITY.lock.json','verify-sdk-lock.cjs','offline-probe.cjs']

def read(p): return json.loads(pathlib.Path(p).read_text())
def sha(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def save(p, value):
    p=pathlib.Path(p);q=p.with_suffix('.partial');q.write_text(json.dumps(value,indent=2)+'\n');q.replace(p)
def recipe():
    values={n:sha(HERE/n) for n in RUNTIME_FILES}
    return hashlib.sha256(json.dumps(values,sort_keys=True,separators=(',',':')).encode()).hexdigest()

class UnknownWork(RuntimeError): pass

class Client:
    def __init__(self, argv, env, registry, hard, after_spawn=None):
        self.p=None;self.streams={}
        try:
            self.p=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env)
            registry.append(self)  # FIRST post-spawn operation, protected before logging/setup
            if after_spawn: after_spawn(self)
            self.streams={self.p.stdout:bytearray(),self.p.stderr:bytearray()}
            for stream in self.streams:os.set_blocking(stream.fileno(),False)
        except BaseException:
            if self.p is not None:self.stop(hard)
            raise
    def drain(self):
        for stream,data in self.streams.items():
            while True:
                try:b=os.read(stream.fileno(),65536)
                except BlockingIOError:break
                if not b:break
                data.extend(b)
                if len(data)>8*MiB:raise UnknownWork('bounded client output exceeded')
    def stop(self, hard):
        if self.p.poll() is None:
            try:self.p.kill()
            except ProcessLookupError:pass
            except OSError:return False
        left=hard-time.monotonic()
        if left>0:
            try:self.p.wait(timeout=min(2,left))
            except subprocess.TimeoutExpired:pass
        done=self.p.poll() is not None
        if done:
            for stream in [self.p.stdout,self.p.stderr]:
                try:stream.close()
                except OSError:return False
        return done

class Supervisor:
    def __init__(self, hard, directory, work=None, hosted=False):
        self.hard=hard;self.directory=pathlib.Path(directory);self.directory.mkdir(parents=True,exist_ok=True)
        self.work=hard-2 if work is None else work
        self.clients=[];self.abort=False;self.sequence=0
        self.env={k:v for k,v in os.environ.items() if not k.startswith('DOCKER_')}
        if hosted:
            require_hosted()
            self.env['DOCKER_CONFIG']=os.environ['DOCKER_CONFIG']
    def command_deadline(self, seconds, cleanup=False):
        return min(self.hard-2 if cleanup else self.work,time.monotonic()+seconds)
    def command(self, argv, seconds, check=True, cleanup=False):
        end=self.command_deadline(seconds,cleanup)
        if end<=time.monotonic() or self.abort and not cleanup:raise UnknownWork('expired/aborted; no new work client')
        self.sequence+=1;number=self.sequence
        client=Client(argv,self.env,self.clients,self.hard,
            lambda c:save(self.directory/('client-'+str(number)+'.json'),{'pid':c.p.pid,'parent':os.getpid(),'direct_supervisor_child':True}))
        try:
            while client.p.poll() is None:
                if self.abort and not cleanup or time.monotonic()>=end:raise UnknownWork('client deadline/abort; daemon outcome unknown')
                client.drain();select.select(list(client.streams),[],[],min(.05,max(0,end-time.monotonic())))
            client.drain();out=bytes(client.streams[client.p.stdout]);err=bytes(client.streams[client.p.stderr])
            (self.directory/('command-'+str(number)+'.stdout.private')).write_bytes(out)
            (self.directory/('command-'+str(number)+'.stderr.private')).write_bytes(err)
            if check and client.p.returncode:raise RuntimeError('command failed; see own private log')
            return client.p.returncode,out,err
        finally:
            if not client.stop(self.hard):raise UnknownWork('host client exit unresolved')
    def close(self):
        results=[]
        for c in self.clients:
            try:results.append(c.stop(self.hard))
            except Exception:results.append(False)
        return all(results)

def require_hosted():
    assert os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('GITHUB_REPOSITORY')==REPO
    assert os.environ.get('GITHUB_EVENT_NAME')=='workflow_dispatch' and os.environ.get('GITHUB_REF')=='refs/heads/main'
    assert os.environ.get('GITHUB_RUN_ATTEMPT')=='1' and re.fullmatch(r'[0-9]+',os.environ.get('GITHUB_RUN_ID',''))
    assert sys.platform=='linux' and os.uname().machine in ['aarch64','arm64']
    assert os.environ['EXPECTED_RECIPE_SHA']==recipe()==os.environ['INPUT_RECIPE_SHA']
    expected=pathlib.Path(os.environ['RUNNER_TEMP'])/('wr-tool-docker-config-'+os.environ['GITHUB_RUN_ID']+'-1')
    assert pathlib.Path(os.environ['DOCKER_CONFIG']).resolve()==expected.resolve()
    return 'wr-cart-tool-'+os.environ['GITHUB_RUN_ID']+'-1'

def direct_buildx(supervisor):
    # setup-buildx-action installs into the explicitly job-owned Docker config.
    # Execute the pinned ELF itself; never an unsupervised `docker buildx` wrapper.
    require_hosted()
    binary=pathlib.Path(os.environ['DOCKER_CONFIG'])/'cli-plugins/docker-buildx'
    expected=read(HERE/'HOSTED-BUILD-INFRA.lock.json')['buildx_binary']['sha256']
    assert binary.is_file() and sha(binary)==expected,'missing/substituted Buildx binary; no wrapper fallback'
    rc,out,err=supervisor.command([str(binary),'version'],5)
    assert b'v0.38.1 ' in out
    return str(binary)

def builder_identity(row, state):
    h=row['HostConfig'];infra=read(HERE/'HOSTED-BUILD-INFRA.lock.json')
    stamp=re.sub(r'(\.\d{6})\d+',r'\1',row['Created'].replace('Z','+00:00'))
    created=datetime.datetime.fromisoformat(stamp).timestamp()
    return (row['Name']=='/buildx_buildkit_'+state['builder']+'0' and row['Config']['Image']==infra['buildkit']['image']
        and created>=state['issued_epoch']-2 and h['Privileged'] is True and h['Memory']==768*MiB
        and h['MemorySwap']==768*MiB and h['CpuQuota']==100000 and h['CpuPeriod']==100000
        and h.get('CgroupnsMode')=='private')

def hosted(mode, directory, supervisor):
    name=require_hosted();docker=shutil.which('docker');assert docker
    statefile=directory/'hosted-state.json';container='buildx_buildkit_'+name+'0'
    if mode=='hosted-prepare':
        rc,out,err=supervisor.command([docker,'container','inspect',container],6,False)
        assert rc!=0 and b'No such' in err,'expected own name already exists or daemon unknown'
        save(statefile,{'builder':name,'issued_epoch':time.time(),'recipe_sha':recipe(),'workflow_sha':os.environ['GITHUB_SHA'],'container_id':None})
        return {'status':'OWN_BUILDER_NAME_ABSENT_PREPARED','FREE':True}
    state=read(statefile);assert state['builder']==name and state['recipe_sha']==recipe() and state['workflow_sha']==os.environ['GITHUB_SHA']
    rc,out,err=supervisor.command([docker,'container','inspect',container],6,False)
    if mode=='hosted-cleanup' and rc!=0 and b'No such' in err:return {'status':'OWN_BUILDER_ABSENT','FREE':False,'await_hosted_job_terminal':True}
    assert rc==0;row=json.loads(out)[0];assert builder_identity(row,state),'foreign/conflicting/unbounded builder; do not mutate'
    assert state['container_id'] in [None,row['Id']];state['container_id']=row['Id'];save(statefile,state)
    if mode=='hosted-cleanup':
        supervisor.command([direct_buildx(supervisor),'rm','--force',name],20)
        rc,out,err=supervisor.command([docker,'container','inspect',row['Id']],6,False)
        assert rc!=0 and b'No such' in err
        return {'status':'OWN_BUILDER_REMOVED','FREE':False,'await_hosted_job_terminal':True,'id':row['Id'],'shared_cache_or_foreign_resources_pruned':False}
    tag='ghcr.io/saintgroovie/woodright-cart-probe:tool-'+recipe()[:16]+'-run-'+os.environ['GITHUB_RUN_ID']+'-attempt-1'
    argv=[direct_buildx(supervisor),'build','--builder',name,'--platform','linux/arm64','--file',str(HERE/'Dockerfile'),
        '--resource','memory=768m','--resource','memory-swap=768m','--resource','cpu-quota=100000','--resource','cpu-period=100000',
        '--label','io.woodright.qa.recipe-sha256='+recipe(),'--tag',tag,'--metadata-file',str(directory/'build-metadata.json'),
        '--label','woodright.tag.namespace=compiled-cart-tool',
        '--provenance=mode=max','--push',str(HERE)]
    supervisor.command(argv,600)
    metadata=read(directory/'build-metadata.json');digest=metadata['containerimage.digest'];assert re.fullmatch(r'sha256:[0-9a-f]{64}',digest)
    return {'status':'HOSTED_IMAGE_PUBLISHED_NOT_BROWSER_QUALIFIED','FREE':False,'cleanup_pending':True,'recipe':recipe(),
        'source_sha':os.environ['GITHUB_SHA'],'run':os.environ['GITHUB_RUN_ID'],'image':'ghcr.io/saintgroovie/woodright-cart-probe@'+digest,
        'workflow_sha256':sha(pathlib.Path(os.environ['GITHUB_WORKSPACE'])/'.github/workflows/build-compiled-cart-tool.yml'),
        'tag':tag,'builder_container_id':row['Id'],'provenance_metadata_present':bool(metadata.get('buildx.build.provenance')),
        'signed_attestation_verified':False,'worker_memory_MiB':768,'daemon_memory_MiB':768,'conservative_total_MiB':1536}

def probe_identity(row, cid, permit):
    h=row['HostConfig'];labels=row['Config']['Labels'];n=permit['nonce']
    return (row['Id']==cid and row['Name']=='/wr-tool-probe-'+n and row['Config']['Image']==permit['image']
        and labels.get('woodright.cart-tool-nonce')==n and labels.get('woodright.cart-tool-role')=='offline-probe'
        and row['Config']['User']=='10001:10001' and h['Memory']==1152*MiB and h['MemorySwap']==1152*MiB
        and h['PidsLimit']==128 and h['NanoCpus']==1000000000 and not h['Privileged'] and h['ReadonlyRootfs']
        and h['PidMode'] in ['','private'] and h['IpcMode']=='private' and h.get('Init') is False
        and h['NetworkMode']=='none' and not h.get('PortBindings') and set(h['CapDrop'])=={'ALL'}
        and set(h['SecurityOpt'])=={'no-new-privileges'} and not any(x['Type']=='bind' for x in row['Mounts']))

def load_hosted_receipt(p):
    f=pathlib.Path(p['hosted_receipt_path']).resolve()
    assert f.parent==(HERE/'verified-hosted-artifacts').resolve(), 'receipt outside own verified artifact directory'
    assert sha(f)==p['authenticated_hosted_receipt_sha256']
    r=read(f)
    assert r['status']=='AUTHENTICATED_HOSTED_TOOL_BUILD' and r['immutable_ref']==p['image'] and r['recipe_sha256']==recipe()
    assert re.fullmatch(r'[0-9a-f]{40}',p['hosted_source_sha']) and r['source_sha']==p['hosted_source_sha']
    assert re.fullmatch(r'[0-9a-f]{64}',p['reviewed_workflow_sha256']) and r['workflow_sha256']==p['reviewed_workflow_sha256']
    assert r['event']=='workflow_dispatch' and r['ref']=='main' and r['attempt']==1 and r['conclusion']=='success'
    assert r['workflow_path']=='.github/workflows/build-compiled-cart-tool.yml'
    assert r['API_job_check_artifact_identity_verified'] is True and r['raw_ZIP_digest_verified_before_extract'] is True
    assert r['own_hosted_builder_cleanup_confirmed'] is True and r['hosted_job_terminal'] is True
    return r

def validate_permit(p, now):
    assert p['scope']=='ONE_LOCAL_COMPLETE_TOOL_ACQUIRE_PROBE' and p['recipe_sha256']==recipe()
    assert p['adapter_sha256']==sha(__file__) and re.fullmatch(r'[0-9a-f]{32}',p['nonce'])
    assert re.fullmatch(r'ghcr.io/saintgroovie/woodright-cart-probe@sha256:[0-9a-f]{64}',p['image'])
    assert 0<=now-p['issued_epoch']<=15 and 95<p['hard_epoch']-now<=360 and p['hard_epoch']-p['issued_epoch']<=360
    assert re.fullmatch(r'[0-9a-f]{64}',p['authenticated_hosted_receipt_sha256'])
    r=p['resources'];assert 0<=now-r['at_epoch']<=15 and r['VM_available_bytes']>=2304*MiB and r['host_available_bytes']>=1024*MiB
    assert r['disk_free_bytes']>=8192*MiB and abs(r['docker_clock_offset_ms'])<=250
    load_hosted_receipt(p)

def local_probe(p, directory, s):
    validate_permit(p,time.time());docker='/usr/local/bin/docker';base=[docker,'--host','unix:///Users/leonidmbp/.docker/run/docker.sock']
    assert s.work<=s.hard-35,'local work must leave full cleanup reserve'
    cid=None;uncertain=False;cleanup=[];passed=False;receipt=None;cleaning=False
    def cmd(a, seconds=6,check=True):return s.command(base+a,seconds,check,cleanup=cleaning)
    def inspect():
        row=json.loads(cmd(['container','inspect',cid])[1])[0]
        assert probe_identity(row,cid,p),'identity conflict: no stop/rm';return row
    try:
        assert cmd(['info','--format','{{.ID}}'])[1].decode().strip()==p['engine_ID']
        st=os.statvfs(directory);assert st.f_bavail*st.f_frsize>=8192*MiB
        # One acquisition only; successful client exit is necessary but not enough for qualification.
        uncertain=True;cmd(['image','pull','--platform','linux/arm64',p['image']],240);uncertain=False
        image=json.loads(cmd(['image','inspect',p['image']])[1])[0]
        assert p['image'] in image.get('RepoDigests',[]) and image['Architecture']=='arm64' and image['Os']=='linux' and image['Size']<=4352*MiB
        assert image['Config']['Labels'].get('io.woodright.qa.recipe-sha256')==recipe()
        assert time.monotonic()+70<s.work,'setup and 60s guardian must fit inside work deadline'
        issued=time.time();guard={'nonce':p['nonce'],'issued_epoch':issued,'hard_epoch':issued+60}
        args=['create','--pull=never','--name','wr-tool-probe-'+p['nonce'],'--label','woodright.cart-tool-nonce='+p['nonce'],
            '--label','woodright.cart-tool-role=offline-probe','--network=none','--ipc=private','--init=false','--memory=1152m','--memory-swap=1152m',
            '--cpus=1','--pids-limit=128','--user=10001:10001','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--no-healthcheck',
            '--tmpfs','/tmp:rw,nosuid,nodev,size=134217728','--entrypoint','node',p['image'],'--max-old-space-size=128',
            '/opt/woodright-cart-probe/offline-probe.cjs','guard',json.dumps(guard,separators=(',',':'))]
        uncertain=True;created_id=cmd(args,8)[1].decode().strip();assert re.fullmatch(r'[0-9a-f]{64}',created_id);cid=created_id;uncertain=False
        save(directory/'owned-container.json',{'id':cid,'nonce':p['nonce'],'image':p['image']});inspect()
        rc,raw,err=cmd(['start','--attach',cid],60,False);row=inspect()
        assert not row['State']['Running'] and rc==0 and row['State']['ExitCode']==0 and not row['State']['OOMKilled'] and row['RestartCount']==0
        receipt=json.loads(raw);assert receipt['pass'] is True and receipt['nonce']==p['nonce'] and receipt['privatePID1'] and receipt['withinHardDeadline']
        assert receipt['SDK']=='1.64.1' and receipt['browser']=='156.0.8078.4' and receipt['uid']==10001 and receipt['networkRequests']==0 and receipt['sandboxRequested'] is True
        passed=True
    except UnknownWork:uncertain=True;cleanup.append('unknown host/daemon outcome')
    except Exception as e:cleanup.append(type(e).__name__)
    finally:
        cleaning=True
        if cid:
            try:
                row=inspect()
                if row['State']['Running']:cmd(['stop','--time=2',cid],4)
                assert not inspect()['State']['Running'];cmd(['rm',cid],4)
            except Exception as e:cleanup.append('cleanup '+type(e).__name__)
        try:assert not cmd(['ps','-aq','--no-trunc','--filter','label=woodright.cart-tool-nonce='+p['nonce']])[1].strip()
        except Exception as e:cleanup.append('absence '+type(e).__name__)
    free=not uncertain and not any(x.startswith(('cleanup','absence','unknown')) for x in cleanup) and time.monotonic()<=s.hard
    return {'status':'PASS_COMPLETE_TOOL_QUALIFICATION' if passed and free else 'UNKNOWN_BUSY' if not free else 'FAIL_PROBE_CLEAN',
        'FREE':free,'qualified':passed and free,'image':p['image'],'recipe_sha256':recipe(),'receipt':receipt,'errors':cleanup,
        'no_application_or_production_access':True,'no_prune_or_foreign_resource_mutation':True}

def main(argv):
    if len(argv)<2 or argv[0] not in ['hosted-prepare','hosted-build','hosted-cleanup','local-probe']:
        raise SystemExit('Inert proposal: explicit reviewed mode and controlled permit/directory required')
    mode=argv[0];directory=pathlib.Path(argv[1]).resolve();p=read(argv[2]) if mode=='local-probe' else None
    if p:
        validate_permit(p,time.time());assert directory==(HERE/'runs'/p['nonce']).resolve() and not directory.exists()
        hard=time.monotonic()+p['hard_epoch']-time.time()
    else:
        require_hosted();expected=pathlib.Path(os.environ['RUNNER_TEMP'])/('wr-tool-'+os.environ['GITHUB_RUN_ID']+'-1')
        assert directory==expected.resolve() and (not directory.exists() if mode=='hosted-prepare' else directory.is_dir())
        hard=time.monotonic()+(630 if mode=='hosted-build' else 45)
    s=Supervisor(hard,directory/(mode+'-clients'),work=hard-35 if p else hard-2,hosted=not bool(p))
    for sig in [signal.SIGTERM,signal.SIGHUP,signal.SIGINT]:signal.signal(sig,lambda *_:setattr(s,'abort',True))
    result={'status':'UNKNOWN_BUSY','FREE':False}
    try:result=local_probe(p,directory,s) if p else hosted(mode,directory,s)
    except Exception as e:result={'status':'UNKNOWN_BUSY','FREE':False,'errorClass':type(e).__name__}
    finally:
        closed=s.close();result['all_host_clients_exit_confirmed']=closed
        if not closed:result.update(status='UNKNOWN_BUSY',FREE=False,qualified=False)
        save(directory/(mode+'-result.json'),result)
    print(json.dumps(result));return 0 if result['status'] not in ['UNKNOWN_BUSY','FAIL_PROBE_CLEAN'] else 1

if __name__=='__main__':raise SystemExit(main(sys.argv[1:]))
