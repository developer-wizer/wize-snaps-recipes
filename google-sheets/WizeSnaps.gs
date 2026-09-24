/**
 * Wize Snaps for Google Sheets
 * ---------------------------------------------------------------
 * Reads a list of people, gets a decision profile for each one, and
 * rewrites your draft message to suit how that person decides.
 *
 * Powered by the Wize Snaps API - https://www.wizesnaps.com/api-tool
 *
 * HOW TO INSTALL
 *   1. Open your Google Sheet.
 *   2. Extensions > Apps Script. Delete whatever is in the editor.
 *   3. Paste this whole file in. Save.
 *   4. Reload the Sheet. A "Wize Snaps" menu appears next to Help.
 *   5. Wize Snaps > Set up this sheet.
 *   6. Wize Snaps > Set API key. Paste the key from your developer
 *      dashboard (snap.wizer.business/dashboard/developers).
 *
 * WHAT TO PUT IN THE TWO CONTEXT COLUMNS
 *   The profile is only as good as what you give it. Two thin lines
 *   gets you a Medium confidence read. Real text gets you more.
 *
 *   "LinkedIn About / posts"  paste their actual words. About section,
 *                             a recent post, a conference bio. Do not
 *                             paste a LinkedIn URL, the API reads text,
 *                             it does not go and fetch the page.
 *   "Notes / context"         what you know that is not public. How they
 *                             ran the last call, what they pushed back on.
 *
 *   Both get sent together. Either one on its own is fine.
 *
 * WHY THERE IS NO =WIZESNAP() FORMULA
 *   Sheets re-runs custom formulas whenever the sheet recalculates.
 *   Every recalc would be another API call and another credit gone.
 *   So this runs from the menu instead and writes plain values into
 *   the cells. Rows that already have a result are skipped, so you
 *   can safely run it again after adding more rows.
 *
 * CREDITS
 *   Get profile   = 1 credit per row
 *   Analyse draft = 2 credits per row
 */

var API_BASE       = 'https://backend.snap.wizer.business';
var SHEET_NAME     = 'Leads';
var HEADER_ROW     = 1;
var FIRST_DATA_ROW = 2;
var PAUSE_MS       = 350;            // gap between calls, keeps us under the rate limit
var MAX_RUNTIME_MS = 5 * 60 * 1000;  // Apps Script kills us at 6 min, stop early and report

// Column layout. Change the numbers here if you reorder the sheet.
var COL = {
  name:       1,   // A
  jobType:    2,   // B
  ageRange:   3,   // C
  linkedin:   4,   // D
  notes:      5,   // E
  profile:    6,   // F
  code:       7,   // G  hidden by default
  secondary:  8,   // H
  secondCode: 9,   // I  hidden by default
  confidence: 10,  // J
  summary:    11,  // K
  snapId:     12,  // L  hidden by default
  draft:      13,  // M
  works:      14,  // N
  risks:      15,  // O
  rewrite:    16   // P
};

var HEADERS = [
  'Name', 'Job type', 'Age range', 'LinkedIn About / posts', 'Notes / context',
  'Profile', 'Code', 'Secondary', 'Secondary code', 'Confidence', 'Summary', 'Snap ID',
  'Draft message', 'What works', 'Risks', 'Rewrite'
];

// Machine fields. Meaningless to read, but worth keeping: the codes are the
// stable identifiers to key on if this data ever goes back into a CRM, and
// Snap ID is what links a profile to its message analysis.
var TECHNICAL_COLS = [COL.code, COL.secondCode, COL.snapId];


/* ---------------------------------------------------------------- */
/* Menu                                                              */
/* ---------------------------------------------------------------- */

function onOpen() {
  var ui = SpreadsheetApp.getUi();

  // The two things people run every day sit on their own at the top.
  // Everything else is tucked into submenus so it cannot be clicked by mistake.
  ui.createMenu('Wize Snaps')
    .addItem('1. Get profiles (1 credit per row)', 'runProfiles')
    .addItem('2. Analyse drafts (2 credits per row)', 'runComms')
    .addSeparator()
    .addSubMenu(ui.createMenu('Setup')
      .addItem('Set up this sheet', 'setupSheet')
      .addItem('Set API key', 'setApiKey')
      .addItem('Check connection (1 credit)', 'checkConnection')
      .addItem('Show / hide technical columns', 'toggleTechnicalColumns'))
    .addSubMenu(ui.createMenu('Debug')
      .addItem('Show raw profile response (1 credit)', 'showRawProfile')
      .addItem('Show raw message response (2 credits)', 'showRawComms'))
    .addToUi();
}


/* ---------------------------------------------------------------- */
/* Setup                                                             */
/* ---------------------------------------------------------------- */

function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  sheet.getRange(HEADER_ROW, 1, 1, HEADERS.length)
       .setValues([HEADERS])
       .setFontWeight('bold')
       .setBackground('#f1f3f4');
  sheet.setFrozenRows(HEADER_ROW);

  // Readable widths. The two context columns and the rewrite get the room.
  var widths = [150, 150, 90, 340, 260, 110, 70, 120, 70, 100, 320, 80, 320, 260, 260, 360];
  for (var i = 0; i < widths.length; i++) {
    sheet.setColumnWidth(i + 1, widths[i]);
  }
  sheet.getRange(FIRST_DATA_ROW, 1, sheet.getMaxRows() - 1, HEADERS.length)
       .setVerticalAlignment('top')
       .setWrap(true);

  // Notes on the two columns people get wrong, as cell notes on the headers.
  sheet.getRange(HEADER_ROW, COL.linkedin).setNote(
    'Paste their actual words: About section, a recent post, a bio.\n\n' +
    'Do not paste a LinkedIn URL. The API reads the text you give it, ' +
    'it does not go and fetch the page.'
  );
  sheet.getRange(HEADER_ROW, COL.notes).setNote(
    'What you know that is not public. How they ran the last call, ' +
    'what they pushed back on, who else they bring in.'
  );

  hideTechnicalColumns_(sheet, true);

  // One example row so it is obvious what goes where, and what "enough
  // context" actually looks like.
  if (sheet.getLastRow() < FIRST_DATA_ROW) {
    sheet.getRange(FIRST_DATA_ROW, 1, 1, 5).setValues([[
      'Alex Morgan',
      'Sales Director',
      '35-44',
      'I run enterprise renewals for a 40-person commercial team. Twelve years in ' +
      'SaaS, most of it turning around accounts that were already halfway out the ' +
      'door. I care about one number and it is net revenue retention. Most of what ' +
      'gets sold to me as "engagement" does not move it. Show me the model, show me ' +
      'where the assumption breaks, and I will make a call in the meeting rather ' +
      'than taking it away for a month.',
      'Asked twice on the last call what the payback period was before letting us ' +
      'get to the demo. Brought her ops lead in unprompted.'
    ]]);
    sheet.getRange(FIRST_DATA_ROW, COL.draft).setValue(
      'Hi Alex, wanted to follow up on the renewal proposal and see if you had any thoughts.'
    );
  }

  toast('Sheet ready. Now set your API key.');
}

function setApiKey() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt(
    'Wize Snaps API key',
    'Paste your key from snap.wizer.business/dashboard/developers.\n\n' +
    'It is stored in this script\'s private properties, not in a cell, so it is not visible to anyone you share the sheet with as a viewer.',
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;

  var key = res.getResponseText().trim();
  if (!key) { ui.alert('No key entered.'); return; }

  PropertiesService.getScriptProperties().setProperty('WIZE_SNAPS_API_KEY', key);
  ui.alert('Key saved. Run "Check connection" to confirm it works.');
}

function getApiKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('WIZE_SNAPS_API_KEY');
  if (!key) {
    throw new Error('No API key set. Use Wize Snaps > Set API key first.');
  }
  return key;
}

function checkConnection() {
  try {
    var r = callApi_('/api/v1/snap', {
      name: 'Connection Test',
      jobType: 'Operations Manager',
      notes: 'Test call to confirm the API key works. Prefers short, factual updates.'
    });
    var p = (r.data && r.data.snapResponse) || {};
    SpreadsheetApp.getUi().alert(
      'Connected.\n\nTest profile came back as: ' + (p.profile || 'unknown') +
      '\nConfidence: ' + (p.confidence || 'unknown') +
      '\n\nThat is a made-up person described in one line, so a low confidence ' +
      'read here is the API being honest, not a fault.\n\nThat used 1 credit.'
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert('Could not connect.\n\n' + e.message);
  }
}

function toggleTechnicalColumns() {
  var sheet = getSheet_();
  var hidden = sheet.isColumnHiddenByUser(COL.code);
  hideTechnicalColumns_(sheet, !hidden);
  toast(hidden ? 'Codes and Snap ID are now visible.' : 'Codes and Snap ID hidden.');
}

function hideTechnicalColumns_(sheet, hide) {
  for (var i = 0; i < TECHNICAL_COLS.length; i++) {
    if (hide) sheet.hideColumns(TECHNICAL_COLS[i]);
    else      sheet.showColumns(TECHNICAL_COLS[i]);
  }
}


/* ---------------------------------------------------------------- */
/* Step 1 - profiles                                                 */
/* ---------------------------------------------------------------- */

function runProfiles() {
  var sheet = getSheet_();
  var rows = dataRows_(sheet);
  if (!rows.length) { toast('Nothing to do. Add some names first.'); return; }

  var started = Date.now();
  var done = 0, skipped = 0, failed = 0, stoppedEarly = false;

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];

    var name = str_(sheet.getRange(r, COL.name).getValue());
    if (!name) { continue; }

    // Already has a result, leave it alone. Clear the Snap ID to redo a row.
    if (str_(sheet.getRange(r, COL.snapId).getValue())) { skipped++; continue; }

    if (Date.now() - started > MAX_RUNTIME_MS) { stoppedEarly = true; break; }

    var notes = buildNotes_(sheet, r);
    if (!notes) {
      sheet.getRange(r, COL.profile).setValue('Needs context');
      failed++;
      continue;
    }

    var body = { name: name, notes: notes };
    var jobType  = str_(sheet.getRange(r, COL.jobType).getValue());
    var ageRange = str_(sheet.getRange(r, COL.ageRange).getValue());
    if (jobType)  body.jobType = jobType;
    if (ageRange) body.ageRange = ageRange;

    try {
      var res = callApi_('/api/v1/snap', body);
      var p = (res.data && res.data.snapResponse) || {};

      sheet.getRange(r, COL.profile).setValue(p.profile || '');
      sheet.getRange(r, COL.code).setValue(p.primary_code || '');
      sheet.getRange(r, COL.secondary).setValue(p.secondary_profile || '');
      sheet.getRange(r, COL.secondCode).setValue(p.secondary_code || '');
      sheet.getRange(r, COL.confidence).setValue(p.confidence || '');
      sheet.getRange(r, COL.summary).setValue(p.summary || '');
      sheet.getRange(r, COL.snapId).setValue(res.data ? res.data.snapId : '');
      done++;
    } catch (e) {
      sheet.getRange(r, COL.profile).setValue('Error: ' + e.message);
      failed++;
    }

    Utilities.sleep(PAUSE_MS);
    if (done % 10 === 0) SpreadsheetApp.flush();
  }

  report_('Profiles', done, skipped, failed, stoppedEarly);
}

/**
 * Both context columns go to the API as one notes string.
 * Labelled, so the model can tell the person's own words apart from
 * the seller's observations about them.
 */
function buildNotes_(sheet, row) {
  var linkedin = str_(sheet.getRange(row, COL.linkedin).getValue());
  var notes    = str_(sheet.getRange(row, COL.notes).getValue());
  var parts = [];

  if (linkedin) parts.push('In their own words:\n' + linkedin);
  if (notes)    parts.push('Observed by the sender:\n' + notes);
  return parts.join('\n\n');
}


/* ---------------------------------------------------------------- */
/* Step 2 - message analysis                                         */
/* ---------------------------------------------------------------- */

function runComms() {
  var sheet = getSheet_();
  var rows = dataRows_(sheet);
  if (!rows.length) { toast('Nothing to do.'); return; }

  var started = Date.now();
  var done = 0, skipped = 0, failed = 0, stoppedEarly = false;

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];

    var snapId = sheet.getRange(r, COL.snapId).getValue();
    var draft  = str_(sheet.getRange(r, COL.draft).getValue());
    if (!snapId || !draft) { continue; }

    // Already rewritten. Clear the Rewrite cell to redo a row.
    if (str_(sheet.getRange(r, COL.rewrite).getValue())) { skipped++; continue; }

    if (Date.now() - started > MAX_RUNTIME_MS) { stoppedEarly = true; break; }

    try {
      var res = callApi_('/api/v1/snap/comms', {
        snapId: Number(snapId),
        messageType: 'email',
        messageText: draft
      });
      var c = pickComms_(res);

      sheet.getRange(r, COL.works).setValue(c.works);
      sheet.getRange(r, COL.risks).setValue(c.risks);
      sheet.getRange(r, COL.rewrite).setValue(c.rewrite);
      done++;
    } catch (e) {
      sheet.getRange(r, COL.rewrite).setValue('Error: ' + e.message);
      failed++;
    }

    Utilities.sleep(PAUSE_MS);
    if (done % 10 === 0) SpreadsheetApp.flush();
  }

  report_('Drafts', done, skipped, failed, stoppedEarly);
}

/**
 * The comms response shape is not published in the docs the way predict-profile is,
 * so this looks for the field names it is most likely to use and falls back to
 * showing the raw JSON rather than silently writing a blank cell.
 * Once we confirm the real shape, this whole function collapses to three lines.
 */
function pickComms_(res) {
  var d = res.data || res;
  if (d.commsResponse) d = d.commsResponse;
  if (d.analysis)      d = d.analysis;

  var works   = first_(d, ['strengths', 'whatWorks', 'what_works', 'positives']);
  var risks   = first_(d, ['risks', 'weaknesses', 'concerns', 'watchOuts', 'watch_outs']);
  var rewrite = first_(d, ['rewrite', 'rewrittenMessage', 'rewritten_message',
                           'suggestedMessage', 'suggested_message', 'revised', 'alternative']);

  // Nothing matched. Surface the raw payload so it is obvious what to map.
  if (!works && !risks && !rewrite) {
    return { works: '', risks: '', rewrite: 'UNMAPPED: ' + JSON.stringify(d) };
  }
  return { works: works, risks: risks, rewrite: rewrite };
}

/** Returns the first key present, flattening arrays and objects into readable text. */
function first_(obj, keys) {
  for (var i = 0; i < keys.length; i++) {
    var v = obj[keys[i]];
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      return v.map(function (item) {
        if (typeof item === 'string') return '• ' + item;
        return '• ' + (item.text || item.point || item.title || JSON.stringify(item));
      }).join('\n');
    }
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  return '';
}


/* ---------------------------------------------------------------- */
/* Debug                                                             */
/* ---------------------------------------------------------------- */

/**
 * Runs one profile call on the selected row and shows the raw JSON.
 * Costs 1 credit and writes nothing to the sheet.
 */
function showRawProfile() {
  var sheet = getSheet_();
  var row = sheet.getActiveRange().getRow();
  if (row < FIRST_DATA_ROW) { toast('Click a data row first.'); return; }

  var name  = str_(sheet.getRange(row, COL.name).getValue());
  var notes = buildNotes_(sheet, row);
  if (!name || !notes) { toast('That row needs a name and some context.'); return; }

  var body = { name: name, notes: notes };
  var jobType  = str_(sheet.getRange(row, COL.jobType).getValue());
  var ageRange = str_(sheet.getRange(row, COL.ageRange).getValue());
  if (jobType)  body.jobType = jobType;
  if (ageRange) body.ageRange = ageRange;

  try {
    var res = callApi_('/api/v1/snap', body);
    var text = JSON.stringify(res, null, 2);
    Logger.log(text);
    SpreadsheetApp.getUi().alert('Raw profile response\n\n' + text.substring(0, 4000));
  } catch (e) {
    SpreadsheetApp.getUi().alert('Failed: ' + e.message);
  }
}

/** Runs one comms call and shows the raw JSON, so we can map the fields properly. */
function showRawComms() {
  var sheet = getSheet_();
  var row = sheet.getActiveRange().getRow();
  if (row < FIRST_DATA_ROW) { toast('Click a data row first.'); return; }

  var snapId = sheet.getRange(row, COL.snapId).getValue();
  var draft  = str_(sheet.getRange(row, COL.draft).getValue());
  if (!snapId || !draft) { toast('That row needs a Snap ID and a draft message.'); return; }

  try {
    var res = callApi_('/api/v1/snap/comms', {
      snapId: Number(snapId),
      messageType: 'email',
      messageText: draft
    });
    var text = JSON.stringify(res, null, 2);
    Logger.log(text);
    SpreadsheetApp.getUi().alert('Raw message response\n\n' + text.substring(0, 4000));
  } catch (e) {
    SpreadsheetApp.getUi().alert('Failed: ' + e.message);
  }
}


/* ---------------------------------------------------------------- */
/* HTTP                                                              */
/* ---------------------------------------------------------------- */

function callApi_(path, body) {
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': getApiKey_() },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };

  var attempts = 0;
  while (true) {
    attempts++;
    var res  = UrlFetchApp.fetch(API_BASE + path, options);
    var code = res.getResponseCode();
    var text = res.getContentText();

    if (code === 200 || code === 201) {
      try { return JSON.parse(text); }
      catch (e) { throw new Error('Could not read the response: ' + text.substring(0, 200)); }
    }

    // Rate limited. Back off and try again, up to three times.
    if (code === 429 && attempts < 4) {
      Utilities.sleep(1500 * attempts);
      continue;
    }

    throw new Error(explain_(code, text));
  }
}

function explain_(code, text) {
  var msg = '';
  try { msg = (JSON.parse(text) || {}).message || ''; } catch (e) {}

  if (code === 400) return msg || 'Rejected. Usually a missing field or no credits left.';
  if (code === 401) return 'API key is invalid or inactive. Set it again from the menu.';
  if (code === 429) return 'Rate limited. Wait a minute and run it again, already-done rows are skipped.';
  if (code === 500) return msg || 'The API could not generate a profile for this one.';
  return 'HTTP ' + code + '. ' + (msg || text.substring(0, 200));
}


/* ---------------------------------------------------------------- */
/* Small helpers                                                     */
/* ---------------------------------------------------------------- */

function getSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No sheet called "' + SHEET_NAME + '". Run "Set up this sheet" first.');
  return sheet;
}

/** Selected rows if there is a real selection, otherwise every data row. */
function dataRows_(sheet) {
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return [];

  var sel = sheet.getActiveRange();
  var rows = [];

  if (sel && sel.getNumRows() > 1 && sel.getRow() >= FIRST_DATA_ROW) {
    for (var r = sel.getRow(); r < sel.getRow() + sel.getNumRows() && r <= last; r++) rows.push(r);
    return rows;
  }
  for (var i = FIRST_DATA_ROW; i <= last; i++) rows.push(i);
  return rows;
}

function str_(v) {
  return (v === null || v === undefined) ? '' : String(v).trim();
}

function toast(msg) {
  SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Wize Snaps', 6);
}

function report_(label, done, skipped, failed, stoppedEarly) {
  SpreadsheetApp.flush();

  // Nothing happened at all. Say why, in a dialog, rather than a toast
  // that disappears before anyone reads it.
  if (!done && !failed && !skipped) {
    SpreadsheetApp.getUi().alert(
      label + ': nothing to do.\n\n' +
      'Every row was skipped. Usual causes:\n\n' +
      '• You had a block of empty rows selected. Click a single cell to run over the whole sheet.\n' +
      '• The rows have no Name, or nothing in either context column.\n' +
      (label === 'Drafts'
        ? '• The rows have no Snap ID yet. Run "Get profiles" first.\n'
        : '')
    );
    return;
  }

  var parts = [label + ': ' + done + ' done'];
  if (skipped) parts.push(skipped + ' already had results');
  if (failed)  parts.push(failed + ' failed');
  if (stoppedEarly) parts.push('stopped at the time limit, run it again to continue');
  toast(parts.join(', ') + '.');
}
