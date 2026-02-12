const paths = require('../lib/paths');
const { render_md } = require('../lib/utils/render-md');
const { createJob } = require('../lib/tools/create-job');
const { setWebhook, sendMessage, downloadFile, reactToMessage, startTypingIndicator } = require('../lib/tools/telegram');
const { isWhisperEnabled, transcribeAudio } = require('../lib/tools/openai');
const { chat, getApiKey } = require('../lib/claude');
const { toolDefinitions, toolExecutors } = require('../lib/claude/tools');
const { getHistory, updateHistory } = require('../lib/claude/conversation');
const { getJobStatus } = require('../lib/tools/github');

// Bot token from env, can be overridden by /telegram/register
let telegramBotToken = null;

// Cached trigger firing function (initialized on first request)
let _fireTriggers = null;

function getTelegramBotToken() {
  if (!telegramBotToken) {
    telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || null;
  }
  return telegramBotToken;
}

function getFireTriggers() {
  if (!_fireTriggers) {
    const { loadTriggers } = require('../lib/triggers');
    const result = loadTriggers();
    _fireTriggers = result.fireTriggers;
  }
  return _fireTriggers;
}

// Routes that have their own authentication
const PUBLIC_ROUTES = ['/telegram/webhook', '/github/webhook'];

/**
 * Check API key authentication
 * @param {string} routePath - The route path
 * @param {Request} request - The incoming request
 * @returns {Response|null} - Error response if unauthorized, null if OK
 */
function checkAuth(routePath, request) {
  if (PUBLIC_ROUTES.includes(routePath)) return null;

  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== process.env.API_KEY) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

/**
 * Extract job ID from branch name (e.g., "job/abc123" -> "abc123")
 */
function extractJobId(branchName) {
  if (!branchName || !branchName.startsWith('job/')) return null;
  return branchName.slice(4);
}

/**
 * Summarize a completed job using Claude
 * @param {Object} results - Job results from webhook payload
 * @returns {Promise<string>} The message to send to Telegram
 */
async function summarizeJob(results) {
  try {
    const apiKey = getApiKey();

    // System prompt from JOB_SUMMARY.md (supports {{includes}})
    const systemPrompt = render_md(paths.jobSummaryMd);

    // User message: structured job results
    const userMessage = [
      results.job ? `## Task\n${results.job}` : '',
      results.commit_message ? `## Commit Message\n${results.commit_message}` : '',
      results.changed_files?.length ? `## Changed Files\n${results.changed_files.join('\n')}` : '',
      results.status ? `## Status\n${results.status}` : '',
      results.merge_result ? `## Merge Result\n${results.merge_result}` : '',
      results.pr_url ? `## PR URL\n${results.pr_url}` : '',
      results.run_url ? `## Run URL\n${results.run_url}` : '',
      results.log ? `## Agent Log\n${results.log}` : '',
    ].filter(Boolean).join('\n\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.EVENT_HANDLER_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) throw new Error(`Claude API error: ${response.status}`);

    const result = await response.json();
    return (result.content?.[0]?.text || '').trim() || 'Job finished.';
  } catch (err) {
    console.error('Failed to summarize job:', err);
    return 'Job finished.';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleWebhook(request) {
  const body = await request.json();
  const { job } = body;
  if (!job) return Response.json({ error: 'Missing job field' }, { status: 400 });

  try {
    const result = await createJob(job);
    return Response.json(result);
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Failed to create job' }, { status: 500 });
  }
}

async function handleTelegramRegister(request) {
  const body = await request.json();
  const { bot_token, webhook_url } = body;
  if (!bot_token || !webhook_url) {
    return Response.json({ error: 'Missing bot_token or webhook_url' }, { status: 400 });
  }

  try {
    const result = await setWebhook(bot_token, webhook_url, process.env.TELEGRAM_WEBHOOK_SECRET);
    telegramBotToken = bot_token;
    return Response.json({ success: true, result });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Failed to register webhook' }, { status: 500 });
  }
}

async function handleTelegramWebhook(request) {
  const { TELEGRAM_WEBHOOK_SECRET, TELEGRAM_CHAT_ID, TELEGRAM_VERIFICATION } = process.env;
  const botToken = getTelegramBotToken();

  // Validate secret token if configured
  // Always return 200 to prevent Telegram retry loops on mismatch
  if (TELEGRAM_WEBHOOK_SECRET) {
    const headerSecret = request.headers.get('x-telegram-bot-api-secret-token');
    if (headerSecret !== TELEGRAM_WEBHOOK_SECRET) {
      return Response.json({ ok: true });
    }
  }

  const update = await request.json();
  const message = update.message || update.edited_message;

  if (message && message.chat && botToken) {
    const chatId = String(message.chat.id);

    let messageText = null;

    if (message.text) {
      messageText = message.text;
    }

    // Check for verification code - this works even before TELEGRAM_CHAT_ID is set
    if (TELEGRAM_VERIFICATION && messageText === TELEGRAM_VERIFICATION) {
      await sendMessage(botToken, chatId, `Your chat ID:\n<code>${chatId}</code>`);
      return Response.json({ ok: true });
    }

    // Security: if no TELEGRAM_CHAT_ID configured, ignore all messages (except verification above)
    if (!TELEGRAM_CHAT_ID) {
      return Response.json({ ok: true });
    }

    // Security: only accept messages from configured chat
    if (chatId !== TELEGRAM_CHAT_ID) {
      return Response.json({ ok: true });
    }

    // Acknowledge receipt with a thumbs up (await so it completes before typing indicator starts)
    await reactToMessage(botToken, chatId, message.message_id).catch(() => {});

    if (message.voice) {
      // Handle voice messages
      if (!isWhisperEnabled()) {
        await sendMessage(botToken, chatId, 'Voice messages are not supported. Please set OPENAI_API_KEY to enable transcription.');
        return Response.json({ ok: true });
      }

      try {
        const { buffer, filename } = await downloadFile(botToken, message.voice.file_id);
        messageText = await transcribeAudio(buffer, filename);
      } catch (err) {
        console.error('Failed to transcribe voice:', err);
        await sendMessage(botToken, chatId, 'Sorry, I could not transcribe your voice message.');
        return Response.json({ ok: true });
      }
    }

    if (messageText) {
      // Process message asynchronously (don't block the response)
      processMessage(botToken, chatId, messageText).catch(err => {
        console.error('Failed to process message:', err);
      });
    }
  }

  return Response.json({ ok: true });
}

/**
 * Process a Telegram message with Claude (async, non-blocking)
 */
async function processMessage(botToken, chatId, messageText) {
  const stopTyping = startTypingIndicator(botToken, chatId);
  try {
    // Get conversation history and process with Claude
    const history = getHistory(chatId);
    const { response, history: newHistory } = await chat(
      messageText,
      history,
      toolDefinitions,
      toolExecutors
    );
    updateHistory(chatId, newHistory);

    // Send response (auto-splits if needed)
    await sendMessage(botToken, chatId, response);
  } catch (err) {
    console.error('Failed to process message with Claude:', err);
    await sendMessage(botToken, chatId, 'Sorry, I encountered an error processing your message.').catch(() => {});
  } finally {
    stopTyping();
  }
}

async function handleGithubWebhook(request) {
  const { GH_WEBHOOK_SECRET, TELEGRAM_CHAT_ID } = process.env;
  const botToken = getTelegramBotToken();

  // Validate webhook secret
  if (GH_WEBHOOK_SECRET) {
    const headerSecret = request.headers.get('x-github-webhook-secret-token');
    if (headerSecret !== GH_WEBHOOK_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const payload = await request.json();
  const jobId = payload.job_id || extractJobId(payload.branch);
  if (!jobId) return Response.json({ ok: true, skipped: true, reason: 'not a job' });

  if (!TELEGRAM_CHAT_ID || !botToken) {
    console.log(`Job ${jobId} completed but no chat ID to notify`);
    return Response.json({ ok: true, skipped: true, reason: 'no chat to notify' });
  }

  try {
    const results = {
      job: payload.job || '',
      pr_url: payload.pr_url || payload.run_url || '',
      run_url: payload.run_url || '',
      status: payload.status || '',
      merge_result: payload.merge_result || '',
      log: payload.log || '',
      changed_files: payload.changed_files || [],
      commit_message: payload.commit_message || '',
    };

    const message = await summarizeJob(results);

    await sendMessage(botToken, TELEGRAM_CHAT_ID, message);

    // Add the summary to chat memory so Claude has context in future conversations
    const history = getHistory(TELEGRAM_CHAT_ID);
    history.push({ role: 'assistant', content: message });
    updateHistory(TELEGRAM_CHAT_ID, history);

    console.log(`Notified chat ${TELEGRAM_CHAT_ID} about job ${jobId.slice(0, 8)}`);

    return Response.json({ ok: true, notified: true });
  } catch (err) {
    console.error('Failed to process GitHub webhook:', err);
    return Response.json({ error: 'Failed to process webhook' }, { status: 500 });
  }
}

async function handleJobStatus(request) {
  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get('job_id');
    const result = await getJobStatus(jobId);
    return Response.json(result);
  } catch (err) {
    console.error('Failed to get job status:', err);
    return Response.json({ error: 'Failed to get job status' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Next.js Route Handlers (catch-all)
// ─────────────────────────────────────────────────────────────────────────────

async function POST(request) {
  const url = new URL(request.url);
  const routePath = url.pathname.replace(/^\/api/, '');

  // Auth check
  const authError = checkAuth(routePath, request);
  if (authError) return authError;

  // Fire triggers (non-blocking)
  try {
    const fireTriggers = getFireTriggers();
    // Clone request to read body for triggers without consuming it for the handler
    const clonedRequest = request.clone();
    const body = await clonedRequest.json().catch(() => ({}));
    const query = Object.fromEntries(url.searchParams);
    const headers = Object.fromEntries(request.headers);
    fireTriggers(routePath, body, query, headers);
  } catch (e) {
    // Trigger errors are non-fatal
  }

  // Route to handler
  switch (routePath) {
    case '/webhook':            return handleWebhook(request);
    case '/telegram/webhook':   return handleTelegramWebhook(request);
    case '/telegram/register':  return handleTelegramRegister(request);
    case '/github/webhook':     return handleGithubWebhook(request);
    default:                    return Response.json({ error: 'Not found' }, { status: 404 });
  }
}

async function GET(request) {
  const url = new URL(request.url);
  const routePath = url.pathname.replace(/^\/api/, '');

  // Auth check
  const authError = checkAuth(routePath, request);
  if (authError) return authError;

  switch (routePath) {
    case '/ping':         return Response.json({ message: 'Pong!' });
    case '/jobs/status':  return handleJobStatus(request);
    default:              return Response.json({ error: 'Not found' }, { status: 404 });
  }
}

module.exports = { GET, POST };
