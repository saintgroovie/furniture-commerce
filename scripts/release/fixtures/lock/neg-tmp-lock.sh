#!/bin/bash
# LIVE_MUTATING=true
# requires_global_lock=true
flock -x /tmp/other.lock -c 'echo bad'
