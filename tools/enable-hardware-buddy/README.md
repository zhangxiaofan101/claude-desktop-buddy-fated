# enable-hardware-buddy

Local workaround for when the "Open Hardware Buddy…" menu item doesn't
appear in Claude Desktop's Developer menu.

## What's going on

The menu item is gated by a GrowthBook feature flag (`2358734848`) that
Claude fetches at startup from `claude.ai/api/desktop/*`. If that
request fails — typically because a Cloudflare challenge is interposed
on your network path (some VPN/proxy users see this) — the flag never
loads and the menu item stays hidden, even with Developer Mode on.

The flag itself is a server-side gate, not a license check. Claude
Desktop ships with the Hardware Buddy code; it just doesn't show the
entry point unless the flag is on.

## What this script does

Writes the flag into Claude's local feature cache file
(`~/Library/Application Support/Claude/fcache`) with `{"on": true,
"source": "override"}`, mirroring what GrowthBook would have written
itself if the fetch had succeeded.

- Backs up any existing `fcache` to `fcache.bak`
- Preserves any other flags already in the cache
- Atomic write, `0600` perms (matches Claude's style)
- Idempotent — safe to re-run

## Caveats

This is an unofficial workaround, not something Anthropic endorses. It
modifies only files in your own `~/Library`; it does not patch the app,
touch credentials, or talk to any server. It will be obsolete the
moment Anthropic either turns the flag on globally or removes the gate.

## Usage

```bash
# Fully quit Claude Desktop first (Cmd+Q, confirm via Force Quit menu).
python3 tools/enable-hardware-buddy/enable.py
# Reopen Claude. Developer menu should now show "Open Hardware Buddy…".
```

To revert: `rm ~/Library/Application\ Support/Claude/fcache` (and
optionally restore `fcache.bak`).
