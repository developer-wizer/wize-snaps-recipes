# Wize Snaps for Claude

Ask Claude how a person makes decisions, then have it rewrite your message to suit them.

Powered by the [Wize Snaps API](https://www.wizesnaps.com/api-tool).

## What you can say to Claude once it's installed

> Here's the About section from a prospect's LinkedIn. How does she make decisions?

> Now rewrite this follow-up email for her.

> I'm about to send this to four people. Read each of them and tell me which one this message is weakest for.

Claude does the rest. Nothing to paste into a spreadsheet, nothing to configure per message.

## Install

**If you use Claude Desktop**, double-click `wize-snaps.mcpb`. Claude asks for your API key, you paste it, done.

**If you use Claude Code, Cursor, or anything else that takes an MCP config**, add this:

```json
{
  "mcpServers": {
    "wize-snaps": {
      "command": "node",
      "args": ["/full/path/to/wizesnaps-mcp/server/index.js"],
      "env": {
        "WIZE_SNAPS_API_KEY": "wz_live_your_key_here"
      }
    }
  }
}
```

Get a key at [snap.wizer.business/dashboard/developers](https://snap.wizer.business/dashboard/developers). New accounts start with 100 free credits.

No dependencies, so there is nothing to install first. Node 18 or newer.

## The one thing that decides whether this is any good

The profile is only as good as the context you hand it.

Paste what the person has actually written. Their LinkedIn About section, a recent post, a conference bio. Two lines of your own description returns Medium confidence. A real About section returns High. A CRM one-liner like "spoke Tuesday, keen" returns Low, and the server will say so rather than let you act on a guess that looks like data.

Don't pass a LinkedIn URL. This reads the text you give it and does not fetch pages. If you pass one anyway, the server notices and tells you.

## Tools

### `read_decision_profile`

Takes a name and some context, optionally a role and age range. Returns the decision profile, a secondary profile, a confidence level, a summary, and a `snap_id`.

Costs 1 credit.

### `rewrite_for_decision_profile`

Takes the `snap_id` from the first tool and your draft message. Returns what already works, where it's likely to land badly, and a rewritten version.

Costs 2 credits.

## Credits

A profile costs 1, a rewrite costs 2. New accounts get 100 free. Claude is told not to call these speculatively, but it's worth knowing that every read spends something.

## Running the tests

```bash
node server/test.js
```

Runs the server against a mock API and checks the protocol, both tools, the confidence warnings, and error handling. No credits spent, no key needed.

## Licence

MIT.
