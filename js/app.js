const ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let client;

export function generatePollId(length = 8) {
  let id = '';
  for (let index = 0; index < length; index += 1) {
    id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  }
  return id;
}

export function isValidDateFormat(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function isValidTimeFormat(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function normalizeOptions(rawList) {
  const options = [];
  const errors = [];
  const seen = new Set();

  for (const raw of Array.isArray(rawList) ? rawList : []) {
    const date = typeof raw?.date === 'string' ? raw.date.trim() : '';
    const timeValue = typeof raw?.time === 'string' ? raw.time.trim() : '';
    const time = timeValue || null;
    const labelValue = typeof raw?.label === 'string' ? raw.label.trim() : '';
    if (!isValidDateFormat(date) || (time !== null && !isValidTimeFormat(time))) {
      errors.push('Invalid option.');
      continue;
    }
    const key = `${date}|${time ?? ''}`;
    if (seen.has(key)) {
      errors.push('Duplicate option.');
      continue;
    }
    seen.add(key);
    options.push({ date, time, label: labelValue || null });
  }

  return { options, errors };
}

export function findDuplicateKeys(options) {
  const counts = new Map();
  for (const option of Array.isArray(options) ? options : []) {
    const key = `${option?.date ?? ''}|${option?.time ?? ''}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key);
}

export function validatePollInput({ title, description, options } = {}) {
  const errors = [];
  if (typeof title !== 'string' || !title.trim() || title.length > 200) {
    errors.push('Please enter a title.');
  }
  if (typeof description === 'string' && description.length > 2000) {
    errors.push('Description is too long.');
  }
  if (!Array.isArray(options) || options.length === 0) errors.push('Add at least one option.');
  if (findDuplicateKeys(options).length > 0) errors.push('Remove duplicate options.');
  return errors;
}

export function validateResponseInput(name, selectedCount) {
  const errors = [];
  if (typeof name !== 'string' || !name.trim() || name.length > 80) {
    errors.push('Please enter your name.');
  }
  if (selectedCount === 0) errors.push('Select at least one option.');
  return errors;
}

export function formatOption(option) {
  const dateValue = option?.date;
  const timeValue = option?.time;
  let dateText = '';
  if (isValidDateFormat(dateValue)) {
    const [year, month, day] = dateValue.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    dateText = `${WEEKDAYS[date.getUTCDay()]}, ${day} ${MONTHS[month - 1]} ${year}`;
  } else if (typeof dateValue === 'string' && dateValue.trim()) {
    dateText = dateValue;
  }
  const timeText = isValidTimeFormat(timeValue) ? timeValue : '';
  if (dateText && timeText) return `${dateText} · ${timeText}`;
  if (dateText) return dateText;
  if (timeText) return timeText;
  if (!dateText && typeof option?.label === 'string' && option.label.trim()) return option.label.trim();
  return 'Option';
}

export function buildViewModel(options, responses) {
  const optionList = Array.isArray(options) ? options : [];
  const responseList = Array.isArray(responses) ? responses : [];
  const rows = optionList.map((option, index) => ({
    option: formatOption(option),
    raw: option,
    index,
    count: 0,
    voters: [],
  }));
  const orderedResponses = responseList
    .map((response, sourceIndex) => ({ response, sourceIndex }))
    .sort((a, b) => {
      const left = a.response?.created_at == null ? '' : String(a.response.created_at);
      const right = b.response?.created_at == null ? '' : String(b.response.created_at);
      return left.localeCompare(right) || a.sourceIndex - b.sourceIndex;
    })
    .map(({ response }) => response);
  const names = orderedResponses.map((response) => String(response?.name ?? ''));

  for (const [responseIndex, response] of orderedResponses.entries()) {
    if (!Array.isArray(response?.selected)) continue;
    for (const selected of new Set(response.selected)) {
      if (!Number.isInteger(selected) || selected < 0 || selected >= rows.length) continue;
      rows[selected].count += 1;
      rows[selected].voters.push(names[responseIndex]);
    }
  }

  const extraByDay = new Map();
  for (const response of orderedResponses) {
    const name = String(response?.name ?? '');
    for (const extraDay of Array.isArray(response?.extra) ? response.extra : []) {
      const date = extraDay?.date;
      if (typeof date !== 'string') continue;
      if (!extraByDay.has(date)) extraByDay.set(date, { names: [] });
      const day = extraByDay.get(date);
      if (!day.names.includes(name)) day.names.push(name);
    }
  }

  return { rows, names, extraByDay, maxCount: rows.reduce((max, row) => Math.max(max, row.count), 0) };
}

export function buildShareLink(pollId) {
  return new URL(`poll.html?poll=${encodeURIComponent(pollId)}`, location.href).href;
}

const RULER_START = 9 * 60;
const RULER_END = 21 * 60;

export function normalizeStep(stepMinutes) {
  return [30, 60].includes(stepMinutes) ? stepMinutes : 30;
}

export function rulerSlots(stepMinutes) {
  const step = normalizeStep(stepMinutes);
  const slots = [];
  for (let minutes = RULER_START; minutes < RULER_END; minutes += step) {
    const hours = Math.floor(minutes / 60);
    slots.push(`${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
  }
  return slots;
}

export function isRulerSlot(value, stepMinutes) {
  if (!isValidTimeFormat(value)) return false;
  const [hours, minutes] = value.split(':').map(Number);
  const total = hours * 60 + minutes;
  const step = normalizeStep(stepMinutes);
  return total >= RULER_START && total < RULER_END && minutes % step === 0;
}

export function legacyExtraTimes(options) {
  const extras = new Set();
  for (const option of Array.isArray(options) ? options : []) {
    const time = option?.time;
    if (time !== null && time !== undefined && !isRulerSlot(time)) extras.add(String(time));
  }
  return [...extras].sort();
}

export function offeredTimes(options) {
  const offered = new Set();
  for (const option of Array.isArray(options) ? options : []) {
    if (isRulerSlot(option?.time)) offered.add(option.time);
  }
  return rulerSlots().filter((slot) => offered.has(slot));
}

export const DAY_ONLY_SLOT = '09:00–17:00';

export function splitSelectionsFromDays(options, daySlots) {
  const optionList = Array.isArray(options) ? options : [];
  const indexes = [];
  const extras = new Map();
  const slots = daySlots instanceof Map ? daySlots : new Map();
  for (const [date, times] of slots) {
    const isDayOnly = Array.isArray(times) && times.length === 0;
    for (const slot of isDayOnly ? [null] : times) {
      const index = optionList.findIndex((option) => option?.date === date
        && (option.time === null || option.time === undefined
          ? isDayOnly
          : !isDayOnly && option.time === slot));
      if (index >= 0) {
        if (!indexes.includes(index)) indexes.push(index);
      } else if (!extras.has(date)) {
        extras.set(date, isDayOnly ? [] : [slot]);
      } else if (!isDayOnly && !extras.get(date).includes(slot)) {
        extras.get(date).push(slot);
      }
    }
  }
  return {
    indexes: indexes.sort((a, b) => a - b),
    extras: [...extras.entries()].map(([date, times]) => ({ date, times: [...times].sort() })),
  };
}

export function buildOptionsFromDays(days) {
  const entries = [];
  for (const day of Array.isArray(days) ? days : []) {
    const date = typeof day?.date === 'string' ? day.date : '';
    const times = day?.times;
    if (!Array.isArray(times)) continue;
    if (times.length === 0) {
      entries.push({ date, time: null, label: null });
      continue;
    }
    for (const time of times) {
      entries.push({ date, time, label: null });
    }
  }
  return entries.sort((a, b) =>
    a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time)));
}

export function buildHeatmap(model) {
  const rows = Array.isArray(model?.rows) ? model.rows : [];
  const times = [];
  const timeKeys = new Set();
  for (const row of rows) {
    const time = row?.raw?.time ?? null;
    const key = time ?? '';
    if (!timeKeys.has(key)) {
      timeKeys.add(key);
      times.push(time);
    }
  }
  const columns = [];
  const dates = new Map();
  for (const row of rows) {
    const date = row?.raw?.date ?? '';
    if (!dates.has(date)) {
      const column = { date, cells: times.map(() => null) };
      dates.set(date, column);
      columns.push(column);
    }
  }
  for (const row of rows) {
    const date = row?.raw?.date ?? '';
    const time = row?.raw?.time ?? null;
    const cellIndex = times.findIndex((value) => (value ?? '') === (time ?? ''));
    if (cellIndex === -1) continue;
    dates.get(date).cells[cellIndex] = { count: row.count, voters: [...row.voters], best: false };
  }
  const maxCount = model?.maxCount ?? 0;
  for (const column of columns) {
    for (const cell of column.cells) {
      if (cell && maxCount > 0 && cell.count === maxCount) cell.best = true;
    }
  }
  return { times, columns, maxCount };
}

export const PERSON_COLORS = [
  '#96700f', '#3a6b35', '#5a4a8a', '#8a3038',
  '#b46f2a', '#5f7f6a', '#9b5d75', '#6f6b3f',
];

export function assignTileColors(names) {
  const colors = new Map();
  for (const name of names) {
    if (colors.has(name)) continue;
    colors.set(name, PERSON_COLORS[colors.size % PERSON_COLORS.length]);
  }
  return colors;
}

export function dayAvailabilityLabel(time) {
  return isValidTimeFormat(time) ? time : '09:00–17:00';
}

export function buildAvailabilityByDay(rows, extraByDay) {
  const byDay = new Map();
  const seenByDay = new Map();
  const ensureDay = (date) => {
    if (typeof date !== 'string' || byDay.has(date)) return;
    byDay.set(date, { names: [] });
    seenByDay.set(date, new Set());
  };
  for (const row of Array.isArray(rows) ? rows : []) {
    ensureDay(row?.raw?.date);
  }
  const push = (date, name) => {
    if (typeof date !== 'string') return;
    ensureDay(date);
    const seen = seenByDay.get(date);
    if (!name || seen.has(name)) return;
    seen.add(name);
    byDay.get(date).names.push(name);
  };
  for (const row of Array.isArray(rows) ? rows : []) {
    for (const name of Array.isArray(row?.voters) ? row.voters : []) {
      push(row?.raw?.date, name);
    }
  }
  if (extraByDay instanceof Map) {
    for (const [date, day] of extraByDay) {
      for (const name of Array.isArray(day?.names) ? day.names : []) {
        push(date, name);
      }
    }
  }
  return byDay;
}

export function mapCreationError(codeOrMessage) {
  const value = String(codeOrMessage ?? '');
  if (value === '42501' || value.includes('new row violates row-level security policy')) {
    return 'That password was not accepted.';
  }
  return null;
}

export function getClient() {
  if (client !== undefined) return client;
  const root = globalThis.window ?? globalThis;
  const config = root.PLANAHEAD_CONFIG;
  const url = config?.supabaseUrl;
  const key = config?.supabaseAnonKey;
  if (!url || !key || url === '<URL>' || key === '<KEY>') {
    return null;
  }
  const supabase = root.supabase;
  if (!supabase || typeof supabase.createClient !== 'function') {
    return null;
  }
  client = supabase.createClient(url, key);
  return client;
}

export function getClientWithPassword(password) {
  if (typeof password !== 'string' || !password) return null;
  const root = globalThis.window ?? globalThis;
  const config = root.PLANAHEAD_CONFIG;
  const url = config?.supabaseUrl;
  const key = config?.supabaseAnonKey;
  if (!url || !key || url === '<URL>' || key === '<KEY>') {
    return null;
  }
  const supabase = root.supabase;
  if (!supabase || typeof supabase.createClient !== 'function') {
    return null;
  }
  return supabase.createClient(url, key, {
    global: { headers: { 'x-planahead-password': password } },
  });
}

export function buildOptionNamesBySlot(rows) {
  const byDate = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = typeof row?.raw?.date === 'string' ? row.raw.date : null;
    if (!date) continue;
    const timeKey = row?.raw?.time ?? '';
    if (!byDate.has(date)) byDate.set(date, new Map());
    const bySlot = byDate.get(date);
    if (!bySlot.has(timeKey)) bySlot.set(timeKey, new Set());
    for (const name of Array.isArray(row?.voters) ? row.voters : []) {
      if (name) bySlot.get(timeKey).add(String(name));
    }
  }
  return byDate;
}

export function buildExtraNamesBySlot(responses) {
  const byDate = new Map();
  for (const response of Array.isArray(responses) ? responses : []) {
    if (!Array.isArray(response?.extra)) continue;
    for (const entry of response.extra) {
      const date = typeof entry?.date === 'string' ? entry.date : null;
      if (!date || !Array.isArray(entry.times)) continue;
      if (!byDate.has(date)) byDate.set(date, new Map());
      const bySlot = byDate.get(date);
      const times = entry.times.length === 0 ? [''] : entry.times;
      for (const time of times) {
        if (!bySlot.has(time)) bySlot.set(time, new Set());
        if (response?.name) bySlot.get(time).add(String(response.name));
      }
    }
  }
  return byDate;
}

export function buildSlotCandidates(rows, extraNamesBySlot) {
  const candidates = [];
  const seen = new Set();
  const add = (date, time) => {
    const key = `${date}|${time ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ date, time });
  };
  for (const row of Array.isArray(rows) ? rows : []) {
    if (typeof row?.raw?.date === 'string') add(row.raw.date, row.raw?.time ?? null);
  }
  const extras = extraNamesBySlot instanceof Map ? extraNamesBySlot : new Map();
  for (const [date, slots] of extras) {
    if (typeof date !== 'string' || !(slots instanceof Map)) continue;
    for (const timeKey of slots.keys()) {
      add(date, timeKey === '' ? null : timeKey);
    }
  }
  return candidates;
}

export function rankBestSlots(candidates, namesForSlot, respondentCount) {
  const ranked = (Array.isArray(candidates) ? candidates : [])
    .filter((slot) => typeof slot?.date === 'string')
    .map((slot) => {
      const names = namesForSlot?.(slot.date, slot.time) ?? [];
      return { ...slot, count: Array.isArray(names) ? names.length : 0, names: Array.isArray(names) ? [...names] : [] };
    })
    .filter((slot) => slot.count > 0)
    .sort((a, b) => b.count - a.count
      || a.date.localeCompare(b.date)
      || String(a.time ?? '').localeCompare(String(b.time ?? '')));
  return ranked.map((slot) => ({
    ...slot,
    everyone: respondentCount > 0 && slot.count === respondentCount,
  }));
}

export function normalizeName(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export function findOwnResponse(responses, name) {
  const query = normalizeName(name).toLowerCase();
  if (query.length === 0 || !Array.isArray(responses)) return null;
  let match = null;
  for (const row of responses) {
    if (typeof row?.name !== 'string') continue;
    if (normalizeName(row.name).toLowerCase() === query) match = row;
  }
  return match;
}

export function restoreDaySlots(options, response) {
  if (!response || typeof response !== 'object' || !Array.isArray(options)) return null;
  const daySlots = new Map();
  const addTime = (date, time) => {
    const slot = typeof date === 'string' && date.length > 0 ? date : null;
    if (!slot) return;
    if (!daySlots.has(slot)) daySlots.set(slot, []);
    if (typeof time === 'string' && time.length > 0 && !daySlots.get(slot).includes(time)) {
      daySlots.get(slot).push(time);
    }
  };
  for (const index of Array.isArray(response.selected) ? response.selected : []) {
    const option = options[index];
    if (option && typeof option.date === 'string' && isValidDateFormat(option.date)) {
      addTime(option.date, option.time);
    }
  }
  for (const extra of Array.isArray(response.extra) ? response.extra : []) {
    if (!extra || typeof extra.date !== 'string' || !isValidDateFormat(extra.date)) continue;
    if (!Array.isArray(extra.times)) continue;
    const slot = extra.date;
    if (!daySlots.has(slot)) daySlots.set(slot, []);
    for (const time of extra.times) {
      if (typeof time === 'string' && time.length > 0 && !daySlots.get(slot).includes(time)) {
        daySlots.get(slot).push(time);
      }
    }
  }
  for (const times of daySlots.values()) times.sort();
  return daySlots;
}
