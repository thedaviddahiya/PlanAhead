import {
  buildOptionsFromDays,
  buildShareLink,
  generatePollId,
  getClient,
  getClientWithPassword,
  normalizeOptions,
  splitSelectionsFromDays,
  validatePollInput,
  validateResponseInput,
} from './app.js';
import { createCalendar } from './calendar.js';

const incomingPollId = new URLSearchParams(location.search).get('poll');
if (incomingPollId && /^[23456789a-hjkmnp-z]{8}$/.test(incomingPollId)) {
  location.replace(buildShareLink(incomingPollId));
}

const NAME_STORAGE_KEY = 'planahead-creator-name';

const titleInput = document.querySelector('#title');
const descriptionInput = document.querySelector('#description');
const creatorNameInput = document.querySelector('#creator-name');
const creationPasswordInput = document.querySelector('#create-password');
const form = document.querySelector('#create-form');
const errorBox = document.querySelector('#create-error');
const setupNotice = document.querySelector('#setup-notice');
const resultPanel = document.querySelector('#result-panel');
const shareLink = document.querySelector('#share-link');
const copyLinkButton = document.querySelector('#copy-link');
const openPollLink = document.querySelector('#open-poll');
const submitButton = form.querySelector('button[type="submit"]');

const client = getClient();
const stepSelect = document.querySelector('#create-step');
const rulerHints = document.querySelectorAll('.ruler-hint');

function updateRulerHint() {
  const text = Number(stepSelect.value) === 60
    ? 'Each block is one hour · marks run 09:00–21:00'
    : 'Each block is 30 minutes · marks run 09:00–21:00';
  for (const hint of rulerHints) hint.textContent = text;
}

function showError(messages) {
  errorBox.textContent = Array.isArray(messages) ? messages.join('\n') : messages;
}

const calendar = createCalendar({
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
});

updateRulerHint();
stepSelect.addEventListener('change', () => {
  calendar.setStep(Number(stepSelect.value));
  updateRulerHint();
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
  const entries = buildOptionsFromDays(
    [...calendar.daySlots.entries()].map(([date, times]) => ({ date, times }))
  );
  const normalization = normalizeOptions(entries);
  const options = normalization.options;
  const { indexes, extras } = splitSelectionsFromDays(options, calendar.daySlots);
  const errors = [
    ...normalization.errors,
    ...validatePollInput({
      title: titleInput.value,
      description: descriptionInput.value,
      options,
    }),
    ...validateResponseInput(creatorNameInput.value, indexes.length + extras.length),
  ];
  if (errors.length > 0) {
    showError(errors);
    return;
  }

  submitButton.disabled = true;
  showError('');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = generatePollId();
    try {
      const insertClient = getClientWithPassword(creationPasswordInput.value) ?? client;
      const { error } = await insertClient.from('polls').insert({
        id,
        title: titleInput.value.trim(),
        description: descriptionInput.value.trim() || null,
        options,
        step_minutes: Number(stepSelect.value) === 60 ? 60 : 30,
      });
      if (!error) {
        localStorage.setItem('planahead-creation-password', creationPasswordInput.value);
        localStorage.setItem(NAME_STORAGE_KEY, creatorNameInput.value.trim());
        const { error: responseError } = await client.from('responses').insert({
          poll_id: id,
          name: creatorNameInput.value.trim(),
          selected: indexes,
          extra: extras,
        });
        const link = buildShareLink(id);
        shareLink.textContent = link;
        openPollLink.href = link;
        form.closest('.card').hidden = true;
        resultPanel.hidden = false;
        if (responseError) {
          showError(`Your poll is live, but your own availability could not be saved: ${responseError.message}`);
        }
        return;
      }
      if (error.code !== '23505') {
        showError(error.message || 'Could not create poll.');
        submitButton.disabled = false;
        return;
      }
    } catch (error) {
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

const savedName = localStorage.getItem(NAME_STORAGE_KEY);
if (savedName) creatorNameInput.value = savedName;
const savedPassword = localStorage.getItem('planahead-creation-password');
if (savedPassword) creationPasswordInput.value = savedPassword;

creationPasswordInput.addEventListener('invalid', () => {
  showError(creationPasswordInput.validationMessage);
});

if (!client) {
  setupNotice.hidden = false;
  submitButton.disabled = true;
}
