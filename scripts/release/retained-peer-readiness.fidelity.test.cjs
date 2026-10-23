'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Exercise the real readiness gate and complete peer no-touch functions. Only
// Docker/HTTP/time-bound fixture responses are replaced; no real socket is used.
const script = path.resolve(__dirname, '../../ops/release/cutover-public-production-pair.sh')
const source = fs.readFileSync(script, 'utf8')
const names = ['wait_component_ready', 'assert_backend_notouch', 'assert_storefront_notouch', 'assert_untouched_peer']
const functions = names.map((name) => {
  const found = source.match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?^\\}`, 'm'))
  assert.ok(found, `actual function ${name} must exist`)
  return found[0]
}).join('\n')
const fixture = `
set -u
COMPONENT="$1"; KIND="$2"; LABEL="$3"; STATE="$4"; POST="$5"
WR_FIELD_SEP='|'; READY_RESTART_LOOP_THRESHOLD=3
WOODRIGHT_BE_CONTAINER_DEFAULT=backend; WOODRIGHT_SF_CONTAINER_DEFAULT=storefront
BE_KEEP_ID=kept-id; SF_KEEP_ID=kept-id
BE_KEEP_IMAGE=kept-image; SF_KEEP_IMAGE=kept-image
BE_KEEP_STARTED=kept-start; SF_KEEP_STARTED=kept-start
BE_KEEP_CREATED=kept-created; SF_KEEP_CREATED=kept-created
BE_KEEP_RESTARTS=18; SF_KEEP_RESTARTS=18
BE_KEEP_REV=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; SF_KEEP_REV=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
log(){ echo "$*" >&2; }
poll_note(){ :; }
readiness_url_for(){ printf 'http://127.0.0.1:0/health'; }
harness_enabled(){ return 1; }
ready_poll_interval(){ printf 0; }
prod_docker(){
  local format='' previous='' arg
  for arg in "$@"; do
    if [[ "$previous" == '--format' ]]; then format="$arg"; break; fi
    previous="$arg"
  done
  [[ -n "$format" ]] || return 0
  source "$STATE"
  case "$format" in
    *'.State.Status'*) printf '%s|%s|%s\\n' "$status" "$health" "$restarts" ;;
    '{{.Id}}') printf '%s\\n' "$id" ;;
    '{{.Config.Image}}') printf '%s\\n' "$image" ;;
    '{{.State.StartedAt}}') printf '%s\\n' "$started" ;;
    '{{.Created}}') printf '%s\\n' "$created" ;;
    '{{.RestartCount}}') printf '%s\\n' "$restarts" ;;
    *) echo "unexpected inspect format $format" >&2; return 1 ;;
  esac
}
live_oci_revision(){ source "$STATE"; printf '%s\\n' "$revision"; }
http_status(){
  # Changes here model drift after Docker healthy and during the HTTP probe.
  cat "$POST" >> "$STATE"
  source "$STATE"
  printf '%s\\n' "$http"
}
`
const baseline = { id: 'kept-id', image: 'kept-image', started: 'kept-start', created: 'kept-created', restarts: 18, revision: 'a'.repeat(40), status: 'running', health: 'healthy', http: 200 }
const assignment = (object) => Object.entries(object).map(([key, value]) => `${key}='${String(value).replaceAll("'", "'\\''")}'\n`).join('')
const cases = []
const add = (name, options = {}) => cases.push({ name, component: 'backend', kind: 'storefront', label: 'forward', initial: {}, post: {}, succeeds: true, ...options })
add('unchanged retained storefront lifetime RestartCount18 passes')
add('unchanged retained backend lifetime RestartCount18 passes', { component: 'storefront', kind: 'backend' })
for (const [key, value] of Object.entries({ id: 'changed-id', image: 'changed-image', started: 'changed-start', created: 'changed-created', restarts: 19, revision: 'b'.repeat(40) })) {
  add(`retained storefront ${key} drift fails`, { initial: { [key]: value }, succeeds: false })
  add(`retained storefront ${key} drift during HTTP200 fails`, { post: { [key]: value }, succeeds: false })
}
add('retained backend restart delta during HTTP200 fails', { component: 'storefront', kind: 'backend', post: { restarts: 19 }, succeeds: false })
add('retained peer currently restarting fails', { initial: { status: 'restarting' }, succeeds: false })
add('retained peer currently unhealthy fails', { initial: { health: 'unhealthy' }, succeeds: false })
add('retained peer HTTP503 fails', { post: { http: 503 }, succeeds: false })
add('new backend RestartCount3 still fails', { component: 'backend', kind: 'backend', initial: { restarts: 3 }, succeeds: false })
add('new storefront RestartCount3 still fails', { component: 'storefront', kind: 'storefront', initial: { restarts: 3 }, succeeds: false })
add('pair backend RestartCount3 still fails', { component: 'pair', kind: 'backend', initial: { restarts: 3 }, succeeds: false })
add('pair storefront RestartCount18 still fails', { component: 'pair', succeeds: false })
add('rollback label does not waive RestartCount18', { label: 'rollback', succeeds: false })

for (const scenario of cases) {
  test(scenario.name, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-retained-peer-ready-'))
    try {
      const shell = path.join(directory, 'gate.sh')
      const state = path.join(directory, 'state')
      const post = path.join(directory, 'post')
      fs.writeFileSync(shell, `${fixture}\n${functions}\nwait_component_ready "$KIND" "$KIND" 0 "$LABEL"\n`)
      fs.writeFileSync(state, assignment({ ...baseline, ...scenario.initial }))
      fs.writeFileSync(post, assignment(scenario.post))
      const result = spawnSync('bash', [shell, scenario.component, scenario.kind, scenario.label, state, post], { encoding: 'utf8', timeout: 5000 })
      assert.equal(result.error, undefined, String(result.error))
      assert.equal(result.signal, null, result.stderr)
      assert.equal(result.status === 0, scenario.succeeds, `exit=${result.status}\n${result.stderr}`)
      if (scenario.succeeds) assert.match(result.stderr, /HTTP .*code=200/)
      if (scenario.name.includes('during HTTP200')) assert.match(result.stderr, /retained peer changed during HTTP readiness/)
      if (scenario.name.includes('RestartCount3') || scenario.name.includes('still fails') || scenario.name.includes('rollback label')) assert.match(result.stderr, /restart loop detected/)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
}
