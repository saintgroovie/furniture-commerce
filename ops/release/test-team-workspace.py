import importlib.util
from pathlib import Path
import unittest
import tempfile
import json
from unittest.mock import patch
import io
import urllib.error

spec=importlib.util.spec_from_file_location('workspace',Path(__file__).with_name('deploy-team-workspace.py'))
workspace=importlib.util.module_from_spec(spec);spec.loader.exec_module(workspace)

class WorkspaceBoundary(unittest.TestCase):
    def baseline_fixture(self, root):
        route=root/'router.json';route.write_bytes(b'route')
        (root/'compose.json').write_bytes(b'compose')
        existing={'container_id':'current-container','source':'b'*40,'image':'ghcr.io/saintgroovie/woodright-workspace@sha256:'+'a'*64}
        packet={'schema':'woodright-team-workspace-release-v1','state':'deployed_not_verified','source':existing['source'],'workspace':existing,'url':'https://woodright.ru/os','route_sha256':workspace.digest(b'route'),'compose_sha256':workspace.digest(b'compose')}
        (root/'PENDING_RELEASE.json').write_text(json.dumps(packet))
        return existing,route,packet

    def test_pending_deployment_can_be_updated_only_from_its_exact_runtime(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);existing,route,packet=self.baseline_fixture(root)
            baseline=workspace.workspace_baseline(existing,existing['source'],existing['image'],root,route)
            self.assertEqual(baseline['state'],'deployed_not_verified')
            for field,value in [('container_id','replacement'),('source','c'*40),('image','different-image')]:
                with self.subTest(field=field),self.assertRaises(ValueError):
                    workspace.workspace_baseline({**existing,field:value},existing['source'],existing['image'],root,route)

    def test_stale_pending_metadata_cannot_fall_back_to_an_older_verified_record(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);existing,route,packet=self.baseline_fixture(root)
            (root/'ACTIVE_RELEASE.json').write_text(json.dumps({**packet,'state':'done_deployed_and_verified'}))
            packet['workspace']={**existing,'container_id':'stale'}
            (root/'PENDING_RELEASE.json').write_text(json.dumps(packet))
            with self.assertRaises(ValueError):workspace.workspace_baseline(existing,existing['source'],existing['image'],root,route)

    def test_pending_baseline_refuses_modified_files_and_symlink_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);existing,route,packet=self.baseline_fixture(root)
            for target in [route,root/'compose.json']:
                original=target.read_bytes();target.write_bytes(b'changed')
                with self.assertRaises(ValueError):workspace.workspace_baseline(existing,existing['source'],existing['image'],root,route)
                target.write_bytes(original)
            metadata=root/'PENDING_RELEASE.json';metadata.rename(root/'saved.json');metadata.symlink_to(root/'saved.json')
            with self.assertRaises(ValueError):workspace.workspace_baseline(existing,existing['source'],existing['image'],root,route)

    def test_isolated_authenticated_runtime_without_database_secret_or_public_port(self):
        d=workspace.compose_document('ghcr.io/saintgroovie/woodright-workspace@sha256:'+'a'*64,'b'*40)
        service=d['services']['workspace']
        self.assertEqual(service['ports'],['127.0.0.1:44320:4320'])
        self.assertNotIn('DATABASE_URL',service['environment'])
        self.assertNotIn('WOODRIGHT_WORKSPACE_SESSION_SECRET',service['environment'])
        self.assertEqual(service['environment']['WOODRIGHT_WORKSPACE_ORIGIN'],'https://os.woodright.ru')
        self.assertEqual(service['environment']['MEDUSA_BACKEND_INTERNAL_URL'],'http://woodright-public-production-backend:9000')
        self.assertEqual(service['environment']['WOODRIGHT_EXPECTED_DATABASE_IDENTITY'],'public_production_db')
        self.assertEqual(set(d['services']),{'workspace'})
        self.assertTrue(all(n['external'] for n in d['networks'].values()))
        self.assertTrue(service['read_only'])
    def test_root_host_and_exact_legacy_entry_do_not_route_old_api_to_authenticated_handlers(self):
        document=workspace.router_document()['http'];routers=document['routers']
        for scheme in ['http','https']:
            new=routers['wr-team-os-'+scheme]
            self.assertEqual(new['rule'],'Host(`os.woodright.ru`)')
            fallback=routers['wr-team-os-legacy-'+scheme]
            self.assertIn('Host(`woodright.ru`)',fallback['rule'])
            self.assertIn('Path(`/os`)',fallback['rule'])
            self.assertIn('PathPrefix(`/os/`)',fallback['rule'])
            self.assertNotIn('Method(',fallback['rule'])
            self.assertIn('wr-team-os-legacy-refused',fallback['middlewares'])
            entry=routers['wr-team-os-legacy-entry-'+scheme]
            self.assertIn('Host(`woodright.ru`)',entry['rule'])
            self.assertIn('(Path(`/os`) || Path(`/os/`))',entry['rule'])
            self.assertIn('(Method(`GET`) || Method(`HEAD`))',entry['rule'])
            self.assertNotIn('PathPrefix',entry['rule'])
            self.assertEqual(entry['priority'],220)
            self.assertGreater(entry['priority'],fallback['priority'])
        self.assertEqual(document['middlewares']['wr-team-os-legacy-entry']['replacePath']['path'],'/api/legacy-entry')
        self.assertEqual(document['middlewares']['wr-team-os-legacy-refused']['replacePath']['path'],'/api/legacy-refused')
        self.assertIn('wr-team-os-legacy-entry',routers['wr-team-os-legacy-entry-https']['middlewares'])
        self.assertEqual(routers['wr-team-os-legacy-entry-http']['middlewares'],['redirect-to-https'])
        for name,router in routers.items():
            self.assertEqual(router['service'],'wr-team-os')
            self.assertNotIn('api.woodright',router['rule'])
            if name.endswith('https'):
                self.assertEqual(router['tls']['certResolver'],'letsencrypt')
                self.assertIn('wr-team-os-private',router['middlewares'])
                self.assertIn('wr-team-os-rate',router['middlewares'])
        self.assertEqual(document['services']['wr-team-os']['loadBalancer']['servers'],[{'url':'http://woodright-team-workspace:4320'}])
        with self.assertRaises(ValueError): workspace.compose_document('ghcr.io/saintgroovie/woodright-workspace:latest','b'*40)

    def test_health_targets_are_limited_to_the_two_exact_release_addresses(self):
        self.assertEqual(workspace.local_health_base('https://woodright.ru/os'),'http://127.0.0.1:44320/os')
        self.assertEqual(workspace.local_health_base('https://os.woodright.ru/'),'http://127.0.0.1:44320')
        for invalid in [None,'','https://evil.example/','http://os.woodright.ru/','https://os.woodright.ru','https://woodright.ru/os/','https://os.woodright.ru:443/','https://user@os.woodright.ru/','http://127.0.0.1:44320']:
            with self.subTest(url=invalid),self.assertRaises(ValueError):workspace.local_health_base(invalid)

    def test_cas_baseline_keeps_its_own_old_or_new_rollback_address(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);existing,route,packet=self.baseline_fixture(root)
            for url,local in [('https://woodright.ru/os','http://127.0.0.1:44320/os'),('https://os.woodright.ru/','http://127.0.0.1:44320')]:
                packet['url']=url;(root/'PENDING_RELEASE.json').write_text(json.dumps(packet))
                baseline=workspace.workspace_baseline(existing,existing['source'],existing['image'],root,route)
                self.assertEqual(baseline['url'],url)
                self.assertEqual(workspace.local_health_base(baseline['url']),local)
                self.assertEqual(json.loads(baseline['raw'])['url'],url)
            for invalid in [None,'https://outside.example/','https://woodright.ru/']:
                packet['url']=invalid;(root/'PENDING_RELEASE.json').write_text(json.dumps(packet))
                with self.subTest(url=invalid),self.assertRaises(ValueError):workspace.workspace_baseline(existing,existing['source'],existing['image'],root,route)

    def test_public_dom_evidence_accepts_only_the_exact_new_host_root_and_hash_routes(self):
        for valid in ['https://os.woodright.ru','https://os.woodright.ru/','https://os.woodright.ru/#/requests/request-1']:
            self.assertTrue(workspace.dom_url_allowed(valid),valid)
        for invalid in [None,'','https://woodright.ru/os#/today','http://os.woodright.ru/','https://os.woodright.ru:443/','https://user@os.woodright.ru/','https://os.woodright.ru.attacker.example/','https://os.woodright.ru/os','https://os.woodright.ru/api/live/data','https://os.woodright.ru/?return=https://outside.example']:
            self.assertFalse(workspace.dom_url_allowed(invalid),repr(invalid))

    def test_http_checker_uses_root_or_snapshot_prefix_without_network(self):
        class Reply(io.BytesIO):
            status=200
            headers={'X-Woodright-Workspace-Source-Sha':'b'*40,'X-Robots-Tag':'noindex'}
        for base in ['http://127.0.0.1:44320','http://127.0.0.1:44320/os','https://os.woodright.ru/','https://woodright.ru/os']:
            seen=[]
            def open_fixture(url,timeout):
                seen.append(url)
                if url.endswith('/api/live/data'):
                    raise urllib.error.HTTPError(url,401,'Unauthorized',{},None)
                return Reply(b'{"connected":true,"writeEnabled":true}')
            with self.subTest(base=base),patch.object(workspace.urllib.request,'urlopen',side_effect=open_fixture):
                workspace.check_http(base,'b'*40)
                prefix=base.rstrip('/')
                self.assertEqual(seen,[prefix+'/api/live/status',prefix+'/',prefix+'/api/live/data'])

class WorkspaceRollbackContract(unittest.TestCase):
    def fixture(self, directory):
        root=Path(directory)
        operation=root/'operation-20261024T000000Z-deadbeef';operation.mkdir()
        old={'container_id':'old-cid','source':'b'*40,'image':'ghcr.io/saintgroovie/woodright-workspace@sha256:'+'a'*64}
        backend_source='c'*40
        compose=workspace.compose_document(old['image'],backend_source)
        compose['services']['workspace']['environment']['WOODRIGHT_WORKSPACE_ORIGIN']='https://woodright.ru'
        compose_raw=workspace.json_bytes(compose);route_raw=b'{"old":"route"}'
        prior={'schema':'woodright-team-workspace-release-v1','state':'done_deployed_and_verified','workspace':old,'source':old['source'],'url':workspace.LEGACY_URL,'compose_sha256':workspace.digest(compose_raw),'route_sha256':workspace.digest(route_raw)}
        prior_raw=workspace.json_bytes(prior)
        owner_raw=b'{"owner":"deploy-team-workspace.py","source":"old"}'
        metadata={'PENDING_RELEASE.json':prior_raw,'ACTIVE_RELEASE.json':prior_raw,'ACTIVE_OWNER.json':owner_raw}
        baseline={'state':prior['state'],'url':prior['url'],'metadata_path':str(root/'PENDING_RELEASE.json'),'metadata_sha256':workspace.digest(prior_raw)}
        intent=b'{"approved":"test-only"}';build=b'{"source":"test-only"}'
        for name,raw in [('compose.before.json',compose_raw),('route.before.json',route_raw),('baseline.json',workspace.json_bytes(baseline)),('owner-intent.json',intent),('build-manifest.json',build)]:
            (operation/name).write_bytes(raw)
        for name,raw in metadata.items():(operation/(name+'.before')).write_bytes(raw)
        checksum_raw=workspace.json_bytes({name:workspace.digest(raw) for name,raw in metadata.items()})
        (operation/'metadata-checksums.json').write_bytes(checksum_raw)
        packet={'state':'deployed_not_verified','url':workspace.URL,'rollback_evidence':str(operation),'owner_authorization_sha256':workspace.digest(intent),'build_manifest_sha256':workspace.digest(build),'rollback_metadata_sha256':workspace.digest(checksum_raw),'previous_workspace':old,'previous_release_metadata_sha256':workspace.digest(prior_raw)}
        return {'root':root,'operation':operation,'old':old,'prior':prior,'baseline':baseline,'packet':packet,'compose':compose_raw,'route':route_raw,'metadata':metadata,'backend_source':backend_source}

    def snapshot(self, fixture):
        return workspace.rollback_snapshot(fixture['packet'],fixture['root'])

    def test_valid_snapshot_retains_exact_old_identity_and_backend_pin(self):
        with tempfile.TemporaryDirectory() as directory:
            f=self.fixture(directory);snapshot=self.snapshot(f)
            self.assertEqual(snapshot['existing'],f['old'])
            self.assertEqual(snapshot['baseline']['url'],workspace.LEGACY_URL)
            self.assertEqual(snapshot['compose'],f['compose'])
            self.assertEqual(snapshot['route'],f['route'])
            self.assertEqual(snapshot['metadata'],f['metadata'])
            self.assertEqual(snapshot['backend_source'],f['backend_source'])

    def test_finalized_wrong_host_and_unowned_operation_snapshots_are_refused(self):
        for mutation in ['finalized','wrong-host','outside','bad-name','symlink-operation']:
            with self.subTest(mutation=mutation),tempfile.TemporaryDirectory() as directory:
                f=self.fixture(directory)
                if mutation=='finalized':f['packet']['state']='done_deployed_and_verified'
                elif mutation=='wrong-host':f['packet']['url']=workspace.LEGACY_URL
                elif mutation=='outside':f['packet']['rollback_evidence']=str(f['root'].parent/f['operation'].name)
                elif mutation=='bad-name':
                    wrong=f['root']/'arbitrary';f['operation'].rename(wrong);f['packet']['rollback_evidence']=str(wrong)
                else:
                    original=f['operation'];saved=f['root']/'saved';original.rename(saved);original.symlink_to(saved,target_is_directory=True)
                with self.assertRaises(ValueError):self.snapshot(f)

    def test_selected_snapshot_provenance_checksums_and_symlinks_are_refused(self):
        for name in ['owner-intent.json','build-manifest.json','metadata-checksums.json','PENDING_RELEASE.json.before','compose.before.json','route.before.json']:
            for mutation in ['tamper','symlink','missing']:
                with self.subTest(file=name,mutation=mutation),tempfile.TemporaryDirectory() as directory:
                    f=self.fixture(directory);target=f['operation']/name
                    if mutation=='tamper':target.write_bytes(target.read_bytes()+b' ')
                    elif mutation=='missing':target.unlink()
                    else:
                        saved=f['operation']/(name+'.saved');target.rename(saved);target.symlink_to(saved)
                    with self.assertRaises((ValueError,FileNotFoundError)):self.snapshot(f)

    def test_each_canonical_metadata_snapshot_is_checksum_bound(self):
        for name in ['ACTIVE_RELEASE.json','ACTIVE_OWNER.json']:
            with self.subTest(file=name),tempfile.TemporaryDirectory() as directory:
                f=self.fixture(directory)
                target=f['operation']/(name+'.before');target.write_bytes(b'{"tampered":true}')
                with self.assertRaises(ValueError):self.snapshot(f)

    def test_metadata_absence_and_complete_manifest_keyset_are_bound(self):
        for mutation in ['valid-absent','unexpected-file','missing-file','incomplete-manifest']:
            with self.subTest(mutation=mutation),tempfile.TemporaryDirectory() as directory:
                f=self.fixture(directory);manifest=f['operation']/'metadata-checksums.json'
                checksums=json.loads(manifest.read_bytes())
                target=f['operation']/'ACTIVE_OWNER.json.before'
                if mutation in ['valid-absent','unexpected-file']:
                    checksums['ACTIVE_OWNER.json']=None;target.unlink()
                elif mutation=='missing-file':target.unlink()
                else:del checksums['ACTIVE_OWNER.json']
                raw=workspace.json_bytes(checksums);manifest.write_bytes(raw)
                f['packet']['rollback_metadata_sha256']=workspace.digest(raw)
                if mutation=='unexpected-file':target.write_bytes(b'{"injected":true}')
                if mutation=='valid-absent':self.assertIsNone(self.snapshot(f)['metadata']['ACTIVE_OWNER.json'])
                else:
                    with self.assertRaises(ValueError):self.snapshot(f)

    def test_previous_metadata_identity_and_address_cannot_be_relabelled(self):
        for mutation in ['schema','state','workspace','source','url','metadata-outside']:
            with self.subTest(mutation=mutation),tempfile.TemporaryDirectory() as directory:
                f=self.fixture(directory)
                if mutation=='metadata-outside':
                    f['baseline']['metadata_path']=str(f['root'].parent/'PENDING_RELEASE.json')
                elif mutation=='url':f['baseline']['url']='https://outside.example/'
                else:
                    changes={'schema':'wrong','state':'rolled_back','workspace':{**f['old'],'container_id':'someone-else'},'source':'d'*40}
                    f['prior'][mutation]=changes[mutation]
                    raw=workspace.json_bytes(f['prior'])
                    (f['operation']/'PENDING_RELEASE.json.before').write_bytes(raw)
                    f['baseline']['metadata_sha256']=workspace.digest(raw)
                    f['packet']['previous_release_metadata_sha256']=workspace.digest(raw)
                (f['operation']/'baseline.json').write_bytes(workspace.json_bytes(f['baseline']))
                with self.assertRaises(ValueError):self.snapshot(f)

    def exercise_restore(self, f, public_failure=False, wrong_identity=False, local_failure=False):
        root=f['root'];route=root/'live-route.json'
        route.write_bytes(b'new-route');(root/'compose.json').write_bytes(b'new-compose')
        for name in f['metadata']:(root/name).write_bytes(b'{"new":true}')
        restored={**f['old'],'container_id':'restored-new-cid'}
        if wrong_identity:restored['image']='ghcr.io/saintgroovie/woodright-workspace@sha256:'+'f'*64
        events=[]
        def command_fixture(argv,log):
            self.assertEqual(argv,['fixture-compose','up','-d','--no-deps','--pull','never','workspace'])
            self.assertEqual(log,f['operation']/'rollback.log')
            self.assertEqual(route.read_bytes(),f['route'])
            self.assertEqual((root/'compose.json').read_bytes(),f['compose'])
            events.append('workspace-recreate')
        def http_fixture(base,source):
            self.assertEqual(source,f['old']['source'])
            if base.startswith('http://127.0.0.1:'):
                self.assertEqual(base,'http://127.0.0.1:44320/os')
                events.append('local-health')
                if local_failure:raise OSError('injected local health failure')
            else:
                self.assertEqual(base,workspace.LEGACY_URL)
                for name in ['PENDING_RELEASE.json','ACTIVE_RELEASE.json']:
                    self.assertEqual(json.loads((root/name).read_bytes())['workspace'],restored)
                self.assertEqual((root/'ACTIVE_OWNER.json').read_bytes(),f['metadata']['ACTIVE_OWNER.json'])
                events.append('public-health-after-canonical-metadata')
                if public_failure:raise OSError('injected public network failure')
        with patch.object(workspace,'ROOT',root),patch.object(workspace,'ROUTE',route),patch.object(workspace,'command',side_effect=command_fixture),patch.object(workspace,'inspect',return_value=restored) as inspect_mock,patch.object(workspace,'check_http',side_effect=http_fixture),patch.object(workspace.time,'sleep'):
            expected_error=OSError if public_failure or local_failure else ValueError if wrong_identity else None
            if expected_error:
                with self.assertRaises(expected_error):workspace.restore_workspace(f['operation'],f['old'],f['baseline'],f['compose'],f['route'],f['metadata'],['fixture-compose'])
            else:workspace.restore_workspace(f['operation'],f['old'],f['baseline'],f['compose'],f['route'],f['metadata'],['fixture-compose'])
            if local_failure:inspect_mock.assert_not_called()
            else:inspect_mock.assert_called_once_with(workspace.CONTAINER)
        return events,restored

    def test_restore_updates_both_canonical_cids_before_public_verification(self):
        with tempfile.TemporaryDirectory() as directory:
            f=self.fixture(directory);events,restored=self.exercise_restore(f)
            self.assertEqual(events,['workspace-recreate','local-health','public-health-after-canonical-metadata'])
            self.assertEqual(json.loads((f['operation']/'rollback-runtime.json').read_bytes()),restored)
            for name in ['PENDING_RELEASE.json','ACTIVE_RELEASE.json']:
                metadata=json.loads((f['root']/name).read_bytes())
                self.assertEqual(metadata['workspace'],restored)
                self.assertEqual(metadata['state'],'done_deployed_and_verified')
                self.assertEqual(metadata['url'],workspace.LEGACY_URL)

    def test_public_network_failure_cannot_leave_canonical_metadata_with_stale_cids(self):
        with tempfile.TemporaryDirectory() as directory:
            f=self.fixture(directory);events,restored=self.exercise_restore(f,public_failure=True)
            self.assertEqual(events[-1],'public-health-after-canonical-metadata')
            for name in ['PENDING_RELEASE.json','ACTIVE_RELEASE.json']:
                self.assertEqual(json.loads((f['root']/name).read_bytes())['workspace'],restored)
            self.assertFalse((f['operation']/'acceptance-rollback-result.json').exists())

    def test_wrong_runtime_or_unready_local_clone_cannot_be_declared_a_verified_restore(self):
        for fault in ['wrong-identity','local-health']:
            with self.subTest(fault=fault),tempfile.TemporaryDirectory() as directory:
                f=self.fixture(directory);events,_=self.exercise_restore(f,wrong_identity=fault=='wrong-identity',local_failure=fault=='local-health')
                self.assertNotIn('public-health-after-canonical-metadata',events)
                self.assertEqual((f['root']/'PENDING_RELEASE.json').read_bytes(),b'{"new":true}')
                self.assertFalse((f['operation']/'rollback-runtime.json').exists())

if __name__=='__main__':unittest.main()
