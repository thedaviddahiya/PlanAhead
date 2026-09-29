import {
  assignTileColors,
  bestDaysByDay,
  buildAvailabilityByDay,
  buildHeatmap,
  buildViewModel,
  dayAvailabilityLabel,
  getClient,
  isValidDateFormat,
  selectedIndexesFromDays,
  validateResponseInput,
} from './app.js';
import { createCalendar } from './calendar.js';

const WEEKDAYS_MIN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pollId = new URLSearchParams(location.search).get('poll');
const validPollId = /^[23456789a-hjkmnp-z]{8}$/.test(pollId ?? '');
const notfoundPanel = document.querySelector('#notfound-panel');
const notfoundMessage = document.querySelector('#notfound-message');
const retryButton = document.querySelector('#retry-poll');
const setupNotice = document.querySelector('#setup-notice');
const respondPanel = document.querySelector('#respond-panel');
const thankyouPanel = document.querySelector('#thankyou-panel');
const resultsPanel = document.querySelector('#results-panel');
const resultsGrid = document.querySelector('#results-grid');
const resultsStatus = document.querySelector('#results-status');
const refreshButton = document.querySelector('#refresh-results');
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

function renderTiles(model) {
  currentModel = model;
  const availability = buildAvailabilityByDay(model.rows);
  const bestDays = bestDaysByDay(model.rows);
  const colors = assignTileColors(model.names);
  for (const cell of document.querySelectorAll('#cal-grid .cal-day:not(.dim)')) {
    const date = dateFromCalendarCell(cell);
    if (!date) continue;
    cell.querySelector('.cal-tiles')?.remove();
    cell.querySelector('.cal-best-star')?.remove();
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
    if (bestDays.has(date)) {
      const star = document.createElement('span');
      star.className = 'cal-best-star';
      star.textContent = '★';
      star.setAttribute('aria-label', 'Best day');
      cell.append(star);
    }
  }
  renderLegend(model.names);
}

let selectedDate = null;

function renderDayReadout(date) {
  if (!date) {
    dayReadout.replaceChildren();
    return;
  }
  dayReadout.replaceChildren();
  const options = optionsForDay(date);
  if (options.length === 0) return;
  const byTime = new Map();
  for (const option of options) {
    const time = option.time ?? null;
    const row = document.createElement('div');
    row.className = 'day-readout-row';
    const label = document.createElement('strong');
    label.textContent = dayAvailabilityLabel(time);
    const names = currentModel?.rows
      .filter((entry) => entry.raw?.date === date && (entry.raw?.time ?? null) === time)
      .flatMap((entry) => entry.voters) ?? [];
    const people = document.createElement('span');
    people.textContent = names.length ? names.join(', ') : 'No responses yet';
    row.append(label, people);
    byTime.set(String(time), row);
  }
  for (const row of byTime.values()) dayReadout.append(row);
}

function heatLevel(count, maxCount) {
  if (count <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((count / maxCount) * 4)));
}

function renderDateHeader(dateIso) {
  const header = document.createElement('th');
  header.scope = 'col';
  if (isValidDateFormat(dateIso)) {
    const [year, month, day] = dateIso.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    const dow = document.createElement('span');
    dow.className = 'heat-col-dow';
    dow.textContent = WEEKDAYS_MIN[date.getUTCDay()];
    const dayLabel = document.createElement('span');
    dayLabel.className = 'heat-col-day';
    dayLabel.textContent = String(day);
    header.append(dow, dayLabel);
  } else {
    header.className = 'heat-col-raw';
    header.textContent = dateIso || '–';
  }
  return header;
}

function renderHeatCell(entry, maxCount) {
  const cell = document.createElement('td');
  const plate = document.createElement('div');
  plate.className = 'heat-cell';
  if (entry === null) {
    plate.classList.add('heat-none');
    cell.setAttribute('aria-label', 'No option at this time');
  } else {
    const level = heatLevel(entry.count, maxCount);
    plate.classList.add(`heat-${level}`);
    if (entry.best) plate.classList.add('heat-best');
    plate.textContent = String(entry.count);
    if (entry.best) {
      const star = document.createElement('span');
      star.className = 'heat-best-star';
      star.textContent = '★';
      star.setAttribute('aria-label', 'Best slot');
      plate.prepend(star);
    }
    const names = entry.voters.join(', ');
    cell.setAttribute('aria-label',
      `${entry.count} available${names ? `: ${names}` : ''}`);
    if (names) cell.title = names;
  }
  cell.append(plate);
  return cell;
}

function renderResults(model) {
  const heat = buildHeatmap(model);
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const corner = document.createElement('th');
  corner.scope = 'col';
  corner.textContent = 'Time';
  headerRow.append(corner);
  for (const column of heat.columns) headerRow.append(renderDateHeader(column.date));
  head.append(headerRow);

  const body = document.createElement('tbody');
  heat.times.forEach((time, timeIndex) => {
    const row = document.createElement('tr');
    const label = document.createElement('th');
    label.scope = 'row';
    label.className = 'time-label';
    label.textContent = time === null ? dayAvailabilityLabel(null) : time;
    row.append(label);
    for (const column of heat.columns) {
      row.append(renderHeatCell(column.cells[timeIndex], heat.maxCount));
    }
    body.append(row);
  });
  table.append(head, body);
  resultsGrid.replaceChildren(table);
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
  editorMode: 'offered-only',
  slotsForDate: (date) => ({
    times: optionsForDay(date)
      .filter((option) => option.time !== null)
      .map((option) => option.time),
    dayOnly: optionsForDay(date).some((option) => option.time === null),
  }),
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
  resultsStatus.textContent = message;
}

function cleanupRealtime() {
  if (!realtimeChannel) return;
  realtimeChannel.unsubscribe();
  client.removeChannel(realtimeChannel);
  realtimeChannel = null;
}

async function loadResults() {
  const { data, error } = await client.from('responses')
    .select('name, selected, created_at')
    .eq('poll_id', pollId)
    .order('created_at');
  if (error) throw error;
  const model = buildViewModel(poll.options, data);
  renderResults(model);
  renderTiles(model);
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
    resultsPanel.hidden = false;
    await loadResults();
    subscribeToResults();
  } catch (error) {
    showNotFound('Could not reach the database.', true);
  }
}

responseForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const selected = selectedIndexesFromDays(poll.options, calendar.daySlots);
  const errors = validateResponseInput(nameInput.value, selected.length);
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
      selected,
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

refreshButton.addEventListener('click', () => refreshResults());
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
