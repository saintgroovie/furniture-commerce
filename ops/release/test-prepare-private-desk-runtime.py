import importlib.util
from pathlib import Path
import subprocess
import unittest

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


if __name__ == '__main__':
    unittest.main()
