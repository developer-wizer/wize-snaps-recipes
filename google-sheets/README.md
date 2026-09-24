# Decision profiles in a spreadsheet

Paste a script into a Google Sheet and your lead list starts telling you how each person decides, and rewriting your draft to suit. About ten minutes to set up, and nothing to deploy.

Full walkthrough with screenshots: [wizesnaps.com/google-sheets-decision-profiles](https://www.wizesnaps.com/google-sheets-decision-profiles)

## What lands in the sheet

You give it a name, a role, and something the person has actually written. It gives you a decision profile, a confidence level, a plain-English read, and a rewrite of whatever you were about to send them.

| Name | Profile | Secondary | Confidence | Summary |
|---|---|---|---|---|
| Alex Morgan | Achiever | Analyzer | High | Makes decisions by zeroing in on the business outcome and financial impact, while relying on clear models and tested assumptions to approve or reject options quickly. |

## Setting it up

1. Open a new Google Sheet.
2. **Extensions › Apps Script.** Delete the placeholder, paste in [`WizeSnaps.gs`](./WizeSnaps.gs), save.
   If the sheet already has code behind it, add this as a new file instead of replacing what's there. Apps Script shares one namespace across every file in a project, so two functions with the same name means one silently stops working.
3. Reload the sheet. A **Wize Snaps** menu appears next to Help.
4. **Setup › Set up this sheet** builds a Leads tab with the right columns and one example row. Then **Set API key**, then **Check connection**.
5. Run **Get profiles**, then **Analyse drafts**. In that order: the rewrite needs the profile it's working against.

On the first run Google shows an authorisation screen and then says the app is unverified. Click Advanced and go through. It says that because it's your own script, not a published add-on. It's your code, calling your API, with your key.

Get a key at [snap.wizer.business/dashboard/developers](https://snap.wizer.business/dashboard/developers). New accounts start with 100 free credits.

## What goes in each column

Five columns are yours. The script writes the rest.

| Column | What belongs there |
|---|---|
| **Name** | Required. |
| **Job type** | Their role. Optional, but it does a lot of work for one field. |
| **Age range** | Optional. Leave it blank if you're guessing. |
| **LinkedIn About / posts** | Their own words, pasted. About section, a recent post, a conference bio. |
| **Notes / context** | What you know that isn't public. How they ran the last call, what they pushed back on, who they brought in. |

Both context columns go to the API together, labelled, so it can tell how someone describes themselves apart from how you describe them. Either one on its own is fine.

## Credits

A profile costs 1 credit, a rewrite costs 2.

Rows that already have a result are skipped and not charged, so adding five people to a finished list of fifty costs five credits, not fifty-five. To redo a profile, use **Setup › Show / hide technical columns** and clear that row's Snap ID. To redo a rewrite, clear its Rewrite cell.

There's no `=WIZESNAP()` formula on purpose. Sheets re-runs custom formulas every time anything recalculates, which on a list of any size would spend credits quietly all day. It runs from the menu and writes plain values instead.

## Two things it won't do

**Read a LinkedIn URL.** The API reads the text you give it. It doesn't fetch the page. Copy the About section across instead.

**Rescue a thin CRM.** A database of names and one-line notes produces a column of Low confidence guesses. If your CRM holds nothing the person has written, you need a step that gets that text in before this one is worth running.

## Licence

MIT.
