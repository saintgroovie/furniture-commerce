"""Candidate operator wrapper. Not installed or authorized for production use.

The WS lease spans the pending-state check and the native installer's own global
lease. The installer remains unchanged. A bare installer is NOT guarded by this
wrapper; the approved operator pipeline must require this exact pinned wrapper.
"""
import argparse
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import time

ROOT = Path('/srv/woodright')
WS = ROOT / 'team-workspace'
OPS = ROOT / 'ops'
TOOLS = ROOT / 'tools/release'
LOCK = ROOT / 'locks/team_workspace/live-cutover.lock'
LEGACY_SOURCE = '59553a048bd144d09bca46fd5b1660996c48d867'
REVIEWED_STORAGE_HASHES = {'ops/backup/immutable_weekly.py': '401a4d55c1306f5a5dc7ca11a7760449345684d7edb26a4fe471ea469182245b', 'ops/backup/retention_catalog.py': '713a8400db7aa775380e8965b7ff6045af163fd0ddda5377ba836cabe7b6d93a', 'ops/backup/woodright-backup-retention.sh': 'b8c2d5b775fd4ea0e455b78e2bf605d88cebb4970adef0faeffc1524b9173cd9', 'ops/backup/woodright-media-backup.sh': 'b6d5553f1167f9cc163b5969966913cc6ee0a4ebe9e1b3fa1dd3839fc458d385', 'ops/release/install-environment-governance.sh': 'cb3bb39156b483a2cf548b1a8cf36cafe8e07543113863a1feeabd78e79b2d11', 'ops/release/verify-environment-governance-bundle.sh': '7f79c35f33afa75ea65066540d756b9d493b65c00777614af43b9e08fce2406f'}
LEGACY595_STORAGE_HASHES = {'ops/backup/immutable_weekly.py': None, 'ops/backup/retention_catalog.py': None, 'ops/backup/woodright-backup-retention.sh': 'c32fd4c2938c507666436da8f79a33bdba45260e8e0c57502a9663a3dc2f3221', 'ops/backup/woodright-media-backup.sh': '6aed7f332ae0ac1fa5856ea27903711f347654d50acf352f1e83ffb50b117ef9', 'ops/release/install-environment-governance.sh': 'f74cb494f5488088464b6dff9c862ee68549e2b782b2ddf1cbb929a30b052410', 'ops/release/verify-environment-governance-bundle.sh': '0c5cdc722c215e557f9f4c84b6aa47f80018b72e9502fd9b14e431a3fbb726e6'}
PUBLIC_CONTROLS = {
    '/srv/woodright/runtime-ownership-public-production/ACTIVE_RELEASE.json',
    '/srv/woodright/runtime-ownership-public-production/ACTIVE_OWNER.json',
    '/srv/woodright/runtime-ownership-public-production/EXPECTED_RELEASE.json',
    '/srv/woodright/meta/public_production/OWNER_APPROVED_RELEASE.json',
    '/etc/dokploy/compose/woodright-public-production/code/docker-compose.yml',
    '/etc/dokploy/compose/woodright-public-production/code/.env',
    '/etc/dokploy/traefik/dynamic/woodright-team-workspace.yml',
    '/srv/woodright/team-workspace/compose.json',
}
ENV = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
       'LANG': 'C.UTF-8', 'GIT_CONFIG_NOSYSTEM': '1',
       'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_NO_REPLACE_OBJECTS': '1'}


# BEGIN EXACT OPERATOR PARENT POLICY V2
# The authorized deployment operator is trusted; hostile operator races are not
# excluded by descriptors or checkpoints. This policy grants no release rights.
class OperatorParentPolicy:
    BOOTSTRAP = '/etc/woodright/operator-parent-contract.json'
    # Finite, role-specific ancestry only, behind the witnessed operator 0700 root.
    # No world-write exception; regular authority/source/bootstrap leaves stay root.
    PARENT_RULES = {
        '/srv/woodright': (0o700, 'READ_PREFLIGHT STORAGE_PIPELINE GOVERNANCE_INSTALL GOVERNANCE_HANDOVER'),
        '/srv/woodright/backups': (0o700, 'READ_PREFLIGHT STORAGE_PIPELINE'),
        '/srv/woodright/backups/automated': (0o700, 'READ_PREFLIGHT STORAGE_PIPELINE'),
        '/srv/woodright/backups/automated/public-production': (0o700, 'READ_PREFLIGHT STORAGE_PIPELINE'),
        '/srv/woodright/backups/automated/public-production/state': (0o700, 'STORAGE_PIPELINE'),
        '/srv/woodright/docs': (0o700, 'READ_PREFLIGHT GOVERNANCE_INSTALL'),
        '/srv/woodright/docs/operator': (0o700, 'READ_PREFLIGHT GOVERNANCE_INSTALL'),
        '/srv/woodright/evidence': (0o775, 'STORAGE_PIPELINE GOVERNANCE_INSTALL GOVERNANCE_HANDOVER'),
        '/srv/woodright/locks': (0o775, 'READ_PREFLIGHT STORAGE_PIPELINE GOVERNANCE_INSTALL GOVERNANCE_HANDOVER'),
        '/srv/woodright/locks/public_production': (0o755, 'READ_PREFLIGHT'),
        '/srv/woodright/meta': (0o775, 'READ_PREFLIGHT GOVERNANCE_INSTALL GOVERNANCE_HANDOVER'),
        '/srv/woodright/ops': (0o700, 'READ_PREFLIGHT GOVERNANCE_INSTALL GOVERNANCE_HANDOVER'),
        '/srv/woodright/ops/backup': (0o700, 'READ_PREFLIGHT GOVERNANCE_INSTALL'),
        '/srv/woodright/ops/backup/lib': (0o700, 'READ_PREFLIGHT GOVERNANCE_INSTALL'),
        '/srv/woodright/ops/compose': (0o700, 'READ_PREFLIGHT GOVERNANCE_INSTALL'),
        '/srv/woodright/ops/config': (0o700, 'READ_PREFLIGHT GOVERNANCE_INSTALL'),
        '/srv/woodright/ops/config/public-launch': (0o700, 'READ_PREFLIGHT GOVERNANCE_INSTALL'),
        '/srv/woodright/ops/config/runtime-environments': (0o700, 'READ_PREFLIGHT GOVERNANCE_INSTALL'),
        '/srv/woodright/ops/lib': (0o700, 'READ_PREFLIGHT GOVERNANCE_INSTALL'),
        '/srv/woodright/ops/monitoring': (0o700, 'READ_PREFLIGHT GOVERNANCE_INSTALL'),
        '/srv/woodright/ops/release': (0o700, 'READ_PREFLIGHT GOVERNANCE_INSTALL GOVERNANCE_HANDOVER'),
        '/srv/woodright/ops/systemd': (0o700, 'READ_PREFLIGHT GOVERNANCE_INSTALL'),
        '/srv/woodright/src': (0o775, 'GOVERNANCE_INSTALL'),
    }
    LEASE_RULES = {
        '/srv/woodright/locks/public_production/live-cutover.lock': ('READ_PREFLIGHT', fcntl.LOCK_SH),
        '/srv/woodright/backups/automated/public-production/state/global.lock': ('STORAGE_PIPELINE', fcntl.LOCK_EX),
        '/srv/woodright/backups/automated/public-production/state/media.lock': ('STORAGE_PIPELINE', fcntl.LOCK_EX),
        '/srv/woodright/backups/automated/public-production/state/postgres.lock': ('STORAGE_PIPELINE', fcntl.LOCK_EX),
    }
    DIRECTORY_PURPOSES = {
        ('READ_PREFLIGHT', 'backup_capacity'): {
            '/srv/woodright/backups/automated',
            '/srv/woodright/backups/automated/public-production'},
        ('GOVERNANCE_INSTALL', 'evidence_parent'): {'/srv/woodright/evidence'},
    }
    ROLES = {'READ_PREFLIGHT', 'STORAGE_PIPELINE', 'GOVERNANCE_INSTALL',
             'GOVERNANCE_HANDOVER'}

    @staticmethod
    def _identity(info):
        return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid)

    @staticmethod
    def _file_identity(info):
        return OperatorParentPolicy._identity(info) + (
            info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)

    @staticmethod
    def _path(path):
        value = os.fspath(path)
        if (not value.startswith('/') or str(Path(value)) != value or
                '..' in Path(value).parts):
            raise ValueError('exact absolute canonical path required')
        return value

    @staticmethod
    def _root_object(info, directory=False):
        kind = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
        if (not kind or info.st_uid != 0 or info.st_mode & 0o022 or
                (not directory and info.st_nlink != 1)):
            raise ValueError('protected root-owned canonical object required')

    def __init__(self, path, checksum, role):
        self._dirs = {}
        self._locks = []
        self._parents = {}
        self._leases = {}
        self._closed = False
        self.role = role
        self.contract_sha256 = checksum
        try:
            if (self._path(path) != self.BOOTSTRAP or role not in self.ROLES or
                    not isinstance(checksum, str) or len(checksum) != 64 or
                    any(c not in '0123456789abcdef' for c in checksum)):
                raise ValueError('independent exact parent bootstrap required')
            # No exceptions exist while the independent authority is read.
            raw = self.read(path, expected_sha256=checksum, max_bytes=65536)
            def unique(pairs):
                result = {}
                for key, value in pairs:
                    if key in result:
                        raise ValueError('duplicate parent contract key')
                    result[key] = value
                return result
            contract = json.loads(raw, object_pairs_hook=unique)
            if (set(contract) != {'schema', 'trust_model', 'allowed_roles', 'parents', 'leases'} or
                    contract['schema'] != 'woodright-operator-parent-contract-v2' or
                    contract['trust_model'] != 'authorized_operator_not_hostile_uid1000'):
                raise ValueError('exact trusted-operator parent schema required')
            roles = contract['allowed_roles']
            if (not isinstance(roles, list) or not roles or
                    any(not isinstance(x, str) or x not in self.ROLES for x in roles) or
                    len(roles) != len(set(roles)) or role not in roles):
                raise ValueError('parent contract caller role refused')
            parents = contract['parents']
            if not isinstance(parents, dict) or set(parents) != set(self.PARENT_RULES):
                raise ValueError('exact finite witnessed parent ledger required')
            for name, row in parents.items():
                if (not isinstance(row, dict) or
                        set(row) != {'dev', 'ino', 'uid', 'gid', 'mode'} or
                        any(type(v) is not int for v in row.values()) or
                        row['dev'] <= 0 or row['ino'] <= 0 or
                        (row['uid'], row['gid'], row['mode']) !=
                        (1000, 1000, self.PARENT_RULES[name][0])):
                    raise ValueError('exact witnessed parent identity required')
            leases = contract['leases']
            if not isinstance(leases, dict) or set(leases) != set(self.LEASE_RULES):
                raise ValueError('exact finite purpose-only lease ledger required')
            for row in leases.values():
                if (not isinstance(row, dict) or
                        set(row) != {'dev', 'ino', 'uid', 'gid', 'mode', 'nlink', 'size'} or
                        any(type(v) is not int for v in row.values()) or
                        row['dev'] <= 0 or row['ino'] <= 0 or
                        (row['uid'], row['gid'], row['mode'], row['nlink'], row['size']) !=
                        (1000, 1000, 0o644, 1, 0)):
                    raise ValueError('exact witnessed canonical lease identity required')
            self._parents = parents
            self._leases = leases
            self.checkpoint()
        except BaseException:
            self.close()
            raise

    def _parent(self, name, info):
        expected = self._parents.get(name)
        try:
            if expected is None:
                self._root_object(info, directory=True)
            elif (self.role not in self.PARENT_RULES[name][1].split() or
                    not stat.S_ISDIR(info.st_mode) or
                    (info.st_dev, info.st_ino, info.st_uid, info.st_gid,
                     stat.S_IMODE(info.st_mode)) != tuple(expected[k] for k in
                                                         ['dev', 'ino', 'uid', 'gid', 'mode'])):
                raise ValueError('witnessed parent identity drift')
        except ValueError:
            # Diagnostic facts do not approve this parent or add an exception.
            facts = dict(path=name, dev=info.st_dev, ino=info.st_ino,
                         uid=info.st_uid, gid=info.st_gid, mode=oct(stat.S_IMODE(info.st_mode)),
                         type='directory' if stat.S_ISDIR(info.st_mode) else
                              'symlink' if stat.S_ISLNK(info.st_mode) else 'other')
            raise ValueError('parent_contract_refused ' + json.dumps(facts, sort_keys=True)) from None

    def _walk(self, path):
        name = self._path(path)
        if '/' not in self._dirs:
            fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                info = os.fstat(fd)
                self._parent('/', info)
                if self._identity(os.lstat('/')) != self._identity(info):
                    raise ValueError('root descriptor identity drift')
                self._dirs['/'] = (fd, self._identity(info))
            except BaseException:
                os.close(fd)
                raise
        current = '/'
        for part in Path(name).parts[1:]:
            parent_fd = self._dirs[current][0]
            child = str(Path(current) / part)
            before = os.stat(part, dir_fd=parent_fd, follow_symlinks=False)
            self._parent(child, before)
            if child not in self._dirs:
                fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                             dir_fd=parent_fd)
                try:
                    if self._identity(os.fstat(fd)) != self._identity(before):
                        raise ValueError('parent descriptor identity drift')
                    self._dirs[child] = (fd, self._identity(before))
                except BaseException:
                    os.close(fd)
                    raise
            elif (self._dirs[child][1] != self._identity(before) or
                  self._identity(os.fstat(self._dirs[child][0])) != self._identity(before)):
                raise ValueError('anchored parent pathname changed')
            current = child
        return self._dirs[current][0]

    def checkpoint(self):
        if self._closed:
            raise ValueError('closed parent policy cannot be reused')
        for path, (fd, expected) in self._dirs.items():
            info = os.fstat(fd)
            self._parent(path, info)
            if path == '/':
                actual = os.lstat('/')
            else:
                actual = os.stat(Path(path).name,
                                 dir_fd=self._dirs[str(Path(path).parent)][0],
                                 follow_symlinks=False)
            if self._identity(info) != expected or self._identity(actual) != expected:
                raise ValueError('retained parent path or descriptor changed')
        for path, fd, expected, operation in self._locks:
            parent = self._dirs[str(Path(path).parent)][0]
            actual = os.stat(Path(path).name, dir_fd=parent, follow_symlinks=False)
            self._lease_object(path, actual, operation)
            self._lease_object(path, os.fstat(fd), operation)
            if (self._file_identity(actual) != expected or
                    self._file_identity(os.fstat(fd)) != expected):
                raise ValueError('canonical lease pathname or inode changed')

    def _leaf(self, path, directory=False):
        path = self._path(path)
        if path in self.LEASE_RULES:
            raise ValueError('operator lease is not an authority or directory')
        self.checkpoint()
        parent = self._walk(str(Path(path).parent))
        info = os.stat(Path(path).name, dir_fd=parent, follow_symlinks=False)
        self._root_object(info, directory=directory)
        return parent, Path(path).name, info

    def protected(self, path, directory=False, purpose=None):
        path = self._path(path)
        if purpose is None:
            _, _, info = self._leaf(path, directory)
        else:
            if (not directory or path not in
                    self.DIRECTORY_PURPOSES.get((self.role, purpose), set())):
                raise ValueError('exact directory object purpose required')
            self.checkpoint()
            parent = self._walk(str(Path(path).parent))
            info = os.stat(Path(path).name, dir_fd=parent, follow_symlinks=False)
            self._parent(path, info)
        if directory:
            self._walk(path)
        self.checkpoint()
        return info

    def read(self, path, expected_sha256=None, max_bytes=4 * 1024 * 1024):
        if type(max_bytes) is not int or not 0 < max_bytes <= 16 * 1024 * 1024:
            raise ValueError('bounded authority read required')
        parent, name, before = self._leaf(path)
        if before.st_size > max_bytes:
            raise ValueError('authority exceeds read bound')
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        try:
            if self._file_identity(os.fstat(fd)) != self._file_identity(before):
                raise ValueError('authority opened identity changed')
            chunks = []
            size = 0
            while True:
                block = os.read(fd, min(65536, max_bytes + 1 - size))
                if not block:
                    break
                chunks.append(block)
                size += len(block)
                if size > max_bytes:
                    raise ValueError('authority exceeds read bound')
            after = os.stat(name, dir_fd=parent, follow_symlinks=False)
            if (self._file_identity(os.fstat(fd)) != self._file_identity(before) or
                    self._file_identity(after) != self._file_identity(before)):
                raise ValueError('authority changed while reading')
            raw = b''.join(chunks)
            if expected_sha256 is not None and hashlib.sha256(raw).hexdigest() != expected_sha256:
                raise ValueError('authority checksum mismatch')
            self.checkpoint()
            return raw
        finally:
            os.close(fd)

    def _lease_object(self, path, info, operation):
        if path not in self.LEASE_RULES:
            self._root_object(info)
            return
        expected = self._leases.get(path)
        if (expected is None or (self.role, operation) != self.LEASE_RULES[path] or
                not stat.S_ISREG(info.st_mode) or
                (info.st_dev, info.st_ino, info.st_uid, info.st_gid,
                 stat.S_IMODE(info.st_mode), info.st_nlink, info.st_size) !=
                tuple(expected[k] for k in ['dev', 'ino', 'uid', 'gid', 'mode', 'nlink', 'size'])):
            raise ValueError('purpose-only canonical lease identity or role/mode refused')

    def open_lock(self, path, operation):
        if operation not in (fcntl.LOCK_SH, fcntl.LOCK_EX):
            raise ValueError('explicit nonblocking lease mode required')
        path = self._path(path)
        self.checkpoint()
        parent = self._walk(str(Path(path).parent))
        name = Path(path).name
        before = os.stat(name, dir_fd=parent, follow_symlinks=False)
        self._lease_object(path, before, operation)
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        try:
            if self._file_identity(os.fstat(fd)) != self._file_identity(before):
                raise ValueError('lease opened identity changed')
            fcntl.flock(fd, operation | fcntl.LOCK_NB)
            self._locks.append((path, fd, self._file_identity(before), operation))
            self.checkpoint()
            return fd
        except BaseException:
            self._locks = [item for item in self._locks if item[1] != fd]
            os.close(fd)
            raise

    def _writable_parent(self, path):
        if self.role == 'READ_PREFLIGHT':
            raise ValueError('read preflight cannot authorize output')
        self.checkpoint()
        path = self._path(path)
        if path in self.LEASE_RULES:
            raise ValueError('operator lease cannot be an output or authority')
        return self._walk(str(Path(path).parent)), Path(path).name

    def mkdir(self, path):
        parent, name = self._writable_parent(path)
        os.mkdir(name, mode=0o700, dir_fd=parent)
        self.protected(path, directory=True)
        os.fsync(parent)
        self.checkpoint()

    def create_output(self, path):
        # Caller owns this one new output FD. Existing outputs are never replaced.
        parent, name = self._writable_parent(path)
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=parent)
        try:
            self._root_object(os.fstat(fd))
            self.checkpoint()
            return fd
        except BaseException:
            os.close(fd)
            raise

    def write(self, path, raw):
        if not isinstance(raw, bytes) or len(raw) > 4 * 1024 * 1024:
            raise ValueError('bounded authority bytes required')
        parent, name = self._writable_parent(path)
        try:
            before = os.stat(name, dir_fd=parent, follow_symlinks=False)
            self._root_object(before)
        except FileNotFoundError:
            before = None
        temp = '.parent-policy-' + os.urandom(16).hex()
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=parent)
        staged = os.fstat(fd)
        try:
            with os.fdopen(fd, 'wb') as stream:
                self._root_object(staged)
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
                staged = os.fstat(stream.fileno())
            self.checkpoint()
            if self._file_identity(os.stat(temp, dir_fd=parent, follow_symlinks=False)) != self._file_identity(staged):
                raise ValueError('staged authority changed before replace')
            try:
                now = os.stat(name, dir_fd=parent, follow_symlinks=False)
            except FileNotFoundError:
                now = None
            if ((before is None) != (now is None) or
                    before is not None and self._file_identity(before) != self._file_identity(now)):
                raise ValueError('authority target changed before replace')
            os.replace(temp, name, src_dir_fd=parent, dst_dir_fd=parent)
            os.fsync(parent)
            self.read(path, expected_sha256=hashlib.sha256(raw).hexdigest())
        finally:
            try:
                leftover = os.stat(temp, dir_fd=parent, follow_symlinks=False)
            except FileNotFoundError:
                leftover = None
            if leftover is not None:
                if self._file_identity(leftover) != self._file_identity(staged):
                    raise ValueError('owned temporary authority identity changed')
                os.unlink(temp, dir_fd=parent)

    def unlink(self, path, expected_sha256):
        parent, name = self._writable_parent(path)
        before = os.stat(name, dir_fd=parent, follow_symlinks=False)
        self._root_object(before)
        self.read(path, expected_sha256=expected_sha256)
        if self._file_identity(os.stat(name, dir_fd=parent, follow_symlinks=False)) != self._file_identity(before):
            raise ValueError('authority target changed before removal')
        self.checkpoint()
        os.unlink(name, dir_fd=parent)
        os.fsync(parent)
        self.checkpoint()

    def close(self):
        # Caller must retain this object until every inherited worker is drained.
        # Close only: never LOCK_UN on a description shared with a child.
        for _, fd, _, _ in self._locks:
            os.close(fd)
        self._locks = []
        for fd, _ in reversed(list(self._dirs.values())):
            os.close(fd)
        self._dirs = {}
        self._closed = True

    def retained_fds(self):
        self.checkpoint()
        return tuple(fd for fd, _ in self._dirs.values()) + tuple(fd for _, fd, _, _ in self._locks)
# END EXACT OPERATOR PARENT POLICY V2


_PARENT_POLICY = None

def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def protected(path, directory=False, purpose=None):
    if _PARENT_POLICY is not None:
        return _PARENT_POLICY.protected(path, directory, purpose=purpose)
    path = Path(path)
    if not path.is_absolute():
        raise ValueError('absolute canonical path required')
    for parent in reversed(path.parents):
        s = parent.lstat()
        if not stat.S_ISDIR(s.st_mode) or s.st_uid != 0 or s.st_mode & 0o022:
            raise ValueError('unsafe canonical parent')
    s = path.lstat()
    kind = stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode)
    if not kind or s.st_uid != 0 or s.st_mode & 0o022:
        raise ValueError('protected root-owned canonical object required')
    return s


def read(path):
    if _PARENT_POLICY is not None:
        return _PARENT_POLICY.read(path)
    protected(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        raw = b''
        while True:
            block = os.read(fd, 65536)
            if not block:
                break
            raw += block
            if len(raw) > 4 * 1024 * 1024:
                raise ValueError('control artifact exceeds bound')
        after = os.fstat(fd)
        if (before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns):
            raise ValueError('artifact changed while reading')
        return raw
    finally:
        os.close(fd)


def inspect(name):
    raw = subprocess.check_output(['docker', 'inspect', name], env=ENV, timeout=10)
    d = json.loads(raw)[0]
    if not d['State']['Running'] or d['State'].get('Health', {}).get('Status') != 'healthy':
        raise ValueError('runtime is not healthy')
    return {'container_id': d['Id'], 'image': d['Config']['Image'],
            'source': d['Config'].get('Labels', {}).get('org.opencontainers.image.revision'),
            'started': d['State']['StartedAt'], 'restarts': d['RestartCount']}


def validate_metadata(active_raw, pending_raw, owner, intent, workspace, backend):
    """Pure semantic validation, also used by the unique new guard tests."""
    if active_raw != pending_raw:
        raise ValueError('active/pending bytes disagree')
    if sha(active_raw) != intent['expected_workspace_release_sha256']:
        raise ValueError('workspace release preimage changed')
    active = json.loads(active_raw)
    if active.get('schema') != 'woodright-team-workspace-release-v1' or active.get('state') != 'done_deployed_and_verified':
        raise ValueError('unverified or unknown workspace release')
    if active.get('source') != intent['application_source_sha'] or active.get('url') != intent['application_url']:
        raise ValueError('workspace release authority mismatch')
    if active.get('owner_authorization_sha256') != intent['expected_workspace_owner_intent_sha256']:
        raise ValueError('workspace owner intent mismatch')
    if workspace != intent['expected_workspace'] or backend != intent['expected_backend']:
        raise ValueError('runtime CAS changed')
    for key, actual in [('workspace', workspace), ('backend', backend)]:
        if active.get(key) != {k: actual[k] for k in ['container_id', 'image', 'source']}:
            raise ValueError('release runtime binding changed')
    if owner.get('owner') != 'deploy-team-workspace.py' or owner.get('runtime_role') != 'team_workspace' or owner.get('source') != intent['application_source_sha'] or owner.get('url') != intent['application_url']:
        raise ValueError('workspace owner metadata mismatch')


def installed_path(relative):
    if relative.startswith('ops/') and '..' not in Path(relative).parts:
        return OPS / relative[4:]
    if relative.startswith('scripts/') and '..' not in Path(relative).parts:
        return TOOLS / Path(relative).name
    if relative.startswith('docs/operator/') and '..' not in Path(relative).parts:
        return ROOT / 'docs/operator' / Path(relative).name
    raise ValueError('unexpected bundle destination')


def validate_storage_scope(files, six):
    if six != REVIEWED_STORAGE_HASHES or any(files.get(path) != expected for path, expected in six.items()):
        raise ValueError('six exact reviewed storage files must remain unchanged')


def validate_source(source, intent):
    protected(source, directory=True)
    if source.parent != ROOT / 'src':
        raise ValueError('qualified source checkout required')
    head = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], env=ENV, timeout=10).decode().strip()
    dirty = subprocess.check_output(['git', '-C', str(source), 'status', '--porcelain', '--untracked-files=no'], env=ENV, timeout=10)
    if head != intent['governance_source_sha'] or dirty.strip():
        raise ValueError('exact clean qualified governance source required')
    files = intent['native_bundle_files_sha256']
    if len(files) != 91:
        raise ValueError('exact reviewed native91 coverage required')
    for relative, expected in files.items():
        installed_path(relative)
        if sha(read(source / relative)) != expected:
            raise ValueError('qualified source hash mismatch')
    six = intent['preserved_storage_files_sha256']
    validate_storage_scope(files, six)
    wrapper = source / 'ops/release/guarded-governance-install.py'
    if Path(__file__).absolute() != wrapper or sha(read(wrapper)) != intent['operator_wrapper_sha256']:
        raise ValueError('qualified pinned operator wrapper required')


class UnknownWorker(RuntimeError):
    """Never translate this result to FREE or a successful native install."""
    def __init__(self, pgid):
        super().__init__('BUSY_UNKNOWN_WORKER')
        self.pgid = pgid


def group_exists(pgid):
    try:
        os.killpg(pgid, 0)
        return True
    except ProcessLookupError:
        return False


def drain_owned_group(child):
    with shield_interrupts():
        try:
            for sig, grace in [(signal.SIGTERM, 5), (signal.SIGKILL, 5)]:
                try:
                    os.killpg(child.pid, sig)
                except ProcessLookupError:
                    pass
                end = time.monotonic() + grace
                while time.monotonic() < end:
                    child.poll()
                    if child.returncode is not None and not group_exists(child.pid):
                        return
                    time.sleep(0.05)
        except BaseException:
            raise UnknownWorker(child.pid)
    raise UnknownWorker(child.pid)


@contextlib.contextmanager
def shield_interrupts():
    old = {sig: signal.getsignal(sig) for sig in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]}
    try:
        for sig in old:
            signal.signal(sig, signal.SIG_IGN)
        yield
    finally:
        for sig, handler in old.items():
            signal.signal(sig, handler)


def hold_unknown_group(pgid):
    # No successful/free receipt and no lease release while an owned worker's
    # termination is unknown. Operator recovery must resolve this BUSY state.
    # SIGKILL cannot be defended against; operators must not kill this guardian
    # before draining the recorded owned group.
    with shield_interrupts():
        while True:
            try:
                if not group_exists(pgid):
                    return
            except BaseException:
                # An unobservable group is still BUSY, never confirmed absent.
                pass
            try:
                time.sleep(1)
            except BaseException:
                # Signal shielding handles ordinary OS interrupts; also retain
                # the guard if a Python-level interrupt interrupts the delay.
                pass


def record_busy_and_hold(evidence, result, pgid):
    # Retention is independent of disk space, log I/O, stdout and interrupts.
    with shield_interrupts():
        try:
            output = evidence / 'busy-unknown-worker.json'
            stream = (os.fdopen(_PARENT_POLICY.create_output(output), 'w') if _PARENT_POLICY is not None else output.open('x'))
            with stream:
                os.fchmod(stream.fileno(), 0o600)
                json.dump(result, stream, indent=2)
            print(json.dumps(result), flush=True)
        except BaseException:
            pass
        finally:
            hold_unknown_group(pgid)


def session_stat():
    s = protected(Path('/etc/woodright/team-workspace/session.env'))
    if stat.S_IMODE(s.st_mode) != 0o600:
        raise ValueError('session secret stat mismatch')
    return (s.st_ino, s.st_uid, s.st_mode, s.st_size, s.st_mtime_ns)


def run_guarded_child(argv, lease_fd, log, seconds):
    # The child inherits the SAME open file description. Closing the parent's
    # descriptor cannot free its lease while a surviving child still holds it.
    # Never issue LOCK_UN: that would unlock the shared description prematurely.
    if _PARENT_POLICY is not None:
        _PARENT_POLICY.checkpoint()
    child = subprocess.Popen(argv, env=ENV, stdout=log, stderr=subprocess.STDOUT,
                             start_new_session=True, pass_fds=(_PARENT_POLICY.retained_fds() if _PARENT_POLICY is not None else (lease_fd,)))
    try:
        code = child.wait(timeout=seconds)
        if group_exists(child.pid):
            drain_owned_group(child)
            raise RuntimeError('native child left workers; no install acceptance')
        if _PARENT_POLICY is not None:
            _PARENT_POLICY.checkpoint()
        return code
    except BaseException:
        try:
            drain_owned_group(child)
        except BaseException:
            raise UnknownWorker(child.pid)
        raise RuntimeError('native child aborted; no install acceptance')


def bundle_verify(intent, lease_fd, log):
    marker = read(TOOLS / 'INSTALLED_ENV_GOVERNANCE_SHA.txt').decode().strip()
    manifest_raw = read(TOOLS / 'ENV_GOVERNANCE_BUNDLE_MANIFEST.json')
    manifest = json.loads(manifest_raw)
    if marker != intent['governance_source_sha'] or manifest.get('source_sha') != marker:
        raise ValueError('installed source mismatch')
    entries = manifest.get('files', [])
    by_relative = {v['relative_path']: v for v in entries}
    if len(entries) != 91 or len(by_relative) != 91 or set(by_relative) != set(intent['native_bundle_files_sha256']):
        raise ValueError('native91 manifest coverage mismatch')
    for relative, expected in intent['native_bundle_files_sha256'].items():
        item = by_relative[relative]
        destination = installed_path(relative)
        if item.get('installed_path') != str(destination) or item.get('sha256') != expected or sha(read(destination)) != expected:
            raise ValueError('installed bundle bytes differ from qualified source')
    result = run_guarded_child(['bash', str(OPS / 'release/verify-environment-governance-bundle.sh'),
                                '--expected-sha', marker], lease_fd, log, 45)
    if result:
        raise ValueError('full native verifier refused installed bundle')
    return sha(manifest_raw)


def verify_previous_bundle(intent, lease_fd, log):
    raw = read(TOOLS / 'ENV_GOVERNANCE_BUNDLE_MANIFEST.json')
    if sha(raw) != intent['expected_current_governance_manifest_sha256']:
        raise ValueError('previous manifest changed')
    manifest = json.loads(raw)
    entries = manifest.get('files', [])
    verifiers = [e for e in entries if e.get('relative_path') == 'ops/release/verify-environment-governance-bundle.sh']
    verifier = OPS / 'release/verify-environment-governance-bundle.sh'
    if manifest.get('source_sha') != intent['expected_current_governance_source_sha'] or len(verifiers) != 1 or verifiers[0].get('installed_path') != str(verifier) or sha(read(verifier)) != verifiers[0].get('sha256'):
        raise ValueError('previous verifier authority mismatch')
    if run_guarded_child(['bash', str(verifier), '--expected-sha', intent['expected_current_governance_source_sha']], lease_fd, log, 45):
        raise ValueError('previous full native bundle verification failed')


def refuse_incomplete_handover():
    journal = WS / 'GOVERNANCE_HANDOVER_PENDING.json'
    if journal.exists() or journal.is_symlink():
        raise ValueError('incomplete handover requires dedicated recovery before installation')


def storage_preimages(intent):
    """Called only AFTER verified previous native bundle; no arbitrary six pins."""
    raw = read(TOOLS / 'ENV_GOVERNANCE_BUNDLE_MANIFEST.json')
    if sha(raw) != intent['expected_current_governance_manifest_sha256']:
        raise ValueError('previous storage manifest changed')
    manifest = json.loads(raw)
    entries = {e['relative_path']: e for e in manifest['files']}
    if manifest['source_sha'] != intent['expected_current_governance_source_sha']:
        raise ValueError('previous storage authority changed')
    initial = manifest['source_sha'] == LEGACY_SOURCE
    if initial and intent.get('allow_initial_595_to_reviewed_3bf_storage_transition') is not True:
        raise ValueError('initial reviewed storage upgrade needs explicit owner authorization')
    result = {}
    for relative, target in REVIEWED_STORAGE_HASHES.items():
        previous = LEGACY595_STORAGE_HASHES[relative] if initial else target
        destination = installed_path(relative)
        entry = entries.get(relative)
        if previous is None:
            if entry is not None or destination.exists() or destination.is_symlink():
                raise ValueError('new reviewed storage file must be absent before initial upgrade')
        elif entry is None or entry.get('installed_path') != str(destination) or entry.get('sha256') != previous or sha(read(destination)) != previous:
            raise ValueError('verified storage preimage mismatch')
        result[relative] = previous
    return result


def verify_storage_postimages():
    for relative, expected in REVIEWED_STORAGE_HASHES.items():
        if sha(read(installed_path(relative))) != expected:
            raise ValueError('reviewed storage postimage mismatch')


def main():
    global _PARENT_POLICY
    ap = argparse.ArgumentParser()
    ap.add_argument('--source-root', type=Path, required=True)
    ap.add_argument('--intent', type=Path, required=True)
    ap.add_argument('--intent-checksum', required=True)
    ap.add_argument('--evidence', type=Path, required=True)
    ap.add_argument('--parent-contract', type=Path, required=True)
    ap.add_argument('--parent-contract-checksum', required=True)
    args = ap.parse_args()
    if os.geteuid() != 0:
        raise ValueError('qualified root operator required')
    _PARENT_POLICY = OperatorParentPolicy(args.parent_contract, args.parent_contract_checksum, 'GOVERNANCE_INSTALL')
    intent_raw = read(args.intent)
    intent = json.loads(intent_raw)
    if sha(intent_raw) != args.intent_checksum or intent.get('schema') != 'woodright-governance-install-intent-v1' or intent.get('scope') != 'governance_install' or intent.get('owner_decision') != 'approved' or intent.get('operator_only_boundary_accepted') is not True:
        raise ValueError('exact approved governance-install operator intent required')
    if intent.get('operator_parent_contract_sha256') != args.parent_contract_checksum:
        raise ValueError('install authority must bind independent parent contract')
    validate_source(args.source_root, intent)
    lease_fd = _PARENT_POLICY.open_lock(LOCK, fcntl.LOCK_EX)
    # No global lock here: the unchanged native installer obtains it itself.
    refuse_incomplete_handover()
    active_raw = read(WS / 'ACTIVE_RELEASE.json')
    pending_raw = read(WS / 'PENDING_RELEASE.json')
    owner_raw = read(WS / 'ACTIVE_OWNER.json')
    validate_metadata(active_raw, pending_raw, json.loads(owner_raw), intent,
                      inspect('woodright-team-workspace'), inspect('woodright-public-production-backend'))
    if inspect('woodright-public-production-storefront') != intent['expected_storefront']:
        raise ValueError('storefront CAS changed')
    secret_stat = session_stat()  # never read or hash the secret's contents
    if set(intent['expected_control_file_sha256']) != PUBLIC_CONTROLS:
        raise ValueError('exact protected control coverage required')
    for file, expected in intent['expected_control_file_sha256'].items():
        if sha(read(Path(file))) != expected:
            raise ValueError('control-file CAS changed')
    marker = read(TOOLS / 'INSTALLED_ENV_GOVERNANCE_SHA.txt').decode().strip()
    if marker != intent['expected_current_governance_source_sha'] or sha(read(TOOLS / 'ENV_GOVERNANCE_BUNDLE_MANIFEST.json')) != intent['expected_current_governance_manifest_sha256']:
        raise ValueError('current governance authority changed')
    if args.evidence.parent == ROOT / 'evidence':
        protected(args.evidence.parent, directory=True, purpose='evidence_parent')
    else:
        protected(args.evidence.parent, directory=True)
    _PARENT_POLICY.mkdir(args.evidence)  # unique; no overwrite or symlink reuse
    fd = _PARENT_POLICY.create_output(args.evidence / 'native-install-and-verify.log')
    result = {'state': 'RUNNING', 'source': intent['governance_source_sha'],
              'application_source': intent['application_source_sha'], 'operator_only_boundary': True}
    try:
        with os.fdopen(fd, 'wb') as log:
            _PARENT_POLICY.checkpoint()
            verify_previous_bundle(intent, lease_fd, log)
            _PARENT_POLICY.checkpoint()
            result['storage_preimages'] = storage_preimages(intent)
            _PARENT_POLICY.checkpoint()
            code = run_guarded_child(['bash', str(args.source_root / 'ops/release/install-environment-governance.sh'),
                                      '--source-sha', intent['governance_source_sha'],
                                      '--repo-root', str(args.source_root)], lease_fd, log, 180)
            _PARENT_POLICY.checkpoint()
            if code:
                raise RuntimeError('native installer refused; no install acceptance')
            result['governance_manifest_sha256'] = bundle_verify(intent, lease_fd, log)
            verify_storage_postimages()
            result['storage_postimages'] = REVIEWED_STORAGE_HASHES
        if read(WS / 'ACTIVE_RELEASE.json') != active_raw or read(WS / 'PENDING_RELEASE.json') != pending_raw or read(WS / 'ACTIVE_OWNER.json') != owner_raw:
            raise ValueError('workspace authority changed during native install')
        if inspect('woodright-team-workspace') != intent['expected_workspace'] or inspect('woodright-public-production-backend') != intent['expected_backend']:
            raise ValueError('peer runtime changed during native install')
        if inspect('woodright-public-production-storefront') != intent['expected_storefront'] or session_stat() != secret_stat:
            raise ValueError('storefront or secret stat changed during install')
        # Public controls must also retain their exact preimages. Governance
        # files are independently checked against the NEW qualified bundle.
        for file, expected in intent['expected_control_file_sha256'].items():
            if sha(read(Path(file))) != expected:
                raise ValueError('protected control preimage changed during install')
        _PARENT_POLICY.checkpoint()
        result['operator_parent_contract_sha256'] = args.parent_contract_checksum
        result['state'] = 'NATIVE_INSTALL_AND_VERIFY_ACCEPTED'
    except UnknownWorker as error:
        result['state'] = 'BUSY_UNKNOWN_WORKER'
        result['owned_process_group'] = error.pgid
        record_busy_and_hold(args.evidence, result, error.pgid)
        result['state'] = 'FAILED_WORKER_DRAINED_NOT_ACCEPTED'
        raise RuntimeError('previously unknown worker drained; no install acceptance')
    except BaseException:
        result['state'] = 'FAILED_NOT_ACCEPTED'
        raise
    finally:
        try:
            with os.fdopen(_PARENT_POLICY.create_output(args.evidence / 'operator-result.json'), 'w') as stream:
                json.dump(result, stream, indent=2)
        finally:
            # close only; NEVER LOCK_UN. Existing BUSY guard drains workers first.
            _PARENT_POLICY.close()


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    try:
        main()
    finally:
        if _PARENT_POLICY is not None:
            _PARENT_POLICY.close()
