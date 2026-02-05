# thepopebot

> **Autonomous AI agents. All the power. None of the leaked API keys.**

Other agent frameworks hand your credentials directly to the LLM and hope for the best. thepopebot is different: the AI **literally cannot access your secrets**, even if it tries. Not through echo. Not through /proc. Not through clever prompt injection. The keys exist in a parallel universe the LLM can't reach.

| What the AI tries | What happens |
|-------------------|--------------|
| `echo $ANTHROPIC_API_KEY` | Empty |
| `echo $GH_TOKEN` | Empty |
| `cat /proc/self/environ` | Secrets missing |
| Claude API calls | ✅ Work normally |
| GitHub CLI commands | ✅ Work normally |

Simple subprocess filtering. No containers-in-containers, no VM sandboxing, no complexity.

[![Use this template](https://img.shields.io/badge/Use%20this%20template-238636?style=for-the-badge&logo=github)](https://github.com/stephengpope/thepopebot/generate)

---

## Quick Start

### Prerequisites

- **Node.js 18+** - [nodejs.org](https://nodejs.org)
- **GitHub CLI** - `brew install gh` or [cli.github.com](https://cli.github.com)
- **ngrok** - `brew install ngrok/ngrok/ngrok` or [ngrok.com](https://ngrok.com)

### Setup

```bash
git clone https://github.com/YOUR_USERNAME/thepopebot.git
cd thepopebot
npm run setup
```

The wizard handles everything:
1. Checks prerequisites
2. Creates a GitHub Personal Access Token
3. Collects API keys (Anthropic required, OpenAI optional for voice)
4. Generates `event_handler/.env` for local development
5. Sets all GitHub repository secrets
6. Sets up Telegram bot
7. Walks you through starting the server + ngrok
8. Registers webhooks automatically

After setup, message your Telegram bot to create jobs!

---

## How It Works

thepopebot uses a two-layer architecture:

1. **Event Handler** - Node.js server for webhooks, Telegram chat, and cron scheduling
2. **Docker Agent** - Pi coding agent container for autonomous task execution

```
┌───────────────────────────────────────────────────────────────────────┐
│                                                                       │
│  ┌─────────────────┐         ┌─────────────────┐                     │
│  │  Event Handler  │ ──1──►  │     GitHub      │                     │
│  │  (creates job)  │         │ (job/* branch)  │                     │
│  └────────▲────────┘         └────────┬────────┘                     │
│           │                           │                              │
│           │                           2 (triggers job-runner.yml)    │
│           │                           │                              │
│           │                           ▼                              │
│           │                  ┌─────────────────┐                     │
│           │                  │  Docker Agent   │                     │
│           │                  │  (runs Pi, PRs) │                     │
│           │                  └────────┬────────┘                     │
│           │                           │                              │
│           │                           3 (creates PR)                 │
│           │                           │                              │
│           │                           ▼                              │
│           │                  ┌─────────────────┐                     │
│           │                  │     GitHub      │                     │
│           │                  │   (PR opened)   │                     │
│           │                  └────────┬────────┘                     │
│           │                           │                              │
│           │                           4 (triggers pr-webhook.yml)    │
│           │                           │                              │
│           5 (Telegram notification)   │                              │
│           └───────────────────────────┘                              │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

**The repository IS the agent** — Fork it and you fork everything: code, personality, logs, history.

**GitHub Actions IS the compute** — Free, isolated containers. Run one task or a thousand in parallel.

**Self-evolving** — The agent modifies its own code through PRs. Every change auditable, every change reversible.

---

## Using Your Bot

### Telegram Chat

Message your bot directly to chat or create jobs. The bot uses Claude to understand your requests and can:

- **Chat** - Have a conversation, ask questions, get information
- **Create jobs** - Say "create a job to..." and the bot will spawn an autonomous agent

#### Voice Messages

Send voice notes to your bot and they'll be transcribed using OpenAI Whisper.

**Requirements:**
- `OPENAI_API_KEY` in your `.env` file

The bot automatically detects voice messages and transcribes them before processing.

### Webhooks

Create jobs programmatically via HTTP:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"job": "Update the README with installation instructions"}'
```

### Scheduled Jobs

Define recurring jobs in `operating_system/CRONS.json`:

```json
[
  {
    "name": "daily-check",
    "schedule": "0 9 * * *",
    "job": "Check for dependency updates",
    "enabled": true
  }
]
```

Set `"enabled": true` to activate a scheduled job.

---

## Configuration

### Environment Variables

All environment variables for the Event Handler (set in `event_handler/.env`):

| Variable | Description | Required |
|----------|-------------|----------|
| `API_KEY` | Authentication key for /webhook endpoint | Yes |
| `GH_TOKEN` | GitHub PAT for creating branches/files | Yes |
| `GH_OWNER` | GitHub repository owner | Yes |
| `GH_REPO` | GitHub repository name | Yes |
| `PORT` | Server port (default: 3000) | No |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from BotFather | For Telegram |
| `TELEGRAM_WEBHOOK_SECRET` | Secret for webhook validation | No |
| `GH_WEBHOOK_TOKEN` | Token for GitHub Actions webhook auth | For notifications |
| `ANTHROPIC_API_KEY` | Claude API key for chat functionality | For chat |
| `OPENAI_API_KEY` | OpenAI key for voice transcription | For voice |
| `EVENT_HANDLER_MODEL` | Claude model for chat (default: claude-sonnet-4) | No |

### GitHub Secrets

Set automatically by the setup wizard:

| Secret | Description |
|--------|-------------|
| `SECRETS` | Base64-encoded JSON with protected credentials |
| `LLM_SECRETS` | Base64-encoded JSON with LLM-accessible credentials (optional) |
| `GH_WEBHOOK_URL` | Your ngrok URL |
| `GH_WEBHOOK_TOKEN` | Random token for webhook authentication |

### Operating System Files

Customize agent behavior in `operating_system/`:

| File | Purpose |
|------|---------|
| `THEPOPEBOT.md` | Core behavioral instructions (what to do, workflow patterns) |
| `SOUL.md` | Agent identity, personality traits, and values |
| `CHATBOT.md` | System prompt for Telegram chat |
| `JOB_SUMMARY.md` | Prompt for summarizing completed jobs |
| `HEARTBEAT.md` | Self-monitoring behavior |
| `CRONS.json` | Scheduled job definitions |

### Task Definition

Edit `workspace/job.md` with:
- Clear task description
- Specific requirements
- Expected outputs

---

## Reference

### File Structure

```
/
├── .github/workflows/
│   ├── job-runner.yml      # Runs Docker agent on job/* branch creation
│   └── pr-webhook.yml      # Notifies event handler on PR opened
├── .pi/
│   ├── extensions/         # Pi extensions (env-sanitizer for secret filtering)
│   └── skills/             # Custom skills for the agent
├── docs/                   # Additional documentation
├── event_handler/          # Event Handler orchestration layer
│   ├── server.js           # Express HTTP server
│   ├── cron.js             # Cron scheduler
│   ├── .env                # Environment config (generated by setup)
│   ├── claude/             # Claude API integration
│   └── tools/              # Job creation, GitHub, Telegram utilities
├── operating_system/
│   ├── THEPOPEBOT.md       # Agent behavior rules
│   ├── SOUL.md             # Agent identity and personality
│   ├── CHATBOT.md          # Telegram chat system prompt
│   ├── JOB_SUMMARY.md      # Job summary prompt
│   ├── HEARTBEAT.md        # Self-monitoring
│   └── CRONS.json          # Scheduled jobs
├── setup/                  # Interactive setup wizard
│   ├── setup.mjs           # Main wizard script
│   └── lib/                # Helper modules
├── workspace/
│   ├── job.md              # Current task
│   └── logs/               # Session logs
├── Dockerfile              # Container definition
├── entrypoint.sh           # Startup script
└── SECURITY.md             # Security documentation
```

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/webhook` | POST | Generic webhook for job creation (requires API_KEY header) |
| `/telegram/webhook` | POST | Telegram bot webhook for conversational interface |
| `/telegram/register` | POST | Register Telegram webhook URL |
| `/github/webhook` | POST | Receives notifications from GitHub Actions |
| `/jobs/status` | GET | Check status of a running job |

**Examples:**

```bash
# Create a job via webhook
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"job": "Update the README with installation instructions"}'

# Check job status
curl "http://localhost:3000/jobs/status?job_id=abc123" \
  -H "x-api-key: YOUR_API_KEY"

# Register Telegram webhook
curl -X POST http://localhost:3000/telegram/register \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "bot_token": "YOUR_BOT_TOKEN",
    "webhook_url": "https://your-ngrok-url.ngrok-free.dev/telegram/webhook"
  }'
```

### GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `job-runner.yml` | `job/*` branch created | Runs Docker agent container |
| `pr-webhook.yml` | PR opened from `job/*` branch | Notifies event handler → Telegram |

**Flow:**
1. Event handler creates a `job/uuid` branch via GitHub API
2. GitHub Actions detects branch creation → runs `job-runner.yml`
3. Docker agent executes task, commits results, creates PR
4. GitHub Actions detects PR opened → runs `pr-webhook.yml`
5. Event handler receives notification → sends Telegram message

### Docker Agent

The container executes tasks autonomously using the Pi coding agent.

**Container includes:**
- Node.js 22
- Pi coding agent
- Puppeteer + Chromium (headless browser, CDP port 9222)
- Git + GitHub CLI

**Environment Variables:**

| Variable | Description | Required |
|----------|-------------|----------|
| `REPO_URL` | Your repository URL | Yes |
| `BRANCH` | Branch to work on (e.g., job/uuid) | Yes |
| `SECRETS` | Base64-encoded JSON with protected credentials | Yes |
| `LLM_SECRETS` | Base64-encoded JSON with LLM-accessible credentials | No |

**Runtime Flow:**
1. Extract Job ID from branch name
2. Start Chrome in headless mode
3. Decode and export secrets (filtered from LLM's bash)
4. Decode and export LLM secrets (accessible to LLM)
5. Configure Git credentials
6. Clone repository branch
7. Run Pi with THEPOPEBOT.md + SOUL.md + job.md
8. Commit all changes
9. Create PR and auto-merge

### Session Logs

Each job creates a session log at `workspace/logs/{JOB_ID}/`. These can be used to resume sessions or review agent actions.

---

## Security

### How Secret Protection Works

1. GitHub passes a single `SECRETS` env var (base64-encoded JSON with all credentials)
2. The entrypoint decodes the JSON and exports each key as an env var
3. Pi starts - SDKs read their env vars (ANTHROPIC_API_KEY, gh CLI uses GH_TOKEN)
4. The `env-sanitizer` extension filters ALL secret keys from bash subprocess env
5. The LLM can't `echo $ANYTHING` - subprocess env is filtered
6. Other extensions still have full `process.env` access

**What's Protected:**

| Attack Vector | Protection |
|---------------|------------|
| `echo $ANTHROPIC_API_KEY` | Filtered from bash subprocess environment |
| `echo $GH_TOKEN` | Filtered from bash subprocess environment |
| `echo $SECRETS` | Filtered from bash subprocess environment |
| `echo $ANY_CUSTOM_SECRET` | Filtered (any key in SECRETS JSON) |

### LLM-Accessible Secrets

Sometimes you want the LLM to have access to certain credentials - browser logins, skill API keys, or service passwords. Use `LLM_SECRETS` for these.

```bash
# Protected (filtered from LLM)
SECRETS=$(echo -n '{"GH_TOKEN":"ghp_xxx","ANTHROPIC_API_KEY":"sk-ant-xxx"}' | base64)

# Accessible to LLM (not filtered)
LLM_SECRETS=$(echo -n '{"BROWSER_PASSWORD":"mypass123"}' | base64)
```

| Credential Type | Put In | Why |
|-----------------|--------|-----|
| `GH_TOKEN` | `SECRETS` | Agent shouldn't push to arbitrary repos |
| `ANTHROPIC_API_KEY` | `SECRETS` | Agent shouldn't leak billing keys |
| Browser login password | `LLM_SECRETS` | Skills may need to authenticate |
| Third-party API key for a skill | `LLM_SECRETS` | Skills need these to function |

### Implementation

The `env-sanitizer` extension in `.pi/extensions/` dynamically filters secrets:

```typescript
const bashTool = createBashTool(process.cwd(), {
  spawnHook: ({ command, cwd, env }) => {
    const filteredEnv = { ...env };
    if (process.env.SECRETS) {
      try {
        for (const key of Object.keys(JSON.parse(process.env.SECRETS))) {
          delete filteredEnv[key];
        }
      } catch {}
    }
    delete filteredEnv.SECRETS;
    return { command, cwd, env: filteredEnv };
  },
});
```

No special Docker flags required. Works on any host.

### Security Testing

```bash
# Build (Mac users: use --platform linux/amd64 for local testing)
docker build --platform linux/amd64 -t thepopebot:test .

# Run with test secrets
SECRETS=$(echo -n '{"GH_TOKEN":"ghp_test","ANTHROPIC_API_KEY":"sk-ant-test"}' | base64)
docker run --rm -e SECRETS="$SECRETS" thepopebot:test

# Agent should NOT be able to echo any secret vars
# But Pi SDK and gh CLI should work normally
```

### Custom Extensions

The env-sanitizer protects against the **AI agent** accessing secrets through bash. Extension code itself can access `process.env` directly - this is by design.

**Best practices:**
- Don't create tools that echo environment variables to the agent
- Review extension code before adding to your agent
