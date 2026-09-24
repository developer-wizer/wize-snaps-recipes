# Wize Snaps recipes

Working things built on the [Wize Snaps API](https://www.wizesnaps.com/api-tool). Take them, change them, or use them as a starting point for something better.

Wize Snaps reads how a specific person makes decisions and rewrites your message to suit them. It's built by [Wizer](https://www.wizer.business/), and the seven decision profiles come from Dr Juliet Bourke's research on decision lenses.

## What's here

**[google-sheets](https://www.wizesnaps.com/google-sheets-decision-profiles)** — an Apps Script that turns a Google Sheet into a lead list with decision profiles in it. Paste the script in, set your API key, and two menu items fill the columns. No deployment, about ten minutes to set up.

**[mcp-server](./mcp-server)** — an MCP server that gives Claude two tools: read how someone decides, and rewrite a message for them. Zero dependencies, and it installs in Claude Desktop by double-clicking a file. Works in Claude Code, Cursor, and anything else that speaks MCP.

Both are MIT licensed.

## The API, in full

Two calls. That's the whole surface.

```
POST https://backend.snap.wizer.business/api/v1/snap
Header: x-api-key: wz_live_...

{ "name": "Alex Morgan",
  "jobType": "Sales Director",
  "ageRange": "35-44",
  "notes": "<what this person has written about themselves>" }
```

Returns a decision profile, a secondary profile, a confidence level, a summary, the reasoning behind it, and a `snapId`.

```
POST https://backend.snap.wizer.business/api/v1/snap/comms
Header: x-api-key: wz_live_...

{ "snapId": 4359,
  "messageType": "email",
  "messageText": "<your draft>" }
```

Returns what works in the draft, where it's likely to land badly for that person, suggestions, and a rewrite.

Get a key at [snap.wizer.business/dashboard/developers](https://snap.wizer.business/dashboard/developers). New accounts start with 100 free credits. A profile costs 1 credit, a rewrite costs 2.

## The thing that decides whether any of this is any good

The profile is only as good as the context you send.

We tested the same person three ways. A one-line CRM note ("spoke Tuesday, keen") comes back Low confidence. Two lines of description comes back Medium. Their actual LinkedIn About section comes back High.

A Low confidence profile is worse than no profile, because it sits in a column looking like data. Send the person's own words. Both recipes here are built around getting that text in front of the API rather than a summary of it.

The API does not fetch web pages. Passing a LinkedIn URL gets you a profile inferred from the name in the URL, which is the most dangerous failure mode available, because it looks exactly like a real answer. The MCP server detects this and says so.

## Things we found building these

Worth knowing before you build your own.

**It's stable across runs.** The same About section returned Achiever with an Analyzer secondary, High confidence, from the spreadsheet and from the MCP server six days apart. Two clients, two weeks, same answer.

**It discriminates.** A consensus-led people leader came back Collaborator with Analyzer behind it, off a completely different piece of writing. It isn't pattern-matching on confident prose.

**The rewrite is a strong draft with gaps, not a finished email.** It leaves square-bracket placeholders where it needs a date or a name, which is the right behaviour, but don't tell people they can paste it straight into a message.

**The rewrite doesn't fact-check the message it's given.** Twice we saw it preserve an unsourced statistic while rewriting for someone who had explicitly said they distrust unsourced claims. Check the claims in your own draft before you rely on the rewrite.

**Credits go faster than you expect.** Setting up, testing and debugging a first integration will spend twenty or thirty before you've profiled a single real prospect.

## Build your own

The whole API is two POST requests with one header. Anything that can make an HTTP call can use it — a Zapier or Make scenario, an n8n workflow, a CRM webhook, fifty lines in whatever language you already write.

If you build something, open an issue and tell us. We'll link it.

## Licence

MIT. Do what you like with it.
