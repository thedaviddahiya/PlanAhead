import {
  buildOptionsFromDays,
  buildShareLink,
  dayAvailabilityLabel,
  formatOption,
  generatePollId,
  getClient,
  getClientWithPassword,
  mapCreationError,
  normalizeOptions,
  validatePollInput,
} from './app.js';
import { createCalendar } from './calendar.js';

const incomingPollId = new URLSearchParams(location.search).get('poll');
if (incomingPollId && /^[23456789a-hjkmnp-z]{8}$/.test(incomingPollId)) {
  location.replace(buildShareLink(incomingPollId));
}

const titleInput = document.querySelector('#title');
const descriptionInput = document.querySelector('#description');
const creationPasswordInput = document.querySelector('#create-password');
const optionsList = document.querySelector('#options-list');
const form = document.querySelector('#create-form');
const errorBox = document.querySelector('#create-error');
const setupNotice = document.querySelector('#setup-notice');
const resultPanel = document.querySelector('#result-panel');
const shareLink = document.querySelector('#share-link');
const copyLinkButton = document.querySelector('#copy-link');
const openPollLink = document.querySelector('#open-poll');
const submitButton = form.querySelector('button[type="submit"]');
const client = getClient();

function showError(messages) {
  errorBox.textContent = Array.isArray(messages) ? messages.join('\n') : messages;
}

creationPasswordInput.addEventListener('invalid', () => {
  showError(creationPasswordInput.validationMessage);
});

function renderSummary() {
  optionsList.replaceChildren();
  const entries = buildOptionsFromDays(
    [...calendar.daySlots.entries()].map(([date, times]) => ({ date, times }))
  );
  const { options } = normalizeOptions(entries);
  options.forEach((option) => {
    const item = document.createElement('li');
    item.className = 'option-chip';
    const text = document.createElement('span');
    text.textContent = option.time === null
      ? `${formatOption(option)} · ${dayAvailabilityLabel(null)}`
      : formatOption(option);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.dataset.date = option.date;
    remove.dataset.time = option.time ?? '';
    remove.setAttribute('aria-label', `Remove ${text.textContent}`);
    remove.addEventListener('click', () => {
      const slots = calendar.daySlots.get(option.date) ?? [];
      const next = slots.filter((value) => value !== (option.time ?? ''));
      if (next.length === 0) calendar.daySlots.delete(option.date);
      else calendar.daySlots.set(option.date, next);
      calendar.renderCalendar();
      renderSummary();
    });
    item.append(text, remove);
    optionsList.append(item);
  });
}

const calendar = createCalendar({
  gridEl: document.querySelector('#cal-grid'),
  monthEl: document.querySelector('#cal-month'),
  prevEl: document.querySelector('#cal-prev'),
  nextEl: document.querySelector('#cal-next'),
  popoverEl: document.querySelector('#day-popover'),
  backdropEl: document.querySelector('#popover-backdrop'),
  popoverTitleEl: document.querySelector('#popover-title'),
  slotChipsEl: document.querySelector('#slot-chips'),
  exactInputEl: document.querySelector('#exact-time'),
  addExactEl: document.querySelector('#add-exact'),
  rangeStartEl: document.querySelector('#range-start'),
  rangeEndEl: document.querySelector('#range-end'),
  addRangeEl: document.querySelector('#add-range'),
  popoverErrorEl: document.querySelector('#popover-error'),
  chosenListEl: document.querySelector('#day-chosen'),
  clearEl: document.querySelector('#clear-day'),
  doneEl: document.querySelector('#done-day'),
});
calendar.onChange(renderSummary);

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
  calendar.closePopover();
  const entries = buildOptionsFromDays(
    [...calendar.daySlots.entries()].map(([date, times]) => ({ date, times }))
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
      const insertClient = getClientWithPassword(creationPasswordInput.value);
      const { error } = await insertClient.from('polls').insert({
        id,
        title: titleInput.value.trim(),
        description: descriptionInput.value.trim() || null,
        options,
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

renderSummary();

creationPasswordInput.value = localStorage.getItem('planahead-creation-password') ?? '';

if (!client) {
  setupNotice.hidden = false;
  submitButton.disabled = true;
}
