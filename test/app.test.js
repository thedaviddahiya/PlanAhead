import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHeatmap,
  buildOptionsFromDays,
  buildShareLink,
  buildViewModel,
  expandTimeRange,
  findDuplicateKeys,
  formatOption,
  generatePollId,
  getClient,
  isValidDateFormat,
  isValidTimeFormat,
  normalizeOptions,
  validatePollInput,
  validateResponseInput,
} from '../js/app.js';

const validDate = '2026-09-29';
const validOption = { date: '2026-09-29', time: '18:00', label: null };

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

test('expandTimeRange expands inclusive 30-minute slots and rejects invalid ranges', () => {
  assert.deepEqual(
    expandTimeRange('17:30', '20:30'),
    ['17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30']
  );
  assert.deepEqual(expandTimeRange('17:45', '18:15'), ['17:45', '18:15']);
  assert.equal(expandTimeRange('18:00', '17:00'), null);
  assert.equal(expandTimeRange('bad', '18:00'), null);
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
