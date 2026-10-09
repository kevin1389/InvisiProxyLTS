#!/bin/sh
# Lower Tor's queue ceiling to leave more room for Node and the Wisp worker.
tor --MaxMemInQueues "32 MB" &

# Avoid keeping pnpm's Node.js process resident alongside the app process, and
# leave headroom for Tor and the Wisp worker under Render's 512 MB limit.
exec node --max-old-space-size=256 dist/server.js
