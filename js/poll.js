import {
  assignTileColors,
  buildAvailabilityByDay,
  buildExtraNamesBySlot,
  buildOptionNamesBySlot,
  buildViewModel,
  dayAvailabilityLabel,
  formatOption,
  buildSlotCandidates,
  rankBestSlots,
  getClient,
  splitSelectionsFromDays,
  validateResponseInput,
} from './app.js';
import { createCalendar } from './calendar.js';

const pollId = new URLSearchParams(location.search).get('poll');
const validPollId = /^[23456789a-hjkmnp-z]{8}$/.test(pollId ?? '');
const notfoundPanel = document.querySelector('#notfound-panel');
const notfoundMessage = document.querySelector('#notfound-message');
const retryButton = document.querySelector('#retry-poll');
const setupNotice = document.querySelector('#setup-notice');
const respondPanel = document.querySelector('#respond-panel');
const thankyouPanel = document.querySelector('#thankyou-panel');
const responseForm = document.querySelector('#response-form');
const nameInput = document.querySelector('#name-input');
const respondError = document.querySelector('#respond-error');
const submitButton = document.querySelector('#submit-response');
const title = document.querySelector('#poll-title');
const description = document.querySelector('#poll-description');
const tileLegend = document.querySelector('#tile-legend');
const dayReadout = document.querySelector('#day-readout');

let calendar;
let currentModel;
let slotOptions = new Map();
let slotExtras = new Map();
let nameColors = new Map();
let bestOpen = false;

function orderedNamesForSlot(date, time) {
  const timeKey = time ?? '';
  const names = new Set();
  for (const name of slotOptions.get(date)?.get(timeKey) ?? []) names.add(name);
  for (const name of slotExtras.get(date)?.get(timeKey) ?? []) names.add(name);
  if (time === null) {
    for (const name of slotOptions.get(date)?.get('') ?? []) names.add(name);
    for (const name of slotExtras.get(date)?.get('') ?? []) names.add(name);
  }
  const ordered = [];
  const seen = new Set();
  for (const name of [...(currentModel?.names ?? []), ...names]) {
    if (names.has(name) && !seen.has(name)) {
      seen.add(name);
      ordered.push(name);
    }
  }
  return ordered;
}

function peopleForSlot(date, time) {
  return orderedNamesForSlot(date, time)
    .map((name) => nameColors.get(name))
    .filter((color) => Boolean(color));
}

function showNotFound(message, canRetry = false) {
  notfoundMessage.textContent = message;
  retryButton.hidden = !canRetry;
  notfoundPanel.hidden = false;
}

function showError(messages) {
  respondError.textContent = Array.isArray(messages) ? messages.join('\n') : messages;
}

function optionsForDay(date) {
  return (poll?.options ?? []).filter((option) => option?.date === date);
}

function dateFromCalendarCell(cell) {
  return cell.dataset.date || null;
}

function renderLegend(names) {  tileLegend.replaceChildren();
  const colors = assignTileColors(names);
  for (const [name, color] of colors) {
    const item = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.className = 'tile-legend-swatch';
    swatch.style.backgroundColor = color;
    const label = document.createElement('span');
    label.textContent = name;
    item.append(swatch, label);
    tileLegend.append(item);
  }
}

let latestResponses = [];

function renderTiles(model, responses) {
  currentModel = model;
  if (responses) latestResponses = responses;
  slotOptions = buildOptionNamesBySlot(model.rows);
  slotExtras = buildExtraNamesBySlot(latestResponses);
  nameColors = assignTileColors(model.names);
  const availability = buildAvailabilityByDay(model.rows, model.extraByDay);
  const colors = assignTileColors(model.names);
  for (const cell of document.querySelectorAll('#cal-grid .cal-day:not(.dim)')) {
    const date = dateFromCalendarCell(cell);
    if (!date) continue;
    cell.querySelector('.cal-tiles')?.remove();
    const day = availability.get(date);
    if (day?.names.length) {
      const tiles = document.createElement('span');
      tiles.className = 'cal-tiles';
      for (const name of day.names) {
        const tile = document.createElement('span');
        tile.className = 'cal-tile';
        tile.style.backgroundColor = colors.get(name);
        tile.title = name;
        tile.setAttribute('aria-label', name);
        tiles.append(tile);
      }
      cell.append(tiles);
    }
  }
  renderLegend(model.names);
  renderBestPanel();
}

function renderBestPanel() {
  bestList.replaceChildren();
  if (!currentModel) return;
  const entries = rankBestSlots(
    buildSlotCandidates(currentModel.rows, slotExtras),
    (date, time) => orderedNamesForSlot(date, time),
    currentModel.names.length
  ).slice(0, 5);
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'best-row';
    if (entry.everyone) row.classList.add('best-everyone');
    const label = document.createElement('strong');
    label.textContent = dayAvailabilityLabel(entry.time);
    const date = document.createElement('span');
    date.textContent = formatOption({ date: entry.date, time: null });
    const detail = document.createElement('span');
    detail.className = 'best-meta';
    detail.textContent = entry.everyone ? 'Everyone' : `${entry.count} of ${currentModel.names.length}`;
    const people = document.createElement('span');
    people.className = 'day-readout-people';
    for (const name of entry.names) {
      const dot = document.createElement('span');
      dot.className = 'person-dot';
      dot.style.backgroundColor = nameColors.get(name);
      dot.title = name;
      people.append(dot);
    }
    people.append(detail);
    row.append(label, date, people);
    bestList.append(row);
  }
}

const bestToggle = document.querySelector('#best-toggle');
const bestList = document.querySelector('#best-list');
bestToggle.addEventListener('click', () => {
  bestOpen = !bestOpen;
  bestToggle.setAttribute('aria-expanded', String(bestOpen));
  bestList.hidden = !bestOpen;
});

let selectedDate = null;

function renderDayReadout(date) {
  if (!date) {
    dayReadout.replaceChildren();
    return;
  }
  dayReadout.replaceChildren();
  const options = optionsForDay(date);
  if (options.length === 0) return;
  const seen = new Set();
  for (const option of options) {
    const time = option.time ?? null;
    const key = String(time);
    if (seen.has(key)) continue;
    seen.add(key);
    const row = document.createElement('div');
    row.className = 'day-readout-row';
    const label = document.createElement('strong');
    label.textContent = dayAvailabilityLabel(time);
    const names = orderedNamesForSlot(date, time);
    const people = document.createElement('span');
    people.className = 'day-readout-people';
    if (names.length === 0) {
      people.textContent = 'No responses yet';
    } else {
      for (const name of names) {
        const dot = document.createElement('span');
        dot.className = 'person-dot';
        dot.style.backgroundColor = nameColors.get(name);
        dot.title = name;
        people.append(dot);
      }
    }
    if (currentModel && names.length > 0) {
      const count = document.createElement('span');
      count.className = 'readout-count';
      count.textContent = `${names.length} of ${currentModel.names.length}`;
      row.append(label, people, count);
      dayReadout.append(row);
      continue;
    }
    row.append(label, people);
    dayReadout.append(row);
  }
}

calendar = createCalendar({
  gridEl: document.querySelector('#cal-grid'),
  monthEl: document.querySelector('#cal-month'),
  prevEl: document.querySelector('#cal-prev'),
  nextEl: document.querySelector('#cal-next'),
  rulerPanelEl: document.querySelector('#ruler-panel'),
  rulerTitleEl: document.querySelector('#ruler-title'),
  allDayEl: document.querySelector('#all-day'),
  rulerBlocksEl: document.querySelector('#ruler-blocks'),
  rulerExtrasEl: document.querySelector('#ruler-extras'),
  clearEl: document.querySelector('#clear-day'),
  editorMode: 'full',
  slotsForDate: (date) => ({
    times: optionsForDay(date)
      .filter((option) => option.time !== null)
      .map((option) => option.time),
    dayOnly: optionsForDay(date).some((option) => option.time === null),
  }),
  peopleForSlot,
});

calendar.onChange(() => {
  if (currentModel) renderTiles(currentModel);
  renderDayReadout(selectedDate);
});

document.querySelector('#cal-prev').addEventListener('click', () => {
  if (currentModel) renderTiles(currentModel);
});

document.querySelector('#cal-next').addEventListener('click', () => {
  if (currentModel) renderTiles(currentModel);
});

document.querySelector('#cal-grid').addEventListener('click', (event) => {
  const cell = event.target.closest('.cal-day:not(.dim)');
  if (!cell) return;
  const date = dateFromCalendarCell(cell);
  if (!date) return;
  selectedDate = date;
  renderDayReadout(date);
});

let client;
let poll;
let realtimeChannel;

function setResultsStatus(message) {
  if (message) respondError.textContent = message;
  else if (respondError.textContent.startsWith('Results may be')) {
    respondError.textContent = '';
  }
}

function cleanupRealtime() {
  if (!realtimeChannel) return;
  realtimeChannel.unsubscribe();
  client.removeChannel(realtimeChannel);
  realtimeChannel = null;
}

async function loadResults() {
  const { data, error } = await client.from('responses')
    .select('name, selected, extra, created_at')
    .eq('poll_id', pollId)
    .order('created_at');
  if (error) throw error;
  const model = buildViewModel(poll.options, data);
  renderTiles(model, data);
  setResultsStatus('');
}

async function refreshResults() {
  try {
    await loadResults();
  } catch (error) {
    setResultsStatus('Results may be out of date. Refresh failed.');
  }
}

function subscribeToResults() {
  cleanupRealtime();
  realtimeChannel = client.channel(`planahead-${pollId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'responses', filter: `poll_id=eq.${pollId}`,
    }, () => refreshResults())
    .subscribe();
}

async function loadPoll() {
  cleanupRealtime();
  try {
    const { data, error } = await client.from('polls').select('*').eq('id', pollId).maybeSingle();
    if (error) throw error;
    if (!data) {
      showNotFound('This poll was not found.');
      return;
    }
    poll = { ...data, options: Array.isArray(data.options) ? data.options : [] };
    title.textContent = data.title;
    description.textContent = data.description ?? '';
    respondPanel.hidden = false;
    await loadResults();
    subscribeToResults();
  } catch (error) {
    showNotFound('Could not reach the database.', true);
  }
}

responseForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const { indexes, extras } = splitSelectionsFromDays(poll.options, calendar.daySlots);
  const errors = validateResponseInput(
    nameInput.value,
    indexes.length + extras.length
  );
  if (errors.length > 0) {
    showError(errors);
    return;
  }

  submitButton.disabled = true;
  showError('');
  try {
    const { error } = await client.from('responses').insert({
      poll_id: pollId,
      name: nameInput.value.trim(),
      selected: indexes,
      extra: extras,
    });
    if (error) throw error;
    nameInput.hidden = true;
    responseForm.querySelector('label[for="name-input"]').hidden = true;
    submitButton.hidden = true;
    thankyouPanel.hidden = false;
    await refreshResults();
  } catch (error) {
    showError(error?.message || 'Could not submit your response.');
    submitButton.disabled = false;
  }
});

window.addEventListener('focus', () => {
  if (poll) refreshResults();
});
window.addEventListener('visibilitychange', () => {
  if (!document.hidden && poll) refreshResults();
});
retryButton.addEventListener('click', () => loadPoll());
window.addEventListener('pagehide', cleanupRealtime);
window.addEventListener('beforeunload', cleanupRealtime);

if (!validPollId) {
  showNotFound('This poll link is invalid.');
} else {
  client = getClient();
  if (!client) {
    setupNotice.hidden = false;
  } else {
    loadPoll();
  }
}
