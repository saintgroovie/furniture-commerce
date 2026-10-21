import hashlib
import importlib.util
import io
import os
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("private_verifier", os.path.join(os.path.dirname(__file__), "verify-private-files.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PrivateRestore(unittest.TestCase):
    def test_exact_bytes_and_missing_or_altered_documents(self):
        with tempfile.TemporaryDirectory(prefix="woodright-private-restore-") as directory:
            path = os.path.join(directory, "private.tar.gz")
            content = "Служебный тест документа".encode()
            with tarfile.open(path, "w:gz") as archive:
                entry = tarfile.TarInfo("./blob_test_1")
                entry.size = len(content)
                archive.addfile(entry, io.BytesIO(content))
            with open(path, "rb") as stream:
                sha = hashlib.sha256(stream.read()).hexdigest()
            manifest = {"private_files": {"path": path, "sha256": sha}}
            rows = [{"storage_key": "blob_test_1", "sha256": hashlib.sha256(content).hexdigest(), "size": len(content)}]
            self.assertEqual(module.verify(manifest, rows)["verified_references"], 1)
            with self.assertRaisesRegex(ValueError, "metadata requires"):
                module.verify({}, rows)
            with self.assertRaisesRegex(ValueError, "missing from archive"):
                module.verify(manifest, [{**rows[0], "storage_key": "blob_missing"}])
            with self.assertRaisesRegex(ValueError, "bytes mismatch"):
                module.verify(manifest, [{**rows[0], "sha256": "0" * 64}])
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                module.verify({"private_files": {"path": path, "sha256": "0" * 64}}, rows)

    def test_symlink_entries_are_refused(self):
        with tempfile.TemporaryDirectory(prefix="woodright-private-restore-") as directory:
            path = os.path.join(directory, "unsafe.tar.gz")
            with tarfile.open(path, "w:gz") as archive:
                entry = tarfile.TarInfo("blob_link")
                entry.type = tarfile.SYMTYPE
                entry.linkname = "/etc/passwd"
                archive.addfile(entry)
            with open(path, "rb") as stream:
                sha = hashlib.sha256(stream.read()).hexdigest()
            with self.assertRaisesRegex(ValueError, "unsafe"):
                module.verify({"private_files": {"path": path, "sha256": sha}}, [])


if __name__ == "__main__":
    unittest.main()
