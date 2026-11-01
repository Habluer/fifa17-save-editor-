const { definitions, bulkKeys, bulkEdit } = window.attributeTools;
const $ = id => document.getElementById(id);
// current é a leitura original; os inputs guardam o rascunho. pending só roda
// quando o usuário confirma o resumo. Nenhum botão de lote grava sozinho.
let current, pending;
let activeHelp, pinnedHelp;
function hideHelp() {
  if (activeHelp) {
    activeHelp.classList.remove('open');
    activeHelp.querySelector('button').setAttribute('aria-expanded','false');
  }
  activeHelp = null; pinnedHelp = null;
}
function positionHelp() {
  if (!activeHelp) return;
  const button = activeHelp.querySelector('button'), tip = activeHelp.querySelector('.tooltip');
  const anchor = button.getBoundingClientRect();
  const width = document.documentElement.clientWidth;
  const footer = document.querySelector('footer');
  const bottom = (footer.getClientRects().length ? Math.min(innerHeight,footer.getBoundingClientRect().top) : innerHeight) - 8;
  const top = 40;
  if (!button.getClientRects().length || anchor.bottom <= top || anchor.top >= bottom) { hideHelp(); return; }
  tip.style.maxWidth = `${width-16}px`;
  tip.style.maxHeight = `${Math.max(1,bottom-top)}px`;
  const size = tip.getBoundingClientRect();
  const below = anchor.bottom+8;
  const desiredTop = below+size.height <= bottom ? below : anchor.top-size.height-8;
  tip.style.top = `${Math.max(top,Math.min(desiredTop,bottom-size.height))}px`;
  tip.style.left = `${Math.max(8,Math.min(anchor.right-size.width,width-size.width-8))}px`;
}
function showHelp(help) {
  if (activeHelp !== help) { hideHelp(); activeHelp = help; }
  help.classList.add('open');
  help.querySelector('button').setAttribute('aria-expanded','true');
  positionHelp();
}
function connectHelp(help) {
  const button = help.querySelector('button');
  button.onclick = () => {
    if (pinnedHelp === help) hideHelp();
    else { showHelp(help); pinnedHelp = help; }
  };
  help.onmouseenter = () => showHelp(help);
  help.onmouseleave = () => { if (pinnedHelp !== help && !help.contains(document.activeElement)) hideHelp(); };
  help.onfocusin = () => showHelp(help);
  help.onfocusout = event => { if(pinnedHelp !== help && !help.contains(event.relatedTarget) && !help.matches(':hover')) hideHelp(); };
}
connectHelp($('folder-help'));
window.addEventListener('resize',positionHelp);
document.addEventListener('scroll',positionHelp,true);
document.addEventListener('pointerdown',event => { if(activeHelp && !activeHelp.contains(event.target)) hideHelp(); });
document.addEventListener('keydown',event => { if(event.key==='Escape' && activeHelp) { hideHelp(); event.preventDefault(); } });
const date = value => new Date(value).toLocaleString('pt-BR');
function say(message, details = '') {
  document.querySelector('.status-bar').hidden = !message && !details;
  $('status').textContent = message;
  $('status-details-text').textContent = details;
  $('show-status-details').hidden = !details;
}
$('show-status-details').onclick = () => { hideHelp(); $('status-details').showModal(); };
$('close-status-details').onclick = () => $('status-details').close();
function inputs() { return [...$('fields').querySelectorAll('input[data-key]')]; }
function draft() { return Object.fromEntries(inputs().map(input => [input.dataset.key, Number(input.value)])); }
function changes() { return current ? Object.entries(draft()).filter(([key,value]) => value !== current.values[key]) : []; }
function update() {
  const count = changes().length;
  $('changes-count').textContent = count ? `${count} alteração(ões) pendente(s)` : 'Sem alterações';
  for (const input of inputs()) input.closest('.field').classList.toggle('changed', Number(input.value) !== current.values[input.dataset.key]);
  $('selection-count').textContent = `${$('fields').querySelectorAll('input[data-select]:checked').length} selecionados`;
  $('save').disabled = !count;
}
function renderField([key,value]) {
  const [label, group, description] = definitions[key];
  const field = document.createElement('div'); field.className = 'field'; field.dataset.group = group;
  const heading = document.createElement('div'); heading.className = 'field-heading';
  if (bulkKeys.includes(key)) {
    const check = document.createElement('input'); check.type = 'checkbox'; check.dataset.select = key;
    check.setAttribute('aria-label', `Selecionar ${label}`); check.onchange = update; heading.append(check);
  }
  const text = document.createElement('label'); text.htmlFor = `field-${key}`; text.textContent = label;
  const help = document.createElement('span'); help.className = 'info';
  const button = document.createElement('button'); button.textContent = '?'; button.className = 'info-button'; button.setAttribute('aria-label', `Sobre ${label}`);
  const tooltip = document.createElement('span'); tooltip.className = 'tooltip'; tooltip.id = `help-${key}`; tooltip.setAttribute('role','tooltip'); tooltip.textContent = description;
  button.setAttribute('aria-describedby',tooltip.id); button.setAttribute('aria-expanded','false');
  help.append(button,tooltip); heading.append(text,help);
  connectHelp(help);
  const input = document.createElement('input'); input.type = 'number'; input.id = text.htmlFor; input.dataset.key = key;
  input.min = current.limits[key].min; input.max = current.limits[key].max; input.step = '1'; input.required = true; input.value = value;
  input.oninput = update; field.append(heading,input); return field;
}
function display(state) {
  hideHelp();
  current = state;
  $('save-name').textContent = state.saveName;
  $('player').textContent = `${state.playerName} · ID ${state.playerId}`;
  $('modified').textContent = `Salvo em ${date(state.modified)}`;
  $('file').textContent = state.filePath;
  $('fields').replaceChildren(...Object.entries(state.values).filter(([key]) => definitions[key]).map(renderField));
  $('editor').hidden = false; $('reload').disabled = false; $('backups').disabled = false;
  filterGroup(); update();
}
function review(title, description, rows, action) {
  hideHelp();
  $('review-title').textContent = title; $('review-description').textContent = description;
  $('review-list').replaceChildren(...rows.map(([label,value]) => {
    const row = document.createElement('div'); row.className = 'review-row';
    const name = document.createElement('span'); name.textContent = label;
    const result = document.createElement('strong'); result.textContent = value; row.append(name,result); return row;
  }));
  pending = action; $('review').showModal();
}
async function run(action) {
  const enabled = [...document.querySelectorAll('button:not(:disabled)')];
  enabled.forEach(button => { button.disabled = true; });
  try { await action(); } catch (error) { say(error.message); }
  finally { enabled.forEach(button => { button.disabled = false; }); if (current) update(); }
}
function discardThen(action) {
  if (changes().length) review('Descartar alterações?', 'Os valores ainda não aplicados serão descartados.', [], () => run(action));
  else run(action);
}
$('confirm-review').onclick = () => { const action = pending; pending = null; $('review').close(); if (action) action(); };
$('cancel-review').onclick = () => { pending = null; $('review').close(); };
$('review').addEventListener('cancel', () => { pending = null; });
$('open').onclick = () => discardThen(async () => { const state = await window.fifaEditor.selectSave(); if (state) { display(state); say(''); } });
$('reload').onclick = () => discardThen(async () => { display(await window.fifaEditor.reloadSave()); say('Valores recarregados do arquivo.'); });
$('reset').onclick = () => { display(current); say('Alterações pendentes revertidas aos valores carregados.'); };

async function pick(backups) {
  hideHelp();
  $('picker-title').textContent = backups ? 'Restaurar backup' : 'Minhas carreiras';
  const entries = backups ? await window.fifaEditor.listBackups() : await window.fifaEditor.listSaves();
  if (entries === null) return;
  $('change-folder').hidden = backups;
  const nodes = entries.map(entry => {
    const button = document.createElement('button'); button.className = 'picker-item';
    const title = document.createElement('strong'); title.textContent = entry.saveName;
    const detail = document.createElement('small'); detail.textContent = `${entry.playerName} · ${entry.values.height || '?'} cm · ${date(entry.modified)}`;
    const filename = document.createElement('small'); filename.textContent = (entry.backupPath || entry.filePath).split(/[\\/]/).pop();
    button.append(title,detail,filename);
    button.onclick = () => {
      $('picker').close();
      if (backups) {
        review('Restaurar este backup?', 'O estado atual será preservado em um novo backup. Feche o FIFA antes de confirmar.', [['Save',entry.saveName],['Jogador',entry.playerName],['Altura',`${entry.values.height} cm`]], () => run(async () => {
          const result = await window.fifaEditor.restoreBackup(entry.key); display(result.state);
          say('Backup restaurado. Estado anterior preservado.', `Backup do estado anterior:\n${result.backup}`);
        }));
      } else discardThen(async () => { display(await window.fifaEditor.loadSave(entry.key)); say(''); });
    }; return button;
  });
  if (!nodes.length) { const message = document.createElement('p'); message.textContent = backups ? 'Nenhum backup válido para este arquivo.' : 'Nenhuma carreira válida nesta pasta. Use Trocar pasta ou Abrir arquivo.'; nodes.push(message); }
  $('picker-list').replaceChildren(...nodes); $('picker').showModal();
}
$('browse').onclick = () => run(() => pick(false));
$('change-folder').onclick = () => run(async () => { if (await window.fifaEditor.selectSaveFolder()) await pick(false); });
$('backups').onclick = () => discardThen(() => pick(true));
$('close-picker').onclick = () => $('picker').close();
function filterGroup() { for (const field of $('fields').children) field.hidden = Boolean($('group').value && field.dataset.group !== $('group').value); positionHelp(); }
$('group').onchange = filterGroup;
$('select-group').onclick = () => { for (const check of $('fields').querySelectorAll('input[data-select]')) check.checked = !$('group').value || definitions[check.dataset.select][1] === $('group').value; update(); };
$('clear-selection').onclick = () => { for (const check of $('fields').querySelectorAll('input[data-select]')) check.checked = false; update(); };
function bulk(operation, all = false) {
  try {
    const keys = all ? bulkKeys : [...$('fields').querySelectorAll('input[data-select]:checked')].map(input => input.dataset.select);
    if (!keys.length) return say('Selecione pelo menos um atributo.');
    const values = bulkEdit(draft(),keys,operation,Number($('bulk-value').value));
    for (const input of inputs()) input.value = values[input.dataset.key];
    update(); say('Campos preenchidos. Revise e aplique quando desejar gravar.');
  } catch (error) { say(error.message); }
}
$('set-selected').onclick = () => bulk('set'); $('add-selected').onclick = () => bulk('add');
$('max-selected').onclick = () => bulk('max'); $('max-all').onclick = () => bulk('max',true);
$('save').onclick = () => {
  if (!current || inputs().find(input => !input.reportValidity())) return;
  const changed = changes(); if (!changed.length) return;
  const values = Object.fromEntries(changed);
  review('Aplicar alterações?', 'Um backup será criado antes de gravar. Feche o FIFA para confirmar.', changed.map(([key,value]) => [definitions[key][0],`${current.values[key]} → ${value}`]), () => run(async () => {
    const result = await window.fifaEditor.saveChanges({ values }); display(result.state);
    say(`Aplicado. No FIFA, procure: ${result.saveName}.`, `Backup criado:\n${result.backup}`);
  }));
};
window.addEventListener('beforeunload', event => { if (changes().length) { event.preventDefault(); event.returnValue = ''; } });
