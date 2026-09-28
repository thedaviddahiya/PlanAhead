import {
  buildShareLink,
  generatePollId,
  getClient,
  normalizeOptions,
  validatePollInput,
} from './app.js';

const titleInput = document.querySelector('#title');
const descriptionInput = document.querySelector('#description');
const dateInput = document.querySelector('#date-input');
const timeInput = document.querySelector('#time-input');
const addOptionButton = document.querySelector('#add-option');
const optionsList = document.querySelector('#options-list');
const form = document.querySelector('#create-form');
const errorBox = document.querySelector('#create-error');
const setupNotice = document.querySelector('#setup-notice');
const resultPanel = document.querySelector('#result-panel');
const shareLink = document.querySelector('#share-link');
const copyLinkButton = document.querySelector('#copy-link');
const openPollLink = document.querySelector('#open-poll');
const submitButton = form.querySelector('button[type="submit"]');

const pendingOptions = [];
const client = getClient();

function showError(messages) {
  errorBox.textContent = Array.isArray(messages) ? messages.join('\n') : messages;
}

function renderOptions() {
  optionsList.replaceChildren();
  pendingOptions.forEach((option, index) => {
    const item = document.createElement('li');
    item.className = 'option-chip';
    const text = document.createElement('span');
    text.textContent = option.time ? `${option.date} · ${option.time}` : option.date;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${text.textContent}`);
    remove.addEventListener('click', () => {
      pendingOptions.splice(index, 1);
      renderOptions();
    });
    item.append(text, remove);
    optionsList.append(item);
  });
}

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

addOptionButton.addEventListener('click', () => {
  const { options, errors } = normalizeOptions([{
    date: dateInput.value,
    time: timeInput.value,
    label: null,
  }]);
  if (errors.length > 0 || options.length !== 1) {
    showError(errors.length > 0 ? errors : ['Invalid option.']);
    return;
  }

  pendingOptions.push(options[0]);
  showError('');
  renderOptions();
  timeInput.value = '';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const normalization = normalizeOptions(pendingOptions);
  const options = normalization.options;
  const errors = [
    ...normalization.errors,
    ...validatePollInput({
      title: titleInput.value,
      description: descriptionInput.value,
      options: pendingOptions,
    }),
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
      const { error } = await client.from('polls').insert({
        id,
        title: titleInput.value.trim(),
        description: descriptionInput.value.trim() || null,
        options,
      });
      if (!error) {
        const link = buildShareLink(id);
        shareLink.textContent = link;
        openPollLink.href = link;
        form.closest('.card').hidden = true;
        resultPanel.hidden = false;
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

if (!client) {
  setupNotice.hidden = false;
  submitButton.disabled = true;
}
