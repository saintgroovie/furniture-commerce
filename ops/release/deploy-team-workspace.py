#!/usr/bin/env python3
"""Governed authenticated workspace deployment. Plan is read-only; deploy never pulls or migrates."""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import signal
import stat
import subprocess
import time
import urllib.request
import urllib.error
import urllib.parse
import uuid

ROOT = Path('/srv/woodright/team-workspace')
ROUTE = Path('/etc/dokploy/traefik/dynamic/woodright-team-workspace.yml')
SECRET = Path('/etc/woodright/team-workspace/session.env')
CONTAINER = 'woodright-team-workspace'
PROJECT = 'woodright-team-workspace'
URL = 'https://os.woodright.ru/'
LEGACY_URL = 'https://woodright.ru/os'


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


def configure_operator_parent_contract(path, checksum):
    global _PARENT_POLICY
    if _PARENT_POLICY is None:
        _PARENT_POLICY = OperatorParentPolicy(path, checksum, 'GOVERNANCE_HANDOVER')
    elif (str(path) != _PARENT_POLICY.BOOTSTRAP or
          checksum != _PARENT_POLICY.contract_sha256 or
          _PARENT_POLICY.role != 'GOVERNANCE_HANDOVER'):
        raise ValueError('parent policy configuration is immutable')
    _PARENT_POLICY.checkpoint()
    return _PARENT_POLICY

def digest(value):
    return hashlib.sha256(value).hexdigest()


def regular(path):
    if _PARENT_POLICY is not None:
        return _PARENT_POLICY.read(path)
    if path.is_symlink() or not path.is_file():
        raise ValueError('regular non-symlink file required: ' + str(path))
    return path.read_bytes()


def compose_document(image, backend_source):
    if not re.fullmatch(r'ghcr.io/saintgroovie/woodright-workspace@sha256:[a-f0-9]{64}', image):
        raise ValueError('immutable workspace image required')
    if not re.fullmatch(r'[a-f0-9]{40}', backend_source):
        raise ValueError('exact backend component revision required')
    return {'name': PROJECT, 'services': {'workspace': {
        'image': image, 'container_name': CONTAINER, 'restart': 'unless-stopped',
        'ports': ['127.0.0.1:44320:4320'], 'env_file': [str(SECRET)],
        'environment': {
            'PORT': '4320', 'HOSTNAME': '0.0.0.0', 'WOODRIGHT_WORKSPACE_RUNTIME': 'hosted',
            'WOODRIGHT_WORKSPACE_ORIGIN': 'https://os.woodright.ru',
            'MEDUSA_BACKEND_INTERNAL_URL': 'http://woodright-public-production-backend:9000',
            'WOODRIGHT_DATA_ENVIRONMENT': 'public_production',
            'WOODRIGHT_EXPECTED_DATABASE_IDENTITY': 'public_production_db',
            'WOODRIGHT_EXPECTED_BACKEND_REVISION': backend_source, 'WOODRIGHT_LIVE_WRITES': '1',
            'WOODRIGHT_MEDIA_ORIGINS': 'https://api.woodright.ru,http://api.woodright.ru',
            'WOODRIGHT_PUBLIC_API_ORIGINS': 'https://api.woodright.ru,http://api.woodright.ru',
        },
        'labels': {'com.woodright.runtime-role': 'team_workspace', 'com.woodright.controller': 'deploy-team-workspace.py', 'traefik.enable': 'false'},
        'networks': ['commerce', 'proxy'], 'read_only': True,
        'tmpfs': ['/tmp:rw,noexec,nosuid,size=64m'], 'cap_drop': ['ALL'],
        'security_opt': ['no-new-privileges:true'], 'mem_limit': '512m',
    }}, 'networks': {
        'commerce': {'external': True, 'name': 'woodright-public-production_woodright_public'},
        'proxy': {'external': True, 'name': 'dokploy-network'},
    }}


def router_document():
    legacy = 'Host(`woodright.ru`) && (Path(`/os`) || PathPrefix(`/os/`))'
    entry = 'Host(`woodright.ru`) && (Path(`/os`) || Path(`/os/`)) && (Method(`GET`) || Method(`HEAD`))'
    private = ['wr-team-os-rate', 'wr-team-os-private']
    tls = {'certResolver': 'letsencrypt'}
    return {'http': {'routers': {
        'wr-team-os-http': {'rule': 'Host(`os.woodright.ru`)', 'priority': 200,
                            'entryPoints': ['web'], 'middlewares': ['redirect-to-https'], 'service': 'wr-team-os'},
        'wr-team-os-https': {'rule': 'Host(`os.woodright.ru`)', 'priority': 200,
                             'entryPoints': ['websecure'], 'tls': tls,
                             'middlewares': private, 'service': 'wr-team-os'},
        # Legacy APIs and non-entry paths never reach authenticated BFF handlers.
        'wr-team-os-legacy-http': {'rule': legacy, 'priority': 200, 'entryPoints': ['web'],
                                  'middlewares': private + ['wr-team-os-legacy-refused'], 'service': 'wr-team-os'},
        'wr-team-os-legacy-https': {'rule': legacy, 'priority': 200, 'entryPoints': ['websecure'], 'tls': tls,
                                   'middlewares': private + ['wr-team-os-legacy-refused'], 'service': 'wr-team-os'},
        'wr-team-os-legacy-entry-http': {'rule': entry, 'priority': 220, 'entryPoints': ['web'],
                                        'middlewares': ['redirect-to-https'], 'service': 'wr-team-os'},
        'wr-team-os-legacy-entry-https': {'rule': entry, 'priority': 220, 'entryPoints': ['websecure'], 'tls': tls,
                                         'middlewares': private + ['wr-team-os-legacy-entry'], 'service': 'wr-team-os'},
    }, 'middlewares': {
        'wr-team-os-rate': {'rateLimit': {'average': 30, 'burst': 60}},
        'wr-team-os-private': {'headers': {'customResponseHeaders': {'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Cache-Control': 'private, no-store', 'X-Frame-Options': 'DENY'}}},
        'wr-team-os-legacy-entry': {'replacePath': {'path': '/api/legacy-entry'}},
        'wr-team-os-legacy-refused': {'replacePath': {'path': '/api/legacy-refused'}},
    }, 'services': {'wr-team-os': {'loadBalancer': {'servers': [{'url': 'http://' + CONTAINER + ':4320'}]}}}}}


def local_health_base(release_url):
    # Baseline comes from CAS-verified metadata; never probe an arbitrary URL.
    if release_url == LEGACY_URL:
        return 'http://127.0.0.1:44320/os'
    if release_url == URL:
        return 'http://127.0.0.1:44320'
    raise ValueError('unsupported workspace release URL')


def dom_url_allowed(value):
    try:
        parsed = urllib.parse.urlsplit(value)
        return parsed.scheme == 'https' and parsed.netloc == 'os.woodright.ru' and parsed.path in ['', '/'] and not parsed.query
    except (ValueError, TypeError, AttributeError):
        return False


def write(path, data):
    if _PARENT_POLICY is not None:
        return _PARENT_POLICY.write(path, data)
    if path.is_symlink():
        raise ValueError('symlink destination refused')
    temporary = path.with_name('.' + path.name + '.' + uuid.uuid4().hex)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data); stream.flush(); os.fsync(stream.fileno())
    os.replace(temporary, path)


def json_bytes(value):
    return (json.dumps(value, indent=2) + '\n').encode()


def inspect(name):
    result = subprocess.run(['docker', 'inspect', name, '--format', '{{.Id}}|{{.Config.Image}}|{{index .Config.Labels "org.opencontainers.image.revision"}}'], capture_output=True, text=True)
    if result.returncode:
        if 'No such' in result.stderr: return None
        raise ValueError('Docker inspection unavailable')
    identity, image, source = result.stdout.strip().split('|')
    return {'container_id': identity, 'image': image, 'source': source}


def workspace_baseline(existing, source, image, root=ROOT, route=ROUTE):
    # A pending deployment is the latest runtime authority even when an older verified release exists.
    metadata = root / 'PENDING_RELEASE.json'
    if not metadata.exists() and not metadata.is_symlink():
        metadata = root / 'ACTIVE_RELEASE.json'
    raw = regular(metadata)
    packet = json.loads(raw)
    if packet.get('schema') != 'woodright-team-workspace-release-v1' or packet.get('state') not in ['deployed_not_verified', 'done_deployed_and_verified']:
        raise ValueError('aborted_conflict: workspace release state is not updateable')
    if not existing or existing['source'] != source or existing['image'] != image or existing != packet.get('workspace') or packet.get('source') != source or digest(regular(route)) != packet.get('route_sha256') or digest(regular(root / 'compose.json')) != packet.get('compose_sha256'):
        raise ValueError('aborted_conflict: active workspace changed')
    local_health_base(packet.get('url'))
    return {'state': packet['state'], 'url': packet['url'], 'metadata_path': str(metadata), 'metadata_sha256': digest(raw), 'raw': raw}


def command(argv, log):
    # Remain in foreground and retain leases until the exact child has stopped, including on signals.
    with log.open('ab') as output:
        process = subprocess.Popen(argv, stdout=output, stderr=subprocess.STDOUT)
        try:
            code = process.wait()
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait()
    if code: raise ValueError('container operation failed; inspect protected operation log')


def check_http(base, source):
    base = base.rstrip('/')
    with urllib.request.urlopen(base + '/api/live/status', timeout=15) as response:
        value = json.load(response)
        if not value.get('connected') or not value.get('writeEnabled'): raise ValueError('workspace cannot verify its backend')
        if response.headers.get('X-Woodright-Workspace-Source-Sha') != source: raise ValueError('workspace HTTP source changed')
    with urllib.request.urlopen(base + '/', timeout=15) as response:
        if response.status != 200 or 'noindex' not in response.headers.get('X-Robots-Tag', ''): raise ValueError('workspace private page gate failed')
    try:
        urllib.request.urlopen(base + '/api/live/data', timeout=15)
    except urllib.error.HTTPError as error:
        if error.code == 401: return
    raise ValueError('anonymous workspace data access was not refused')


def rollback_snapshot(packet, root=ROOT):
    if packet.get('state') != 'deployed_not_verified' or packet.get('url') != URL:
        raise ValueError('only an unverified new-host deployment can be rolled back')
    operation = Path(packet.get('rollback_evidence', ''))
    if operation.parent != root or not re.fullmatch(r'operation-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}', operation.name) or operation.is_symlink() or not operation.is_dir() or operation.resolve().parent != root.resolve():
        raise ValueError('owned workspace rollback operation required')
    if digest(regular(operation / 'owner-intent.json')) != packet.get('owner_authorization_sha256') or digest(regular(operation / 'build-manifest.json')) != packet.get('build_manifest_sha256'):
        raise ValueError('rollback operation provenance changed')
    baseline = json.loads(regular(operation / 'baseline.json'))
    metadata_path = Path(baseline.get('metadata_path', ''))
    if metadata_path.parent != root or metadata_path.name not in ['PENDING_RELEASE.json', 'ACTIVE_RELEASE.json']:
        raise ValueError('owned previous metadata required')
    prior_raw = regular(operation / (metadata_path.name + '.before'))
    if digest(prior_raw) != baseline.get('metadata_sha256'):
        raise ValueError('previous metadata checksum changed')
    prior = json.loads(prior_raw)
    existing = packet.get('previous_workspace')
    if not existing or prior.get('schema') != 'woodright-team-workspace-release-v1' or prior.get('state') not in ['deployed_not_verified', 'done_deployed_and_verified'] or prior.get('workspace') != existing or prior.get('source') != existing.get('source') or baseline.get('state') != prior.get('state') or baseline.get('url') != prior.get('url') or packet.get('previous_release_metadata_sha256') != digest(prior_raw):
        raise ValueError('previous runtime or metadata identity changed')
    local_health_base(baseline['url'])
    compose = regular(operation / 'compose.before.json')
    route = regular(operation / 'route.before.json')
    if digest(compose) != prior.get('compose_sha256') or digest(route) != prior.get('route_sha256'):
        raise ValueError('rollback compose or route checksum changed')
    document = json.loads(compose)
    service = document.get('services', {}).get('workspace', {})
    if set(document.get('services', {})) != {'workspace'} or document.get('name') != PROJECT or service.get('container_name') != CONTAINER or service.get('image') != existing.get('image') or not re.fullmatch(r'ghcr.io/saintgroovie/woodright-workspace@sha256:[a-f0-9]{64}', existing.get('image', '')) or not re.fullmatch(r'[a-f0-9]{40}', existing.get('source', '')):
        raise ValueError('qualified workspace-only rollback image required')
    snapshot_raw = regular(operation / 'metadata-checksums.json')
    if digest(snapshot_raw) != packet.get('rollback_metadata_sha256'):
        raise ValueError('rollback metadata manifest changed')
    checksums = json.loads(snapshot_raw)
    if set(checksums) != {'PENDING_RELEASE.json', 'ACTIVE_RELEASE.json', 'ACTIVE_OWNER.json'}:
        raise ValueError('complete rollback metadata manifest required')
    metadata = {}
    for name in ['PENDING_RELEASE.json', 'ACTIVE_RELEASE.json', 'ACTIVE_OWNER.json']:
        path = operation / (name + '.before')
        metadata[name] = regular(path) if path.exists() or path.is_symlink() else None
        if (digest(metadata[name]) if metadata[name] is not None else None) != checksums[name]:
            raise ValueError('rollback metadata snapshot changed')
    return {'operation': operation, 'existing': existing, 'baseline': baseline, 'compose': compose, 'route': route, 'metadata': metadata, 'backend_source': service.get('environment', {}).get('WOODRIGHT_EXPECTED_BACKEND_REVISION')}


def restore_workspace(operation, existing, baseline, previous_compose, previous_route, previous_metadata, compose_cli):
    if previous_route is None:
        if ROUTE.exists(): ROUTE.unlink()
    else: write(ROUTE, previous_route)
    if previous_compose is None:
        command(compose_cli + ['down'], operation / 'rollback.log')
        (ROOT / 'compose.json').unlink(missing_ok=True)
    else:
        write(ROOT / 'compose.json', previous_compose)
        command(compose_cli + ['up', '-d', '--no-deps', '--pull', 'never', 'workspace'], operation / 'rollback.log')
        for attempt in range(40):
            try: check_http(local_health_base(baseline['url']), existing['source']); break
            except Exception:
                if attempt == 39: raise
                time.sleep(1)
        restored = inspect(CONTAINER)
        if not restored or restored['image'] != existing['image'] or restored['source'] != existing['source']:
            raise ValueError('rollback runtime identity was not confirmed')
        write(operation / 'rollback-runtime.json', json_bytes(restored))
    for name, raw in previous_metadata.items():
        if raw is None: (ROOT / name).unlink(missing_ok=True)
        else:
            if previous_compose and name in ['PENDING_RELEASE.json', 'ACTIVE_RELEASE.json']:
                prior = json.loads(raw)
                if prior.get('workspace') == existing:
                    prior['workspace'] = restored
                    prior['rollback_runtime_evidence'] = str(operation / 'rollback-runtime.json')
                    raw = json_bytes(prior)
            write(ROOT / name, raw)
    # Keep canonical metadata accurate even if external verification then fails.
    if previous_compose: check_http(baseline['url'], existing['source'])


GOVERNANCE_MARKER = Path('/srv/woodright/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt')
GOVERNANCE_MANIFEST = Path('/srv/woodright/tools/release/ENV_GOVERNANCE_BUNDLE_MANIFEST.json')
GOVERNANCE_PROGRESS = Path('/srv/woodright/tools/release/ENV_GOVERNANCE_INSTALL_IN_PROGRESS.json')
GOVERNANCE_CONTROLLER = Path('/srv/woodright/ops/release/deploy-team-workspace.py')
GOVERNANCE_VERIFIER = Path('/srv/woodright/ops/release/verify-environment-governance-bundle.sh')


def governance_request(args, intent):
    source = args.governance_source or args.source
    checksum = args.governance_manifest_checksum
    if not re.fullmatch(r'[a-f0-9]{40}', source):
        raise ValueError('exact governance source revision required')
    explicit = args.governance_source is not None or checksum is not None
    if explicit:
        if args.governance_source is None or not checksum or not re.fullmatch(r'[a-f0-9]{64}', checksum):
            raise ValueError('explicit governance source and manifest checksum required together')
        if intent.get('governance_source_sha') != source or intent.get('governance_manifest_sha256') != checksum:
            raise ValueError('exact owner governance authorization required')
    return {'source': source, 'manifest_sha256': checksum, 'explicit': explicit}


def protected_governance_file(path):
    raw = regular(path)
    info = path.stat()
    if info.st_uid != 0 or info.st_mode & 0o022:
        raise ValueError('protected root-owned governance file required')
    return raw


def verify_governance(request):
    marker = protected_governance_file(GOVERNANCE_MARKER).decode().strip()
    if marker != request['source']:
        raise ValueError('qualified workspace controller bundle is not installed')
    if not request['explicit']:
        # Compatibility with existing same-source qualified operations only.
        return None
    if Path(__file__).absolute() != GOVERNANCE_CONTROLLER:
        raise ValueError('canonical installed workspace controller required')
    if GOVERNANCE_PROGRESS.exists() or GOVERNANCE_PROGRESS.is_symlink():
        raise ValueError('governance installation is in progress')
    raw = protected_governance_file(GOVERNANCE_MANIFEST)
    manifest = json.loads(raw)
    if digest(raw) != request['manifest_sha256'] or manifest.get('source_sha') != request['source']:
        raise ValueError('qualified governance manifest mismatch')
    entries = {}
    for entry in manifest.get('files', []):
        relative = entry.get('relative_path')
        if not isinstance(relative, str) or not relative or relative in entries:
            raise ValueError('invalid or duplicate governance manifest entry')
        entries[relative] = entry
    for relative, path in [('ops/release/deploy-team-workspace.py', GOVERNANCE_CONTROLLER),
                           ('ops/release/verify-environment-governance-bundle.sh', GOVERNANCE_VERIFIER)]:
        entry = entries.get(relative, {})
        if entry.get('installed_path') != str(path) or entry.get('sha256') != digest(protected_governance_file(path)):
            raise ValueError('installed governance code differs from qualified manifest')
    result = subprocess.run(['bash', str(GOVERNANCE_VERIFIER), '--expected-sha', request['source']],
                            capture_output=True, text=True)
    if result.returncode:
        raise ValueError('full native governance bundle verification failed')
    return {'source': request['source'], 'manifest_sha256': request['manifest_sha256'],
            'controller_sha256': digest(protected_governance_file(GOVERNANCE_CONTROLLER))}


def pending_governance(packet, authority):
    recorded = packet.get('governance')
    if recorded != authority:
        raise ValueError('pending workspace governance qualification changed')


# Dedicated authority handover; these helpers never restart an application.
HANDOVER_JOURNAL = ROOT / 'GOVERNANCE_HANDOVER_PENDING.json'
HANDOVER_STORAGE_SIX = {
    'ops/backup/immutable_weekly.py', 'ops/backup/retention_catalog.py',
    'ops/backup/woodright-backup-retention.sh', 'ops/backup/woodright-media-backup.sh',
    'ops/release/install-environment-governance.sh',
    'ops/release/verify-environment-governance-bundle.sh',
}
HANDOVER_CONTROLS = [
    ROOT / 'compose.json', ROUTE,
    Path('/srv/woodright/runtime-ownership-public-production/ACTIVE_RELEASE.json'),
    Path('/srv/woodright/runtime-ownership-public-production/ACTIVE_OWNER.json'),
    Path('/srv/woodright/runtime-ownership-public-production/EXPECTED_RELEASE.json'),
    Path('/srv/woodright/meta/public_production/OWNER_APPROVED_RELEASE.json'),
    Path('/etc/dokploy/compose/woodright-public-production/code/docker-compose.yml'),
    Path('/etc/dokploy/compose/woodright-public-production/code/.env'),
]


def handover_json(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('duplicate authority JSON key')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=unique)


def handover_projection(raw, authorization):
    manifest = handover_json(raw)
    if set(manifest) != {'schema_version', 'source_sha', 'installed_at_utc', 'files'} or type(manifest['schema_version']) is not int or manifest['schema_version'] != 1:
        raise ValueError('exact native manifest schema required')
    if manifest['source_sha'] != authorization['governance_source_sha']:
        raise ValueError('native manifest source changed')
    stamp = manifest['installed_at_utc']
    if not isinstance(stamp, str) or not re.fullmatch(r'[0-9]{8}T[0-9]{6}Z', stamp):
        raise ValueError('strict native UTC installation timestamp required')
    installed = datetime.datetime.strptime(stamp, '%Y%m%dT%H%M%SZ').replace(tzinfo=datetime.timezone.utc)
    def utc(value):
        if not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z', value):
            raise ValueError('strict authorization UTC window required')
        return datetime.datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc)
    start, end = utc(authorization['install_window_start']), utc(authorization['install_window_end'])
    if not start <= installed <= end or start > end:
        raise ValueError('native timestamp outside approved installation window')
    entries = manifest['files']
    if not isinstance(entries, list) or len(entries) != 91:
        raise ValueError('native91 coverage required')
    by_path = {}
    for entry in entries:
        if set(entry) != {'relative_path', 'installed_path', 'sha256', 'mode', 'role', 'required'} or entry['required'] is not True or entry['relative_path'] in by_path:
            raise ValueError('exact unique native manifest entries required')
        by_path[entry['relative_path']] = entry['sha256']
    expected = authorization['native_bundle_files_sha256']
    six = authorization['preserved_storage_files_sha256']
    if by_path != expected or set(six) != HANDOVER_STORAGE_SIX or any(expected.get(path) != value for path, value in six.items()):
        raise ValueError('predeclared native91/storage6 hashset mismatch')
    projection = dict(manifest)
    del projection['installed_at_utc']  # the ONE dynamic key, never arbitrary removal
    h0 = digest(json.dumps(projection, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode())
    if h0 != authorization['native_manifest_projection_sha256']:
        raise ValueError('exact predeclared manifest projection required')
    return h0


def handover_read(path):
    if _PARENT_POLICY is not None:
        return _PARENT_POLICY.read(path)
    for ancestor in path.parents:
        info = ancestor.lstat()
        if ancestor.is_symlink() or not ancestor.is_dir() or info.st_uid != 0 or info.st_mode & 0o022:
            raise ValueError('protected canonical authority parent required')
    return protected_governance_file(path)


def handover_authorization(args, application_intent_raw):
    if not args.governance_authorization or not args.governance_authorization_checksum:
        raise ValueError('separate exact handover owner authorization required')
    raw = handover_read(args.governance_authorization)
    b = handover_json(raw)
    if digest(raw) != args.governance_authorization_checksum or b.get('schema') != 'woodright-governance-handover-authorization-v1' or b.get('scope') != 'adopt_exact_current_verified_workspace_governance' or b.get('owner_decision') != 'approved' or b.get('allow_native_installed_timestamp_for_exact_projection') is not True:
        raise ValueError('exact approved handover-only scope required')
    if b.get('application_owner_intent_sha256') != digest(application_intent_raw) or b.get('application_source_sha') != args.source or b.get('application_image') != args.image or b.get('application_url') != URL:
        raise ValueError('original application authority mismatch')
    if not args.governance_source or not re.fullmatch(r'[a-f0-9]{40}', args.governance_source) or b.get('governance_source_sha') != args.governance_source or not args.governance_manifest_checksum or not re.fullmatch(r'[a-f0-9]{64}', args.governance_manifest_checksum):
        raise ValueError('exact governance source/raw-H required')
    if _PARENT_POLICY is None or b.get('operator_parent_contract_sha256') != _PARENT_POLICY.contract_sha256:
        raise ValueError('handover authority must bind independent parent contract')
    return b


def handover_request(args, authorization):
    raw = handover_read(GOVERNANCE_MANIFEST)
    if digest(raw) != args.governance_manifest_checksum:
        raise ValueError('actual native raw-H mismatch')
    handover_projection(raw, authorization)
    return {'source': args.governance_source, 'manifest_sha256': args.governance_manifest_checksum, 'explicit': True}


def handover_peers():
    services = {}
    for name in [CONTAINER, 'woodright-public-production-backend', 'woodright-public-production-storefront']:
        item = json.loads(subprocess.check_output(['docker', 'inspect', name], timeout=10))[0]
        if not item['State']['Running'] or item['State'].get('Health', {}).get('Status') != 'healthy':
            raise ValueError('handover runtime unhealthy')
        services[name] = {'container_id': item['Id'], 'image': item['Config']['Image'], 'source': item['Config'].get('Labels', {}).get('org.opencontainers.image.revision'), 'started': item['State']['StartedAt'], 'restarts': item['RestartCount']}
    st = (_PARENT_POLICY.protected(SECRET) if _PARENT_POLICY is not None else SECRET.lstat())  # STAT ONLY
    if SECRET.is_symlink() or not SECRET.is_file() or st.st_uid != 0 or st.st_mode & 0o777 != 0o600:
        raise ValueError('protected session stat required')
    return {'services': services, 'control_sha256': {str(path): digest(handover_read(path)) for path in HANDOVER_CONTROLS}, 'active_owner_sha256': digest(handover_read(ROOT / 'ACTIVE_OWNER.json')), 'session_stat': [st.st_ino, st.st_mode, st.st_uid, st.st_size, st.st_mtime_ns]}


def handover_sync_directory(path):
    if _PARENT_POLICY is not None:
        info = _PARENT_POLICY.protected(path, directory=True)
        expected = (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid)
        matches = []
        for fd in _PARENT_POLICY.retained_fds():
            actual = os.fstat(fd)
            if (stat.S_ISDIR(actual.st_mode) and
                    (actual.st_dev, actual.st_ino, actual.st_mode, actual.st_uid, actual.st_gid) == expected):
                matches.append(fd)
        if len(matches) != 1:
            raise ValueError('one verified retained directory descriptor required')
        os.fsync(matches[0])
        _PARENT_POLICY.checkpoint()
        return
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def handover_write(path, raw):
    write(path, raw)
    handover_sync_directory(path.parent)


def handover_clear_journal():
    pointer = handover_read(HANDOVER_JOURNAL)
    try:
        if _PARENT_POLICY is not None:
            _PARENT_POLICY.unlink(HANDOVER_JOURNAL, digest(pointer))
        else:
            HANDOVER_JOURNAL.unlink()
        handover_sync_directory(ROOT)
    except BaseException:
        # unlink itself may remove the pointer and then fail its fsync/checkpoint.
        # Restore exclusively; never replace an unknown marker that appeared.
        try:
            stream = (os.fdopen(_PARENT_POLICY.create_output(HANDOVER_JOURNAL), 'wb')
                      if _PARENT_POLICY is not None else HANDOVER_JOURNAL.open('xb'))
        except FileExistsError:
            if handover_read(HANDOVER_JOURNAL) != pointer:
                raise ValueError('foreign handover marker preserved after removal failure')
        else:
            with stream:
                os.fchmod(stream.fileno(), 0o600)
                stream.write(pointer)
                stream.flush()
                os.fsync(stream.fileno())
        handover_sync_directory(ROOT)
        raise


def handover_recover(authorization, authorization_sha, request):
    verified = verify_governance(request)
    if verified['source'] != request['source'] or verified['manifest_sha256'] != request['manifest_sha256']:
        raise ValueError('qualified governance required for handover recovery')
    pointer_raw = handover_read(HANDOVER_JOURNAL)
    pointer = handover_json(pointer_raw)
    if pointer.get('schema') != 'woodright-governance-handover-journal-v1' or pointer.get('authorization_sha256') != authorization_sha or pointer.get('request') != request:
        raise ValueError('incomplete handover authority mismatch')
    op = Path(pointer['operation'])
    if op.parent != ROOT or not re.fullmatch(r'governance-handover-[a-f0-9]{32}', op.name) or op.is_symlink():
        raise ValueError('owned handover operation required')
    snapshot_raw = handover_read(op / 'snapshot.json')
    if digest(snapshot_raw) != pointer['snapshot_sha256']:
        raise ValueError('handover snapshot checksum mismatch')
    snapshot = handover_json(snapshot_raw)
    if snapshot['original_sha256'] != authorization['current_release_sha256'] or snapshot['authorization_sha256'] != authorization_sha or snapshot['request'] != request:
        raise ValueError('handover recovery binding mismatch')
    original = handover_read(op / 'original-release.json')
    if digest(original) != snapshot['original_sha256']:
        raise ValueError('handover original metadata checksum mismatch')
    if handover_peers() != authorization['expected_preservation']:
        raise ValueError('handover recovery runtime/preimage changed')
    for name in ['ACTIVE_RELEASE.json', 'PENDING_RELEASE.json']:
        if digest(handover_read(ROOT / name)) not in [snapshot['original_sha256'], snapshot['adopted_sha256']]:
            raise ValueError('foreign metadata cannot be overwritten by handover recovery')
    for name in ['ACTIVE_RELEASE.json', 'PENDING_RELEASE.json']:
        handover_write(ROOT / name, original)
    if any(handover_read(ROOT / name) != original for name in ['ACTIVE_RELEASE.json', 'PENDING_RELEASE.json']):
        raise ValueError('handover recovery incomplete')
    if verify_governance(request) != verified or handover_peers() != authorization['expected_preservation']:
        raise ValueError('authority changed during handover recovery')
    handover_write(op / 'recovery.json', json_bytes({'state': 'RECOVERED_ORIGINAL_NOT_ADOPTED', 'governance_downgraded': False}))
    handover_clear_journal()
    return {'status': 'handover_recovered_not_adopted', 'operation': str(op)}


def handover_governance(args, authorization, authority, request, intent_raw, artifact_raw):
    b_sha = args.governance_authorization_checksum
    if HANDOVER_JOURNAL.exists() or HANDOVER_JOURNAL.is_symlink():
        if not args.handover_recover:
            raise ValueError('incomplete handover; explicit qualified recovery required')
        return handover_recover(authorization, b_sha, request)
    if args.handover_recover:
        raise ValueError('no pending handover to recover')
    if args.expected_workspace_source != args.source or args.expected_workspace_ref != args.image:
        raise ValueError('handover current application preimage required')
    original = handover_read(ROOT / 'ACTIVE_RELEASE.json')
    if handover_read(ROOT / 'PENDING_RELEASE.json') != original or digest(original) != authorization['current_release_sha256']:
        raise ValueError('exact matching current release required')
    packet = handover_json(original)
    if packet.get('schema') != 'woodright-team-workspace-release-v1' or packet.get('state') != 'done_deployed_and_verified' or 'governance' in packet or 'governance_handover' in packet:
        raise ValueError('only explicit verified legacy release handover permitted')
    if packet.get('source') != args.source or packet.get('url') != URL or packet.get('owner_authorization_sha256') != digest(intent_raw) or packet.get('build_manifest_sha256') != digest(artifact_raw):
        raise ValueError('original release application qualification changed')
    before = handover_peers()
    if before != authorization['expected_preservation']:
        raise ValueError('handover runtime/control CAS changed')
    for key, name in [('workspace', CONTAINER), ('backend', 'woodright-public-production-backend')]:
        if packet.get(key) != {k: before['services'][name][k] for k in ['container_id', 'image', 'source']}:
            raise ValueError('current release runtime binding mismatch')
    if digest(handover_read(ROOT / 'compose.json')) != packet.get('compose_sha256') or digest(handover_read(ROUTE)) != packet.get('route_sha256'):
        raise ValueError('current release configuration binding mismatch')
    owner = handover_json(handover_read(ROOT / 'ACTIVE_OWNER.json'))
    if owner.get('owner') != 'deploy-team-workspace.py' or owner.get('source') != args.source or owner.get('url') != URL or owner.get('runtime_role') != 'team_workspace':
        raise ValueError('current workspace owner mismatch')
    op = ROOT / ('governance-handover-' + uuid.uuid4().hex)
    if _PARENT_POLICY is not None:
        _PARENT_POLICY.mkdir(op)
    else:
        op.mkdir(mode=0o700)
    handover_sync_directory(ROOT)
    # C attests observations and references B; it is NOT an owner approval.
    c = {'schema': 'woodright-governance-handover-attestation-v1', 'authorization_sha256': b_sha, 'application_intent_sha256': digest(intent_raw), 'original_release_sha256': digest(original), 'governance': authority, 'native_manifest_projection_sha256': handover_projection(handover_read(GOVERNANCE_MANIFEST), authorization), 'observed_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'operator_parent_contract_sha256': _PARENT_POLICY.contract_sha256}
    c_raw = json_bytes(c)
    adopted = dict(packet)
    adopted['governance'] = authority
    adopted['governance_handover'] = {'operation': str(op), 'authorization_sha256': b_sha, 'attestation_sha256': digest(c_raw), 'previous_release_sha256': digest(original)}
    adopted_raw = json_bytes(adopted)
    snapshot = {'original_sha256': digest(original), 'adopted_sha256': digest(adopted_raw), 'authorization_sha256': b_sha, 'request': request}
    handover_write(op / 'original-release.json', original)
    handover_write(op / 'authorization.json', handover_read(args.governance_authorization))
    handover_write(op / 'attestation.json', c_raw)
    handover_write(op / 'snapshot.json', json_bytes(snapshot))
    pointer = {'schema': 'woodright-governance-handover-journal-v1', 'operation': str(op), 'authorization_sha256': b_sha, 'request': request, 'snapshot_sha256': digest(json_bytes(snapshot))}
    handover_write(HANDOVER_JOURNAL, json_bytes(pointer))  # durable BEFORE first metadata write
    try:
        for name in ['ACTIVE_RELEASE.json', 'PENDING_RELEASE.json']:
            handover_write(ROOT / name, adopted_raw)
        if handover_peers() != before or verify_governance(request) != authority:
            raise ValueError('peer or governance changed during handover')
        if any(handover_read(ROOT / name) != adopted_raw for name in ['ACTIVE_RELEASE.json', 'PENDING_RELEASE.json']):
            raise ValueError('handover metadata commit incomplete')
        handover_write(op / 'result.json', json_bytes({'state': 'HANDOVER_VERIFIED', 'application_runtime_changed': False}))
        handover_clear_journal()
    except BaseException:
        # The journal stays present if any restoration/proof fails. All other
        # controller mutation modes refuse while it exists. No bundle downgrade.
        handover_recover(authorization, b_sha, request)
        raise
    return {'status': 'governance_handover_verified', 'application_source': args.source, 'governance': authority, 'operation': str(op), 'runtime_changed': False}


def main():
    global _PARENT_POLICY
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['plan', 'deploy', 'finalize', 'rollback', 'handover-governance'], default='plan')
    parser.add_argument('--source', required=True)
    parser.add_argument('--governance-source')
    parser.add_argument('--governance-manifest-checksum')
    parser.add_argument('--image', required=True)
    parser.add_argument('--backend-source', required=True)
    parser.add_argument('--backend-ref', required=True)
    parser.add_argument('--expected-workspace-source', required=True)
    parser.add_argument('--expected-workspace-ref', required=True)
    parser.add_argument('--build-manifest', type=Path, required=True)
    parser.add_argument('--build-checksum', required=True)
    parser.add_argument('--intent', type=Path, required=True)
    parser.add_argument('--intent-checksum', required=True)
    parser.add_argument('--dom-evidence', type=Path)
    parser.add_argument('--governance-authorization', type=Path)
    parser.add_argument('--governance-authorization-checksum')
    parser.add_argument('--handover-recover', action='store_true')
    parser.add_argument('--parent-contract', type=Path)
    parser.add_argument('--parent-contract-checksum')
    args = parser.parse_args()
    if args.mode == 'handover-governance':
        if not args.parent_contract or not args.parent_contract_checksum:
            raise ValueError('independent parent contract required before handover authorities')
        configure_operator_parent_contract(args.parent_contract, args.parent_contract_checksum)
    elif args.parent_contract or args.parent_contract_checksum:
        raise ValueError('parent contract authority is handover-only')
    for value in [args.source, args.backend_source]:
        if not re.fullmatch(r'[a-f0-9]{40}', value): raise ValueError('exact source revision required')
    artifact_raw = regular(args.build_manifest)
    artifact = json.loads(artifact_raw)
    if digest(artifact_raw) != args.build_checksum or artifact.get('source_sha') != args.source or artifact.get('image') != args.image or artifact.get('schema') != 'woodright-workspace-build-v1' or artifact.get('base_path') != '':
        raise ValueError('qualified workspace artifact mismatch')
    intent_raw = regular(args.intent); intent = json.loads(intent_raw)
    if digest(intent_raw) != args.intent_checksum or intent.get('owner_decision') != 'approved' or intent.get('scope') != 'team_workspace' or intent.get('source_sha') != args.source or intent.get('image') != args.image or intent.get('url') != URL:
        raise ValueError('exact owner workspace authorization required')
    handover = args.mode == 'handover-governance'
    if not handover and (args.governance_authorization or args.governance_authorization_checksum or args.handover_recover):
        raise ValueError('handover authorization cannot authorize normal mutators')
    authorization = handover_authorization(args, intent_raw) if handover else None
    governance = None if handover else governance_request(args, intent)
    authority = None
    leases = []
    if args.mode != 'plan':
        lock_dir = Path('/srv/woodright/locks/team_workspace')
        if _PARENT_POLICY is not None:
            _PARENT_POLICY.protected(lock_dir, directory=True)
        else:
            lock_dir.mkdir(mode=0o755, exist_ok=True)
        for path in [Path('/srv/woodright/locks/live-cutover.lock'), lock_dir / 'live-cutover.lock']:
            if _PARENT_POLICY is not None:
                fd = _PARENT_POLICY.open_lock(path, fcntl.LOCK_EX)
            else:
                fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CREAT, 0o644)
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            leases.append(fd)
        if handover:
            governance = handover_request(args, authorization)
        elif HANDOVER_JOURNAL.exists() or HANDOVER_JOURNAL.is_symlink():
            raise ValueError('incomplete governance handover blocks mutation')
        authority = verify_governance(governance)
    backend = inspect('woodright-public-production-backend')
    if not backend or backend['image'] != args.backend_ref or backend['source'] != args.backend_source:
        raise ValueError('aborted_conflict: backend identity changed')
    commerce = json.loads(regular(Path('/srv/woodright/runtime-ownership-public-production/ACTIVE_RELEASE.json')))
    if commerce.get('backend_image') != args.backend_ref or commerce.get('state') != 'committed':
        raise ValueError('commerce active metadata does not match the verified backend')
    revision = subprocess.check_output(['docker', 'image', 'inspect', args.image, '--format', '{{index .Config.Labels "org.opencontainers.image.revision"}}'], text=True).strip()
    if revision != args.source: raise ValueError('workspace image revision mismatch')
    existing = inspect(CONTAINER)
    if handover:
        _PARENT_POLICY.checkpoint()
        result = handover_governance(args, authorization, authority, governance, intent_raw, artifact_raw)
        _PARENT_POLICY.checkpoint()
        _PARENT_POLICY.close()
        print(json.dumps(result)); return
    if args.mode == 'rollback':
        current = workspace_baseline(existing, args.source, args.image)
        packet = json.loads(current['raw'])
        pending_governance(packet, authority)
        if packet.get('backend') != backend or packet.get('owner_authorization_sha256') != args.intent_checksum or packet.get('build_manifest_sha256') != args.build_checksum:
            raise ValueError('aborted_conflict: rollback deployment qualification changed')
        snapshot = rollback_snapshot(packet)
        if snapshot['backend_source'] != args.backend_source:
            raise ValueError('aborted_conflict: old workspace backend pin no longer matches')
        old = snapshot['existing']
        revision = subprocess.check_output(['docker', 'image', 'inspect', old['image'], '--format', '{{index .Config.Labels "org.opencontainers.image.revision"}}'], text=True).strip()
        if revision != old['source']: raise ValueError('retained rollback image source mismatch')
        for sig in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]: signal.signal(sig, signal.SIG_IGN)
        compose_cli = ['docker', 'compose', '--project-name', PROJECT, '--file', str(ROOT / 'compose.json')]
        restore_workspace(snapshot['operation'], old, snapshot['baseline'], snapshot['compose'], snapshot['route'], snapshot['metadata'], compose_cli)
        result = {'status': 'rolled_back_after_acceptance_failure', 'url': snapshot['baseline']['url'], 'source': old['source'], 'workspace': inspect(CONTAINER), 'live_database_touched': False}
        write(snapshot['operation'] / 'acceptance-rollback-result.json', json_bytes(result))
        print(json.dumps(result)); return
    if args.mode == 'finalize':
        packet = json.loads(regular(ROOT / 'PENDING_RELEASE.json'))
        pending_governance(packet, authority)
        if existing != packet['workspace'] or existing['image'] != args.image or packet['source'] != args.source or packet.get('url') != URL or digest(regular(ROUTE)) != packet['route_sha256']:
            raise ValueError('aborted_conflict: pending workspace changed')
        evidence_raw = regular(args.dom_evidence) if args.dom_evidence else b'{}'
        evidence = json.loads(evidence_raw); samples = evidence.get('samples', [])
        if len(samples) < 5 or not all(dom_url_allowed(s.get('url', '')) and s.get('connected') is True and s.get('heading') for s in samples):
            raise ValueError('five authenticated public DOM samples required')
        if len({(s['heading'], s.get('marker')) for s in samples}) != 1 or samples[0]['at'] == samples[-1]['at']:
            raise ValueError('public DOM samples diverged')
        check_http(URL, args.source)
        packet.update(state='done_deployed_and_verified', dom_evidence_sha256=digest(evidence_raw), dom_evidence_path=str(args.dom_evidence), verified_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
        write(ROOT / 'ACTIVE_RELEASE.json', json_bytes(packet))
        write(ROOT / 'PENDING_RELEASE.json', json_bytes(packet))
        print(json.dumps({'status': packet['state'], 'url': URL, 'source': args.source})); return
    baseline = None
    if args.expected_workspace_source == 'absent':
        if args.expected_workspace_ref != 'absent' or existing or ROUTE.exists() or any((ROOT / name).exists() for name in ['compose.json', 'PENDING_RELEASE.json', 'ACTIVE_RELEASE.json']): raise ValueError('aborted_conflict: workspace already exists')
    else:
        baseline = workspace_baseline(existing, args.expected_workspace_source, args.expected_workspace_ref)
    compose = json_bytes(compose_document(args.image, args.backend_source)); route = json_bytes(router_document())
    if args.mode == 'plan':
        print(json.dumps({'mode':'plan','url':URL,'source':args.source,'image':args.image,'backend':backend,'previous_workspace':existing,'previous_release_state':baseline['state'] if baseline else None,'governance_request':governance,'compose_sha256':digest(compose),'route_sha256':digest(route),'anonymous_access':'login_only','public_raw_admin':False}));return
    ROOT.mkdir(mode=0o700, exist_ok=True)
    operation = ROOT / ('operation-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]); operation.mkdir(mode=0o700)
    previous_compose = regular(ROOT / 'compose.json') if (ROOT / 'compose.json').exists() else None
    previous_route = regular(ROUTE) if ROUTE.exists() else None
    if previous_compose: write(operation / 'compose.before.json', previous_compose)
    if previous_route: write(operation / 'route.before.json', previous_route)
    previous_metadata = {}
    for name in ['PENDING_RELEASE.json', 'ACTIVE_RELEASE.json', 'ACTIVE_OWNER.json']:
        path = ROOT / name
        previous_metadata[name] = regular(path) if path.exists() or path.is_symlink() else None
        if previous_metadata[name] is not None: write(operation / (name + '.before'), previous_metadata[name])
    metadata_checksums = json_bytes({name: digest(raw) if raw is not None else None for name, raw in previous_metadata.items()})
    write(operation / 'metadata-checksums.json', metadata_checksums)
    if baseline: write(operation / 'baseline.json', json_bytes({key: value for key, value in baseline.items() if key != 'raw'}))
    write(operation / 'owner-intent.json', intent_raw); write(operation / 'build-manifest.json', artifact_raw)
    if authority is not None: write(operation / 'governance-qualification.json', json_bytes(authority))
    SECRET.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if SECRET.exists():
        if SECRET.is_symlink() or SECRET.stat().st_uid != 0 or SECRET.stat().st_mode & 0o077 or not regular(SECRET).startswith(b'WOODRIGHT_WORKSPACE_SESSION_SECRET=') or len(regular(SECRET).split(b'=',1)[1].strip()) < 32:
            raise ValueError('protected workspace session secret required')
    else:
        fd = os.open(SECRET, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd,'w') as stream: stream.write('WOODRIGHT_WORKSPACE_SESSION_SECRET=' + secrets.token_urlsafe(48) + '\n')
    compose_cli = ['docker','compose','--project-name',PROJECT,'--file',str(ROOT/'compose.json')]
    for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP]:
        signal.signal(sig, lambda number, frame: (_ for _ in ()).throw(InterruptedError('deployment interrupted')))
    try:
        write(ROOT / 'compose.json', compose)
        command(compose_cli + ['up','-d','--no-deps','--pull','never','workspace'], operation / 'container.log')
        for attempt in range(40):
            try: check_http(local_health_base(URL), args.source); break
            except Exception:
                if attempt == 39: raise
                time.sleep(1)
        write(ROUTE, route)
        for attempt in range(20):
            try: check_http(URL,args.source);break
            except Exception:
                if attempt == 19: raise
                time.sleep(1)
        packet = {'schema':'woodright-team-workspace-release-v1','state':'deployed_not_verified','source':args.source,'workspace':inspect(CONTAINER),'backend':backend,'url':URL,'base_path':'','compose_sha256':digest(compose),'route_sha256':digest(route),'build_manifest_sha256':digest(artifact_raw),'workflow_run_id':artifact['workflow_run_id'],'workflow_run_attempt':artifact['workflow_run_attempt'],'owner_authorization_sha256':digest(intent_raw),'rollback_evidence':str(operation),'rollback_metadata_sha256':digest(metadata_checksums),'previous_workspace':existing,'previous_release_state':baseline['state'] if baseline else None,'previous_release_url':baseline['url'] if baseline else None,'previous_release_metadata_sha256':baseline['metadata_sha256'] if baseline else None,'controller':'deploy-team-workspace.py','claim_bypass_closed':False,'governance':authority,'activated_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        write(ROOT/'PENDING_RELEASE.json',json_bytes(packet))
        write(ROOT/'ACTIVE_OWNER.json',json_bytes({'owner':'deploy-team-workspace.py','runtime_role':'team_workspace','url':URL,'database':'Medusa public_production_db via authenticated BFF','auto_deploy':False,'claim_bypass_closed':False,'source':args.source}))
        print(json.dumps({'status':packet['state'],'url':URL,'source':args.source,'evidence':str(operation)}))
    except BaseException:
        for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP]: signal.signal(sig, signal.SIG_IGN)
        restore_workspace(operation, existing, baseline, previous_compose, previous_route, previous_metadata, compose_cli)
        write(operation/'failure.json',json_bytes({'status':'rolled_back','previous_workspace':existing,'live_database_touched':False}))
        raise


if __name__ == '__main__':
    try: main()
    except Exception as error:
        print('WORKSPACE_DEPLOY_REFUSED ' + str(error)); raise SystemExit(2)
