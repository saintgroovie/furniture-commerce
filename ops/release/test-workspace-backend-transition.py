"""New BE/WS seam only: real local journals/files, mocked Docker and HTTP."""
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('workspace', Path(__file__).with_name('deploy-team-workspace.py'))
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)


class BackendTransition(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.route = self.root / 'route.json'
        self.patches = [patch.object(w, 'ROOT', self.root), patch.object(w, 'ROUTE', self.route)]
        for p in self.patches:
            p.start(); self.addCleanup(p.stop)
        self.old = {'container_id': 'a'*64, 'source': 'b'*40, 'image': 'ghcr.io/saintgroovie/woodright-workspace@sha256:'+'c'*64}
        self.be0 = {'container_id': 'd'*64, 'source': 'e'*40, 'image': 'be0'}
        self.be1 = {'container_id': 'f'*64, 'source': '1'*40, 'image': 'be1'}
        self.sf = {'container_id': '2'*64, 'source': '3'*40, 'image': 'sf'}
        self.authority = {'source': '4'*40, 'manifest_sha256': '5'*64, 'controller_sha256': '6'*64}
        self.op = self.root / 'operation-20261028T010000Z-12345678'
        self.op.mkdir()
        self.compose = w.json_bytes(w.compose_document(self.old['image'], self.be0['source']))
        self.route.write_bytes(w.json_bytes(w.router_document()))
        (self.root/'compose.json').write_bytes(self.compose)
        self.packet = {'state': 'done_deployed_and_verified', 'workspace': self.old, 'backend': self.be0,
                       'compose_sha256': w.digest(self.compose), 'source': self.old['source'], 'url': w.URL}
        self.intent = {'image': self.old['image'], 'source_sha': self.old['source'],
                       'backend_transition': {'id': '7'*32, 'previous_backend': self.be0, 'storefront': self.sf, 'compensation_intent_sha256': '8'*64}}
        for name in ['ACTIVE_RELEASE.json', 'PENDING_RELEASE.json']:
            (self.root/name).write_bytes(w.json_bytes(self.packet))
        (self.root/'ACTIVE_OWNER.json').write_bytes(b'{"owner":"original"}')
        checksums = {}
        for name in ['ACTIVE_RELEASE.json', 'PENDING_RELEASE.json', 'ACTIVE_OWNER.json']:
            raw = (self.root/name).read_bytes()
            (self.op/(name+'.before')).write_bytes(raw)
            checksums[name] = w.digest(raw)
        for name, raw in {'compose.before.json': self.compose, 'route.before.json': self.route.read_bytes(),
                          'owner-intent.json': w.json_bytes(self.intent), 'build-manifest.json': b'{"actual":"manifest"}',
                          'baseline.json': w.json_bytes({'url': w.URL}), 'metadata-checksums.json': w.json_bytes(checksums)}.items():
            (self.op/name).write_bytes(raw)
        self.baseline = {'raw': w.json_bytes(self.packet)}
        self.inspect_mock = patch.object(w, 'inspect', return_value=self.sf).start()
        self.addCleanup(patch.stopall)

    def begin(self):
        value, compose = w.begin_backend_transition(self.intent, w.json_bytes(self.intent), self.authority, self.op, self.baseline, self.old, self.be1, w.json_bytes(w.compose_document(self.old['image'], self.be1['source'])))
        (self.root/'compose.json').write_bytes(compose)
        return value

    def docker(self, value, pin=None, cid='9'*64, label=None):
        return SimpleNamespace(returncode=0, stdout=json.dumps({'Id': cid, 'Config': {'Image': self.old['image'], 'Env': ['WOODRIGHT_EXPECTED_BACKEND_REVISION='+(pin or self.be1['source'])], 'Labels': {
            w.TRANSITION_LABEL: label or value['id'], 'com.docker.compose.project': w.PROJECT,
            'com.docker.compose.service': 'workspace', 'org.opencontainers.image.revision': self.old['source']}}}))

    def command(self, value, phase, *unused):
        if unused and isinstance(unused[-1], dict): unused[-1]['stage'] = 'reaped'
        w.transition_save(value, child_receipt={'attempt': ('a' if phase == 'forward' else 'b')*32, 'phase': phase, 'started': True, 'pid': 123, 'reaped': True, 'returncode': 0, 'no_forced_cancel': True})

    def failed(self):
        value = self.begin()
        self.command(value, 'forward')
        with patch.object(w.subprocess, 'run', return_value=self.docker(value)):
            w.transition_forward_receipt(value, self.old['image'], self.old['source'])
            self.assertEqual(w.transition_read()['own_workspace']['container_id'], '9'*64)
            w.transition_failed(value)
        return value

    def recovery(self, value):
        receipt = self.root/'qualified-compensation-receipt.json'
        provenance = {'payload_sha256': 'a'*64, 'launcher_sha256': 'b'*64, 'foreground_sha256': 'c'*64, 'native_wait_sha256': 'd'*64, 'helper_install_sha': 'f'*40}
        packet = {'tool': 'cutover-public-production-pair.sh', 'mode': 'execute', 'environment': 'public_production',
            'component': 'backend', 'phase': 'committed', 'verdict': 'committed', 'source_sha': self.be0['source'],
            'application_source_sha': self.be0['source'], 'operation_helper_install_sha': provenance['helper_install_sha'],
            'owner_approval': {'checksum': '8'*64, 'component': 'backend'},
            'candidates': {'backend': {'ref': self.be0['image'], 'oci_revision': self.be0['source']}},
            'current_containers': {'backend': {'id': self.be0['container_id'], 'image': self.be0['image']},
                                   'storefront': {'id': self.sf['container_id'], 'image': self.sf['image']}}}
        packet_raw = w.json_bytes(packet).decode(); packet_sha = w.digest(packet_raw.encode())
        proof = {'schema': 'woodright-native-backend-compensation-proof-v1', 'transition_id': value['id'],
            'forward_intent_sha256': value['intent_sha256'], 'provenance': provenance,
            'canonical_packet_json': packet_raw, 'canonical_packet_sha256': packet_sha,
            'native_execution': {'rc': 0, 'native_reaped': True, 'expired': False, 'capture_complete': True,
                'no_forced_cancel': True, 'payload_sha256': provenance['payload_sha256'], 'canonical_packet_sha256': packet_sha, 'stdout_sha256': 'e'*64},
            'transport_receipt': {'returncode': 0, 'local_client_reaped': True, 'FREE': True, 'no_forced_cancel': True,
                'budget_expired': False, 'payload_sha256': provenance['payload_sha256'], 'canonical_approval_sha256': '8'*64}}
        receipt.write_bytes(w.json_bytes(proof))
        args = SimpleNamespace(image=self.old['image'], source=self.old['source'], intent_checksum='a'*64, compensation_receipt=receipt)
        intent = {'transition_recovery': {'journal_sha256': w.digest(w.regular(w.transition_path())),
            'forward_intent_sha256': value['intent_sha256'], 'compensation_intent_sha256': '8'*64,
            'compensation_receipt_sha256': w.digest(receipt.read_bytes()), 'compensation_terminal': 'committed',
            'compensation_reaped': True, 'own_workspace': value['own_workspace'], 'compensation_provenance': provenance}}
        return args, intent

    def test_same_backend_keeps_existing_behavior_without_journal(self):
        value, compose = w.begin_backend_transition({}, b'{}', None, self.op, self.baseline, self.old, self.be0, self.compose)
        self.assertIsNone(value); self.assertEqual(compose, self.compose)
        self.assertFalse(w.transition_path().exists())

    def test_cross_backend_requires_verified_same_image_and_exact_intent(self):
        for change in ['missing', 'image', 'backend', 'governance', 'storefront']:
            with self.subTest(change=change):
                original = json.loads(json.dumps(self.intent)); authority = self.authority
                if change == 'missing': self.intent.pop('backend_transition')
                if change == 'image': self.intent['image'] = 'another'
                if change == 'backend': self.intent['backend_transition']['previous_backend'] = self.be1
                if change == 'governance': authority = None
                if change == 'storefront': self.intent['backend_transition']['storefront'] = self.be1
                with self.assertRaises(ValueError):
                    w.begin_backend_transition(self.intent, w.json_bytes(self.intent), authority, self.op, self.baseline, self.old, self.be1, self.compose)
                self.intent = original
                self.assertFalse(w.transition_path().exists())

    def test_nonterminal_journal_blocks_all_other_mutators(self):
        value = self.begin()
        self.assertFalse(value['terminal'])
        for mode in ['deploy', 'finalize', 'rollback', 'handover-governance']:
            with self.subTest(mode=mode), self.assertRaises(ValueError): w.transition_guard(mode)
        args, intent = self.recovery({**value, 'own_workspace': self.old})
        with self.assertRaisesRegex(ValueError, 'unknown is not FREE'):
            w.recover_backend_transition(args, intent, self.authority, self.be0)

    def test_foreign_runtime_never_becomes_terminal_or_owned(self):
        value = self.begin()
        with patch.object(w.subprocess, 'run', return_value=self.docker(value, label='foreign')):
            with self.assertRaises(ValueError): w.transition_failed(value)
        self.assertFalse(w.transition_read()['terminal'])
        self.assertNotIn('own_workspace', w.transition_read())

    def test_known_failed_bridge_is_recoverable_only_after_actual_backend_compensation(self):
        value = self.failed(); args, intent = self.recovery(value)
        with self.assertRaises(ValueError): w.recover_backend_transition(args, intent, self.authority, self.be1)
        self.assertEqual(w.transition_read()['state'], 'recovery_required')

    def test_changed_cid_snapshot_route_or_authority_refused_before_any_write(self):
        value = self.failed()
        for change in ['cid', 'snapshot', 'route', 'authority', 'receipt']:
            with self.subTest(change=change):
                args, intent = self.recovery(value)
                authority = self.authority; info = self.docker(value)
                target = None; original = None
                if change == 'cid': info = self.docker(value, cid='0'*64)
                if change == 'authority': authority = {**authority, 'source': '0'*40}
                if change == 'snapshot': target = self.op/'route.before.json'
                if change == 'route': target = self.route
                if change == 'receipt': target = args.compensation_receipt
                if target: original = target.read_bytes(); target.write_bytes(b'changed')
                with patch.object(w.subprocess, 'run', return_value=info), patch.object(w, 'write', side_effect=AssertionError('must not mutate')):
                    with self.assertRaises(ValueError): w.recover_backend_transition(args, intent, authority, self.be0)
                if target: target.write_bytes(original)

    def test_recovery_records_own_cid_before_health_and_keeps_metadata_truthful(self):
        value = self.failed(); args, intent = self.recovery(value)
        restored = self.docker(value, pin=self.be0['source'], cid='0'*64)
        def health(*unused):
            self.assertEqual(w.transition_read()['own_workspace']['container_id'], '0'*64)
        with patch.object(w.subprocess, 'run', side_effect=[self.docker(value), restored]), patch.object(w, 'transition_command', side_effect=self.command), patch.object(w, 'check_http', side_effect=health):
            result = w.recover_backend_transition(args, intent, self.authority, self.be0)
        self.assertFalse(result['live_database_touched'])
        self.assertEqual(w.transition_read()['state'], 'recovered')
        packet = json.loads((self.root/'ACTIVE_RELEASE.json').read_bytes())
        self.assertEqual(packet['workspace']['container_id'], '0'*64)
        self.assertEqual(packet['compose_sha256'], w.digest((self.root/'compose.json').read_bytes()))
        self.assertEqual((self.root/'ACTIVE_OWNER.json').read_bytes(), b'{"owner":"original"}')

    def test_health_failure_after_restore_stays_blocked_and_can_resume_with_new_exact_intent(self):
        value = self.failed(); args, intent = self.recovery(value)
        restored = self.docker(value, pin=self.be0['source'], cid='0'*64)
        with patch.object(w.subprocess, 'run', side_effect=[self.docker(value), restored, restored]), patch.object(w, 'transition_command', side_effect=self.command), patch.object(w, 'check_http', side_effect=ValueError('health failed')):
            with self.assertRaises(ValueError): w.recover_backend_transition(args, intent, self.authority, self.be0)
        value = w.transition_read()
        self.assertEqual(value['state'], 'recovery_required'); self.assertTrue(value['reaped'])
        self.assertEqual(value['phase'], 'restore')
        with self.assertRaises(ValueError): w.transition_guard('deploy')
        args, intent = self.recovery(value)
        with patch.object(w.subprocess, 'run', return_value=restored), patch.object(w, 'transition_command', side_effect=self.command), patch.object(w, 'check_http'):
            w.recover_backend_transition(args, intent, self.authority, self.be0)
        self.assertEqual(w.transition_read()['state'], 'recovered')

    def test_partial_forward_metadata_write_recovers_only_qualified_bytes(self):
        value = self.failed()
        partial = w.json_bytes({'state': 'deployed_not_verified', 'workspace': value['own_workspace']})
        w.transition_save(value, forward_metadata={'PENDING_RELEASE.json': w.digest(partial)})
        (self.root/'PENDING_RELEASE.json').write_bytes(partial)
        args, intent = self.recovery(value)
        restored = self.docker(value, pin=self.be0['source'], cid='0'*64)
        with patch.object(w.subprocess, 'run', side_effect=[self.docker(value), restored]), patch.object(w, 'transition_command', side_effect=self.command), patch.object(w, 'check_http'):
            w.recover_backend_transition(args, intent, self.authority, self.be0)
        self.assertEqual(json.loads((self.root/'PENDING_RELEASE.json').read_bytes())['workspace']['container_id'], '0'*64)

    def test_failed_restore_command_with_ambiguous_runtime_stays_nonterminal(self):
        value = self.failed(); args, intent = self.recovery(value)
        with patch.object(w.subprocess, 'run', side_effect=[self.docker(value), self.docker(value, pin=self.be0['source'], label='foreign')]), patch.object(w, 'transition_command', side_effect=ValueError('command failed')):
            with self.assertRaises(ValueError): w.recover_backend_transition(args, intent, self.authority, self.be0)
        journal = w.transition_read()
        self.assertEqual(journal['state'], 'recovering')
        self.assertFalse(journal['terminal']); self.assertFalse(journal['reaped'])
        for mode in ['deploy', 'finalize', 'rollback', 'handover-governance']:
            with self.assertRaises(ValueError): w.transition_guard(mode)

    def test_receipts_do_not_export_environment_secrets(self):
        value = self.begin(); self.command(value, 'forward'); info = self.docker(value)
        data = json.loads(info.stdout)
        data['Config']['Env'].append('PASSWORD=do-not-export-this')
        info.stdout = json.dumps(data)
        with patch.object(w.subprocess, 'run', return_value=info):
            w.transition_forward_receipt(value, self.old['image'], self.old['source'])
        for file in [w.transition_path(), self.op/'backend-transition-journal.json']:
            self.assertNotIn('do-not-export-this', file.read_text())
            self.assertNotIn('PASSWORD', file.read_text())

    def test_terminal_flag_alone_cannot_unlock_workspace_mutators(self):
        value = self.begin()
        w.transition_save(value, state='bridged', terminal=True, reaped=False)
        with self.assertRaises(ValueError): w.transition_guard('deploy')

    def test_repeated_interruptions_still_wait_for_exact_child_without_cancellation(self):
        value = self.begin()
        proc = MagicMock(); proc.pid = 123
        proc.wait.side_effect = [InterruptedError('first'), KeyboardInterrupt(), 0]
        with patch.object(w.subprocess, 'Popen', return_value=proc), patch.object(w.signal, 'signal'):
            with self.assertRaises(InterruptedError):
                w.transition_command(value, 'forward', ['mocked-compose'], self.op/'command.log')
        self.assertEqual(proc.wait.call_count, 3)
        proc.terminate.assert_not_called(); proc.kill.assert_not_called()
        self.assertTrue(w.transition_read()['child_receipt']['reaped'])
        self.assertTrue(w.transition_read()['child_receipt']['no_forced_cancel'])

    def test_matching_runtime_cannot_replace_missing_exact_child_receipt(self):
        value = self.begin()
        with patch.object(w.subprocess, 'run', return_value=self.docker(value)):
            with self.assertRaisesRegex(ValueError, 'exact-child'):
                w.transition_failed(value)
        self.assertFalse(w.transition_read()['terminal'])

    def test_failure_does_not_adopt_replacement_after_forward_cid_recorded(self):
        value = self.begin(); self.command(value, 'forward')
        with patch.object(w.subprocess, 'run', return_value=self.docker(value)):
            w.transition_forward_receipt(value, self.old['image'], self.old['source'])
        with patch.object(w.subprocess, 'run', return_value=self.docker(value, cid='0'*64)):
            with self.assertRaisesRegex(ValueError, 'CID changed'): w.transition_failed(value)
        self.assertEqual(w.transition_read()['own_workspace']['container_id'], '9'*64)
        self.assertFalse(w.transition_read()['terminal'])

    def test_failure_does_not_adopt_replacement_after_restore_cid_recorded(self):
        value = self.failed(); args, intent = self.recovery(value)
        with patch.object(w.subprocess, 'run', side_effect=[self.docker(value), self.docker(value, pin=self.be0['source'], cid='0'*64), self.docker(value, pin=self.be0['source'], cid='1'*64)]), patch.object(w, 'transition_command', side_effect=self.command), patch.object(w, 'check_http', side_effect=ValueError('health failed')):
            with self.assertRaisesRegex(ValueError, 'CID changed'):
                w.recover_backend_transition(args, intent, self.authority, self.be0)
        self.assertEqual(w.transition_read()['own_workspace']['container_id'], '0'*64)
        self.assertFalse(w.transition_read()['terminal'])

    def test_canonical_receipt_bindings_are_required_even_with_authorized_bytes_hash(self):
        value = self.failed(); args, intent = self.recovery(value)
        original = json.loads(args.compensation_receipt.read_bytes())
        for case in ['native', 'transport', 'approval', 'backend', 'producer', 'packet-hash']:
            with self.subTest(case=case):
                proof = json.loads(json.dumps(original))
                if case == 'native': proof['native_execution']['native_reaped'] = False
                if case == 'transport': proof['transport_receipt']['no_forced_cancel'] = False
                if case == 'producer': proof['provenance']['payload_sha256'] = '0'*64
                if case == 'packet-hash': proof['canonical_packet_sha256'] = '0'*64
                if case in ['approval', 'backend']:
                    packet = json.loads(proof['canonical_packet_json'])
                    if case == 'approval': packet['owner_approval']['checksum'] = '0'*64
                    else: packet['current_containers']['backend']['id'] = '0'*64
                    proof['canonical_packet_json'] = w.json_bytes(packet).decode()
                    proof['canonical_packet_sha256'] = w.digest(proof['canonical_packet_json'].encode())
                    proof['native_execution']['canonical_packet_sha256'] = proof['canonical_packet_sha256']
                raw = w.json_bytes(proof)
                args.compensation_receipt.write_bytes(raw)
                intent['transition_recovery']['compensation_receipt_sha256'] = w.digest(raw)
                with patch.object(w, 'write', side_effect=AssertionError('must not mutate')):
                    with self.assertRaises(ValueError): w.recover_backend_transition(args, intent, self.authority, self.be0)

    def test_known_route_write_failure_before_child_can_resume_without_cid_adoption(self):
        value = self.failed(); args, intent = self.recovery(value)
        real_write = w.write
        once = [False]
        def write(path, raw):
            if path == self.route and not once[0]:
                once[0] = True; raise OSError('synthetic route install failure')
            return real_write(path, raw)
        with patch.object(w.subprocess, 'run', return_value=self.docker(value)), patch.object(w, 'write', side_effect=write), patch.object(w, 'transition_command') as command:
            with self.assertRaises(OSError): w.recover_backend_transition(args, intent, self.authority, self.be0)
            command.assert_not_called()
        value = w.transition_read()
        self.assertTrue(value['pre_child_resume']); self.assertTrue(value['reaped'])
        self.assertEqual(value['own_workspace']['container_id'], '9'*64)
        args, intent = self.recovery(value)
        with patch.object(w.subprocess, 'run', side_effect=[self.docker(value), self.docker(value, pin=self.be0['source'], cid='0'*64)]), patch.object(w, 'transition_command', side_effect=self.command), patch.object(w, 'check_http'):
            w.recover_backend_transition(args, intent, self.authority, self.be0)
        self.assertEqual(w.transition_read()['state'], 'recovered')

    def test_compensation_checksum_and_validation_use_the_same_single_read(self):
        value = self.failed(); args, intent = self.recovery(value)
        real_regular = w.regular; reads = []
        def read(path):
            if path == args.compensation_receipt:
                reads.append(path)
                if len(reads) > 1: raise AssertionError('receipt read twice')
            return real_regular(path)
        with patch.object(w, 'regular', side_effect=read), patch.object(w.subprocess, 'run', side_effect=[self.docker(value), self.docker(value, pin=self.be0['source'], cid='0'*64)]), patch.object(w, 'transition_command', side_effect=self.command), patch.object(w, 'check_http'):
            w.recover_backend_transition(args, intent, self.authority, self.be0)
        self.assertEqual(len(reads), 1)

    def test_catchable_signal_during_spawn_is_deferred_until_child_reaped(self):
        value = self.begin(); progress = {}
        registered = {sig: w.signal.SIG_DFL for sig in [w.signal.SIGINT, w.signal.SIGTERM, w.signal.SIGHUP]}
        proc = MagicMock(); proc.pid = 123; proc.wait.return_value = 0
        def install(sig, handler):
            previous = registered[sig]; registered[sig] = handler; return previous
        def spawn(*args, **kwargs):
            self.assertEqual(progress['stage'], 'launching')
            for sig in registered: self.assertTrue(callable(registered[sig]))
            registered[w.signal.SIGTERM](w.signal.SIGTERM, None)
            registered[w.signal.SIGHUP](w.signal.SIGHUP, None)
            return proc
        with patch.object(w.signal, 'signal', side_effect=install), patch.object(w.subprocess, 'Popen', side_effect=spawn):
            with self.assertRaisesRegex(InterruptedError, 'exact child reaped'):
                w.transition_command(value, 'restore', ['mocked-compose'], self.op/'command.log', progress)
        self.assertEqual(progress['stage'], 'reaped')
        self.assertTrue(w.transition_read()['child_receipt']['reaped'])
        self.assertTrue(all(handler == w.signal.SIG_DFL for handler in registered.values()))
        proc.terminate.assert_not_called(); proc.kill.assert_not_called()

    def test_recovery_initial_child_journal_failure_is_known_pre_child_and_resumable(self):
        value = self.failed(); args, intent = self.recovery(value)
        real_save = w.transition_save; once = [False]
        def save(value, **changes):
            if 'child_receipt' in changes and not once[0]:
                once[0] = True; raise OSError('synthetic before-spawn journal failure')
            return real_save(value, **changes)
        with patch.object(w, 'transition_save', side_effect=save), patch.object(w.subprocess, 'Popen') as spawn, patch.object(w.subprocess, 'run', return_value=self.docker(value)), patch.object(w.signal, 'signal'):
            with self.assertRaises(OSError): w.recover_backend_transition(args, intent, self.authority, self.be0)
            spawn.assert_not_called()
        value = w.transition_read()
        self.assertEqual(value['state'], 'recovery_required'); self.assertTrue(value['pre_child_resume'])
        args, intent = self.recovery(value)
        with patch.object(w.subprocess, 'run', side_effect=[self.docker(value), self.docker(value, pin=self.be0['source'], cid='0'*64)]), patch.object(w, 'transition_command', side_effect=self.command), patch.object(w, 'check_http'):
            w.recover_backend_transition(args, intent, self.authority, self.be0)
        self.assertEqual(w.transition_read()['state'], 'recovered')

    def test_ambiguous_launch_is_not_treated_as_known_pre_child(self):
        value = self.failed(); args, intent = self.recovery(value)
        with patch.object(w.subprocess, 'run', return_value=self.docker(value)), patch.object(w.subprocess, 'Popen', side_effect=OSError('ambiguous launch')), patch.object(w.signal, 'signal'):
            with self.assertRaises(ValueError): w.recover_backend_transition(args, intent, self.authority, self.be0)
        value = w.transition_read()
        self.assertEqual(value['state'], 'recovering'); self.assertFalse(value['terminal'])


if __name__ == '__main__': unittest.main()
