import {
  buildOptionsFromDays,
  buildShareLink,
  expandTimeRange,
  formatOption,
  generatePollId,
  getClient,
  isValidTimeFormat,
  mapCreationError,
  normalizeOptions,
  validatePollInput,
} from './app.js';

const incomingPollId = new URLSearchParams(location.search).get('poll');
if (incomingPollId && /^[23456789a-hjkmnp-z]{8}$/.test(incomingPollId)) {
  location.replace(buildShareLink(incomingPollId));
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DOW_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const FIXED_SLOTS = ['17:00', '18:00', '19:00', '20:00'];
const MAX_DOTS = 4;

const titleInput = document.querySelector('#title');
const descriptionInput = document.querySelector('#description');
const creationPasswordInput = document.querySelector('#create-password');
const calGrid = document.querySelector('#cal-grid');
const calMonth = document.querySelector('#cal-month');
const calPrev = document.querySelector('#cal-prev');
const calNext = document.querySelector('#cal-next');
const popover = document.querySelector('#day-popover');
const popoverTitle = document.querySelector('#popover-title');
const slotChips = document.querySelector('#slot-chips');
const exactTimeInput = document.querySelector('#exact-time');
const addExactButton = document.querySelector('#add-exact');
const rangeStartInput = document.querySelector('#range-start');
const rangeEndInput = document.querySelector('#range-end');
const addRangeButton = document.querySelector('#add-range');
const popoverError = document.querySelector('#popover-error');
const dayChosenList = document.querySelector('#day-chosen');
const clearDayButton = document.querySelector('#clear-day');
const doneDayButton = document.querySelector('#done-day');
const popoverBackdrop = document.querySelector('#popover-backdrop');
const optionsList = document.querySelector('#options-list');
const form = document.querySelector('#create-form');
const errorBox = document.querySelector('#create-error');
const setupNotice = document.querySelector('#setup-notice');
const resultPanel = document.querySelector('#result-panel');
const shareLink = document.querySelector('#share-link');
const copyLinkButton = document.querySelector('#copy-link');
const openPollLink = document.querySelector('#open-poll');
const submitButton = form.querySelector('button[type="submit"]');

const daySlots = new Map();
const client = getClient();
let viewYear;
let viewMonth;
let popoverDate = null;
let popoverTrigger = null;

function showError(messages) {
  errorBox.textContent = Array.isArray(messages) ? messages.join('\n') : messages;
}

creationPasswordInput.addEventListener('invalid', () => {
  showError(creationPasswordInput.validationMessage);
});

function showPopoverError(message) {
  popoverError.textContent = message;
}

function isoOf(day) {
  return `${String(day.getUTCFullYear()).padStart(4, '0')}-${
    String(day.getUTCMonth() + 1).padStart(2, '0')}-${
    String(day.getUTCDate()).padStart(2, '0')}`;
}

function slotsFor(dateIso) {
  return daySlots.get(dateIso) ?? [];
}

function addSlot(dateIso, time) {
  const slots = slotsFor(dateIso);
  if (slots.includes(time)) return false;
  const next = [...slots, time].sort();
  daySlots.set(dateIso, next);
  return true;
}

function removeSlot(dateIso, time) {
  const slots = slotsFor(dateIso);
  const next = slots.filter((value) => value !== time);
  if (next.length === 0) daySlots.delete(dateIso);
  else daySlots.set(dateIso, next);
}

function renderCalendar() {
  calMonth.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
  calGrid.replaceChildren();
  for (const label of DOW_LABELS) {
    const dow = document.createElement('span');
    dow.className = 'cal-dow';
    dow.textContent = label;
    calGrid.append(dow);
  }

  const firstOfMonth = new Date(Date.UTC(viewYear, viewMonth, 1));
  const lead = (firstOfMonth.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
  const daysInPrevMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate();
  const totalCells = lead + daysInMonth;
  const trailing = (7 - (totalCells % 7)) % 7;

  for (let index = lead - 1; index >= 0; index -= 1) {
    const dim = document.createElement('span');
    dim.className = 'cal-day dim';
    dim.textContent = String(daysInPrevMonth - index);
    calGrid.append(dim);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateIso = isoOf(new Date(Date.UTC(viewYear, viewMonth, day)));
    const slots = slotsFor(dateIso);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-day';
    if (slots.length > 0) cell.classList.add('filled');
    cell.textContent = String(day);
    cell.setAttribute('aria-label',
      `Add times for ${MONTH_NAMES[viewMonth]} ${day}` +
      (slots.length > 0 ? ` (${slots.length} chosen)` : ''));
    if (slots.length > 0) {
      const dots = document.createElement('span');
      dots.className = 'cal-dots';
      for (let index = 0; index < Math.min(slots.length, MAX_DOTS); index += 1) {
        const dot = document.createElement('span');
        dot.className = 'cal-dot';
        dots.append(dot);
      }
      cell.append(dots);
    }
    cell.addEventListener('click', () => openPopover(dateIso, cell));
    calGrid.append(cell);
  }

  for (let index = 1; index <= trailing; index += 1) {
    const dim = document.createElement('span');
    dim.className = 'cal-day dim';
    dim.textContent = String(index);
    calGrid.append(dim);
  }
}

function positionPopover(trigger) {
  const rect = trigger.getBoundingClientRect();
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  const margin = 8;
  let left = Math.min(Math.max(rect.left, margin), window.innerWidth - width - margin);
  let top = rect.bottom + margin;
  if (top + height > window.innerHeight - margin) {
    top = Math.max(rect.top - height - margin, margin);
  }
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function openPopover(dateIso, trigger) {
  popoverDate = dateIso;
  popoverTrigger = trigger;
  popover.hidden = false;
  popoverBackdrop.hidden = window.matchMedia('(min-width: 641px)').matches;
  positionPopover(trigger);
  popover.focus({ preventScroll: true });
  renderPopover();
}

function closePopover() {
  const returning = popoverTrigger;
  popover.hidden = true;
  popoverBackdrop.hidden = true;
  popoverDate = null;
  popoverTrigger = null;
  returning?.focus({ preventScroll: true });
  renderSummary();
}

function renderPopover() {
  const dateIso = popoverDate;
  if (!dateIso) return;
  const slots = slotsFor(dateIso);
  popoverTitle.textContent = formatOption({ date: dateIso, time: null });
  slotChips.replaceChildren();
  for (const slot of FIXED_SLOTS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'slot-chip';
    chip.classList.toggle('on', slots.includes(slot));
    chip.setAttribute('aria-pressed', String(slots.includes(slot)));
    chip.textContent = slot;
    chip.addEventListener('click', () => {
      if (slots.includes(slot)) removeSlot(dateIso, slot);
      else addSlot(dateIso, slot);
      renderPopover();
      renderCalendar();
      renderSummary();
    });
    slotChips.append(chip);
  }
  const other = document.createElement('button');
  other.type = 'button';
  other.className = 'slot-chip other';
  other.textContent = 'Other…';
  other.addEventListener('click', () => {
    try {
      exactTimeInput.showPicker();
    } catch {
      exactTimeInput.focus();
    }
    if (!exactTimeInput.showPicker) exactTimeInput.focus();
  });
  slotChips.append(other);

  dayChosenList.replaceChildren();
  for (const slot of slots) {
    const item = document.createElement('li');
    const chip = document.createElement('span');
    chip.className = 'chosen-chip';
    chip.textContent = slot;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', `Remove ${slot}`);
    remove.addEventListener('click', () => {
      removeSlot(dateIso, slot);
      renderPopover();
      renderCalendar();
      renderSummary();
    });
    chip.append(remove);
    item.append(chip);
    dayChosenList.append(item);
  }
  showPopoverError('');
}

addExactButton.addEventListener('click', () => {
  if (!popoverDate) return;
  const value = exactTimeInput.value;
  if (!isValidTimeFormat(value)) {
    showPopoverError('Enter a time like 18:45.');
    return;
  }
  if (slotsFor(popoverDate).includes(value)) {
    showPopoverError('That time is already added.');
    return;
  }
  addSlot(popoverDate, value);
  exactTimeInput.value = '';
  renderPopover();
  renderCalendar();
  renderSummary();
});

addRangeButton.addEventListener('click', () => {
  if (!popoverDate) return;
  const slots = expandTimeRange(rangeStartInput.value, rangeEndInput.value);
  if (!slots) {
    showPopoverError('Use two valid times, e.g. 17:30 – 20:30.');
    return;
  }
  for (const slot of slots) addSlot(popoverDate, slot);
  rangeStartInput.value = '';
  rangeEndInput.value = '';
  renderPopover();
  renderCalendar();
  renderSummary();
});

clearDayButton.addEventListener('click', () => {
  if (!popoverDate) return;
  daySlots.delete(popoverDate);
  renderPopover();
  renderCalendar();
  renderSummary();
});

doneDayButton.addEventListener('click', closePopover);
popoverBackdrop.addEventListener('click', closePopover);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !popover.hidden) closePopover();
});
document.addEventListener('click', (event) => {
  if (popover.hidden) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('#day-popover') || target.closest('.cal-day')) return;
  closePopover();
}, true);

function renderSummary() {
  optionsList.replaceChildren();
  const entries = buildOptionsFromDays(
    [...daySlots.entries()].map(([date, times]) => ({ date, times }))
  );
  const { options } = normalizeOptions(entries);
  options.forEach((option) => {
    const item = document.createElement('li');
    item.className = 'option-chip';
    const text = document.createElement('span');
    text.textContent = formatOption(option);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.dataset.date = option.date;
    remove.dataset.time = option.time ?? '';
    remove.setAttribute('aria-label', `Remove ${text.textContent}`);
    remove.addEventListener('click', () => {
      removeSlot(option.date, option.time ?? '');
      renderCalendar();
      renderSummary();
    });
    item.append(text, remove);
    optionsList.append(item);
  });
}

calPrev.addEventListener('click', () => {
  const first = new Date(Date.UTC(viewYear, viewMonth - 1, 1));
  viewYear = first.getUTCFullYear();
  viewMonth = first.getUTCMonth();
  renderCalendar();
});

calNext.addEventListener('click', () => {
  const first = new Date(Date.UTC(viewYear, viewMonth + 1, 1));
  viewYear = first.getUTCFullYear();
  viewMonth = first.getUTCMonth();
  renderCalendar();
});

function copyShareLink() {
  const link = shareLink.textContent;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(link).catch(() => fallbackCopy(link));
    return;
  }
  fallbackCopy(link);
}

function fallbackCopy(value) {
  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  closePopover();
  const entries = buildOptionsFromDays(
    [...daySlots.entries()].map(([date, times]) => ({ date, times }))
  );
  const normalization = normalizeOptions(entries);
  const options = normalization.options;
  const errors = [
    ...normalization.errors,
    ...validatePollInput({
      title: titleInput.value,
      description: descriptionInput.value,
      options,
    }),
  ];
  if (!creationPasswordInput.value) errors.push('Please enter the creation password.');
  if (errors.length > 0) {
    showError(errors);
    return;
  }

  submitButton.disabled = true;
  showError('');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = generatePollId();
    try {
      const { error } = await client.from('polls').insert({
        id,
        title: titleInput.value.trim(),
        description: descriptionInput.value.trim() || null,
        options,
      }, {
        headers: { 'x-planahead-password': creationPasswordInput.value },
      });
      if (!error) {
        localStorage.setItem('planahead-creation-password', creationPasswordInput.value);
        const link = buildShareLink(id);
        shareLink.textContent = link;
        openPollLink.href = link;
        form.closest('.card').hidden = true;
        resultPanel.hidden = false;
        return;
      }
      const mappedError = mapCreationError(error.code ?? error.message);
      if (mappedError) {
        showError(mappedError);
        submitButton.disabled = false;
        return;
      }
      if (error.code !== '23505') {
        showError(error.message || 'Could not create poll.');
        submitButton.disabled = false;
        return;
      }
    } catch (error) {
      const mappedError = mapCreationError(error?.code ?? error?.message);
      if (mappedError) {
        showError(mappedError);
        submitButton.disabled = false;
        return;
      }
      if (error?.code === '23505') continue;
      showError(error?.message || 'Could not create poll.');
      submitButton.disabled = false;
      return;
    }
  }
  showError('Could not create a unique poll ID. Please try again.');
  submitButton.disabled = false;
});

copyLinkButton.addEventListener('click', copyShareLink);

const today = new Date();
viewYear = today.getFullYear();
viewMonth = today.getMonth();
renderCalendar();
renderSummary();

creationPasswordInput.value = localStorage.getItem('planahead-creation-password') ?? '';

if (!client) {
  setupNotice.hidden = false;
  submitButton.disabled = true;
}
