#!/usr/bin/env python3
"""
Inject GrowthBook flag 2358734848 (Hardware Buddy menu) into Claude's local
feature cache, so the "Open Hardware Buddy..." menu item appears even though
the server-side feature fetch is being blocked (Cloudflare 403).

Usage:
    1. Completely quit Claude.app (Cmd+Q)
    2. python3 enable_hardware_buddy.py
    3. Reopen Claude.app
    4. Developer menu should now contain "Open Hardware Buddy..."

Safe to re-run. Existing fcache (if any) is backed up to fcache.bak.
"""
import gzip
import json
import os
import shutil
import sys
import time

CACHE_DIR = os.path.expanduser("~/Library/Application Support/Claude")
CACHE_PATH = os.path.join(CACHE_DIR, "fcache")
BACKUP_PATH = CACHE_PATH + ".bak"

# Magic bytes from the Claude app source: Buffer.from([67,76,70,1,0,154,183,226])
MAGIC = bytes([67, 76, 70, 1, 0, 154, 183, 226])

# The GrowthBook flag that gates the "Open Hardware Buddy..." menu item.
HARDWARE_BUDDY_FLAG = "2358734848"


def read_existing_features() -> dict:
    """Read existing fcache if present so we don't blow away other flags."""
    if not os.path.exists(CACHE_PATH):
        return {}
    try:
        with open(CACHE_PATH, "rb") as f:
            data = f.read()
        if not data.startswith(MAGIC):
            print(f"[!] Existing fcache has unexpected magic bytes; ignoring it.")
            return {}
        body = gzip.decompress(data[len(MAGIC):])
        obj = json.loads(body)
        return obj.get("features", {}) or {}
    except Exception as e:
        print(f"[!] Failed to read existing fcache ({e}); starting fresh.")
        return {}


def write_fcache(features: dict) -> None:
    payload = {
        "timestamp": int(time.time() * 1000),
        "features": features,
    }
    body = json.dumps(payload).encode("utf-8")
    gzipped = gzip.compress(body)
    out = MAGIC + gzipped
    # Write atomically.
    tmp = CACHE_PATH + ".tmp"
    with open(tmp, "wb") as f:
        f.write(out)
    os.replace(tmp, CACHE_PATH)
    # Match Claude's tight permission style (rw user only).
    os.chmod(CACHE_PATH, 0o600)


def main() -> int:
    if not os.path.isdir(CACHE_DIR):
        print(f"[x] Claude data dir not found: {CACHE_DIR}")
        print("    Is Claude desktop installed?")
        return 1

    if os.path.exists(CACHE_PATH):
        shutil.copy2(CACHE_PATH, BACKUP_PATH)
        print(f"[i] Backed up existing fcache -> {BACKUP_PATH}")

    features = read_existing_features()
    before = features.get(HARDWARE_BUDDY_FLAG)
    features[HARDWARE_BUDDY_FLAG] = {"on": True, "value": None, "source": "override"}
    write_fcache(features)

    print(f"[ok] Wrote {CACHE_PATH}")
    print(f"     features in cache: {len(features)}")
    print(f"     flag {HARDWARE_BUDDY_FLAG}: before={before} after={features[HARDWARE_BUDDY_FLAG]}")
    print()
    print("Next steps:")
    print("  1. Open Claude.app")
    print("  2. Help -> Troubleshooting -> Enable Developer Mode (if not already)")
    print("  3. Developer menu should now show 'Open Hardware Buddy...'")
    print()
    print("Verify after launch with:")
    print("  grep '\\[growthbook\\] loaded' ~/Library/Logs/Claude/main.log | tail -3")
    print()
    print("To revert: rm '%s' && mv '%s' '%s' (if a backup exists)"
          % (CACHE_PATH, BACKUP_PATH, CACHE_PATH))
    return 0


if __name__ == "__main__":
    sys.exit(main())
