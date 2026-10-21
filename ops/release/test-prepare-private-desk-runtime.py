import importlib.util
from pathlib import Path
import subprocess
import unittest
import contextlib
import io
import json
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('desk_prepare', Path(__file__).with_name('prepare-private-desk-runtime.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Preparation(unittest.TestCase):
    def setUp(self):
        self.original = (Path(__file__).resolve().parents[2] / 'scripts/release/fixtures/private-desk-runtime.yml').read_text()

    def test_only_backend_delta_preserves_buyer_configuration_and_is_idempotent(self):
        result = module.prepare(self.original)
        self.assertEqual(result.split('  storefront:', 1)[1].split('\nvolumes:')[0], self.original.split('  storefront:', 1)[1].split('\nvolumes:')[0])
        self.assertIn('      WOODRIGHT_DESK_FEATURES: "1"', result)
        self.assertIn('      WOODRIGHT_MANGO_ENABLED: "0"', result)
        self.assertIn('      - woodright_private_files:/var/lib/woodright/private-files', result)
        self.assertEqual(module.prepare(result), result)
        for line in self.original.splitlines():
            if line.strip().startswith(('DATABASE_URL:', 'JWT_SECRET:', 'STORE_CORS:', 'image:', '- woodright_public_media:')):
                self.assertIn(line, result)

    def test_conflicting_mount_or_flag_fails_instead_of_overwriting_operator_settings(self):
        with self.assertRaisesRegex(ValueError, 'conflicting'):
            module.prepare(self.original.replace('      PORT: "9000"', '      WOODRIGHT_DESK_FEATURES: "0"\n      PORT: "9000"'))
        with self.assertRaisesRegex(ValueError, 'conflicting'):
            module.prepare(self.original.replace('      - woodright_public_media:/server/static', '      - other_volume:/var/lib/woodright/private-files\n      - woodright_public_media:/server/static'))
        with self.assertRaisesRegex(ValueError, 'backend'):
            module.prepare(self.original.replace('  backend:', '  other_backend:'))

    def test_storefront_only_baseline_keeps_distinct_backend_identity_and_rejects_drift(self):
        backend_source, primary, target = 'a'*40, 'b'*40, 'c'*40
        backend_ref, storefront_ref = 'backend@sha256:'+ 'd'*64, 'storefront@sha256:'+'e'*64
        with tempfile.TemporaryDirectory(prefix='woodright-split-desk-') as directory:
            root = Path(directory)
            compose = root/'compose.yml'; compose.write_text(self.original)
            approval = root/'approval.json'
            approval.write_text(json.dumps({'application_sha':target,'owner_decision':'approved','environment':'public_production','reservation_state':'reserved','component':'pair'}))
            (root/'ACTIVE_OWNER.json').write_text(json.dumps({'application_source_sha':primary}))
            (root/'ACTIVE_RELEASE.json').write_text(json.dumps({'application_source_sha':primary,'backend_image':backend_ref,'storefront_image':storefront_ref}))
            argv=['desk-prepare','--source',target,'--expected-current-source',primary,
                  '--expected-backend-source',backend_source,'--expected-backend-ref',backend_ref,
                  '--expected-storefront-ref',storefront_ref,'--approval-checksum',module.sha(approval.read_bytes()),
                  '--compose-checksum',module.sha(compose.read_bytes()),'--backup-manifest',str(root/'recovery.json')]
            images={'woodright-public-production-backend':(backend_ref,backend_source), 'woodright-public-production-storefront':(storefront_ref,primary)}
            with patch.object(module,'COMPOSE',compose), patch.object(module,'APPROVAL',approval), patch.object(module,'META',root), patch.object(module,'backup_gate') as recovery, patch.object(module,'inspect',side_effect=lambda name:images[name]), patch('sys.argv',argv):
                output=io.StringIO()
                with contextlib.redirect_stdout(output): module.main()
                packet=json.loads(output.getvalue())
                self.assertEqual(packet['expected_component_sources'],{'backend':backend_source,'storefront':primary})
                recovery.assert_called_once_with(root/'recovery.json',primary)
                self.assertEqual(compose.read_text(),self.original)
                images['woodright-public-production-backend']=(backend_ref,'f'*40)
                with self.assertRaisesRegex(ValueError,'live pair changed'): module.main()


if __name__ == '__main__':
    unittest.main()
