#!/bin/sh
# Cap Tor's queue memory to leave room for Node and the Wisp worker on small hosts.
tor --MaxMemInQueues "96 MB" &

exec pnpm run manual-start
