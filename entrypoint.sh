#!/bin/bash
set -e

JOB_ID=$(cat /proc/sys/kernel/random/uuid)
echo "Job ID: ${JOB_ID}"

# Start Chrome (using Playwright's chromium)
CHROME_BIN=$(find /root/.cache/ms-playwright -name "chrome" -path "*/chrome-linux/*" | head -1)
$CHROME_BIN --headless --no-sandbox --disable-gpu --remote-debugging-port=9222 2>/dev/null &
CHROME_PID=$!
sleep 2

# Git setup
git config --global user.name "popebot"
git config --global user.email "popebot@example.com"

# Configure git to use gh CLI for authentication (GH_TOKEN env var required)
gh auth setup-git

# Clone branch
if [ -n "$REPO_URL" ]; then
    git clone --single-branch --branch "$BRANCH" --depth 1 "$REPO_URL" /job
else
    echo "No REPO_URL provided"
fi

exit

# Point Pi to /job for auth.json
export PI_CODING_AGENT_DIR=/job

# Clean workspace/tmp
rm -rf ./workspace/tmp/*

# Setup logs
LOG_DIR="/job/workspace/logs"
mkdir -p "${LOG_DIR}"

# 1. Run job (AGENTS.md provides behavior rules, job.md provides the task)
pi -p "$(cat /job/AGENTS.md /job/workspace/job.md)" --session-dir "${LOG_DIR}"
mv "${LOG_DIR}"/session-*.jsonl "${LOG_DIR}/${JOB_ID}.jsonl" 2>/dev/null || true

# 2. Commit changes + logs
git add -A
git commit -m "popebot: job ${JOB_ID}" || true

# 3. Merge (pi has memory of job via session)
if [ -n "$REPO_URL" ] && [ -f "/job/MERGE_JOB.md" ]; then
    pi -p "$(cat /job/MERGE_JOB.md)" --session "${LOG_DIR}/${JOB_ID}.jsonl"
fi

# 4. Delete logs, commit "done."
rm -f "${LOG_DIR}/${JOB_ID}.jsonl"
git add workspace/logs/
git commit -m "done." || true

# Cleanup
kill $CHROME_PID 2>/dev/null || true
echo "Done. Job ID: ${JOB_ID}"
