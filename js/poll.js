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
  findOwnResponse,
  restoreDaySlots,
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
const modifyEntryButton = document.querySelector('#modify-entry');
const title = document.querySelector('#poll-title');
const description = document.querySelector('#poll-description');
const tileLegend = document.querySelector('#tile-legend');

let calendar;
let currentModel;
let poll;
let client;
let realtimeChannel;
let slotOptions = new Map();
let slotExtras = new Map();
let nameColors = new Map();
let bestOpen = false;
const myNameKey = `planahead-my-name:${pollId}`;

function nameLabelElement() {
  return responseForm.querySelector('label[for="name-input"]');
}

function updateSubmitLabel() {
  const own = findOwnResponse(latestResponses, nameInput.value);
  submitButton.textContent = own ? 'Modify entry' : 'Submit availability';
}

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

function overlapNamesForSlot(date, time) {
  const names = new Set(orderedNamesForSlot(date, time));
  if (time !== null && time >= '09:00' && time < '17:00') {
    for (const name of orderedNamesForSlot(date, null)) names.add(name);
  }
  if (time === null) return orderedNamesForSlot(date, null);
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
    (date, time) => overlapNamesForSlot(date, time),
    currentModel.names.length
  ).slice(0, 5);
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.date)) groups.set(entry.date, []);
    groups.get(entry.date).push(entry);
  }
  for (const [date, groupEntries] of groups) {
    const heading = document.createElement('div');
    heading.className = 'best-date';
    heading.textContent = formatOption({ date, time: null });
    bestList.append(heading);
    for (const entry of groupEntries) {
      const row = document.createElement('div');
      row.className = 'best-row';
      const label = document.createElement('strong');
      label.textContent = dayAvailabilityLabel(entry.time);
      const people = document.createElement('span');
      people.className = 'best-people';
      for (const name of entry.names) {
        const dot = document.createElement('span');
        dot.className = 'person-dot';
        dot.style.backgroundColor = nameColors.get(name);
        dot.title = name;
        people.append(dot);
      }
      const detail = document.createElement('span');
      detail.className = 'best-meta';
      detail.textContent = entry.everyone ? 'Everyone' : `${entry.count} of ${currentModel.names.length}`;
      people.append(detail);
      row.append(label, people);
      bestList.append(row);
    }
  }
}

const bestToggle = document.querySelector('#best-toggle');
const bestList = document.querySelector('#best-list');
bestToggle.addEventListener('click', () => {
  bestOpen = !bestOpen;
  bestToggle.setAttribute('aria-expanded', String(bestOpen));
  bestList.hidden = !bestOpen;
});

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

calendar.renderCalendar();

calendar.onChange(() => {
  if (currentModel) renderTiles(currentModel);
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
});

let selectedDate = null;

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
  updateSubmitLabel();
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
      event: '*', schema: 'public', table: 'responses', filter: `poll_id=eq.${pollId}`,
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
    calendar.setStep(Number(poll.step_minutes) === 60 ? 60 : 30);
    for (const hint of document.querySelectorAll('.ruler-hint')) {
      hint.textContent = Number(poll.step_minutes) === 60
        ? 'Each block is one hour · marks run 09:00–21:00'
        : 'Each block is 30 minutes · marks run 09:00–21:00';
    }
    title.textContent = data.title;
    description.textContent = data.description ?? '';
    respondPanel.hidden = false;
    const savedName = localStorage.getItem(myNameKey);
    if (savedName && !nameInput.value) nameInput.value = savedName;
    await loadResults();
    restoreOwnSelectionIfAny();
    subscribeToResults();
  } catch (error) {
    showNotFound('Could not reach the database.', true);
  }
}

function restoreOwnSelectionIfAny() {
  if (calendar.daySlots.size !== 0) return;
  const own = findOwnResponse(latestResponses, nameInput.value || localStorage.getItem(myNameKey));
  if (!own) return;
  const restored = restoreDaySlots(poll.options, own);
  if (!restored || restored.size === 0) return;
  for (const [date, times] of restored) calendar.daySlots.set(date, [...times]);
  calendar.renderCalendar();
}

function revealResponseForm() {
  nameLabelElement().hidden = false;
  nameInput.hidden = false;
  submitButton.hidden = false;
  submitButton.disabled = false;
  modifyEntryButton.hidden = true;
  const own = findOwnResponse(latestResponses, nameInput.value);
  if (own) {
    nameInput.value = own.name;
    const restored = restoreDaySlots(poll.options, own);
    for (const [date, times] of restored ?? []) calendar.daySlots.set(date, [...times]);
    calendar.renderCalendar();
  }
  respondError.textContent = '';
}

modifyEntryButton.addEventListener('click', revealResponseForm);

nameInput.addEventListener('input', updateSubmitLabel);

responseForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const own = findOwnResponse(latestResponses, nameInput.value);
  const storedName = own ? own.name : nameInput.value.trim();
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
    const { error } = await client.from('responses').upsert({
      poll_id: pollId,
      name: storedName,
      selected: indexes,
      extra: extras,
    }, { onConflict: 'poll_id,name' });
    if (error) throw error;
    try {
      localStorage.setItem(myNameKey, storedName);
    } catch {
      /* storage unavailable */
    }
    nameInput.hidden = true;
    nameLabelElement().hidden = true;
    submitButton.hidden = true;
    thankyouPanel.hidden = false;
    modifyEntryButton.hidden = false;
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
