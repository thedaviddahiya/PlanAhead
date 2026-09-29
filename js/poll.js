import {
  buildHeatmap,
  buildViewModel,
  formatOption,
  getClient,
  isValidDateFormat,
  validateResponseInput,
} from './app.js';

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
const optionsList = document.querySelector('#options-list');
const respondError = document.querySelector('#respond-error');
const submitButton = document.querySelector('#submit-response');
const title = document.querySelector('#poll-title');
const description = document.querySelector('#poll-description');

function showNotFound(message, canRetry = false) {
  notfoundMessage.textContent = message;
  retryButton.hidden = !canRetry;
  notfoundPanel.hidden = false;
}

function showError(messages) {
  respondError.textContent = Array.isArray(messages) ? messages.join('\n') : messages;
}

function renderOptions(options) {
  optionsList.replaceChildren();
  const groups = new Map();
  options.forEach((option, index) => {
    const date = typeof option?.date === 'string' && option.date.trim() ? option.date : null;
    const key = date ?? '__ungrouped__';
    if (!groups.has(key)) groups.set(key, { date, entries: [] });
    groups.get(key).entries.push({ option, index });
  });

  for (const { date, entries } of groups.values()) {
    const heading = document.createElement('h3');
    heading.className = 'option-group-heading';
    heading.textContent = date ? formatOption({ date, time: null }) : 'Ungrouped';
    optionsList.append(heading);
    entries.forEach(({ option, index }) => {
      const label = document.createElement('label');
      label.className = 'response-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'selected';
      checkbox.value = String(index);
      label.append(checkbox, document.createTextNode(formatOption(option)));
      optionsList.append(label);
    });
  }
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
    label.textContent = time ?? 'Any time';
    row.append(label);
    for (const column of heat.columns) {
      row.append(renderHeatCell(column.cells[timeIndex], heat.maxCount));
    }
    body.append(row);
  });
  table.append(head, body);
  resultsGrid.replaceChildren(table);
}

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
  renderResults(buildViewModel(poll.options, data));
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
    poll = data;
    title.textContent = data.title;
    description.textContent = data.description ?? '';
    renderOptions(Array.isArray(data.options) ? data.options : []);
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
  const checked = [...optionsList.querySelectorAll('input[type="checkbox"]:checked')];
  const errors = validateResponseInput(nameInput.value, checked.length);
  if (errors.length > 0) {
    showError(errors);
    return;
  }

  submitButton.disabled = true;
  showError('');
  const selected = checked.map((input) => Number(input.value)).sort((a, b) => a - b);
  try {
    const { error } = await client.from('responses').insert({
      poll_id: pollId,
      name: nameInput.value.trim(),
      selected,
    });
    if (error) throw error;
    respondPanel.hidden = true;
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
