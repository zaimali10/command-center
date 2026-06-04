#!/usr/bin/env python3
"""
Auto-builder for Command Center.
Runs pending Phase B work via Claude Code when usage is available.
If rate-limited, self-schedules a one-shot cron job at the reported reset time.
"""
import json, os, re, subprocess, sys, tempfile, time
from pathlib import Path

PROJECT = Path(os.environ['HOME']) / 'Projects/command-center'
LOG = PROJECT / 'data' / 'auto-builder.log'
SCRIPT_NAME = 'auto-builder.py'

PENDING_PROMPTS = [
    {
        'name': 'monitor-sparklines',
        'prompt': '''In ~/Projects/command-center/src/components/widgets/Monitor.jsx, add per-core CPU sparklines below the existing CPU/Memory/Disk bars. Fetch from /api/system/stats which returns cpu.per_core array. Add a small horizontal bar chart showing each core's usage with colored bars. Keep the existing layout. After changes, run `npm run build` from ~/Projects/command-center/ and verify zero errors.'''
    },
    {
        'name': 'ipad-polish',
        'prompt': '''In ~/Projects/command-center/src/styles.css, add iPad-optimized touch targets: increase min-height for all interactive elements to at least 44px where they're currently smaller. Add @media (hover: none) and (pointer: coarse) queries for touch devices. Do not change desktop layout. After changes, run `npm run build` from ~/Projects/command-center/ and verify zero errors.'''
    },
]


def log(msg):
    ts = time.strftime('%Y-%m-%d %H:%M:%S %Z')
    line = f'[{ts}] {msg}'
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG, 'a') as f:
        f.write(line + '\n')
    print(line, flush=True)


def run_claude(prompt_text):
    """Run Claude Code with a prompt. Returns (ok, output, reset_time or None)."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, dir=str(PROJECT)) as f:
        f.write(prompt_text)
        pf = f.name
    try:
        r = subprocess.run(
            ['claude', '-p', f'$(cat "{pf}")', '--print', '--dangerously-skip-permissions'],
            capture_output=True, text=True, timeout=300, cwd=str(PROJECT)
        )
        output = (r.stdout or '') + (r.stderr or '')

        # Check for rate-limit message
        reset_match = re.search(r"resets\s+(\d+[ap]m\s*\([^)]+\))", output, re.I)
        if reset_match:
            return False, output[:500], reset_match.group(1)

        # Check for "hit your limit"
        if "hit your limit" in output.lower():
            # Try to parse the time more carefully
            time_match = re.search(r'(\d{1,2}:\d{2}\s*[ap]m)', output, re.I)
            tz_match = re.search(r'\(([^)]+)\)', output)
            tz = tz_match.group(1) if tz_match else 'America/Chicago'
            t = time_match.group(1) if time_match else None
            return False, output[:500], f'{t} ({tz})' if t else f'12:00 am ({tz})'

        return r.returncode == 0, output[:2000], None
    except subprocess.TimeoutExpired:
        return False, 'TIMEOUT after 300s', None
    except Exception as e:
        return False, str(e), None
    finally:
        try:
            os.unlink(pf)
        except OSError:
            pass


def build():
    r = subprocess.run(['npm', 'run', 'build'], capture_output=True, text=True, timeout=60, cwd=str(PROJECT))
    if r.returncode == 0:
        log('Build: OK')
    else:
        log(f'Build: FAILED - {r.stderr[:300]}')
    return r.returncode == 0


def git_commit(msg):
    subprocess.run(['git', 'add', '-A'], cwd=str(PROJECT), capture_output=True)
    r = subprocess.run(['git', 'commit', '-m', msg], cwd=str(PROJECT), capture_output=True, text=True)
    if r.returncode == 0:
        log(f'Committed: {msg}')
    else:
        log(f'Commit: {r.stdout.strip() or r.stderr.strip()}')


def schedule_next_job(reset_time_str):
    """
    Schedule a one-shot cron job right after the reported reset time.
    reset_time_str looks like '2am (America/Chicago)' or '3:00 pm (America/Chicago)'
    """
    log(f'Scheduling next run for reset time: {reset_time_str}')

    # Use hermes CLI to create a one-shot job 5 min after the reset
    # We need to convert "2am (America/Chicago)" to an ISO-ish timestamp
    # The simplest approach: ask hermes to parse it, or just try the format

    # Parse the time from the string
    import datetime
    now = datetime.datetime.now()

    time_match = re.search(r'(\d{1,2}):?(\d{2})\s*([ap])m', reset_time_str, re.I)
    if not time_match:
        time_match = re.search(r'(\d{1,2})\s*([ap])m', reset_time_str, re.I)

    if time_match:
        h = int(time_match.group(1))
        m = int(time_match.group(2)) if ':' in time_match.group(0) else 0
        ampm = time_match.group(3).lower() if time_match.lastindex >= 3 else 'a'

        if ampm == 'p' and h != 12:
            h += 12
        elif ampm == 'a' and h == 12:
            h = 0

        # Build target datetime - add 5 min buffer
        target = now.replace(hour=h, minute=m, second=0, microsecond=0) + datetime.timedelta(minutes=5)

        # If target is in the past, it's tomorrow
        if target <= now:
            target += datetime.timedelta(days=1)

        iso_target = target.strftime('%Y-%m-%dT%H:%M:%S')
        log(f'Target run time: {iso_target}')
    else:
        # Fallback: 5 minutes from now (recheck)
        target = now + datetime.timedelta(minutes=5)
        iso_target = target.strftime('%Y-%m-%dT%H:%M:%S')
        log(f'Could not parse "{reset_time_str}", retrying in 5 min: {iso_target}')

    # Remove old job if exists, then create a new one-shot
    subprocess.run(['hermes', 'cron', 'remove', 'auto-command-center-builder'],
                   capture_output=True, timeout=10)

    # Check if hermes CLI is available
    r = subprocess.run([
        'hermes', 'cron', 'create',
        '--name', 'auto-command-center-builder',
        '--script', SCRIPT_NAME,
        '--no-agent',
        '--schedule', iso_target,
        '--repeat', '1',
        '--deliver', 'origin',
        '--workdir', str(PROJECT),
    ], capture_output=True, text=True, timeout=15)

    log(f'Schedule result: {r.stdout.strip()[:200]} {r.stderr.strip()[:200]}')
    return r.returncode == 0


def main():
    log('Auto-builder starting...')

    # If no pending work, self-destruct
    if not PENDING_PROMPTS:
        log('No pending work. Removing cron job...')
        subprocess.run(['hermes', 'cron', 'remove', 'auto-command-center-builder'],
                       capture_output=True, timeout=10)
        log('Cron job removed. All done.')
        return 0

    # Test Claude Code availability
    probe = subprocess.run(
        ['claude', '-p', 'Reply READY', '--print'],
        capture_output=True, text=True, timeout=30, cwd=str(PROJECT)
    )
    probe_output = probe.stdout + probe.stderr

    if 'READY' in probe_output:
        log('Claude Code available. Running pending work...')

        for item in PENDING_PROMPTS:
            log(f'Working on: {item["name"]}')
            ok, output, reset_time = run_claude(item['prompt'])

            if ok:
                log(f'{item["name"]}: OK')
                build()
                git_commit(f'auto: {item["name"]}')
            elif reset_time:
                log(f'{item["name"]}: RATE LIMITED - resets {reset_time}')
                schedule_next_job(reset_time)
                return 0
            else:
                log(f'{item["name"]}: FAILED - {output[:200]}')
                return 1

        log('All pending work complete.')
        log('Removing cron job (no more pending work)...')
        subprocess.run(['hermes', 'cron', 'remove', 'auto-command-center-builder'],
                       capture_output=True, timeout=10)
        return 0

    elif 'hit your limit' in probe_output.lower():
        log('Claude Code rate-limited from the start.')
        # Parse the reset time
        time_match = re.search(r'resets\s+(\d+[ap]m\s*\([^)]+\)|[\d:]+\s*[ap]m)', probe_output, re.I)
        reset_str = time_match.group(1) if time_match else None
        if reset_str:
            schedule_next_job(reset_str)
        else:
            log('Could not parse reset time, scheduling retry in 1 hour.')
            schedule_next_job('1 hour')

    else:
        log(f'Unexpected Claude Code state: {probe_output[:200]}')
        schedule_next_job('1 hour')

    return 0


if __name__ == '__main__':
    sys.exit(main())
