#!/bin/sh
# Tor can exceed Render's 512 MB free-instance limit while bootstrapping.
# Keep it available for self-hosted instances, but let constrained hosts disable it.
if [ "${ENABLE_TOR:-true}" = "true" ]; then
	tor --MaxMemInQueues "32 MB" &
fi

# Avoid keeping pnpm's Node.js process resident alongside the app process.
exec node --max-old-space-size=256 dist/server.js
