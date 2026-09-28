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

  return { rows, names, maxCount: rows.reduce((max, row) => Math.max(max, row.count), 0) };
}

export function buildShareLink(pollId) {
  return `${location.origin}${location.pathname}?poll=${pollId}`;
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
