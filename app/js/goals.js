// Goal checklist: written before boarding, locked at takeoff, checked off in
// flight or on arrival. A journey succeeds when every goal is done.

import { MAX_GOALS } from './store.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function goalsDone(todos) {
  return todos.filter((t) => t.done).length;
}

export function allGoalsDone(todos) {
  return todos.length > 0 && todos.every((t) => t.done);
}

/**
 * Editable list rendered into `root`. Enter adds a row, Backspace on an empty
 * row removes it. `onChange(todos)` gets the non-empty goals after each edit.
 */
export function goalEditor(root, todos, onChange) {
  let rows = todos.length ? todos.map((t) => t.text) : [''];
  const collect = () => rows.map((t) => t.trim()).filter(Boolean).map((text) => ({ text, done: false }));

  const render = (focusIndex = null) => {
    root.innerHTML = `
      <ol class="goal-edit">${rows.map((text, i) => `<li>
        <input type="text" maxlength="60" value="${esc(text)}" data-i="${i}" placeholder="${i === 0 ? '例如：读完第 3 章并做笔记' : '下一个目标'}">
        ${rows.length > 1 ? `<button type="button" class="icon-btn" data-del="${i}" aria-label="删除这一项">✕</button>` : ''}
      </li>`).join('')}</ol>
      ${rows.length < MAX_GOALS ? '<button type="button" class="btn small ghost" data-add>＋ 添加目标</button>' : `<span class="dim small">最多 ${MAX_GOALS} 项</span>`}`;
    root.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', () => {
        rows[+input.dataset.i] = input.value;
        onChange(collect());
      });
      input.addEventListener('keydown', (e) => {
        const i = +input.dataset.i;
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          if (rows.length < MAX_GOALS) {
            rows.splice(i + 1, 0, '');
            render(i + 1);
          }
        } else if (e.key === 'Backspace' && input.value === '' && rows.length > 1) {
          e.preventDefault();
          rows.splice(i, 1);
          render(Math.max(0, i - 1));
          onChange(collect());
        }
      });
    });
    root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      rows.splice(+b.dataset.del, 1);
      render();
      onChange(collect());
    }));
    root.querySelector('[data-add]')?.addEventListener('click', () => {
      rows.push('');
      render(rows.length - 1);
    });
    if (focusIndex != null) root.querySelectorAll('input')[focusIndex]?.focus();
  };
  render();
  return { value: collect };
}

/** Read-only text, checkable boxes. `onToggle(index, done)` persists the change. */
export function goalChecklist(root, todos, onToggle) {
  root.innerHTML = `<ul class="goal-check">${todos.map((t, i) => `<li class="${t.done ? 'done' : ''}">
    <label><input type="checkbox" data-i="${i}" ${t.done ? 'checked' : ''}><span>${esc(t.text)}</span></label>
  </li>`).join('')}</ul>`;
  root.querySelectorAll('input').forEach((box) => box.addEventListener('change', () => {
    const i = +box.dataset.i;
    box.closest('li').classList.toggle('done', box.checked);
    onToggle(i, box.checked);
  }));
}
