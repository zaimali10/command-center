# Auto-Builder Async Redesign Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple Claude Code's run duration from the cron tick's 120s lifetime by running Claude as a detached background process and turning each tick into a short state-machine poll.

**Architecture:** The cron tick becomes a ~2-second status check, not a synchronous executor. A single "current run" state file tracks the in-flight Claude Code process (PID, output path, status path). Each tick (a) reaps a completed run by reading its exit-code marker, runs build+verify+commit, then (b) launches the next pending item as a fully detached child via a tiny Python runner wrapper. Claude Code can now run for hours; the cron tick never waits for it.

**Tech Stack:** Python 3.11 (stdlib only), Windows process flags (`CREATE_BREAKAWAY_FROM_JOB`, `DETACHED_PROCESS`, `CREATE_NEW_PROCESS_GROUP`), hermes cron CLI, Claude Code CLI.

---

## 1. Analysis of the Current Script

### What's broken

`auto-builder.py` lines 95-135 (`run_claude`) call `subprocess.run(..., timeout=110)` and **block the cron tick** until Claude either finishes, times out, or errors. The hermes cron tick has a 120s hard kill. So any Claude task that needs more than ~100 seconds is guaranteed to be killed mid-edit, leaving the repo in a partial state and the queue item in either `waiting` (next tick retries from scratch) or `in_progress` (never marked, no restart logic).

The for-loop at lines 298-341 compounds this: it processes items sequentially within one tick, but each individual `run_claude` already eats the budget. Build (`build()` line 138, 60s timeout) and `verify_build()` further squeeze the budget even when Claude finishes quickly.

### What's worth preserving

- Lock file with PID-liveness check (`acquire_lock`, lines 23-43) — keep, but shorten its hold duration.
- Rate-limit detection regex (lines 113-124) — move to the reaper phase.
- `schedule_next_job` (lines 204-263) — keep as-is for rate-limit recovery.
- `build()` and `verify_build()` (lines 138-189) — keep, but invoke only after Claude completes, in a later tick.
- `load_pending`, `save_queue`, `set_status` — keep, but add `in_progress` as a tracked status and treat existing `in_progress` items as recoverable.
- Self-destructing cron when queue empties (lines 274-279, 343-346) — keep, but gate on "no active run + no pending."

### What must change

- Replace synchronous `subprocess.run` for Claude with `subprocess.Popen` + Windows detach flags + a tiny on-disk runner wrapper that writes an exit-code marker.
- Introduce a persistent `active-run.json` state file recording `{item_id, pid, started_at, output_path, status_path, model, attempt}`.
- Convert `main()` from a sequential executor into a state-machine tick: REAP → BUILD/COMMIT-IF-DONE → LAUNCH-NEXT → EXIT.

---

## 2. State Machine

Each tick runs this state machine. Total wall-clock budget per tick: under 5s in the steady-state running case, under 90s when a build+verify+commit reap happens.

```
┌────────────────────────────────────────────────────────────────────┐
│ TICK START                                                         │
│   acquire_lock() ─ fail-fast if held                               │
│   state = load_state()  // active-run.json                         │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                  ┌─────────────────────────┐
                  │ state.active_run is set?│
                  └─────────────────────────┘
                  No │                      │ Yes
                     ▼                      ▼
       ┌─────────────────────┐   ┌────────────────────────────┐
       │ LAUNCH PHASE        │   │ REAP PHASE                 │
       │ load_pending()      │   │ status_path exists?        │
       │ if empty:           │   └────────────────────────────┘
       │   self_destruct()   │      Yes │              │ No
       │   exit              │          ▼              ▼
       │ pick first item     │   ┌─────────────┐  ┌────────────────┐
       │ mark "in_progress"  │   │ POST-RUN    │  │ pid alive?     │
       │ spawn detached      │   │ - read code │  └────────────────┘
       │ write state         │   │ - if rate-  │     Yes │     │ No
       │ release_lock        │   │   limited:  │         ▼     ▼
       │ exit                │   │   pause +   │   ┌──────┐ ┌────────┐
       └─────────────────────┘   │   schedule  │   │ keep │ │ CRASH  │
                                 │ - if ok:    │   │ wait │ │ mark   │
                                 │   build()   │   │ exit │ │ failed │
                                 │   verify()  │   └──────┘ │ clear  │
                                 │   commit()  │           │ state  │
                                 │   mark done │           │ fall to│
                                 │ - else:     │           │ LAUNCH │
                                 │   mark fail │           └────────┘
                                 │ clear state │
                                 │ fall to     │
                                 │ LAUNCH      │
                                 └─────────────┘
```

### Key invariants

1. **One Claude process at a time.** Enforced by the singleton `active-run.json` entry. The launch phase refuses to start a new run if one is recorded, regardless of whether the recorded one is actually alive (the reap phase decides that).
2. **Lock is short-lived.** Acquired at tick start, released before exit. The Claude child process does NOT inherit the lock; the lock file's only job is to serialize cron ticks against each other, not to gate the Claude run.
3. **In-progress items always have an `active_run`.** If we ever load the queue and see `status=in_progress` but no `active_run`, that's a crash signature → reset to `failed` (or retry, see attempt counter).
4. **Build/verify/commit run only when Claude exits 0.** The reap phase reads the status file *first*, then reads the output for rate-limit markers, then runs build only on clean exit.
5. **Atomic state writes.** Always write to `state.tmp` then `os.replace` — a tick that crashes mid-write cannot corrupt the JSON.

---

## 3. File Structure

### Files modified
- `C:\Users\Zaim-Work\AppData\Local\hermes\scripts\auto-builder.py` — full rewrite of `main()` and `run_claude`. Helpers (`log`, `acquire_lock`, `build`, `verify_build`, `git_commit`, `schedule_next_job`, `load_pending`, `save_queue`, `set_status`) stay close to current form.

### Files created
- `C:\Users\Zaim-Work\AppData\Local\hermes\scripts\claude_runner.py` — standalone runner that the detached Claude child actually executes. Reads prompt from a file, runs Claude, redirects all output to `output_path`, writes exit code to `status_path` atomically.
- `C:\Users\Zaim-Work\Projects\command-center\data\active-run.json` — runtime, gitignored. Persisted state across ticks.
- `C:\Users\Zaim-Work\Projects\command-center\data\runs\<item_id>-<timestamp>.out` — Claude's captured stdout/stderr.
- `C:\Users\Zaim-Work\Projects\command-center\data\runs\<item_id>-<timestamp>.exit` — exit code marker (single integer line). Existence = completion signal.

### Files unchanged
- `data/work-queue.json` — schema unchanged; we just start using `in_progress` consistently.
- `data/auto-builder.log` — same log file.
- `data/auto-builder.lock` — same lock semantics, shorter hold time.

### .gitignore additions
- `data/active-run.json`
- `data/runs/`

---

## 4. Data Contracts

### `active-run.json` schema

```json
{
  "schema_version": 1,
  "active_run": {
    "item_id": "ipad-polish",
    "pid": 23456,
    "started_at": "2026-06-04T10:30:00-05:00",
    "output_path": "C:\\Users\\Zaim-Work\\Projects\\command-center\\data\\runs\\ipad-polish-20260604T103000.out",
    "status_path": "C:\\Users\\Zaim-Work\\Projects\\command-center\\data\\runs\\ipad-polish-20260604T103000.exit",
    "prompt_path": "C:\\Users\\Zaim-Work\\Projects\\command-center\\data\\runs\\ipad-polish-20260604T103000.prompt",
    "model": "claude-sonnet-4-6",
    "attempt": 1
  }
}
```

When `active_run` is absent or `null`, no run is in flight. The `attempt` counter increments when a crashed run is retried.

### `<item_id>-<ts>.exit` format

A single line containing the integer exit code, terminated by `\n`. The file is created atomically (write to `.exit.tmp`, then `os.replace`). The presence of this file is the sole signal that Claude finished; PID-aliveness is only used to *distinguish a still-running child from a crashed one* (no exit file + dead PID = crash).

### Work-queue `status` values

- `waiting` — eligible to be picked up.
- `in_progress` — currently has an `active_run`. If the state file says otherwise, the item is stale and gets reset on the next tick.
- `paused` — rate-limited; a cron one-shot is scheduled to resume.
- `done` — completed and committed.
- `failed` — Claude returned non-zero, build failed, verify failed, or the run crashed past `MAX_ATTEMPTS`.

---

## 5. Windows Process Detachment

The cron job runs `python auto-builder.py` under hermes. Hermes likely wraps children in a Windows Job Object so it can enforce the 120s kill. We need the spawned Claude process to **break away** from that job, or it dies when hermes' job is destroyed at tick end.

Three flags, OR'd together for `subprocess.Popen(creationflags=...)`:

```python
DETACHED_PROCESS         = 0x00000008  # no console attached
CREATE_NEW_PROCESS_GROUP = 0x00000200  # own group; survives parent
CREATE_BREAKAWAY_FROM_JOB = 0x01000000  # escapes parent's Job Object
```

Plus:
- `stdin=subprocess.DEVNULL`
- `stdout=subprocess.DEVNULL` (the runner script handles its own redirection)
- `stderr=subprocess.DEVNULL`
- `close_fds=True`
- `cwd=str(PROJECT)`

If the parent Job Object has `JOB_OBJECT_LIMIT_BREAKAWAY_OK` unset, breakaway fails with `ERROR_ACCESS_DENIED`. Fallback path: re-exec via `cmd.exe /c start "" /B pythonw.exe ...`, which uses cmd.exe's process-creation path and almost always escapes. The plan implements breakaway first and falls back to the cmd-start path only on `OSError`.

---

## 6. Self-Review Checklist (for the author of this plan)

Before handing off:

1. **Spec coverage.** Each numbered Design Constraint (1-7 in the brief) maps to a task: hours-long runs (Task 3, detachment); short tick (Task 4 reap, Task 5 launch); crash detection (Task 4 reap, dead-PID branch); de-duplication (Task 6 launch guard); in-progress + done lifecycle (Tasks 4 + 5); post-run build/commit (Task 7); lock file (Task 2). ✓
2. **Placeholder scan.** No "TBD"/"appropriate"/"handle edge cases" left. ✓
3. **Type consistency.** Functions referenced across tasks: `load_state`/`save_state`/`clear_state`, `is_pid_alive`, `spawn_claude`, `reap_run`, `launch_next` — used by the same names everywhere below. ✓

---

# Task Breakdown

## Task 1: Add `active-run.json` and runs/ to `.gitignore`

**Files:**
- Modify: `C:\Users\Zaim-Work\Projects\command-center\.gitignore`

- [ ] **Step 1: Append entries**

Append:
```
# Auto-builder runtime state (created by hermes auto-builder)
data/active-run.json
data/runs/
```

- [ ] **Step 2: Verify**

Run: `git check-ignore data/active-run.json data/runs/foo.out`
Expected: Both paths echoed back (ignored).

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore auto-builder runtime state"
```

---

## Task 2: Create the `claude_runner.py` wrapper

**Files:**
- Create: `C:\Users\Zaim-Work\AppData\Local\hermes\scripts\claude_runner.py`

This is the script the detached child actually runs. It exists to (a) avoid quoting headaches with multi-line prompts and (b) write an atomic exit-code marker so the auto-builder can detect completion without `waitpid`.

- [ ] **Step 1: Write the runner**

```python
#!/usr/bin/env python3
"""
Detached runner for a single Claude Code invocation.
Invoked by auto-builder.py as a fully detached child process.

Args (all required, positional):
    1. claude_cmd     - absolute path to claude.cmd
    2. prompt_path    - file containing the prompt text
    3. output_path    - file to capture stdout+stderr
    4. status_path    - file to write exit code to (atomically, last)
    5. model          - optional model id; pass empty string for default

The status file is the ONLY completion signal. It is written via
write-temp-then-rename so a reader either sees the final code or
sees no file at all.
"""
import os, subprocess, sys
from pathlib import Path


def main():
    if len(sys.argv) < 6:
        sys.exit(2)
    claude_cmd, prompt_path, output_path, status_path, model = sys.argv[1:6]

    prompt = Path(prompt_path).read_text(encoding='utf-8')
    cmd = [claude_cmd, '-p', prompt, '--print', '--dangerously-skip-permissions']
    if model:
        cmd.extend(['--model', model])

    try:
        with open(output_path, 'w', encoding='utf-8') as out:
            r = subprocess.run(cmd, stdout=out, stderr=subprocess.STDOUT, cwd=os.getcwd())
            exit_code = r.returncode
    except Exception as e:
        try:
            with open(output_path, 'a', encoding='utf-8') as out:
                out.write(f'\n[runner] EXCEPTION: {e}\n')
        except OSError:
            pass
        exit_code = 99

    tmp = status_path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(f'{exit_code}\n')
    os.replace(tmp, status_path)
    sys.exit(exit_code)


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Smoke-test the runner directly**

Run:
```bash
mkdir -p /c/Users/Zaim-Work/Projects/command-center/data/runs
echo "Reply with exactly: PONG" > /tmp/prompt.txt
python "/c/Users/Zaim-Work/AppData/Local/hermes/scripts/claude_runner.py" \
  "C:/Users/Zaim-Work/AppData/Roaming/npm/claude.cmd" \
  /tmp/prompt.txt /tmp/out.txt /tmp/exit.txt ""
cat /tmp/exit.txt
cat /tmp/out.txt
```
Expected: `/tmp/exit.txt` contains `0`, `/tmp/out.txt` contains `PONG`.

- [ ] **Step 3: Commit**

```bash
git add C:/Users/Zaim-Work/AppData/Local/hermes/scripts/claude_runner.py
git commit -m "feat(auto-builder): add detached Claude runner wrapper"
```

(Note: hermes scripts may live outside the command-center repo; if so, commit there or in whatever repo tracks `~/AppData/Local/hermes/scripts/`. Skip step 3 if not under VCS.)

---

## Task 3: Add state helpers to `auto-builder.py`

**Files:**
- Modify: `C:\Users\Zaim-Work\AppData\Local\hermes\scripts\auto-builder.py` (top of file, after existing imports and constants)

- [ ] **Step 1: Add constants**

Insert after the existing constants block (after `SCRIPT_NAME = 'auto-builder.py'`):

```python
STATE_FILE = PROJECT / 'data' / 'active-run.json'
RUNS_DIR = PROJECT / 'data' / 'runs'
RUNNER_SCRIPT = Path(__file__).parent / 'claude_runner.py'
MAX_ATTEMPTS = 2  # retry a crashed run once before marking failed
MAX_RUN_HOURS = 6  # safety cap; older runs are killed and marked failed

# Windows process creation flags
DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200
CREATE_BREAKAWAY_FROM_JOB = 0x01000000
```

- [ ] **Step 2: Add state load/save/clear**

Add these functions immediately after `release_lock()`:

```python
def load_state():
    """Load active-run.json. Returns dict (possibly empty)."""
    if not STATE_FILE.exists():
        return {'schema_version': 1, 'active_run': None}
    try:
        with open(STATE_FILE, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        log(f'State: could not load ({e}); treating as empty')
        return {'schema_version': 1, 'active_run': None}


def save_state(state):
    """Atomically write active-run.json."""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix('.json.tmp')
    with open(tmp, 'w') as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, STATE_FILE)


def clear_active_run(state):
    """Remove the active_run; persist."""
    state['active_run'] = None
    save_state(state)
```

- [ ] **Step 3: Add PID-liveness check**

Add immediately after `clear_active_run`:

```python
def is_pid_alive(pid):
    """Return True if a Windows process with the given PID exists."""
    if not pid:
        return False
    try:
        import ctypes
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        handle = ctypes.windll.kernel32.OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION, False, int(pid))
        if not handle:
            return False
        # Also check it hasn't exited yet
        exit_code = ctypes.c_ulong(0)
        ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code))
        ctypes.windll.kernel32.CloseHandle(handle)
        STILL_ACTIVE = 259
        return exit_code.value == STILL_ACTIVE
    except (ValueError, OSError, AttributeError):
        return False
```

- [ ] **Step 4: Quick syntax check**

Run: `python -c "import ast; ast.parse(open(r'C:/Users/Zaim-Work/AppData/Local/hermes/scripts/auto-builder.py').read())"`
Expected: no output (file parses).

- [ ] **Step 5: Commit (if applicable)**

```bash
git add C:/Users/Zaim-Work/AppData/Local/hermes/scripts/auto-builder.py
git commit -m "feat(auto-builder): add state and PID helpers"
```

---

## Task 4: Add `spawn_claude` — detached launcher

**Files:**
- Modify: `C:\Users\Zaim-Work\AppData\Local\hermes\scripts\auto-builder.py` (replace the body of `run_claude`)

The new function returns immediately after starting the child. It does NOT wait. The caller writes the state file with the PID.

- [ ] **Step 1: Replace `run_claude` with `spawn_claude`**

Delete the existing `run_claude` function (current lines 95-135) and replace with:

```python
def _build_run_paths(item_id):
    """Construct the trio of paths for a run, ensuring runs/ exists."""
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    ts = time.strftime('%Y%m%dT%H%M%S')
    base = f'{item_id}-{ts}'
    return (
        RUNS_DIR / f'{base}.prompt',
        RUNS_DIR / f'{base}.out',
        RUNS_DIR / f'{base}.exit',
    )


def spawn_claude(item_id, prompt_text, model=None):
    """Launch Claude Code as a detached background child.

    Writes the prompt to disk, then spawns claude_runner.py with the
    Windows breakaway flags so it survives this script's exit and the
    cron tick's 120s kill.

    Returns dict suitable for state['active_run'] on success, or None.
    """
    prompt_path, output_path, status_path = _build_run_paths(item_id)
    prompt_path.write_text(prompt_text, encoding='utf-8')

    cmd = [
        sys.executable,
        str(RUNNER_SCRIPT),
        CLAUDE_CMD,
        str(prompt_path),
        str(output_path),
        str(status_path),
        model or '',
    ]

    creation_flags = (
        DETACHED_PROCESS
        | CREATE_NEW_PROCESS_GROUP
        | CREATE_BREAKAWAY_FROM_JOB
    )

    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(PROJECT),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
            creationflags=creation_flags,
        )
        pid = proc.pid
        log(f'Spawned Claude (PID {pid}) for {item_id}; output={output_path.name}')
    except OSError as e:
        # Breakaway-denied fallback: use cmd /c start which always detaches
        log(f'Direct spawn failed ({e}); falling back to cmd start')
        quoted = ' '.join(f'"{a}"' for a in cmd)
        try:
            proc = subprocess.Popen(
                f'start "" /B {quoted}',
                shell=True,
                cwd=str(PROJECT),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            pid = proc.pid  # this is cmd.exe's PID, not the runner's — see note
            log(f'Spawned via cmd-start; shell PID {pid}. Tracking via status file only.')
        except OSError as e2:
            log(f'Spawn failed entirely: {e2}')
            return None

    return {
        'item_id': item_id,
        'pid': pid,
        'started_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'output_path': str(output_path),
        'status_path': str(status_path),
        'prompt_path': str(prompt_path),
        'model': model or '',
        'attempt': 1,
    }
```

- [ ] **Step 2: Manual smoke test**

Create a throwaway script `/tmp/spawn-smoke.py`:

```python
import sys, time
sys.path.insert(0, r'C:\Users\Zaim-Work\AppData\Local\hermes\scripts')
import importlib.util
spec = importlib.util.spec_from_file_location("ab", r'C:\Users\Zaim-Work\AppData\Local\hermes\scripts\auto-builder.py')
ab = importlib.util.module_from_spec(spec); spec.loader.exec_module(ab)
state = ab.spawn_claude('smoke-test', 'Reply with: HELLO_FROM_DETACHED')
print(state)
# Now exit. The child should keep running.
```

Run: `python /tmp/spawn-smoke.py`
Then immediately check: `tasklist | findstr <pid>` — should show the runner still alive after our script exits.
Wait ~30s, then: `cat C:/Users/Zaim-Work/Projects/command-center/data/runs/smoke-test-*.exit` — should show `0`.
And: `cat C:/Users/Zaim-Work/Projects/command-center/data/runs/smoke-test-*.out` — should contain `HELLO_FROM_DETACHED`.

This proves detachment works **and** that the status file completion signal works.

- [ ] **Step 3: Commit (if applicable)**

```bash
git add C:/Users/Zaim-Work/AppData/Local/hermes/scripts/auto-builder.py
git commit -m "feat(auto-builder): spawn Claude as detached background process"
```

---

## Task 5: Add `reap_run` — completion + crash handling

**Files:**
- Modify: `C:\Users\Zaim-Work\AppData\Local\hermes\scripts\auto-builder.py`

This is the core of the new tick: given an `active_run`, decide if it's still going, finished cleanly, rate-limited, or crashed, and act accordingly.

- [ ] **Step 1: Add helpers for parsing output**

Add after `spawn_claude`:

```python
def _read_output(path):
    """Read the captured Claude output, defensively."""
    try:
        return Path(path).read_text(encoding='utf-8', errors='replace')
    except OSError:
        return ''


def _parse_rate_limit(output):
    """Return reset-time string or None."""
    m = re.search(r"resets\s+(\d+[ap]m\s*\([^)]+\))", output, re.I)
    if m:
        return m.group(1)
    if "hit your limit" in output.lower():
        t = re.search(r'(\d{1,2}:\d{2}\s*[ap]m)', output, re.I)
        tz = re.search(r'\(([^)]+)\)', output)
        tz_str = tz.group(1) if tz else 'America/Chicago'
        return f'{t.group(1)} ({tz_str})' if t else f'12:00 am ({tz_str})'
    return None


def _run_age_hours(started_at):
    """Approximate hours since started_at ISO string."""
    try:
        dt = datetime.datetime.strptime(started_at[:19], '%Y-%m-%dT%H:%M:%S')
        return (datetime.datetime.now() - dt).total_seconds() / 3600.0
    except (ValueError, TypeError):
        return 0.0
```

- [ ] **Step 2: Add `reap_run`**

Add immediately after the helpers above:

```python
def reap_run(state, q):
    """Process the active_run. Returns one of:
        'done'      - run completed, build/commit handled, state cleared
        'pending'   - still in progress; caller should exit tick
        'failed'    - run failed; state cleared
        'paused'    - rate-limited; cron rescheduled; caller should exit tick
    """
    run = state.get('active_run')
    if not run:
        return 'done'  # nothing to reap

    item_id = run['item_id']
    status_path = Path(run['status_path'])
    output_path = Path(run['output_path'])
    pid = run.get('pid')

    # 1) Did it finish?
    if status_path.exists():
        try:
            code = int(status_path.read_text().strip() or '99')
        except ValueError:
            code = 99
        output = _read_output(output_path)

        # Rate-limit check FIRST (Claude may exit 0 even when refusing on quota)
        reset = _parse_rate_limit(output)
        if reset:
            log(f'{item_id}: RATE LIMITED on completion - resets {reset}')
            set_status(q, item_id, 'paused')
            save_queue(q)
            schedule_next_job(reset)
            clear_active_run(state)
            return 'paused'

        if code == 0:
            log(f'{item_id}: Claude OK (exit 0) - running build')
            if not build():
                set_status(q, item_id, 'failed')
                save_queue(q)
                clear_active_run(state)
                return 'failed'
            if not verify_build():
                set_status(q, item_id, 'failed')
                save_queue(q)
                clear_active_run(state)
                return 'failed'
            set_status(q, item_id, 'done')
            save_queue(q)
            git_commit(f'auto: {item_id}')
            clear_active_run(state)
            return 'done'
        else:
            log(f'{item_id}: Claude FAILED (exit {code}) - {output[-300:]}')
            set_status(q, item_id, 'failed')
            save_queue(q)
            clear_active_run(state)
            return 'failed'

    # 2) Still running?
    if is_pid_alive(pid):
        age_h = _run_age_hours(run.get('started_at', ''))
        if age_h > MAX_RUN_HOURS:
            log(f'{item_id}: exceeded {MAX_RUN_HOURS}h cap (age={age_h:.1f}h) - killing')
            try:
                import ctypes
                PROCESS_TERMINATE = 0x0001
                h = ctypes.windll.kernel32.OpenProcess(PROCESS_TERMINATE, False, int(pid))
                if h:
                    ctypes.windll.kernel32.TerminateProcess(h, 1)
                    ctypes.windll.kernel32.CloseHandle(h)
            except (ValueError, OSError, AttributeError):
                pass
            set_status(q, item_id, 'failed')
            save_queue(q)
            clear_active_run(state)
            return 'failed'
        log(f'{item_id}: still running (PID {pid}, age {age_h*60:.0f} min)')
        return 'pending'

    # 3) Dead PID, no status file → crashed.
    attempt = run.get('attempt', 1)
    if attempt < MAX_ATTEMPTS:
        log(f'{item_id}: CRASHED (no exit file, PID dead); retrying (attempt {attempt+1})')
        # Leave status=in_progress; caller will re-launch on this tick.
        run['attempt'] = attempt + 1
        # Note: caller decides whether to relaunch immediately or just clear.
        clear_active_run(state)
        return 'failed'  # treat as a unit of failed work for THIS run; relaunch handled by launch_next
    else:
        log(f'{item_id}: CRASHED past MAX_ATTEMPTS ({attempt}); marking failed')
        set_status(q, item_id, 'failed')
        save_queue(q)
        clear_active_run(state)
        return 'failed'
```

- [ ] **Step 3: Syntax check**

Run: `python -c "import ast; ast.parse(open(r'C:/Users/Zaim-Work/AppData/Local/hermes/scripts/auto-builder.py').read())"`
Expected: no output.

- [ ] **Step 4: Commit (if applicable)**

```bash
git add C:/Users/Zaim-Work/AppData/Local/hermes/scripts/auto-builder.py
git commit -m "feat(auto-builder): reap completed/crashed Claude runs"
```

---

## Task 6: Add `launch_next` — pick + spawn the next item

**Files:**
- Modify: `C:\Users\Zaim-Work\AppData\Local\hermes\scripts\auto-builder.py`

- [ ] **Step 1: Add `launch_next`**

Add after `reap_run`:

```python
def launch_next(state, q, pending):
    """Pick the first pending item, mark it in_progress, spawn Claude.
    Returns True if a run was started, False if nothing to do."""
    if state.get('active_run'):
        # Defensive: should never happen, reap_run clears it first.
        log('launch_next: refusing to launch - active_run still present')
        return False

    if not pending:
        return False

    item = pending[0]
    item_id = item['id']
    label = item.get('label', item_id)
    prompt = item.get('prompt', '')

    if not prompt:
        log(f'{item_id}: skipping - no prompt field')
        set_status(q, item_id, 'failed')
        save_queue(q)
        return False

    log(f'Launching: {item_id} ({label})')
    set_status(q, item_id, 'in_progress')
    save_queue(q)

    run = spawn_claude(item_id, prompt, model=item.get('model'))
    if not run:
        log(f'{item_id}: spawn failed - rolling back to waiting')
        set_status(q, item_id, 'waiting')
        save_queue(q)
        return False

    state['active_run'] = run
    save_state(state)
    return True
```

- [ ] **Step 2: Syntax check**

Run: `python -c "import ast; ast.parse(open(r'C:/Users/Zaim-Work/AppData/Local/hermes/scripts/auto-builder.py').read())"`
Expected: no output.

- [ ] **Step 3: Commit (if applicable)**

```bash
git add C:/Users/Zaim-Work/AppData/Local/hermes/scripts/auto-builder.py
git commit -m "feat(auto-builder): launch_next picks and spawns pending work"
```

---

## Task 7: Add `reconcile_stale_in_progress` — recover from prior crash

**Files:**
- Modify: `C:\Users\Zaim-Work\AppData\Local\hermes\scripts\auto-builder.py`

If the queue has `status=in_progress` items but there's no `active_run`, the script was killed between marking and spawning (or state was hand-edited). Reset those to `waiting` so they get re-picked.

- [ ] **Step 1: Add reconciler**

Add immediately before `main()`:

```python
def reconcile_stale_in_progress(state, q):
    """Reset orphaned in_progress items to waiting.
    Called once at tick start, after lock acquisition."""
    active_id = (state.get('active_run') or {}).get('item_id')
    fixed = 0
    for entry in q.get('queue', []):
        if entry.get('status') == 'in_progress' and entry.get('id') != active_id:
            log(f'Reconcile: {entry["id"]} was in_progress but no active_run - resetting to waiting')
            entry['status'] = 'waiting'
            fixed += 1
    if fixed:
        save_queue(q)
```

- [ ] **Step 2: Commit (if applicable)**

```bash
git add C:/Users/Zaim-Work/AppData/Local/hermes/scripts/auto-builder.py
git commit -m "feat(auto-builder): reconcile orphaned in_progress items"
```

---

## Task 8: Rewrite `main()` as a state-machine tick

**Files:**
- Modify: `C:\Users\Zaim-Work\AppData\Local\hermes\scripts\auto-builder.py` (replace existing `main`)

- [ ] **Step 1: Replace `main`**

Delete the existing `main()` (current lines 266-362) and replace with:

```python
def self_destruct():
    """Remove our cron entry. Called when there's no work to do."""
    log('No active run and no pending work. Self-destructing cron entry.')
    subprocess.run(
        [HERMES_CMD, 'cron', 'remove', 'auto-command-center-builder'],
        capture_output=True, timeout=10,
    )


def claude_available():
    """Quick probe (20s) to check Claude Code is callable.
    Only used when we're ABOUT TO LAUNCH; not for already-running work."""
    try:
        r = subprocess.run(
            [CLAUDE_CMD, '-p', 'Reply READY', '--print'],
            capture_output=True, text=True, timeout=20, cwd=str(PROJECT),
        )
        out = (r.stdout or '') + (r.stderr or '')
        if 'READY' in out:
            return True, None
        reset = _parse_rate_limit(out)
        return False, reset
    except subprocess.TimeoutExpired:
        return False, None
    except FileNotFoundError:
        return False, None


def main():
    log('Auto-builder tick starting...')
    if not acquire_lock():
        return 0
    atexit.register(release_lock)

    state = load_state()
    pending, q = load_pending()
    if q is None:
        return 0

    reconcile_stale_in_progress(state, q)
    pending, q = load_pending()  # reload after potential reconcile writes

    # PHASE 1: REAP
    if state.get('active_run'):
        result = reap_run(state, q)
        if result == 'pending':
            # Still running. Don't launch anything new this tick.
            log('Tick complete (run in progress).')
            return 0
        # Any other result means active_run was cleared; fall through to launch.
        # Reload pending since reap may have marked the previous item done/failed.
        pending, q = load_pending()

    # PHASE 2: SELF-DESTRUCT IF IDLE
    if not pending:
        self_destruct()
        return 0

    # PHASE 3: PROBE BEFORE LAUNCH
    ok, reset = claude_available()
    if not ok:
        if reset:
            log(f'Claude rate-limited from probe; scheduling at {reset}')
            schedule_next_job(reset)
        else:
            log('Claude probe failed; will retry next regular tick')
        return 0

    # PHASE 4: LAUNCH
    started = launch_next(state, q, pending)
    if started:
        log('Tick complete (run launched).')
    else:
        log('Tick complete (nothing launched).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
```

- [ ] **Step 2: Syntax check**

Run: `python -c "import ast; ast.parse(open(r'C:/Users/Zaim-Work/AppData/Local/hermes/scripts/auto-builder.py').read())"`
Expected: no output.

- [ ] **Step 3: Dry-run with empty queue**

Temporarily back up `work-queue.json` and create a copy with no Claude items.
Run: `python "C:/Users/Zaim-Work/AppData/Local/hermes/scripts/auto-builder.py"`
Expected in log: `Auto-builder tick starting...`, `No active run and no pending work. Self-destructing cron entry.` Tick completes in < 30s.
Restore the original queue file.

- [ ] **Step 4: Commit (if applicable)**

```bash
git add C:/Users/Zaim-Work/AppData/Local/hermes/scripts/auto-builder.py
git commit -m "refactor(auto-builder): state-machine tick replaces sync run loop"
```

---

## Task 9: End-to-end test with a synthetic long-running prompt

**Files:** none modified.

This validates that a Claude run lasting >120s survives across multiple cron ticks.

- [ ] **Step 1: Insert a synthetic queue item**

Edit `data/work-queue.json` and add to the `queue` array:

```json
{
  "id": "async-smoke-test",
  "label": "Async smoke test",
  "prompt": "Write a 500-word essay on the history of asynchronous I/O in Unix, then save it to docs/async-smoke.md. Take your time and think step by step before writing.",
  "model": "claude-sonnet-4-6",
  "assigned_to": "claude",
  "status": "waiting"
}
```

- [ ] **Step 2: Trigger first tick**

Run: `python "C:/Users/Zaim-Work/AppData/Local/hermes/scripts/auto-builder.py"`
Expected in `data/auto-builder.log`:
- `Auto-builder tick starting...`
- `Launching: async-smoke-test (Async smoke test)`
- `Spawned Claude (PID NNNN) for async-smoke-test`
- `Tick complete (run launched).`

Expected: tick exits in under 30s.
Expected: `data/active-run.json` exists with `active_run.item_id == "async-smoke-test"`.
Expected: `tasklist | findstr <PID>` shows the runner still alive.

- [ ] **Step 3: Trigger a second tick mid-run (~60s later)**

Wait 60s. Run the script again.
Expected log: `async-smoke-test: still running (PID NNNN, age 1 min)` and `Tick complete (run in progress).`
Expected: tick exits in under 5s.
Expected: `data/active-run.json` unchanged.

- [ ] **Step 4: Wait for completion and trigger reaping tick**

Wait until `data/runs/async-smoke-test-*.exit` exists (poll every 30s).
Run the script.
Expected log: `async-smoke-test: Claude OK (exit 0) - running build`, then `Build: OK`, `Verify: OK ({n} bytes, 200)`, `Queue: async-smoke-test → done`, `Committed: auto: async-smoke-test`.
Expected: `docs/async-smoke.md` exists.
Expected: `data/active-run.json` shows `active_run: null`.
Expected: `git log -1 --oneline` shows the commit.

- [ ] **Step 5: Clean up**

Delete `docs/async-smoke.md` and the `async-smoke-test` queue entry; commit the cleanup or amend.

- [ ] **Step 6: Crash-recovery test**

Manually re-add the item, run a tick to launch, then **kill the runner process** mid-flight (`taskkill /PID <pid> /F`).
Run the script again.
Expected log: `async-smoke-test: CRASHED (no exit file, PID dead); retrying (attempt 2)` (assuming MAX_ATTEMPTS=2).
Expected: `data/active-run.json` cleared, next tick relaunches it.

If `attempt` reaches `MAX_ATTEMPTS` and crashes again, expect: `marking failed` and item status set to `failed`.

---

## Task 10: Re-register the cron job

**Files:** none modified.

After the rewrite, the cron entry registered with hermes is unchanged in shape — same script name, same `--no-agent`, same 15-min cadence. Verify it's healthy.

- [ ] **Step 1: List current cron jobs**

Run: `hermes cron list`
Expected: `auto-command-center-builder` present with 15-minute cadence.

- [ ] **Step 2: If absent, register**

```bash
hermes cron create \
  --name auto-command-center-builder \
  --script auto-builder.py \
  --no-agent \
  --schedule "*/15 * * * *" \
  --deliver origin \
  --workdir "C:/Users/Zaim-Work/Projects/command-center"
```

- [ ] **Step 3: Observe two full ticks in production**

Wait 30 minutes. Check `data/auto-builder.log` shows the expected pattern: launch on tick 1, "still running" on tick 2 (or reap if quick), etc.

---

## Task 11: Add a `--status` flag for quick inspection (optional, recommended)

**Files:**
- Modify: `C:\Users\Zaim-Work\AppData\Local\hermes\scripts\auto-builder.py`

A read-only diagnostic command so you can ask the script "what are you doing right now?" without waiting for the next tick.

- [ ] **Step 1: Add status reporter**

Add immediately before `if __name__ == '__main__':`:

```python
def print_status():
    state = load_state()
    run = state.get('active_run')
    if not run:
        print('No active run.')
        pending, q = load_pending()
        if q is not None:
            print(f'Queue: {len(pending)} pending item(s).')
            for item in pending[:5]:
                print(f'  - {item["id"]}: {item.get("label", "")}')
        return
    age = _run_age_hours(run.get('started_at', '')) * 60
    alive = is_pid_alive(run.get('pid'))
    status_exists = Path(run['status_path']).exists()
    print(f'Active run: {run["item_id"]}')
    print(f'  PID:       {run["pid"]} (alive={alive})')
    print(f'  Age:       {age:.1f} min')
    print(f'  Started:   {run.get("started_at", "?")}')
    print(f'  Output:    {run["output_path"]}')
    print(f'  Status:    {"COMPLETED" if status_exists else "running"}')
```

- [ ] **Step 2: Wire into entrypoint**

Replace the `if __name__ == '__main__':` block with:

```python
if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--status':
        print_status()
        sys.exit(0)
    sys.exit(main())
```

- [ ] **Step 3: Try it**

Run: `python "C:/Users/Zaim-Work/AppData/Local/hermes/scripts/auto-builder.py" --status`
Expected: prints either `No active run.` + queue summary, or the current run's details.

- [ ] **Step 4: Commit (if applicable)**

```bash
git add C:/Users/Zaim-Work/AppData/Local/hermes/scripts/auto-builder.py
git commit -m "feat(auto-builder): add --status flag for live inspection"
```

---

# Constraint Coverage Matrix

| Brief Constraint | Where it's satisfied |
|---|---|
| 1. Hours-long Claude runs without being killed | Task 4 (detach flags), Task 5 (no waiting in reap), Task 8 (no sync wait in main) |
| 2. Tick completes in seconds | Task 8 (PHASE 3 probe is 20s only when launching; steady-state pending tick is < 5s) |
| 3. Crash detection + retry | Task 5 (dead-PID + no-status branch), Task 7 (orphan reconciler), attempt counter (MAX_ATTEMPTS=2) |
| 4. No duplicate Claude processes | Task 5 (early return when active_run set), Task 6 (defensive check in launch_next), state file is singleton |
| 5. in_progress while running, done on success | Task 6 (sets in_progress before spawn), Task 5 (sets done after build+verify+commit) |
| 6. Build/verify/commit after Claude completes | Task 5 (reap_run runs build/verify/commit only after exit code 0, which may be many ticks later) |
| 7. Lock file prevents conflicting operations | Task 8 (acquire_lock first; held only for the tick body) |

# What is *not* changed

- Rate-limit handling logic (regex + `schedule_next_job` + `paused` status) — preserved, just relocated to reap.
- Lock file PID semantics.
- `build()`, `verify_build()`, `git_commit()`, `load_pending`, `save_queue`, `set_status`, `log`, `schedule_next_job` — kept verbatim.
- Cron registration shape (`--no-agent`, 15-min cadence, `--deliver origin`).
- Work-queue schema (only the *set* of valid status values is broadened to consistently include `in_progress`).

# Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Hermes' Job Object denies `CREATE_BREAKAWAY_FROM_JOB` | Task 4 fallback: `cmd /c start "" /B ...` which always detaches |
| PID reused by Windows after Claude exits, fooling `is_pid_alive` | Reap uses status file as the *primary* signal; PID-aliveness is only consulted when the status file is absent (i.e., the process either is still ours or has died — both safe outcomes) |
| Claude exits cleanly but the build step still takes >90s | Build is 60s timeout; verify is ~1s. If the project grows, move build to its own background pattern (out of scope for v1) |
| `data/runs/` accumulates indefinitely | Acceptable for v1. Future task: prune `runs/` older than 7 days at tick start |
| Two cron ticks somehow race past the lock | Lock is fail-fast (`acquire_lock` returns False); the late tick logs and exits without touching state |
| State file corrupted mid-write | Atomic via `os.replace`; reader tolerates JSON errors by treating as empty (Task 3, `load_state`) |
| Claude completes between TICK_N reading state and TICK_N+1 — but status file appears mid-tick | Reap reads `status_path.exists()` first; if false then PID check; the race window is < 1ms and either outcome is safe (next tick reaps) |

# Execution Notes

This plan is implementable in one sitting; ~250 net lines of Python changed, mostly added. Order matters: Tasks 1-3 establish the foundation (gitignore, runner, state helpers), Tasks 4-7 add the building blocks (spawn, reap, launch, reconcile), Task 8 wires it all together, Task 9 validates end-to-end with a real long-running prompt, Task 10 confirms cron registration. Task 11 is a quality-of-life addition you'll want before debugging anything in production.

**Plan complete and saved to `auto-builder-redesign.md`.**
