import {
  expandTimeRange,
  formatOption,
  isValidTimeFormat,
} from './app.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DOW_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const FIXED_SLOTS = ['17:00', '18:00', '19:00', '20:00'];
const MAX_DOTS = 4;

export function createCalendar({
  gridEl,
  monthEl,
  prevEl,
  nextEl,
  popoverEl,
  backdropEl,
  popoverTitleEl,
  slotChipsEl,
  exactInputEl,
  addExactEl,
  rangeStartEl,
  rangeEndEl,
  addRangeEl,
  popoverErrorEl,
  chosenListEl,
  clearEl,
  doneEl,
  editorMode = 'full',
  slotsForDate,
}) {
  const daySlots = new Map();
  let viewYear;
  let viewMonth;
  let popoverDate = null;
  let popoverTrigger = null;
  const changeListeners = [];

  function notifyChange() {
    for (const listener of changeListeners) listener(daySlots);
  }

  function setError(message) {
    popoverErrorEl.textContent = message;
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
    monthEl.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
    gridEl.replaceChildren();
    for (const label of DOW_LABELS) {
      const dow = document.createElement('span');
      dow.className = 'cal-dow';
      dow.textContent = label;
      gridEl.append(dow);
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
      gridEl.append(dim);
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
      gridEl.append(cell);
    }

    for (let index = 1; index <= trailing; index += 1) {
      const dim = document.createElement('span');
      dim.className = 'cal-day dim';
      dim.textContent = String(index);
      gridEl.append(dim);
    }
  }

  function positionPopover(trigger) {
    const rect = trigger.getBoundingClientRect();
    const width = popoverEl.offsetWidth;
    const height = popoverEl.offsetHeight;
    const margin = 8;
    let left = Math.min(Math.max(rect.left, margin), window.innerWidth - width - margin);
    let top = rect.bottom + margin;
    if (top + height > window.innerHeight - margin) {
      top = Math.max(rect.top - height - margin, margin);
    }
    popoverEl.style.left = `${left}px`;
    popoverEl.style.top = `${top}px`;
  }

  function openPopover(dateIso, trigger) {
    popoverDate = dateIso;
    popoverTrigger = trigger;
    popoverEl.hidden = false;
    backdropEl.hidden = window.matchMedia('(min-width: 641px)').matches;
    positionPopover(trigger);
    popoverEl.focus({ preventScroll: true });
    renderPopover();
  }

  function closePopover() {
    const returning = popoverTrigger;
    popoverEl.hidden = true;
    backdropEl.hidden = true;
    popoverDate = null;
    popoverTrigger = null;
    returning?.focus({ preventScroll: true });
  }

  function renderPopover() {
    const dateIso = popoverDate;
    if (!dateIso) return;
    const slots = slotsFor(dateIso);
    popoverTitleEl.textContent = formatOption({ date: dateIso, time: null });
    slotChipsEl.replaceChildren();
    const offeredSlots = typeof slotsForDate === 'function'
      ? slotsForDate(dateIso)
      : FIXED_SLOTS;
    for (const slot of offeredSlots) {
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
        notifyChange();
      });
      slotChipsEl.append(chip);
    }
    if (editorMode !== 'offered-only') {
      const other = document.createElement('button');
      other.type = 'button';
      other.className = 'slot-chip other';
      other.textContent = 'Other…';
      other.addEventListener('click', () => {
        try {
          exactInputEl.showPicker();
        } catch {
          exactInputEl.focus();
        }
        if (!exactInputEl.showPicker) exactInputEl.focus();
      });
      slotChipsEl.append(other);
    }

    chosenListEl.replaceChildren();
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
        notifyChange();
      });
      chip.append(remove);
      item.append(chip);
      chosenListEl.append(item);
    }
    setError('');
  }

  if (editorMode === 'offered-only') {
    exactInputEl.closest('.custom-row').hidden = true;
    rangeStartEl.closest('.custom-row').hidden = true;
  }

  addExactEl.addEventListener('click', () => {
    if (!popoverDate) return;
    const value = exactInputEl.value;
    if (!isValidTimeFormat(value)) {
      setError('Enter a time like 18:45.');
      return;
    }
    if (slotsFor(popoverDate).includes(value)) {
      setError('That time is already added.');
      return;
    }
    addSlot(popoverDate, value);
    exactInputEl.value = '';
    renderPopover();
    renderCalendar();
    notifyChange();
  });

  addRangeEl.addEventListener('click', () => {
    if (!popoverDate) return;
    const slots = expandTimeRange(rangeStartEl.value, rangeEndEl.value);
    if (!slots) {
      setError('Use two valid times, e.g. 17:30 – 20:30.');
      return;
    }
    for (const slot of slots) addSlot(popoverDate, slot);
    rangeStartEl.value = '';
    rangeEndEl.value = '';
    renderPopover();
    renderCalendar();
    notifyChange();
  });

  clearEl.addEventListener('click', () => {
    if (!popoverDate) return;
    daySlots.delete(popoverDate);
    renderPopover();
    renderCalendar();
    notifyChange();
  });

  doneEl.addEventListener('click', closePopover);
  backdropEl.addEventListener('click', closePopover);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !popoverEl.hidden) closePopover();
  });
  document.addEventListener('click', (event) => {
    if (popoverEl.hidden) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#day-popover') || target.closest('.cal-day')) return;
    closePopover();
  }, true);

  prevEl.addEventListener('click', () => {
    const first = new Date(Date.UTC(viewYear, viewMonth - 1, 1));
    viewYear = first.getUTCFullYear();
    viewMonth = first.getUTCMonth();
    renderCalendar();
  });

  nextEl.addEventListener('click', () => {
    const first = new Date(Date.UTC(viewYear, viewMonth + 1, 1));
    viewYear = first.getUTCFullYear();
    viewMonth = first.getUTCMonth();
    renderCalendar();
  });

  const today = new Date();
  viewYear = today.getFullYear();
  viewMonth = today.getMonth();
  renderCalendar();

  return {
    daySlots,
    renderCalendar,
    openPopover,
    closePopover,
    setError,
    onChange(callback) {
      changeListeners.push(callback);
    },
  };
}
