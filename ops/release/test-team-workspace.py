import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('workspace',Path(__file__).with_name('deploy-team-workspace.py'))
workspace=importlib.util.module_from_spec(spec);spec.loader.exec_module(workspace)

class WorkspaceBoundary(unittest.TestCase):
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
