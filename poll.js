(function () {
  const STORAGE_KEY = 'gbl_poll_data';
  const CRITICAL_MASS = 6;
  const COMMISSIONER_ABBR = 'NMG';
  const COMMISSIONER_PASSWORD = 'Cadets1989';
  const TEAMS = window.GBL_TEAMS || [];

  const LEGACY_POLL = {
    id: 'ci-mi-lineup-2025',
    question: "Should we add a spot in the lineup for a Corner Infielder (CI) and a spot for a Middle Infielder (MI), or leave the lineup as-is?",
    options: [
      { value: 'add-ci-mi', label: 'Add CI and MI spots' },
      { value: 'leave-as-is', label: 'Leave lineup as-is' }
    ]
  };

  let commissionerUnlocked = false;

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : { polls: {}, votes: {}, closedPolls: {}, history: [] };
      if (!data.polls) data.polls = {};
      if (!data.votes) data.votes = {};
      if (!data.closedPolls) data.closedPolls = {};
      if (!data.history) data.history = [];
      if (Object.keys(data.polls).length === 0) {
        data.polls[LEGACY_POLL.id] = LEGACY_POLL;
        data.votes[LEGACY_POLL.id] = { 'add-ci-mi': [], 'leave-as-is': [] };
      }
      return data;
    } catch {
      const data = { polls: {}, votes: {}, closedPolls: {}, history: [] };
      data.polls[LEGACY_POLL.id] = LEGACY_POLL;
      data.votes[LEGACY_POLL.id] = { 'add-ci-mi': [], 'leave-as-is': [] };
      return data;
    }
  }

  function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function getActivePolls() {
    const data = loadData();
    return Object.keys(data.polls).filter(function (id) { return !data.closedPolls[id]; });
  }

  function getPoll(pollId) {
    const data = loadData();
    return data.polls[pollId] || null;
  }

  function isPollClosed(pollId) {
    const data = loadData();
    return !!(data.closedPolls && data.closedPolls[pollId]);
  }

  function getVoteKey(pollId, teamAbbr) {
    return 'vote_' + pollId + '_' + (teamAbbr || '');
  }

  function hasTeamVoted(pollId, teamAbbr) {
    return !!localStorage.getItem(getVoteKey(pollId, teamAbbr));
  }

  function recordVote(pollId, teamAbbr, option) {
    const data = loadData();
    const poll = data.polls[pollId];
    if (!poll || !data.votes[pollId]) return;
    const v = data.votes[pollId];
    poll.options.forEach(function (opt) {
      const arr = v[opt.value] || [];
      const i = arr.indexOf(teamAbbr);
      if (i !== -1) arr.splice(i, 1);
    });
    if (!v[option]) v[option] = [];
    v[option].push(teamAbbr);
    saveData(data);
    localStorage.setItem(getVoteKey(pollId, teamAbbr), option);
  }

  function getResults(pollId) {
    const data = loadData();
    const poll = data.polls[pollId];
    if (!poll) return { votes: {}, byTeam: {}, total: 0 };
    const v = data.votes[pollId] || {};
    const byTeam = {};
    const votes = {};
    let total = 0;
    poll.options.forEach(function (opt) {
      const arr = v[opt.value] || [];
      byTeam[opt.value] = arr.slice();
      votes[opt.value] = arr.length;
      total += arr.length;
    });
    return { votes, byTeam, total };
  }

  function checkCriticalMass(pollId) {
    if (isPollClosed(pollId)) return;
    const r = getResults(pollId);
    if (r.total < CRITICAL_MASS) return;
    const data = loadData();
    const poll = data.polls[pollId];
    if (!poll) return;
    const hit = poll.options.some(function (opt) { return (r.votes[opt.value] || 0) >= CRITICAL_MASS; });
    if (hit) closePoll(pollId);
  }

  function closePoll(pollId) {
    const data = loadData();
    const poll = data.polls[pollId];
    if (!poll) return;
    const v = data.votes[pollId] || {};
    data.history.push({
      question: poll.question,
      results: poll.options.map(function (opt) {
        return { label: opt.label, teams: (v[opt.value] || []).slice() };
      })
    });
    data.closedPolls[pollId] = true;
    saveData(data);
    renderActivePolls();
    renderPollHistory();
  }

  function deletePoll(pollId) {
    const data = loadData();
    if (!data.polls[pollId]) return;
    delete data.polls[pollId];
    delete data.votes[pollId];
    delete data.closedPolls[pollId];
    saveData(data);
    TEAMS.forEach(function (t) {
      localStorage.removeItem(getVoteKey(pollId, t.abbr));
    });
    renderActivePolls();
  }

  function deleteHistoryItem(index) {
    const data = loadData();
    if (!data.history || index < 0 || index >= data.history.length) return;
    data.history.splice(index, 1);
    saveData(data);
    renderPollHistory();
  }

  function slugify(str) {
    return String(str).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-') || 'opt';
  }

  function createPoll(question, optionLabels) {
    if (!question || !optionLabels || optionLabels.length < 2 || optionLabels.length > 10) return null;
    const data = loadData();
    const id = 'poll-' + Date.now();
    const options = optionLabels.map(function (label, i) {
      const value = slugify(label) || ('opt-' + (i + 1));
      return { value: value, label: label };
    });
    data.polls[id] = { id, question, options };
    data.votes[id] = {};
    options.forEach(function (opt) { data.votes[id][opt.value] = []; });
    saveData(data);
    return id;
  }

  function showNoActivePoll() {
    const content = document.getElementById('current-poll-content');
    const noActive = document.getElementById('no-active-poll');
    if (content) content.hidden = true;
    if (noActive) noActive.hidden = false;
  }

  function showActivePollsList() {
    const content = document.getElementById('current-poll-content');
    const noActive = document.getElementById('no-active-poll');
    if (content) content.hidden = false;
    if (noActive) noActive.hidden = true;
  }

  function teamAbbrToName(abbr) {
    const t = TEAMS.find(function (x) { return x.abbr === abbr; });
    return t ? t.name : abbr;
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function renderPollResults(container, pollId) {
    if (!container) return;
    const poll = getPoll(pollId);
    if (!poll) return;
    const r = getResults(pollId);
    if (r.total === 0) {
      container.hidden = true;
      container.innerHTML = '';
      return;
    }
    container.hidden = false;
    const maxCount = Math.max.apply(null, poll.options.map(function (o) { return r.votes[o.value] || 0; }), 1);
    const lis = poll.options.map(function (opt) {
      const count = r.votes[opt.value] || 0;
      const width = (count / maxCount) * 100;
      const names = (r.byTeam[opt.value] || []).map(teamAbbrToName).join(', ');
      return '<li><div class="poll-result-row"><span>' + escapeHtml(opt.label) + '</span> <strong>' + count + '</strong></div>' +
        '<div class="poll-bar" style="width:' + width + '%"></div>' +
        (names ? '<p class="poll-who-voted">' + escapeHtml(names) + '</p>' : '') + '</li>';
    }).join('');
    container.innerHTML = '<ul class="poll-results poll-results--with-teams">' + lis + '</ul>';
  }

  function renderActivePolls() {
    const listEl = document.getElementById('active-polls-list');
    if (!listEl) return;
    const activeIds = getActivePolls();
    if (activeIds.length === 0) {
      showNoActivePoll();
      return;
    }
    showActivePollsList();
    const teamSel = document.getElementById('poll-team');
    const selectedTeam = teamSel && teamSel.value;
    const showCommissionerActions = commissionerUnlocked && selectedTeam === COMMISSIONER_ABBR;
    listEl.innerHTML = activeIds.map(function (pollId) {
      const poll = getPoll(pollId);
      if (!poll) return '';
      const voted = selectedTeam && hasTeamVoted(pollId, selectedTeam);
      const optionsHtml = poll.options.map(function (opt, idx) {
        const req = idx === 0 ? ' required' : '';
        return '<li><label><input type="radio" name="vote_' + escapeHtml(pollId) + '" value="' + escapeHtml(opt.value) + '"' + req + (voted ? ' disabled' : '') + ' /><span>' + escapeHtml(opt.label) + '</span></label></li>';
      }).join('');
      const needTeam = !selectedTeam && !voted;
      const commissionerActions = showCommissionerActions
        ? '<div class="poll-block__commissioner"><span class="poll-block__commissioner-label">Commissioner:</span>' +
          '<button type="button" class="poll-block__action poll-block__action--close" data-poll-id="' + escapeHtml(pollId) + '" data-action="close">Close poll</button>' +
          '<button type="button" class="poll-block__action poll-block__action--delete" data-poll-id="' + escapeHtml(pollId) + '" data-action="delete">Delete poll</button>' +
          '</div>'
        : '';
      return '<div class="poll-block" data-poll-id="' + escapeHtml(pollId) + '">' +
        '<p class="poll-question">' + escapeHtml(poll.question) + '</p>' +
        commissionerActions +
        (needTeam ? '<p class="poll-team-hint">Select your team above to vote.</p>' : '') +
        '<form class="poll-form" data-poll-id="' + escapeHtml(pollId) + '">' +
        '<ul class="poll-options">' + optionsHtml + '</ul>' +
        '<button type="submit" class="poll-submit"' + (voted ? ' hidden' : '') + (needTeam ? ' disabled' : '') + '>Submit vote</button>' +
        '</form>' +
        '<p class="poll-thanks poll-thanks--per-poll" data-poll-id="' + escapeHtml(pollId) + '"' + (voted ? '' : ' hidden') + '>Thanks for voting!</p>' +
        '<div class="poll-results-container" data-poll-id="' + escapeHtml(pollId) + '" hidden></div>' +
        '</div>';
    }).join('');

    activeIds.forEach(function (pollId) {
      renderPollResults(listEl.querySelector('.poll-results-container[data-poll-id="' + pollId + '"]'), pollId);
    });

    listEl.querySelectorAll('.poll-form').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const pid = form.getAttribute('data-poll-id');
        const option = form.querySelector('input[name="vote_' + pid + '"]:checked');
        if (!selectedTeam || !option) return;
        recordVote(pid, selectedTeam, option.value);
        checkCriticalMass(pid);
        if (!isPollClosed(pid)) {
          const block = form.closest('.poll-block');
          if (block) {
            const thanks = block.querySelector('.poll-thanks--per-poll');
            const resultsContainer = block.querySelector('.poll-results-container');
            const submitBtn = form.querySelector('.poll-submit');
            if (thanks) thanks.hidden = false;
            if (submitBtn) submitBtn.hidden = true;
            if (form) form.hidden = true;
            renderPollResults(resultsContainer, pid);
          }
        }
      });
    });

    listEl.querySelectorAll('.poll-block__action').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const pid = btn.getAttribute('data-poll-id');
        const action = btn.getAttribute('data-action');
        if (!pid || !action) return;
        if (action === 'close') {
          closePoll(pid);
        } else if (action === 'delete') {
          if (confirm('Delete this poll? It will be removed and will not appear in poll history.')) {
            deletePoll(pid);
          }
        }
      });
    });
  }

  function renderPollHistory() {
    const container = document.getElementById('poll-history');
    if (!container) return;
    const data = loadData();
    const history = data.history || [];
    const teamSel = document.getElementById('poll-team');
    const selectedTeam = teamSel && teamSel.value;
    const showHistoryDelete = commissionerUnlocked && selectedTeam === COMMISSIONER_ABBR;
    if (history.length === 0) {
      container.innerHTML = '<p class="empty-history">No past polls yet. Results will appear here once polls are closed.</p>';
      return;
    }
    container.innerHTML = history.map(function (poll, index) {
      const total = poll.results.reduce(function (sum, r) { return sum + (r.teams ? r.teams.length : r.count); }, 0);
      const maxCount = Math.max.apply(null, poll.results.map(function (r) { return r.teams ? r.teams.length : r.count; }), 1);
      const bars = poll.results.map(function (r) {
        const count = r.teams ? r.teams.length : r.count;
        const width = maxCount ? Math.max(5, (count / maxCount) * 100) : 0;
        const names = r.teams ? r.teams.map(teamAbbrToName).join(', ') : '';
        return '<li><div class="poll-result-row"><span>' + escapeHtml(r.label) + '</span> <strong>' + count + '</strong></div><div class="poll-bar" style="width:' + width + '%"></div>' +
          (names ? '<p class="poll-who-voted">' + escapeHtml(names) + '</p>' : '') + '</li>';
      }).join('');
      const deleteBtn = showHistoryDelete
        ? '<button type="button" class="poll-history-item__delete" data-history-index="' + index + '">Delete</button>'
        : '';
      return '<div class="poll-history-item">' + deleteBtn + '<h3>' + escapeHtml(poll.question) + '</h3><ul class="poll-results poll-results--with-teams">' + bars + '</ul></div>';
    }).join('');

    container.querySelectorAll('.poll-history-item__delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const index = parseInt(btn.getAttribute('data-history-index'), 10);
        if (isNaN(index)) return;
        if (confirm('Remove this poll from history?')) {
          deleteHistoryItem(index);
        }
      });
    });
  }

  function fillTeamSelect() {
    const sel = document.getElementById('poll-team');
    if (!sel || !TEAMS.length) return;
    TEAMS.forEach(function (t) {
      const opt = document.createElement('option');
      opt.value = t.abbr;
      opt.textContent = t.name + ' (' + t.abbr + ')';
      sel.appendChild(opt);
    });
  }

  function showPasswordModal() {
    const modal = document.getElementById('password-modal');
    const input = document.getElementById('password-input');
    const err = document.getElementById('password-error');
    if (modal) modal.hidden = false;
    if (input) { input.value = ''; input.focus(); }
    if (err) err.hidden = true;
  }

  function hidePasswordModal() {
    const modal = document.getElementById('password-modal');
    if (modal) modal.hidden = true;
  }

  function showCreatePollPanel() {
    const panel = document.getElementById('create-poll-panel');
    if (panel) panel.hidden = false;
  }

  function hideCreatePollPanel() {
    const panel = document.getElementById('create-poll-panel');
    if (panel) panel.hidden = true;
  }

  var MEDAL = { 1: '\uD83E\uDD47', 2: '\uD83E\uDD48', 3: '\uD83E\uDD49' };

  function sortKeyForTeam(t) {
    var name = t.name.replace(/^The\s+/i, '');
    return name.toLowerCase();
  }

  function fillSidebarTeams() {
    const list = document.getElementById('sidebar-teams');
    if (!list || !TEAMS.length) return;
    list.innerHTML = '';
    var sorted = TEAMS.slice().sort(function (a, b) {
      return sortKeyForTeam(a).localeCompare(sortKeyForTeam(b));
    });
    sorted.forEach(function (t) {
      const li = document.createElement('li');
      const nameWrap = document.createElement('span');
      nameWrap.className = 'sidebar__team-name-wrap';
      const name = document.createElement('span');
      name.className = 'sidebar__team-name';
      name.textContent = t.name;
      nameWrap.appendChild(name);
      if (t.lastSeasonPlace && MEDAL[t.lastSeasonPlace]) {
        const medal = document.createElement('span');
        medal.className = 'sidebar__team-medal';
        medal.setAttribute('aria-label', 'Placed ' + (t.lastSeasonPlace === 1 ? '1st' : t.lastSeasonPlace === 2 ? '2nd' : '3rd') + ' last season');
        medal.textContent = MEDAL[t.lastSeasonPlace];
        nameWrap.appendChild(medal);
      }
      if (t.newTeam) {
        const newcomer = document.createElement('span');
        newcomer.className = 'sidebar__team-new';
        newcomer.setAttribute('aria-label', 'New to the league');
        newcomer.textContent = '\uD83D\uDC23';
        nameWrap.appendChild(newcomer);
      }
      li.appendChild(nameWrap);
      if (t.manager) {
        const mgr = document.createElement('span');
        mgr.className = 'sidebar__team-manager';
        mgr.textContent = t.commissioner ? t.manager + ' (Commissioner)' : t.manager;
        li.appendChild(mgr);
      }
      list.appendChild(li);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    fillTeamSelect();
    fillSidebarTeams();
    renderActivePolls();
    renderPollHistory();

    const teamSelEl = document.getElementById('poll-team');
    function onTeamChange() {
      const val = teamSelEl && teamSelEl.value;
      if (val === COMMISSIONER_ABBR) {
        if (!commissionerUnlocked) {
          showPasswordModal();
        } else {
          showCreatePollPanel();
        }
      } else {
        hideCreatePollPanel();
      }
      renderActivePolls();
      renderPollHistory();
    }
    if (teamSelEl) teamSelEl.addEventListener('change', onTeamChange);

    const passwordForm = document.getElementById('password-form');
    const passwordInput = document.getElementById('password-input');
    const passwordError = document.getElementById('password-error');
    const passwordCancel = document.getElementById('password-cancel');
    if (passwordForm) {
      passwordForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (passwordInput && passwordInput.value === COMMISSIONER_PASSWORD) {
          commissionerUnlocked = true;
          hidePasswordModal();
          showCreatePollPanel();
          renderActivePolls();
          renderPollHistory();
        } else {
          if (passwordError) passwordError.hidden = false;
        }
      });
    }
    if (passwordCancel) passwordCancel.addEventListener('click', hidePasswordModal);
    document.getElementById('password-modal').addEventListener('click', function (e) {
      if (e.target.classList.contains('modal__backdrop')) hidePasswordModal();
    });

    const createPollForm = document.getElementById('create-poll-form');
    if (createPollForm) {
      createPollForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const questionInput = document.getElementById('create-poll-question');
        const question = questionInput && questionInput.value.trim();
        const optionInputs = createPollForm.querySelectorAll('.create-poll-options input[type="text"]');
        const options = [];
        optionInputs.forEach(function (input) {
          const v = input.value.trim();
          if (v) options.push(v);
        });
        if (!question || options.length < 2) return;
        const id = createPoll(question, options);
        if (id) {
          createPollForm.reset();
          renderActivePolls();
        }
      });
    }
  });
})();
