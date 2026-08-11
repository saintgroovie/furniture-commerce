#!/bin/bash
# LIVE_MUTATING=true
# requires_global_lock=true
flock -x -w 30 /srv/woodright/locks/live-cutover.lock -c 'echo cutover'
