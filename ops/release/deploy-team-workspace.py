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


def digest(value):
    return hashlib.sha256(value).hexdigest()


def regular(path):
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['plan', 'deploy', 'finalize', 'rollback'], default='plan')
    parser.add_argument('--source', required=True)
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
    args = parser.parse_args()
    for value in [args.source, args.backend_source]:
        if not re.fullmatch(r'[a-f0-9]{40}', value): raise ValueError('exact source revision required')
    artifact_raw = regular(args.build_manifest)
    artifact = json.loads(artifact_raw)
    if digest(artifact_raw) != args.build_checksum or artifact.get('source_sha') != args.source or artifact.get('image') != args.image or artifact.get('schema') != 'woodright-workspace-build-v1' or artifact.get('base_path') != '':
        raise ValueError('qualified workspace artifact mismatch')
    intent_raw = regular(args.intent); intent = json.loads(intent_raw)
    if digest(intent_raw) != args.intent_checksum or intent.get('owner_decision') != 'approved' or intent.get('scope') != 'team_workspace' or intent.get('source_sha') != args.source or intent.get('image') != args.image or intent.get('url') != URL:
        raise ValueError('exact owner workspace authorization required')
    leases = []
    if args.mode != 'plan':
        if regular(Path('/srv/woodright/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt')).decode().strip() != args.source:
            raise ValueError('qualified workspace controller bundle is not installed')
        lock_dir = Path('/srv/woodright/locks/team_workspace'); lock_dir.mkdir(mode=0o755, exist_ok=True)
        for path in [Path('/srv/woodright/locks/live-cutover.lock'), lock_dir / 'live-cutover.lock']:
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CREAT, 0o644)
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB); leases.append(fd)
    backend = inspect('woodright-public-production-backend')
    if not backend or backend['image'] != args.backend_ref or backend['source'] != args.backend_source:
        raise ValueError('aborted_conflict: backend identity changed')
    commerce = json.loads(regular(Path('/srv/woodright/runtime-ownership-public-production/ACTIVE_RELEASE.json')))
    if commerce.get('backend_image') != args.backend_ref or commerce.get('state') != 'committed':
        raise ValueError('commerce active metadata does not match the verified backend')
    revision = subprocess.check_output(['docker', 'image', 'inspect', args.image, '--format', '{{index .Config.Labels "org.opencontainers.image.revision"}}'], text=True).strip()
    if revision != args.source: raise ValueError('workspace image revision mismatch')
    existing = inspect(CONTAINER)
    if args.mode == 'rollback':
        current = workspace_baseline(existing, args.source, args.image)
        packet = json.loads(current['raw'])
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
        print(json.dumps({'mode':'plan','url':URL,'source':args.source,'image':args.image,'backend':backend,'previous_workspace':existing,'previous_release_state':baseline['state'] if baseline else None,'compose_sha256':digest(compose),'route_sha256':digest(route),'anonymous_access':'login_only','public_raw_admin':False}));return
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
        packet = {'schema':'woodright-team-workspace-release-v1','state':'deployed_not_verified','source':args.source,'workspace':inspect(CONTAINER),'backend':backend,'url':URL,'base_path':'','compose_sha256':digest(compose),'route_sha256':digest(route),'build_manifest_sha256':digest(artifact_raw),'workflow_run_id':artifact['workflow_run_id'],'workflow_run_attempt':artifact['workflow_run_attempt'],'owner_authorization_sha256':digest(intent_raw),'rollback_evidence':str(operation),'rollback_metadata_sha256':digest(metadata_checksums),'previous_workspace':existing,'previous_release_state':baseline['state'] if baseline else None,'previous_release_url':baseline['url'] if baseline else None,'previous_release_metadata_sha256':baseline['metadata_sha256'] if baseline else None,'controller':'deploy-team-workspace.py','claim_bypass_closed':False,'activated_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
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
