#!/usr/bin/env node
/**
 * Tests for the Wize Snaps MCP server.
 *
 * Starts a mock Wize Snaps API on a local port, runs the server against it
 * over stdio, and checks the protocol, both tools, the confidence warnings
 * and error handling. No API key needed and no credits spent.
 *
 *   node server/test.js
 */

const http = require('http');
const path = require('path');
const assert = require('assert');
const { spawn } = require('child_process');

/* ---------------------------------------------------------------- */
/* Mock API                                                          */
/* ---------------------------------------------------------------- */

const GOOD_KEY = 'wz_test_mock';

function profileFor(notes) {
  if (/keen/i.test(notes)) return { confidence: 'Low' };
  if (notes.length < 120) return { confidence: 'Medium' };
  return { confidence: 'High' };
}

const api = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const reply = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (req.headers['x-api-key'] !== GOOD_KEY) return reply(401, { message: 'Unauthorised' });

    let body;
    try { body = JSON.parse(raw); } catch { return reply(400, { message: 'Bad JSON' }); }

    if (req.url === '/api/v1/snap') {
      if (body.name === 'Ratelimited') return reply(429, {});
      if (body.name === 'Broken') return reply(500, { message: 'Could not generate a profile.' });
      const { confidence } = profileFor(body.notes || '');
      return reply(201, {
        data: {
          snapId: 4359,
          snapResponse: {
            name: body.name,
            profile: 'Achiever',
            primary_code: 'DP-ACH',
            secondary_profile: 'Analyzer',
            secondary_code: 'DP-ANA',
            confidence,
            summary: 'Zeroes in on the business outcome.',
            secondary_profile_summary: 'Wants the model behind the number.',
            reasoning: 'Talks about one number and asks to see the model.'
          }
        }
      });
    }

    if (req.url === '/api/v1/snap/comms') {
      if (body.snapId === 1) return reply(200, { data: { somethingElse: true } });
      return reply(200, {
        data: {
          commsResponse: {
            strengths: ['Short'],
            risks: [{ text: '"Any thoughts" is vague.' }],
            suggestions: ['Ask for a decision by a date.'],
            rewrite: 'Hi Alex, can you let me know by [date]?'
          }
        }
      });
    }

    reply(404, { message: 'Not found' });
  });
});

/* ---------------------------------------------------------------- */
/* MCP client over stdio                                             */
/* ---------------------------------------------------------------- */

function startServer(env) {
  const child = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const pending = new Map();
  let buf = '';
  let nextId = 1;

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let cut;
    while ((cut = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, cut);
      buf = buf.slice(cut + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line); // stdout must only ever carry JSON-RPC
      const waiter = pending.get(msg.id);
      if (waiter) { pending.delete(msg.id); waiter(msg); }
    }
  });

  return {
    request(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for ' + method)), 5000);
        pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    },
    notify(method, params) {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
    },
    raw(line) { child.stdin.write(line + '\n'); },
    stop() { child.stdin.end(); child.kill(); }
  };
}

/* ---------------------------------------------------------------- */
/* Tests                                                             */
/* ---------------------------------------------------------------- */

const results = [];
async function test(name, fn) {
  try { await fn(); results.push([true, name]); }
  catch (e) { results.push([false, name, e.message]); }
}

const call = (srv, name, args) => srv.request('tools/call', { name, arguments: args });
const ABOUT =
  'I run enterprise renewals for a 40-person commercial team. Twelve years in SaaS. ' +
  'I care about one number and it is net revenue retention. Show me the model, show me ' +
  'where the assumption breaks, and I will make a call in the meeting.';

async function main() {
  await new Promise((r) => api.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + api.address().port;
  const srv = startServer({ WIZE_SNAPS_API_BASE: base, WIZE_SNAPS_API_KEY: GOOD_KEY });

  await test('initialize echoes a supported protocol version', async () => {
    const r = await srv.request('initialize', {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' }
    });
    assert.strictEqual(r.result.protocolVersion, '2025-06-18');
    assert.strictEqual(r.result.serverInfo.name, 'wize-snaps');
    assert.ok(r.result.capabilities.tools);
    assert.ok(r.result.instructions.length > 0);
  });

  await test('initialize accepts the 2025-11-25 protocol', async () => {
    const r = await srv.request('initialize', { protocolVersion: '2025-11-25', capabilities: {} });
    assert.strictEqual(r.result.protocolVersion, '2025-11-25');
  });

  await test('initialize falls back to the newest version for an unknown one', async () => {
    const r = await srv.request('initialize', { protocolVersion: '1999-01-01', capabilities: {} });
    assert.strictEqual(r.result.protocolVersion, '2025-11-25');
  });

  srv.notify('notifications/initialized');

  await test('server version matches manifest and package.json', async () => {
    const r = await srv.request('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
    const manifest = require(path.join(__dirname, '..', 'manifest.json'));
    const pkg = require(path.join(__dirname, 'package.json'));
    assert.strictEqual(r.result.serverInfo.version, manifest.version);
    assert.strictEqual(pkg.version, manifest.version);
  });

  await test('ping', async () => {
    const r = await srv.request('ping');
    assert.deepStrictEqual(r.result, {});
  });

  await test('tools/list returns both tools with schemas', async () => {
    const r = await srv.request('tools/list');
    const names = r.result.tools.map((t) => t.name).sort();
    assert.deepStrictEqual(names, ['read_decision_profile', 'rewrite_for_decision_profile']);
    for (const t of r.result.tools) {
      assert.strictEqual(t.inputSchema.type, 'object');
      assert.ok(t.description.includes('credit'));
    }
  });

  await test('manifest lists the same tools the server exposes', async () => {
    const r = await srv.request('tools/list');
    const manifest = require(path.join(__dirname, '..', 'manifest.json'));
    assert.deepStrictEqual(
      manifest.tools.map((t) => t.name).sort(),
      r.result.tools.map((t) => t.name).sort()
    );
  });

  await test('read_decision_profile returns a High confidence profile', async () => {
    const r = await call(srv, 'read_decision_profile', { name: 'Alex Morgan', context: ABOUT, role: 'Sales Director' });
    const d = r.result.structuredContent;
    assert.strictEqual(r.result.isError, false);
    assert.strictEqual(d.snap_id, 4359);
    assert.strictEqual(d.profile, 'Achiever');
    assert.strictEqual(d.secondary_profile, 'Analyzer');
    assert.strictEqual(d.confidence, 'High');
    assert.strictEqual(d.warning, undefined);
    assert.deepStrictEqual(JSON.parse(r.result.content[0].text), d);
  });

  await test('Medium confidence adds a note and flags thin context', async () => {
    const r = await call(srv, 'read_decision_profile', { name: 'Alex', context: 'Leads renewals. Dislikes preamble.' });
    const d = r.result.structuredContent;
    assert.strictEqual(d.confidence, 'Medium');
    assert.ok(d.note);
    assert.ok(d.input_note);
  });

  await test('Low confidence adds a warning', async () => {
    const r = await call(srv, 'read_decision_profile', { name: 'Alex', context: 'spoke Tuesday, keen' });
    const d = r.result.structuredContent;
    assert.strictEqual(d.confidence, 'Low');
    assert.ok(/Low confidence/.test(d.warning));
  });

  await test('a LinkedIn URL as context is flagged', async () => {
    const r = await call(srv, 'read_decision_profile', { name: 'Alex', context: 'https://www.linkedin.com/in/alex-morgan' });
    assert.ok(r.result.structuredContent.input_warning);
  });

  await test('missing context is a tool error, not a protocol error', async () => {
    const r = await call(srv, 'read_decision_profile', { name: 'Alex' });
    assert.strictEqual(r.error, undefined);
    assert.strictEqual(r.result.isError, true);
  });

  await test('rewrite_for_decision_profile maps the comms response', async () => {
    const r = await call(srv, 'rewrite_for_decision_profile', { snap_id: 4359, message: 'Hi Alex, any thoughts?' });
    const d = r.result.structuredContent;
    assert.strictEqual(r.result.isError, false);
    assert.deepStrictEqual(d.what_works, ['Short']);
    assert.deepStrictEqual(d.risks, ['"Any thoughts" is vague.']);
    assert.ok(d.rewrite.includes('[date]'));
    assert.strictEqual(d.credits_used, 2);
  });

  await test('an unrecognised comms response is passed back raw', async () => {
    const r = await call(srv, 'rewrite_for_decision_profile', { snap_id: 1, message: 'Hi' });
    assert.ok(r.result.structuredContent.unmapped_response);
  });

  await test('rewrite without a snap_id is a tool error', async () => {
    const r = await call(srv, 'rewrite_for_decision_profile', { message: 'Hi' });
    assert.strictEqual(r.result.isError, true);
  });

  await test('429 and 500 from the API become readable tool errors', async () => {
    const a = await call(srv, 'read_decision_profile', { name: 'Ratelimited', context: ABOUT });
    assert.strictEqual(a.result.isError, true);
    assert.ok(/Rate limited/.test(a.result.content[0].text));
    const b = await call(srv, 'read_decision_profile', { name: 'Broken', context: ABOUT });
    assert.strictEqual(b.result.isError, true);
  });

  await test('unknown tool is a protocol error', async () => {
    const r = await call(srv, 'no_such_tool', {});
    assert.strictEqual(r.error.code, -32602);
  });

  await test('unknown method is a protocol error', async () => {
    const r = await srv.request('resources/list');
    assert.strictEqual(r.error.code, -32601);
  });

  srv.stop();

  // Separate processes for key problems.
  const badKey = startServer({ WIZE_SNAPS_API_BASE: base, WIZE_SNAPS_API_KEY: 'wz_live_wrong' });
  await test('an invalid key is reported clearly', async () => {
    const r = await call(badKey, 'read_decision_profile', { name: 'Alex', context: ABOUT });
    assert.strictEqual(r.result.isError, true);
    assert.ok(/invalid or inactive/.test(r.result.content[0].text));
  });
  badKey.stop();

  const noKey = startServer({ WIZE_SNAPS_API_BASE: base, WIZE_SNAPS_API_KEY: '' });
  await test('a missing key says where to get one', async () => {
    const r = await call(noKey, 'read_decision_profile', { name: 'Alex', context: ABOUT });
    assert.strictEqual(r.result.isError, true);
    assert.ok(/snap\.wizer\.business/.test(r.result.content[0].text));
  });
  noKey.stop();

  api.close();

  let failed = 0;
  for (const [ok, name, err] of results) {
    console.log((ok ? 'ok    ' : 'FAIL  ') + name + (ok ? '' : '\n      ' + err));
    if (!ok) failed++;
  }
  console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
