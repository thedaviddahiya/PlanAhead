import {
  formatOption,
  isRulerSlot,
  rulerSlots,
  normalizeStep,
} from './app.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DOW_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function createCalendar({
  gridEl,
  monthEl,
  prevEl,
  nextEl,
  rulerPanelEl,
  rulerTitleEl,
  allDayEl,
  rulerBlocksEl,
  rulerExtrasEl,
  clearEl,
  editorMode = 'full',
  slotsForDate,
  peopleForSlot,
  stepMinutes = 30,
}) {
  const daySlots = new Map();
  let viewYear;
  let viewMonth;
  let selectedDate = null;
  let dragging = false;
  let dragState = false;
  let suppressNextClick = false;
  const changeListeners = [];

  function notifyChange() {
    for (const listener of changeListeners) listener(daySlots);
  }

  function isoOf(day) {
    return `${String(day.getUTCFullYear()).padStart(4, '0')}-${
      String(day.getUTCMonth() + 1).padStart(2, '0')}-${
      String(day.getUTCDate()).padStart(2, '0')}`;
  }

  function slotsFor(dateIso) {
    return daySlots.get(dateIso) ?? [];
  }

  function setSlots(dateIso, times) {
    if (times.length === 0) daySlots.set(dateIso, []);
    else daySlots.set(dateIso, [...new Set(times)].sort());
  }

  function offeredFor(dateIso) {
    const offered = typeof slotsForDate === 'function'
      ? slotsForDate(dateIso)
      : { times: [], dayOnly: false };
    return {
      times: (offered?.times ?? []).filter((time) => isRulerSlot(time, stepMinutes)),
      extras: (offered?.times ?? []).filter((time) => !isRulerSlot(time, stepMinutes)).sort(),
      dayOnly: Boolean(offered?.dayOnly),
    };
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
      const hasDay = daySlots.has(dateIso);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cal-day';
      cell.dataset.date = dateIso;
      if (hasDay) cell.classList.add('filled');
      if (dateIso === selectedDate) cell.classList.add('selected');
      cell.textContent = String(day);
      cell.setAttribute('aria-label',
        `Set times for ${MONTH_NAMES[viewMonth]} ${day}` +
        (slots.length > 0 ? ` (${slots.length} chosen)` : (hasDay ? ' (day only)' : '')));
      cell.addEventListener('click', () => selectDay(dateIso));
      gridEl.append(cell);
    }

    for (let index = 1; index <= trailing; index += 1) {
      const dim = document.createElement('span');
      dim.className = 'cal-day dim';
      dim.textContent = String(index);
      gridEl.append(dim);
    }
  }

  function selectDay(dateIso) {
    selectedDate = dateIso;
    let changed = false;
    const hadDay = daySlots.has(dateIso);
    if (hadDay) {
      daySlots.delete(dateIso);
      changed = true;
    } else if (editorMode === 'full') {
      setSlots(dateIso, []);
      changed = true;
    } else {
      const offered = offeredFor(dateIso);
      if (offered.times.length > 0) {
        setSlots(dateIso, offered.times);
        changed = true;
      } else if (offered.dayOnly) {
        setSlots(dateIso, []);
        changed = true;
      }
    }
    if (changed) {
      renderCalendar();
      notifyChange();
    }
    for (const cell of gridEl.querySelectorAll('.cal-day.selected')) {
      cell.classList.remove('selected');
    }
    const active = gridEl.querySelector(`.cal-day[data-date="${dateIso}"]`);
    active?.classList.add('selected');
    renderRuler();
  }

  function dotsFor(dateIso, time) {
    if (typeof peopleForSlot !== 'function') return null;
    const colors = peopleForSlot(dateIso, time);
    if (!Array.isArray(colors) || colors.length === 0) return null;
    const wrap = document.createElement('span');
    wrap.className = 'block-dots';
    for (const color of colors) {
      const dot = document.createElement('span');
      dot.className = 'block-dot';
      dot.style.backgroundColor = color;
      wrap.append(dot);
    }
    return wrap;
  }

  function renderRuler() {
    if (!selectedDate) {
      rulerTitleEl.textContent = 'Select a day to set its times';
      allDayEl.parentElement.hidden = true;
      rulerBlocksEl.replaceChildren();
      rulerExtrasEl.hidden = true;
      clearEl.hidden = true;
      return;
    }
    const slots = slotsFor(selectedDate);
    const offered = offeredFor(selectedDate);
    rulerTitleEl.textContent = formatOption({ date: selectedDate, time: null });
    clearEl.hidden = false;
    allDayEl.parentElement.hidden = editorMode === 'offered-only' && !offered.dayOnly;
    const isDayOnly = daySlots.has(selectedDate) && slots.length === 0;
    allDayEl.classList.toggle('on', isDayOnly);
    allDayEl.setAttribute('aria-pressed', String(isDayOnly));
    allDayEl.disabled = editorMode === 'offered-only' && !offered.dayOnly;
    allDayEl.querySelector('.block-dots')?.remove();
    const allDayDots = dotsFor(selectedDate, null);
    if (allDayDots) allDayEl.append(allDayDots);

    rulerBlocksEl.replaceChildren();
    for (const slot of rulerSlots(stepMinutes)) {
      const block = document.createElement('button');
      block.type = 'button';
      block.className = 'ruler-block';
      const available = editorMode !== 'offered-only' || offered.times.includes(slot);
      if (!available) {
        block.classList.add('off');
        block.disabled = true;
      }
      const on = slots.includes(slot);
      block.classList.toggle('on', on);
      block.setAttribute('aria-pressed', String(on));
      block.setAttribute('aria-label', slot);
      block.dataset.time = slot;
      const dots = dotsFor(selectedDate, slot);
      if (dots) block.append(dots);
      const label = document.createElement('span');
      label.className = 'block-label';
      label.textContent = slot;
      block.append(label);
      rulerBlocksEl.append(block);
    }

    rulerExtrasEl.hidden = offered.extras.length === 0;
    if (!rulerExtrasEl.hidden) {
      rulerExtrasEl.replaceChildren();
      for (const slot of offered.extras) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'slot-chip';
        chip.classList.toggle('on', slots.includes(slot));
        chip.setAttribute('aria-pressed', String(slots.includes(slot)));
        chip.textContent = slot;
        chip.dataset.time = slot;
        chip.dataset.extra = '1';
        const dots = dotsFor(selectedDate, slot);
        if (dots) chip.append(dots);
        rulerExtrasEl.append(chip);
      }
    }
  }

  function toggleBlock(target) {
    if (!selectedDate) return;
    const time = target.dataset.time;
    if (!time) return;
    const slots = slotsFor(selectedDate);
    const turningOn = !slots.includes(time);
    const nextSlots = turningOn
      ? [...slots, time]
      : slots.filter((value) => value !== time);
    setSlots(selectedDate, nextSlots);
    renderRuler();
    renderCalendar();
    notifyChange();
  }

  function toggleAllDay() {
    if (!selectedDate) return;
    if (allDayEl.disabled) return;
    if (daySlots.has(selectedDate) && slotsFor(selectedDate).length === 0) {
      daySlots.delete(selectedDate);
    } else {
      setSlots(selectedDate, []);
    }
    renderRuler();
    renderCalendar();
    notifyChange();
  }

  function dragApply(target) {
    const time = target.dataset.time;
    if (!time || target.disabled) return;
    const slots = slotsFor(selectedDate);
    const shouldTurnOn = dragState && !slots.includes(time);
    const shouldTurnOff = !dragState && slots.includes(time);
    if (!shouldTurnOn && !shouldTurnOff) return;
    setSlots(selectedDate, shouldTurnOn
      ? [...slots, time]
      : slots.filter((value) => value !== time));
  }

  function isRulerPiece(target) {
    return target instanceof Element
      && (target.closest('.ruler-block') || target.closest('#ruler-extras .slot-chip'));
  }

  rulerBlocksEl.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!isRulerPiece(target)) return;
    const block = target.closest('.ruler-block');
    if (!block || block.disabled) return;
    dragging = true;
    suppressNextClick = true;
    dragState = !slotsFor(selectedDate).includes(block.dataset.time);
    dragApply(block);
  });

  rulerBlocksEl.addEventListener('pointerover', (event) => {
    if (!dragging) return;
    const block = event.target instanceof Element
      ? event.target.closest('.ruler-block')
      : null;
    if (!block || block.disabled) return;
    dragApply(block);
    renderRuler();
    renderCalendar();
  });

  rulerBlocksEl.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    renderRuler();
    renderCalendar();
    notifyChange();
  });

  rulerBlocksEl.addEventListener('click', (event) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    const block = event.target instanceof Element
      ? event.target.closest('.ruler-block')
      : null;
    if (!block || block.disabled) return;
    toggleBlock(block);
  });

  for (const eventName of ['pointerdown', 'pointerover', 'pointerup', 'click']) {
    rulerExtrasEl.addEventListener(eventName, (event) => {
      const chip = event.target instanceof Element
        ? event.target.closest('.slot-chip')
        : null;
      if (!chip) return;
      event.preventDefault();
      toggleBlock(chip);
    });
  }

  allDayEl.addEventListener('click', toggleAllDay);

  clearEl.addEventListener('click', () => {
    if (!selectedDate) return;
    daySlots.delete(selectedDate);
    renderRuler();
    renderCalendar();
    notifyChange();
  });

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
  renderRuler();

  return {
    daySlots,
    renderCalendar,
    renderRuler,
    selectDay,
    setStep(nextStep) {
      stepMinutes = normalizeStep(nextStep);
      renderCalendar();
      renderRuler();
    },
    onChange(callback) {
      changeListeners.push(callback);
    },
  };
}
