---
name: decision-profiles
description: Read how a specific person makes decisions and rewrite a message to suit them, using the Wize Snaps tools. Use when the user asks how a named person decides, what they respond to, how to approach, pitch or write to them, what their decision profile is, or wants a draft email, LinkedIn message or follow-up adapted for a particular person.
---

# Decision profiles with Wize Snaps

The Wize Snaps tools return a real read from a model built on Dr Juliet Bourke's decision-lens research, with a calibrated confidence level. Use them for the read and use your own knowledge only to interpret what they return.

## If the tools are not available

The tools run on the user's computer, so they load in Claude Code but not in claude.ai chat, and not in Cowork yet. If `read_decision_profile` is not among the available tools, do not produce a profile from your own reasoning. Say in one line that the Wize Snaps tools aren't connected here, and point the user to the Claude Desktop extension at https://www.wizesnaps.com/claude-decision-profiles or to installing this plugin in Claude Code.

## When to call the tools

- Call `read_decision_profile` whenever the user asks how a named person decides, what they respond to, or how to approach or write to them. Do not answer from your own reasoning about the text. An inferred answer has no confidence level and is not a Wize Snaps profile.
- Call `rewrite_for_decision_profile` when the user wants a message adapted for someone already profiled. Pass the `snap_id` from the profile. Do not rewrite it yourself from the summary.
- Set `message_type` to match the message: `outreach` for a cold or first-touch message, including LinkedIn messages and connection notes; `email`; `text` for SMS or chat; `internal_comms` for colleagues; `difficult_conversation` for bad news or pushback; `meeting_prep` for notes before a meeting.
- Each call spends credits: 1 for a profile, 2 for a rewrite. Never call speculatively, and never profile the same person twice in a conversation unless the user adds new context.

## Getting a good read

- Pass the person's own words: their LinkedIn About section, a recent post, a conference bio. Paste it as written, not a summary.
- If the user has only a line or two, say that the read will be hedged and ask for more of the person's own writing before calling. Call anyway if they say to go ahead.
- Never pass a LinkedIn URL as context. The API reads text and does not fetch pages. Ask the user to paste the About section instead.
- Pass the role when known. Leave out the age range rather than guessing it.

## How to present a profile

Use profile names. Leave the DP- codes and the `snap_id` out of the answer; they are identifiers for software, not for the reader. Keep this shape so every read looks the same:

**<Name> reads as <Primary>, with <Secondary> behind it.** <Confidence> confidence.
One sentence on what that means in practice.

**What they told you**
Two or three bullets, each quoting the person's own words and naming what it signals. Use the reasoning the tool returned rather than inventing new reasoning.

If there is a draft, add:

**What lands badly in your draft**
The risks as bullets, each tied to something the person actually said.

**Rewrite**
The rewritten message as a blockquote. Keep any square-bracket placeholders and say in one line what the user needs to fill in. If the rewrite can be improved, give the improved version and say what changed and why.

## Rules that protect the user

- On a Low confidence read, say so in the first line and tell the user to paste more of the person's own writing before acting on it. Do not present a Low read as if it were solid.
- Relay any `warning`, `input_warning` or `input_note` the tool returns.
- The rewrite does not fact-check the draft. If the draft contains an unsourced statistic or claim, point it out, especially for someone who has said they distrust unsourced claims.
- A profile describes how someone approaches a decision, not who they are. Do not describe it as a personality type.
- No preamble and no restating the brief.

## If a tool fails

Tool errors come back as readable messages. Pass them on plainly:
- No or invalid key: point the user to the plugin settings and to snap.wizer.business/dashboard/developers.
- Out of credits (a 400 that mentions credits): say so and link the pricing page, snap.wizer.business/pricing.
- Rate limited: wait and retry once.
