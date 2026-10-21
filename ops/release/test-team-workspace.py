import importlib.util
from pathlib import Path
import unittest
import tempfile
import json

spec=importlib.util.spec_from_file_location('workspace',Path(__file__).with_name('deploy-team-workspace.py'))
workspace=importlib.util.module_from_spec(spec);spec.loader.exec_module(workspace)

class WorkspaceBoundary(unittest.TestCase):
    def baseline_fixture(self, root):
        route=root/'router.json';route.write_bytes(b'route')
        (root/'compose.json').write_bytes(b'compose')
        existing={'container_id':'current-container','source':'b'*40,'image':'ghcr.io/saintgroovie/woodright-workspace@sha256:'+'a'*64}
        packet={'schema':'woodright-team-workspace-release-v1','state':'deployed_not_verified','source':existing['source'],'workspace':existing,'route_sha256':workspace.digest(b'route'),'compose_sha256':workspace.digest(b'compose')}
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
        self.assertTrue(all(n['external'] for n in d['networks'].values()))
        self.assertTrue(service['read_only'])
    def test_only_os_path_is_routed_and_mutable_images_are_refused(self):
        routers=workspace.router_document()['http']['routers']
        for r in routers.values():
            self.assertIn('Path(`/os`)',r['rule']);self.assertIn('PathPrefix(`/os/`)',r['rule'])
            self.assertNotIn('api.woodright',r['rule'])
        with self.assertRaises(ValueError): workspace.compose_document('ghcr.io/saintgroovie/woodright-workspace:latest','b'*40)

if __name__=='__main__':unittest.main()
