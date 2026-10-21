#!/usr/bin/env python3
"""Prepare only the approved desk environment/volume delta; never replace containers or image pins."""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

COMPOSE = Path('/etc/dokploy/compose/woodright-public-production/code/docker-compose.yml')
APPROVAL = Path('/srv/woodright/meta/public_production/OWNER_APPROVED_RELEASE.json')
META = Path('/srv/woodright/runtime-ownership-public-production')
VOLUME = 'woodright-public-production_woodright_private_files'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def prepare(text):
    matches = list(re.finditer(r'^  backend:\s*$', text, re.M))
    if len(matches) != 1:
        raise ValueError('unique backend service required')
    start = matches[0].end()
    end_match = re.search(r'^  [A-Za-z0-9_-]+:\s*$', text[start:], re.M)
    if not end_match:
        raise ValueError('backend service boundary missing')
    end = start + end_match.start()
    block = text[start:end]
    environment = '    environment:\n'
    volumes = '    volumes:\n'
    if block.count(environment) != 1 or block.count(volumes) != 1:
        raise ValueError('backend mapping environment/volumes required')
    target = {
        'WOODRIGHT_DESK_FEATURES': '"1"',
        'WOODRIGHT_PRIVATE_FILES_ROOT': '/var/lib/woodright/private-files',
        'WOODRIGHT_MANGO_ENABLED': '"0"',
    }
    for key, value in target.items():
        if re.search(r'^\s*' + key + r'\s*:', block, re.M):
            if not re.search(r'^      ' + key + r': ' + re.escape(value) + r'\s*$', block, re.M):
                raise ValueError('conflicting existing desk configuration')
        else:
            block = block.replace(environment, environment + '      ' + key + ': ' + value + '\n', 1)
    mount = '      - woodright_private_files:/var/lib/woodright/private-files\n'
    if '/var/lib/woodright/private-files' in '\n'.join(line for line in block.splitlines() if line.strip().startswith('-')):
        if mount not in block:
            raise ValueError('conflicting private files mount')
    else:
        block = block.replace(volumes, volumes + mount, 1)
    result = text[:start] + block + text[end:]
    if re.search(r'^  woodright_private_files:\s*$', result, re.M):
        if not re.search(r'^  woodright_private_files:\n    name: ' + VOLUME + r'\s*$', result, re.M):
            raise ValueError('conflicting private volume declaration')
    else:
        if result.count('\nvolumes:\n') != 1:
            raise ValueError('unique top-level volumes mapping required')
        result = result.replace('\nvolumes:\n', '\nvolumes:\n  woodright_private_files:\n    name: ' + VOLUME + '\n', 1)
    return result


def inspect(name):
    fields = '{{.Config.Image}}|{{index .Config.Labels "org.opencontainers.image.revision"}}'
    ref, revision = subprocess.check_output(['docker', 'inspect', name, '--format', fields], text=True).strip().split('|')
    return ref, revision


def read_regular(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError('regular non-symlink file required')
    return path.read_bytes()


def backup_gate(path, current_sha):
    document = json.loads(read_regular(path))
    if document.get('environment') != 'public_production' or document.get('schema') != 'woodright_recovery_point_v2' or document.get('status') != 'success' or document.get('partial') is not False:
        raise ValueError('successful full production recovery point required')
    if document.get('application_sha') != current_sha or document.get('db', {}).get('name') != 'woodright_public_production':
        raise ValueError('recovery point source/database mismatch')
    created = datetime.datetime.strptime(document['created_at_utc'], '%Y%m%dT%H%M%SZ').replace(tzinfo=datetime.timezone.utc)
    age = datetime.datetime.now(datetime.timezone.utc) - created
    if not 0 <= age.total_seconds() <= 72 * 3600:
        raise ValueError('fresh recovery point required')
    for key in ['db', 'media']:
        artifact = Path(document[key]['path'])
        if not artifact.is_relative_to('/srv/woodright/backups/automated/public-production') or artifact.is_symlink():
            raise ValueError('canonical recovery artifact required')
        digest = hashlib.sha256()
        with artifact.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''): digest.update(chunk)
        if digest.hexdigest() != document[key]['sha256']:
            raise ValueError('recovery artifact checksum mismatch')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--expected-current-source', required=True)
    parser.add_argument('--expected-backend-ref', required=True)
    parser.add_argument('--expected-storefront-ref', required=True)
    parser.add_argument('--approval-checksum', required=True)
    parser.add_argument('--compose-checksum', required=True)
    parser.add_argument('--backup-manifest', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-f0-9]{40}', args.source) or not re.fullmatch(r'[a-f0-9]{40}', args.expected_current_source):
        raise ValueError('exact source revisions required')
    leases = []
    if args.apply:
        for path in ['/srv/woodright/locks/live-cutover.lock', '/srv/woodright/locks/public_production/live-cutover.lock']:
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            leases.append(fd)
    approval_raw = read_regular(APPROVAL)
    approval = json.loads(approval_raw)
    if sha(approval_raw) != args.approval_checksum or approval.get('application_sha') != args.source or approval.get('owner_decision') != 'approved' or approval.get('environment') != 'public_production' or approval.get('reservation_state') != 'reserved' or approval.get('component', 'pair') != 'pair':
        raise ValueError('exact reserved production pair approval required')
    for component, expected in [('backend', args.expected_backend_ref), ('storefront', args.expected_storefront_ref)]:
        if inspect('woodright-public-production-' + component) != (expected, args.expected_current_source):
            raise ValueError('aborted_conflict: live pair changed')
    for name in ['ACTIVE_RELEASE.json', 'ACTIVE_OWNER.json']:
        if json.loads(read_regular(META / name)).get('application_source_sha') != args.expected_current_source:
            raise ValueError('aborted_conflict: active source changed')
    active = json.loads(read_regular(META / 'ACTIVE_RELEASE.json'))
    if active.get('backend_image') != args.expected_backend_ref or active.get('storefront_image') != args.expected_storefront_ref:
        raise ValueError('aborted_conflict: active image identity changed')
    backup_gate(args.backup_manifest, args.expected_current_source)
    original = read_regular(COMPOSE)
    if sha(original) != args.compose_checksum:
        raise ValueError('aborted_conflict: compose changed')
    planned = prepare(original.decode()).encode()
    packet = {'kind': 'woodright_desk_runtime_preparation', 'source': args.source, 'mode': 'apply' if args.apply else 'plan',
              'before_sha256': sha(original), 'after_sha256': sha(planned), 'containers_changed': False,
              'private_volume': VOLUME, 'mango_enabled': False}
    if args.apply and original != planned:
        evidence = Path('/srv/woodright/evidence') / ('desk-runtime-' + args.source)
        evidence.mkdir(mode=0o700, exist_ok=False)
        backup = evidence / 'docker-compose.before.yml'
        backup.write_bytes(original); backup.chmod(0o600)
        stat = COMPOSE.stat()
        fd, temporary = tempfile.mkstemp(prefix='.woodright-desk-', dir=COMPOSE.parent)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(planned); stream.flush(); os.fsync(stream.fileno())
        os.chmod(temporary, stat.st_mode & 0o777)
        os.chown(temporary, stat.st_uid, stat.st_gid)
        if sha(read_regular(COMPOSE)) != args.compose_checksum or sha(read_regular(APPROVAL)) != args.approval_checksum:
            os.unlink(temporary); raise ValueError('aborted_conflict: authority changed before commit')
        os.replace(temporary, COMPOSE)
        (evidence / 'preparation.json').write_text(json.dumps(packet, indent=2) + '\n')
        packet['backup'] = str(backup)
    print(json.dumps(packet))


if __name__ == '__main__':
    main()
