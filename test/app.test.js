import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHeatmap,
  buildAvailabilityByDay,
  buildOptionsFromDays,
  buildShareLink,
  buildViewModel,
  assignTileColors,
  dayAvailabilityLabel,
  findDuplicateKeys,
  formatOption,
  generatePollId,
  getClient,
  getClientWithPassword,
  isValidDateFormat,
  isValidTimeFormat,
  isRulerSlot,
  legacyExtraTimes,
  mapCreationError,
  normalizeOptions,
  buildExtraNamesBySlot,
  buildOptionNamesBySlot,
  buildSlotCandidates,
  rankBestSlots,
  findOwnResponse,
  restoreDaySlots,
  normalizeName,
  offeredTimes,
  PERSON_COLORS,
  rulerSlots,
  splitSelectionsFromDays,
  validatePollInput,
  validateResponseInput,
} from '../js/app.js';

const validDate = '2026-09-29';
const validOption = { date: '2026-09-29', time: '18:00', label: null };

test('mapCreationError flags the RLS password rejection', () => {
  assert.equal(mapCreationError('42501'), 'That password was not accepted.');
  assert.equal(
    mapCreationError('new row violates row-level security policy for table "polls"'),
    'That password was not accepted.');
  assert.equal(mapCreationError('23505'), null);
  assert.equal(mapCreationError('Could not reach the database.'), null);
});

test('generatePollId uses the required alphabet and default length', () => {
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';
  const first = generatePollId();
  const second = generatePollId();

  assert.equal(first.length, 8);
  assert.match(first, new RegExp(`^[${alphabet}]+$`));
  assert.notEqual(first, second);
});

test('date and time format validators reject malformed values', () => {
  assert.equal(isValidDateFormat('2026-09-28'), true);
  assert.equal(isValidDateFormat('2026-13-01'), false);
  assert.equal(isValidDateFormat('09/28/2026'), false);
  assert.equal(isValidDateFormat('2026-2-8'), false);
  assert.equal(isValidTimeFormat('18:00'), true);
  assert.equal(isValidTimeFormat('24:00'), false);
  assert.equal(isValidTimeFormat('6:00'), false);
  assert.equal(isValidTimeFormat('18:60'), false);
});

test('normalizeOptions cleans entries without sorting them', () => {
  const result = normalizeOptions([
    { date: ' 2026-09-29 ', time: ' 18:00 ', label: '  Dinner ' },
    { date: '', time: '', label: null },
    { date: '2026-13-01', time: '18:00', label: null },
    { date: validDate, time: '18:00', label: null },
    { date: validDate, time: '18:00', label: null },
  ]);

  assert.deepEqual(result.options, [
    { date: validDate, time: '18:00', label: 'Dinner' },
  ]);
  assert.equal(result.errors.length, 4);
});

test('findDuplicateKeys identifies repeated date and time pairs', () => {
  assert.deepEqual(findDuplicateKeys([
    validOption,
    validOption,
    { date: validDate, time: null, label: null },
  ]), [`${validDate}|18:00`]);
});

test('validatePollInput reports title, option, and duplicate errors', () => {
  assert.deepEqual(validatePollInput({ title: '', description: '', options: [] }), [
    'Please enter a title.',
    'Add at least one option.',
  ]);
  assert.deepEqual(validatePollInput({ title: 'Poll', description: '', options: [validOption, validOption] }), [
    'Remove duplicate options.',
  ]);
  assert.deepEqual(validatePollInput({ title: 'Poll', description: 'Details', options: [validOption] }), []);
  assert.ok(validatePollInput({ title: 'x'.repeat(201), description: '', options: [validOption] }).length);
  assert.ok(validatePollInput({ title: 'Poll', description: 'x'.repeat(2001), options: [validOption] }).length);
});

test('validateResponseInput requires a name and a selection', () => {
  assert.deepEqual(validateResponseInput('', 0), [
    'Please enter your name.',
    'Select at least one option.',
  ]);
  assert.deepEqual(validateResponseInput('  ', 1), ['Please enter your name.']);
  assert.deepEqual(validateResponseInput('A'.repeat(81), 1), ['Please enter your name.']);
  assert.deepEqual(validateResponseInput('Alex', 0), ['Select at least one option.']);
  assert.deepEqual(validateResponseInput('Alex', 1), []);
});

test('formatOption renders fixed UTC calendar dates without shifting them', () => {
  assert.equal(formatOption({ date: '2026-09-28', time: '18:00' }), 'Mon, 28 Sep 2026 · 18:00');
  assert.equal(formatOption({ date: '2026-09-28', time: null }), 'Mon, 28 Sep 2026');
  assert.equal(formatOption({ date: 'legacy-value', time: null }), 'legacy-value');
  assert.equal(formatOption({ date: 'legacy-value', time: '18:00' }), 'legacy-value · 18:00');
  assert.equal(formatOption({ date: '  ', time: '18:00' }), '18:00');
  assert.equal(formatOption({ date: '', time: '18:00' }), '18:00');
  assert.equal(formatOption({ date: null, time: '09:30' }), '09:30');
  assert.equal(formatOption(null), 'Option');
});

test('buildViewModel counts valid selections once and ignores out-of-bounds values', () => {
  const options = [validOption, { date: '2026-09-30', time: null, label: null }];
  const responses = [
    { name: 'Ana', selected: [0, 99], created_at: '2026-01-02' },
    { name: 'Bo', selected: [1], created_at: '2026-01-03' },
    { name: 'Cy', selected: [0, '1'], created_at: '2026-01-04' },
  ];
  const model = buildViewModel(options, responses);

  assert.deepEqual(model.rows.map((row) => row.count), [2, 1]);
  assert.deepEqual(model.rows[0].voters, ['Ana', 'Cy']);
  assert.deepEqual(model.rows[1].voters, ['Bo']);
  assert.deepEqual(model.names, ['Ana', 'Bo', 'Cy']);
  assert.equal(model.maxCount, 2);
});

test('buildViewModel deduplicates repeated selected indexes per response', () => {
  const model = buildViewModel([validOption], [
    { name: 'Ana', selected: [0, 0], created_at: '2026-01-02' },
  ]);

  assert.equal(model.rows[0].count, 1);
  assert.deepEqual(model.rows[0].voters, ['Ana']);
});

test('buildViewModel keeps duplicate names and tolerates malformed options', () => {
  const model = buildViewModel([null, { junk: true }, validOption], [
    { name: 'Same', selected: [0, 2], created_at: '2026-01-02' },
    { name: 'Same', selected: [2], created_at: '2026-01-03' },
  ]);

  assert.deepEqual(model.names, ['Same', 'Same']);
  assert.equal(model.rows[0].option, 'Option');
  assert.equal(model.rows[1].option, 'Option');
  assert.deepEqual(model.rows[2].voters, ['Same', 'Same']);
  assert.equal(model.maxCount, 2);
});

test('buildShareLink points at the respond page for the current poll', () => {
  globalThis.location = {
    origin: 'https://x.github.io',
    pathname: '/availability-poll/',
    href: 'https://x.github.io/availability-poll/',
  };
  assert.equal(
    buildShareLink('abcdefgh'),
    'https://x.github.io/availability-poll/poll.html?poll=abcdefgh'
  );
});

test('getClient handles missing, placeholder, and valid Supabase configuration', () => {
  globalThis.window = {};
  assert.equal(getClient(), null);

  window.PLANAHEAD_CONFIG = { supabaseUrl: '<URL>', supabaseAnonKey: '<KEY>' };
  assert.equal(getClient(), null);

  let received;
  window.supabase = {
    createClient: (url, key) => {
      received = [url, key];
      return { from: (table) => ({ table }) };
    },
  };
  window.PLANAHEAD_CONFIG = { supabaseUrl: 'https://db.example', supabaseAnonKey: 'secret' };
  const client = getClient();
  assert.equal(typeof client.from, 'function');
  assert.deepEqual(received, ['https://db.example', 'secret']);
  assert.equal(getClient(), client);
});

test('buildOptionsFromDays flattens day selections chronologically', () => {
  const days = [
    { date: '2026-09-30', times: ['19:00'] },
    { date: '2026-09-28', times: ['19:00', '18:00'] },
  ];
  assert.deepEqual(buildOptionsFromDays(days), [
    { date: '2026-09-28', time: '18:00', label: null },
    { date: '2026-09-28', time: '19:00', label: null },
    { date: '2026-09-30', time: '19:00', label: null },
  ]);
});

test('buildOptionsFromDays preserves empty day selections as day-only options', () => {
  assert.deepEqual(buildOptionsFromDays([
    { date: '2026-09-29', times: [] },
  ]), [
    { date: '2026-09-29', time: null, label: null },
  ]);
});

test('buildViewModel rows carry the raw option for heatmap grouping', () => {
  const model = buildViewModel([validOption], []);
  assert.deepEqual(model.rows[0].raw, validOption);
});

test('buildHeatmap arranges dates as columns and times as rows', () => {
  const options = [
    { date: '2026-09-28', time: '18:00', label: null },
    { date: '2026-09-28', time: '19:00', label: null },
    { date: '2026-09-29', time: '18:00', label: null },
    { date: '2026-09-29', time: null, label: null },
  ];
  const responses = [
    { name: 'Ana', selected: [0, 2], created_at: '2026-01-01' },
    { name: 'Ben', selected: [0, 1], created_at: '2026-01-02' },
  ];
  const heat = buildHeatmap(buildViewModel(options, responses));
  assert.deepEqual(heat.times, ['18:00', '19:00', null]);
  assert.equal(heat.columns.length, 2);
  assert.equal(heat.columns[0].date, '2026-09-28');
  assert.deepEqual(heat.columns[0].cells[0], { count: 2, voters: ['Ana', 'Ben'], best: true });
  assert.deepEqual(heat.columns[0].cells[1], { count: 1, voters: ['Ben'], best: false });
  assert.equal(heat.columns[0].cells[2], null);
  assert.deepEqual(heat.columns[1].cells[0], { count: 1, voters: ['Ana'], best: false });
  assert.equal(heat.columns[1].cells[1], null);
  assert.deepEqual(heat.columns[1].cells[2], { count: 0, voters: [], best: false });
  assert.equal(heat.maxCount, 2);
});

test('PERSON_COLORS leads with the approved palette order', () => {
  assert.deepEqual(PERSON_COLORS.slice(0, 4),
    ['#96700f', '#3a6b35', '#5a4a8a', '#8a3038']);
});

test('assignTileColors maps unique names in first-seen order and cycles the palette', () => {
  const colors = assignTileColors(['Ana', 'Ben', 'Ana', 'Chloe', 'Dan', 'Eve', 'Fay', 'Gus', 'Hana', 'Ivy']);
  assert.equal(colors.get('Ana'), '#96700f');
  assert.equal(colors.get('Ben'), '#3a6b35');
  assert.equal(colors.get('Chloe'), '#5a4a8a');
  assert.equal(colors.get('Dan'), '#8a3038');
  assert.equal(colors.get('Eve'), '#b46f2a');
  assert.equal(colors.get('Ivy'), '#96700f');
  assert.equal(colors.size, 9);
});

test('dayAvailabilityLabel renders the 9-17 window for day-only options', () => {
  assert.equal(dayAvailabilityLabel(null), '09:00–17:00');
  assert.equal(dayAvailabilityLabel(undefined), '09:00–17:00');
  assert.equal(dayAvailabilityLabel('junk'), '09:00–17:00');
  assert.equal(dayAvailabilityLabel('24:00'), '09:00–17:00');
  assert.equal(dayAvailabilityLabel('12:60'), '09:00–17:00');
  assert.equal(dayAvailabilityLabel('18:00'), '18:00');
});

test('buildAvailabilityByDay collects deduped per-day voters', () => {
  const options = [
    { date: '2026-09-28', time: '18:00', label: null },
    { date: '2026-09-28', time: '19:00', label: null },
    { date: '2026-09-29', time: null, label: null },
  ];
  const responses = [
    { name: 'Ana', selected: [0, 2], created_at: '2026-01-01' },
    { name: 'Ben', selected: [0, 1], created_at: '2026-01-02' },
  ];
  const byDay = buildAvailabilityByDay(buildViewModel(options, responses).rows);
  assert.deepEqual([...byDay.get('2026-09-28').names], ['Ana', 'Ben']);
  assert.deepEqual([...byDay.get('2026-09-29').names], ['Ana']);
});

test('buildAvailabilityByDay ignores invalid selected indexes', () => {
  const options = [
    { date: '2026-09-28', time: '18:00', label: null },
    { date: '2026-09-28', time: '19:00', label: null },
    { date: '2026-09-29', time: null, label: null },
  ];
  const responses = [
    { name: 'Ana', selected: [0, 7, -1, 'x'], created_at: '2026-01-01' },
  ];
  const byDay = buildAvailabilityByDay(buildViewModel(options, responses).rows);
  assert.deepEqual([...byDay.get('2026-09-28').names], ['Ana']);
  assert.deepEqual([...byDay.get('2026-09-29').names], []);
});

test('getClientWithPassword passes the password as a global client header', () => {
  window.supabase = {
    createClient: (url, key, options) => ({ url, key, options }),
  };
  window.PLANAHEAD_CONFIG = { supabaseUrl: 'https://db.example', supabaseAnonKey: 'secret' };
  const created = getClientWithPassword('let-me-in');
  assert.equal(created.url, 'https://db.example');
  assert.equal(created.key, 'secret');
  assert.equal(created.options?.global?.headers['x-planahead-password'], 'let-me-in');
  assert.equal(getClientWithPassword(''), null);
  assert.equal(getClientWithPassword(null), null);
});

test('rulerSlots lists every 30-minute block from 09:00 to 20:30', () => {
  const slots = rulerSlots();
  assert.equal(slots.length, 24);
  assert.equal(slots[0], '09:00');
  assert.equal(slots[1], '09:30');
  assert.equal(slots[11], '14:30');
  assert.equal(slots[12], '15:00');
  assert.equal(slots[23], '20:30');
});

test('isRulerSlot accepts only on-grid times', () => {
  assert.equal(isRulerSlot('09:00'), true);
  assert.equal(isRulerSlot('18:30'), true);
  assert.equal(isRulerSlot('20:30'), true);
  assert.equal(isRulerSlot('08:30'), false);
  assert.equal(isRulerSlot('21:00'), false);
  assert.equal(isRulerSlot('18:15'), false);
  assert.equal(isRulerSlot('junk'), false);
});

test('legacyExtraTimes extracts off-grid offered times uniquely and sorted', () => {
  const options = [
    { date: '2026-09-28', time: '18:00', label: null },
    { date: '2026-09-28', time: '07:15', label: null },
    { date: '2026-09-29', time: '07:15', label: null },
    { date: '2026-09-29', time: '22:00', label: null },
    { date: '2026-09-30', time: null, label: null },
  ];
  assert.deepEqual(legacyExtraTimes(options), ['07:15', '22:00']);
});

test('offeredTimes returns unique on-grid offered times in ruler order', () => {
  const options = [
    { date: '2026-09-28', time: '19:00', label: null },
    { date: '2026-09-28', time: '18:00', label: null },
    { date: '2026-09-29', time: '19:00', label: null },
    { date: '2026-09-29', time: null, label: null },
    { date: '2026-09-30', time: '21:00', label: null },
  ];
  assert.deepEqual(offeredTimes(options), ['18:00', '19:00']);
});

test('splitSelectionsFromDays maps offered matches and aggregates unmatched picks as extras', () => {
  const options = [
    { date: '2026-09-28', time: '18:00', label: null },
    { date: '2026-09-28', time: '19:00', label: null },
    { date: '2026-09-29', time: null, label: null },
    { date: '2026-09-30', time: '18:00', label: null },
  ];
  const daySlots = new Map([
    ['2026-09-28', ['19:00', '18:00', '20:15']],
    ['2026-09-29', []],
    ['2026-09-30', []],
    ['2026-10-01', ['08:30']],
  ]);
  const result = splitSelectionsFromDays(options, daySlots);
  assert.deepEqual(result.indexes, [0, 1, 2]);
  assert.deepEqual(result.extras, [
    { date: '2026-09-28', times: ['20:15'] },
    { date: '2026-09-30', times: [] },
    { date: '2026-10-01', times: ['08:30'] },
  ]);
  const empty = splitSelectionsFromDays(options, new Map());
  assert.deepEqual(empty, { indexes: [], extras: [] });
});

test('buildAvailabilityByDay merges option voters with extra-day respondents', () => {
  const model = buildViewModel(
    [{ date: '2026-09-28', time: '18:00', label: null }],
    [
      { name: 'Ana', selected: [0], extra: [], created_at: 'a' },
      { name: 'Ben', selected: [], extra: [{ date: '2026-09-30', times: [] }], created_at: 'b' },
      { name: 'Chloe', selected: [], extra: [{ date: '2026-09-30', times: ['08:00'] }], created_at: 'c' },
      { name: 'Dan', selected: [0], extra: [{ date: '2026-09-28', times: ['20:00'] }], created_at: 'd' },
    ]
  );
  const byDay = buildAvailabilityByDay(model.rows, model.extraByDay);
  assert.deepEqual(byDay.get('2026-09-28').names, ['Ana', 'Dan']);
  assert.deepEqual(byDay.get('2026-09-30').names, ['Ben', 'Chloe']);
});

test('dayAvailabilityLabel matches the day-only pseudo-slot label', () => {
  assert.equal(dayAvailabilityLabel(null), '09:00–17:00');
});


test('buildOptionNamesBySlot groups offered voters by date and slot', () => {
  const rows = [
    { raw: { date: '2026-09-28', time: '18:00' }, voters: ['Ana', 'Ben'] },
    { raw: { date: '2026-09-28', time: '18:00' }, voters: ['Chloe', 'Ana'] },
    { raw: { date: '2026-09-28', time: '19:00' }, voters: [] },
    { raw: { date: '2026-09-29', time: null }, voters: ['Dan'] },
    { raw: { junk: true }, voters: ['Lost'] },
  ];
  const grouped = buildOptionNamesBySlot(rows);
  assert.deepEqual([...grouped.get('2026-09-28').get('18:00')], ['Ana', 'Ben', 'Chloe']);
  assert.equal(grouped.get('2026-09-28').get('19:00').size, 0);
  assert.deepEqual([...grouped.get('2026-09-29').get('')], ['Dan']);
  assert.equal(grouped.size, 2);
});

test('buildExtraNamesBySlot groups extra availability by date and slot', () => {
  const responses = [
    { name: 'Ana', selected: [], extra: [{ date: '2026-09-30', times: ['08:30'] }, { date: '2026-10-01', times: [] }] },
    { name: 'Ben', selected: [0], extra: [{ date: '2026-09-30', times: ['08:30'] }] },
    { name: 'Chloe', selected: [], extra: [] },
    { name: 'Junk', selected: [], extra: 'not-an-array' },
  ];
  const grouped = buildExtraNamesBySlot(responses);
  assert.deepEqual([...grouped.get('2026-09-30').get('08:30')], ['Ana', 'Ben']);
  assert.deepEqual([...grouped.get('2026-10-01').get('')], ['Ana']);
  assert.equal(grouped.get('2026-09-28'), undefined);
});

test('buildSlotCandidates unites offered rows with extra slot picks', () => {
  const rows = [
    { raw: { date: '2026-09-28', time: '18:00' } },
    { raw: { date: '2026-09-28', time: null } },
  ];
  const extras = new Map([
    ['2026-09-28', new Map([['20:15', ['Ana']], ['', ['Ben']]])],
    ['2026-10-01', new Map([['08:30', ['Chloe']], ['', ['Dan']]])],
  ]);
  const candidates = buildSlotCandidates(rows, extras);
  assert.deepEqual(candidates, [
    { date: '2026-09-28', time: '18:00' },
    { date: '2026-09-28', time: null },
    { date: '2026-09-28', time: '20:15' },
    { date: '2026-10-01', time: '08:30' },
    { date: '2026-10-01', time: null },
  ]);
});

test('rankBestSlots ranks candidate slots by availability, everyone flag, filters empty', () => {
  const candidates = [
    { date: '2026-09-28', time: '18:00' },
    { date: '2026-09-28', time: '20:15' },
    { date: '2026-09-28', time: null },
  ];
  const namesForSlot = (date, time) =>
    time === '18:00' ? ['Ben', 'Ana'] : time === null ? ['Ana'] : ['Chloe'];
  const ranked = rankBestSlots(candidates, namesForSlot, 2);
  assert.deepEqual(ranked.map((slot) => [slot.date, slot.time, slot.count]), [
    ['2026-09-28', '18:00', 2],
    ['2026-09-28', null, 1],
    ['2026-09-28', '20:15', 1],
  ]);
  assert.deepEqual(ranked[0].names, ['Ben', 'Ana']);
  assert.equal(ranked[0].everyone, true);
  assert.equal(ranked[1].everyone, false);
  assert.deepEqual(rankBestSlots(candidates, () => [], 2), []);
});

test('findOwnResponse matches names case-insensitively and returns latest match', () => {
  const responses = [
    { name: 'Dan', selected: [0], extra: [] },
    { name: '  ana  ', selected: [1], extra: [] },
    { name: 'Ana', selected: [2], extra: [] },
  ];
  assert.deepEqual(findOwnResponse(responses, 'DAN'), responses[0]);
  assert.deepEqual(findOwnResponse(responses, 'ana'), responses[2]);
  assert.equal(findOwnResponse(responses, 'Ben'), null);
  assert.equal(findOwnResponse(responses, ''), null);
  assert.equal(findOwnResponse([{ name: null }, {}, { name: '   ' }], null), null);
});

test('restoreDaySlots rebuilds calendar selections from a response', () => {
  const options = [
    { date: '2026-09-28', time: '18:00', label: null },
    { date: '2026-09-28', time: '19:00', label: null },
    { date: '2026-09-29', time: '18:00', label: null },
    { date: '2026-09-28', time: null, label: null },
  ];
  assert.deepEqual(restoreDaySlots(options, { name: 'Dan', selected: [0, 1], extra: [] }), new Map([
    ['2026-09-28', ['18:00', '19:00']],
  ]));
  assert.deepEqual(restoreDaySlots(options, { name: 'Eve', selected: [3], extra: [] }), new Map([
    ['2026-09-28', []],
  ]));
  assert.deepEqual(restoreDaySlots(options, {
    name: 'Eve',
    selected: [],
    extra: [
      { date: '2026-09-30', times: [] },
      { date: '2026-10-01', times: ['08:00'] },
      { date: '2026-10-01', times: ['07:00', '08:30'] },
    ],
  }), new Map([
    ['2026-09-30', []],
    ['2026-10-01', ['07:00', '08:00', '08:30']],
  ]));
  assert.deepEqual(restoreDaySlots(options, { name: 'Ana', selected: [3, 0], extra: [{ date: '2026-09-28', times: ['20:15'] }] }), new Map([
    ['2026-09-28', ['18:00', '20:15']],
  ]));
  assert.equal(restoreDaySlots(options, null), null);
  assert.deepEqual([...restoreDaySlots(options, { name: 'Ana', selected: [99, -1], extra: 'junk' })], []);
  assert.deepEqual(restoreDaySlots('', null), null);
});

test('rulerSlots supports 60-minute step from 09:00 to 20:00', () => {
  const slots = rulerSlots(60);
  assert.deepEqual(slots.length, 12);
  assert.equal(slots[0], '09:00');
  assert.equal(slots.at(-1), '20:00');
  assert.deepEqual(slots.filter((slot) => slot.endsWith(':30')), []);
});

test('rulerSlots rejects unsupported steps and falls back to 30', () => {
  assert.deepEqual(rulerSlots(45).length, 24);
  assert.deepEqual(rulerSlots('x').length, 24);
});

test('isRulerSlot honors the step parameter', () => {
  assert.equal(isRulerSlot('10:30', 60), false);
  assert.equal(isRulerSlot('10:00', 60), true);
  assert.equal(isRulerSlot('10:30', 30), true);
  assert.equal(isRulerSlot('10:00', 45), true); // falls back to 30
});
