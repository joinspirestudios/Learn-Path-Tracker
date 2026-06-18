import { esc } from '../helpers.js';

export function evidencePrepHTML(summary){
  if(!summary?.count) return '';
  const noun = summary.count === 1 ? 'task requires' : 'tasks require';
  return '<section class="daily-session-panel" aria-labelledby="dailyEvidencePrepTitle">'
    + '<div class="chip">Evidence prep</div>'
    + '<h3 id="dailyEvidencePrepTitle">Evidence you may need today</h3>'
    + '<p class="muted">' + esc(summary.count + ' ' + noun + ' proof. You can begin now and add evidence as each task is completed.') + '</p>'
    + '<ul class="daily-session-list">'
    + summary.tasks.map(item => '<li><b>' + esc(item.title) + '</b><span>' + esc(item.type) + '</span></li>').join('')
    + '</ul>'
    + '<div class="daily-session-actions">'
    + '<button class="btn gold daily-session-action" type="button" data-session-action="start-session">Start session</button>'
    + '<button class="btn daily-session-action" type="button" data-session-action="agenda">Review agenda</button>'
    + '</div>'
    + '</section>';
}

export function taskEvidenceFormHTML({ task, proofType = 'url', accepts = '', error = '', busy = false } = {}){
  const type = proofType === 'file' ? 'file' : 'url';
  const taskId = String(task?.id || '');
  return '<form class="evidence-form daily-evidence-form" data-task="' + esc(taskId) + '">'
    + '<label>Proof type<select id="evidenceType"><option value="url" ' + (type === 'url' ? 'selected' : '') + '>URL</option><option value="file" ' + (type === 'file' ? 'selected' : '') + '>File</option></select></label>'
    + (type === 'url'
      ? '<label>Proof URL<input type="url" id="evidenceUrl" placeholder="https://..."/></label>'
      : '<label>File<input type="file" id="evidenceFile" accept="' + esc(accepts) + '"/></label>')
    + '<label>Note or reflection<textarea id="evidenceNote" placeholder="Short context for this proof"></textarea></label>'
    + (error ? '<div class="form-error" role="alert">' + esc(error) + '</div>' : '')
    + '<div class="evidence-actions">'
    + '<button class="btn gold" id="submitEvidence" type="button" data-task="' + esc(taskId) + '" ' + (busy ? 'disabled' : '') + '>' + (busy ? 'Submitting...' : 'Submit proof') + '</button>'
    + '<button class="btn" id="cancelEvidence" type="button">Cancel</button>'
    + '</div>'
    + '</form>';
}
