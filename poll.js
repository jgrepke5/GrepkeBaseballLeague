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

  var db = window.GBL_FIREBASE_DB || null;
  var inMemoryData = { polls: {}, votes: {}, closedPolls: {}, history: [] };

  function getData() {
    return inMemoryData;
  }

  function loadDataLocal() {
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

  function saveDataLocal(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function applyDataToMemory(data) {
    inMemoryData.polls = data.polls || {};
    inMemoryData.votes = data.votes || {};
    inMemoryData.closedPolls = data.closedPolls || {};
    inMemoryData.history = data.history || [];
  }

  function loadData() {
    if (db) return;
    var data = loadDataLocal();
    applyDataToMemory(data);
  }

  function saveData(data) {
    if (db) return;
    saveDataLocal(data);
    applyDataToMemory(data);
  }

  function getActivePolls() {
    var data = getData();
    return Object.keys(data.polls).filter(function (id) { return !data.closedPolls[id]; });
  }

  function getPoll(pollId) {
    var data = getData();
    return data.polls[pollId] || null;
  }

  function isPollClosed(pollId) {
    var data = getData();
    return !!(data.closedPolls && data.closedPolls[pollId]);
  }

  function getVoteKey(pollId, teamAbbr) {
    return 'vote_' + pollId + '_' + (teamAbbr || '');
  }

  function hasTeamVoted(pollId, teamAbbr) {
    if (db) {
      var v = getData().votes[pollId] || {};
      for (var opt in v) {
        if ((v[opt] || []).indexOf(teamAbbr) !== -1) return true;
      }
      return false;
    }
    return !!localStorage.getItem(getVoteKey(pollId, teamAbbr));
  }

  function recordVote(pollId, teamAbbr, option) {
    if (db) {
      firestoreRecordVote(pollId, teamAbbr, option);
      return;
    }
    var data = loadDataLocal();
    var poll = data.polls[pollId];
    if (!poll || !data.votes[pollId]) return;
    var v = data.votes[pollId];
    poll.options.forEach(function (opt) {
      var arr = v[opt.value] || [];
      var i = arr.indexOf(teamAbbr);
      if (i !== -1) arr.splice(i, 1);
    });
    if (!v[option]) v[option] = [];
    v[option].push(teamAbbr);
    saveDataLocal(data);
    applyDataToMemory(data);
    localStorage.setItem(getVoteKey(pollId, teamAbbr), option);
  }

  function firestoreRecordVote(pollId, teamAbbr, option) {
    var pollRef = db.collection('polls').doc(pollId);
    pollRef.get().then(function (snap) {
      if (!snap.exists) return;
      var poll = snap.data();
      var votes = poll.votes || {};
      var options = poll.options || [];
      options.forEach(function (opt) {
        var arr = (votes[opt.value] || []).slice();
        var i = arr.indexOf(teamAbbr);
        if (i !== -1) arr.splice(i, 1);
        votes[opt.value] = arr;
      });
      if (!votes[option]) votes[option] = [];
      votes[option].push(teamAbbr);
      inMemoryData.votes[pollId] = votes;
      return pollRef.update({ votes: votes });
    }).then(function () {
      checkCriticalMass(pollId);
      renderActivePolls();
    }).catch(function (err) { console.warn('Firestore recordVote failed', err); });
  }

  function getResults(pollId) {
    var data = getData();
    var poll = data.polls[pollId];
    if (!poll) return { votes: {}, byTeam: {}, total: 0 };
    var v = data.votes[pollId] || {};
    var byTeam = {};
    var votes = {};
    var total = 0;
    poll.options.forEach(function (opt) {
      var arr = v[opt.value] || [];
      byTeam[opt.value] = arr.slice();
      votes[opt.value] = arr.length;
      total += arr.length;
    });
    return { votes: votes, byTeam: byTeam, total: total };
  }

  function checkCriticalMass(pollId) {
    if (isPollClosed(pollId)) return;
    var r = getResults(pollId);
    if (r.total < CRITICAL_MASS) return;
    var poll = getPoll(pollId);
    if (!poll) return;
    var hit = poll.options.some(function (opt) { return (r.votes[opt.value] || 0) >= CRITICAL_MASS; });
    if (hit) closePoll(pollId);
  }

  function closePoll(pollId) {
    if (db) {
      firestoreClosePoll(pollId);
      return;
    }
    var data = loadDataLocal();
    var poll = data.polls[pollId];
    if (!poll) return;
    var v = data.votes[pollId] || {};
    data.history.push({
      question: poll.question,
      results: poll.options.map(function (opt) {
        return { label: opt.label, teams: (v[opt.value] || []).slice() };
      })
    });
    data.closedPolls[pollId] = true;
    saveDataLocal(data);
    applyDataToMemory(data);
    renderActivePolls();
    renderPollHistory();
  }

  function firestoreClosePoll(pollId) {
    var poll = getPoll(pollId);
    if (!poll) return;
    var v = getData().votes[pollId] || {};
    var historyEntry = {
      question: poll.question,
      results: poll.options.map(function (opt) {
        return { label: opt.label, teams: (v[opt.value] || []).slice() };
      }),
      order: Date.now()
    };
    var pollRef = db.collection('polls').doc(pollId);
    var historyRef = db.collection('history');
    pollRef.update({ closed: true }).then(function () {
      return historyRef.add(historyEntry);
    }).then(function () {
      renderActivePolls();
      renderPollHistory();
    }).catch(function (err) { console.warn('Firestore closePoll failed', err); });
  }

  function deletePoll(pollId) {
    if (db) {
      firestoreDeletePoll(pollId);
      return;
    }
    var data = loadDataLocal();
    if (!data.polls[pollId]) return;
    delete data.polls[pollId];
    delete data.votes[pollId];
    delete data.closedPolls[pollId];
    saveDataLocal(data);
    applyDataToMemory(data);
    TEAMS.forEach(function (t) { localStorage.removeItem(getVoteKey(pollId, t.abbr)); });
    renderActivePolls();
  }

  function firestoreDeletePoll(pollId) {
    db.collection('polls').doc(pollId).delete()
      .then(function () { renderActivePolls(); })
      .catch(function (err) { console.warn('Firestore deletePoll failed', err); });
  }

  function deleteHistoryItem(index) {
    if (db) {
      var item = getData().history[index];
      if (!item || !item.id) return;
      firestoreDeleteHistoryItem(item.id);
      return;
    }
    var data = loadDataLocal();
    if (!data.history || index < 0 || index >= data.history.length) return;
    data.history.splice(index, 1);
    saveDataLocal(data);
    applyDataToMemory(data);
    renderPollHistory();
  }

  function firestoreDeleteHistoryItem(docId) {
    db.collection('history').doc(docId).delete()
      .then(function () { renderPollHistory(); })
      .catch(function (err) { console.warn('Firestore deleteHistory failed', err); });
  }

  function slugify(str) {
    return String(str).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-') || 'opt';
  }

  function createPoll(question, optionLabels) {
    if (!question || !optionLabels || optionLabels.length < 2 || optionLabels.length > 10) return null;
    if (db) {
      firestoreCreatePoll(question, optionLabels);
      return 'pending';
    }
    var data = loadDataLocal();
    var id = 'poll-' + Date.now();
    var options = optionLabels.map(function (label, i) {
      var value = slugify(label) || ('opt-' + (i + 1));
      return { value: value, label: label };
    });
    data.polls[id] = { id: id, question: question, options: options };
    data.votes[id] = {};
    options.forEach(function (opt) { data.votes[id][opt.value] = []; });
    saveDataLocal(data);
    applyDataToMemory(data);
    return id;
  }

  function firestoreCreatePoll(question, optionLabels) {
    var id = 'poll-' + Date.now();
    var options = optionLabels.map(function (label, i) {
      var value = slugify(label) || ('opt-' + (i + 1));
      return { value: value, label: label };
    });
    var votes = {};
    options.forEach(function (opt) { votes[opt.value] = []; });
    db.collection('polls').doc(id).set({
      question: question,
      options: options,
      closed: false,
      votes: votes
    }).then(function () {
      renderActivePolls();
    }).catch(function (err) { console.warn('Firestore createPoll failed', err); });
  }

  function showNoActivePoll() {
    var content = document.getElementById('current-poll-content');
    var noActive = document.getElementById('no-active-poll');
    if (content) content.hidden = true;
    if (noActive) noActive.hidden = false;
  }

  function showActivePollsList() {
    var content = document.getElementById('current-poll-content');
    var noActive = document.getElementById('no-active-poll');
    if (content) content.hidden = false;
    if (noActive) noActive.hidden = true;
  }

  function teamAbbrToName(abbr) {
    var t = TEAMS.find(function (x) { return x.abbr === abbr; });
    return t ? t.name : abbr;
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function renderPollResults(container, pollId) {
    if (!container) return;
    var poll = getPoll(pollId);
    if (!poll) return;
    var r = getResults(pollId);
    if (r.total === 0) {
      container.hidden = true;
      container.innerHTML = '';
      return;
    }
    container.hidden = false;
    var maxCount = Math.max.apply(null, poll.options.map(function (o) { return r.votes[o.value] || 0; }), 1);
    var lis = poll.options.map(function (opt) {
      var count = r.votes[opt.value] || 0;
      var width = (count / maxCount) * 100;
      var names = (r.byTeam[opt.value] || []).map(teamAbbrToName).join(', ');
      return '<li><div class="poll-result-row"><span>' + escapeHtml(opt.label) + '</span> <strong>' + count + '</strong></div>' +
        '<div class="poll-bar" style="width:' + width + '%"></div>' +
        (names ? '<p class="poll-who-voted">' + escapeHtml(names) + '</p>' : '') + '</li>';
    }).join('');
    container.innerHTML = '<ul class="poll-results poll-results--with-teams">' + lis + '</ul>';
  }

  function renderActivePolls() {
    var listEl = document.getElementById('active-polls-list');
    if (!listEl) return;
    var activeIds = getActivePolls();
    if (activeIds.length === 0) {
      showNoActivePoll();
      return;
    }
    showActivePollsList();
    var teamSel = document.getElementById('poll-team');
    var selectedTeam = teamSel && teamSel.value;
    var showCommissionerActions = commissionerUnlocked && selectedTeam === COMMISSIONER_ABBR;
    listEl.innerHTML = activeIds.map(function (pollId) {
      var poll = getPoll(pollId);
      if (!poll) return '';
      var voted = selectedTeam && hasTeamVoted(pollId, selectedTeam);
      var optionsHtml = poll.options.map(function (opt, idx) {
        var req = idx === 0 ? ' required' : '';
        return '<li><label><input type="radio" name="vote_' + escapeHtml(pollId) + '" value="' + escapeHtml(opt.value) + '"' + req + (voted ? ' disabled' : '') + ' /><span>' + escapeHtml(opt.label) + '</span></label></li>';
      }).join('');
      var needTeam = !selectedTeam && !voted;
      var commissionerActions = showCommissionerActions
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
        var pid = form.getAttribute('data-poll-id');
        var option = form.querySelector('input[name="vote_' + pid + '"]:checked');
        if (!selectedTeam || !option) return;
        recordVote(pid, selectedTeam, option.value);
        checkCriticalMass(pid);
        if (!isPollClosed(pid)) {
          var block = form.closest('.poll-block');
          if (block) {
            var thanks = block.querySelector('.poll-thanks--per-poll');
            var resultsContainer = block.querySelector('.poll-results-container');
            var submitBtn = form.querySelector('.poll-submit');
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
        var pid = btn.getAttribute('data-poll-id');
        var action = btn.getAttribute('data-action');
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
    var container = document.getElementById('poll-history');
    if (!container) return;
    var data = getData();
    var history = data.history || [];
    var teamSel = document.getElementById('poll-team');
    var selectedTeam = teamSel && teamSel.value;
    var showHistoryDelete = commissionerUnlocked && selectedTeam === COMMISSIONER_ABBR;
    if (history.length === 0) {
      container.innerHTML = '<p class="empty-history">No past polls yet. Results will appear here once polls are closed.</p>';
      return;
    }
    container.innerHTML = history.map(function (poll, index) {
      var total = poll.results.reduce(function (sum, r) { return sum + (r.teams ? r.teams.length : r.count); }, 0);
      var maxCount = Math.max.apply(null, poll.results.map(function (r) { return r.teams ? r.teams.length : r.count; }), 1);
      var bars = poll.results.map(function (r) {
        var count = r.teams ? r.teams.length : r.count;
        var width = maxCount ? Math.max(5, (count / maxCount) * 100) : 0;
        var names = r.teams ? r.teams.map(teamAbbrToName).join(', ') : '';
        return '<li><div class="poll-result-row"><span>' + escapeHtml(r.label) + '</span> <strong>' + count + '</strong></div><div class="poll-bar" style="width:' + width + '%"></div>' +
          (names ? '<p class="poll-who-voted">' + escapeHtml(names) + '</p>' : '') + '</li>';
      }).join('');
      var deleteBtn = showHistoryDelete
        ? '<button type="button" class="poll-history-item__delete" data-history-index="' + index + '">Delete</button>'
        : '';
      return '<div class="poll-history-item">' + deleteBtn + '<h3>' + escapeHtml(poll.question) + '</h3><ul class="poll-results poll-results--with-teams">' + bars + '</ul></div>';
    }).join('');

    container.querySelectorAll('.poll-history-item__delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var index = parseInt(btn.getAttribute('data-history-index'), 10);
        if (isNaN(index)) return;
        if (confirm('Remove this poll from history?')) {
          deleteHistoryItem(index);
        }
      });
    });
  }

  function fillTeamSelect() {
    var sel = document.getElementById('poll-team');
    if (!sel || !TEAMS.length) return;
    TEAMS.forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t.abbr;
      opt.textContent = t.name + ' (' + t.abbr + ')';
      sel.appendChild(opt);
    });
  }

  function showPasswordModal() {
    var modal = document.getElementById('password-modal');
    var input = document.getElementById('password-input');
    var err = document.getElementById('password-error');
    if (modal) modal.hidden = false;
    if (input) { input.value = ''; input.focus(); }
    if (err) err.hidden = true;
  }

  function hidePasswordModal() {
    var modal = document.getElementById('password-modal');
    if (modal) modal.hidden = true;
  }

  function showCreatePollPanel() {
    var panel = document.getElementById('create-poll-panel');
    if (panel) panel.hidden = false;
  }

  function hideCreatePollPanel() {
    var panel = document.getElementById('create-poll-panel');
    if (panel) panel.hidden = true;
  }

  var MEDAL = { 1: '\uD83E\uDD47', 2: '\uD83E\uDD48', 3: '\uD83E\uDD49' };

  function sortKeyForTeam(t) {
    var name = t.name.replace(/^The\s+/i, '');
    return name.toLowerCase();
  }

  function fillSidebarTeams() {
    var list = document.getElementById('sidebar-teams');
    if (!list || !TEAMS.length) return;
    list.innerHTML = '';
    var sorted = TEAMS.slice().sort(function (a, b) {
      return sortKeyForTeam(a).localeCompare(sortKeyForTeam(b));
    });
    sorted.forEach(function (t) {
      var li = document.createElement('li');
      var nameWrap = document.createElement('span');
      nameWrap.className = 'sidebar__team-name-wrap';
      var name = document.createElement('span');
      name.className = 'sidebar__team-name';
      name.textContent = t.name;
      nameWrap.appendChild(name);
      if (t.lastSeasonPlace && MEDAL[t.lastSeasonPlace]) {
        var medal = document.createElement('span');
        medal.className = 'sidebar__team-medal';
        medal.setAttribute('aria-label', 'Placed ' + (t.lastSeasonPlace === 1 ? '1st' : t.lastSeasonPlace === 2 ? '2nd' : '3rd') + ' last season');
        medal.textContent = MEDAL[t.lastSeasonPlace];
        nameWrap.appendChild(medal);
      }
      if (t.newTeam) {
        var newcomer = document.createElement('span');
        newcomer.className = 'sidebar__team-new';
        newcomer.setAttribute('aria-label', 'New to the league');
        newcomer.textContent = '\uD83D\uDC23';
        nameWrap.appendChild(newcomer);
      }
      li.appendChild(nameWrap);
      if (t.manager) {
        var mgr = document.createElement('span');
        mgr.className = 'sidebar__team-manager';
        mgr.textContent = t.commissioner ? t.manager + ' (Commissioner)' : t.manager;
        li.appendChild(mgr);
      }
      list.appendChild(li);
    });
  }

  function initFirestore() {
    var pollsRef = db.collection('polls');
    var historyRef = db.collection('history');

    function buildPollsFromSnapshot(snapshot) {
      var polls = {};
      var votes = {};
      var closedPolls = {};
      snapshot.forEach(function (doc) {
        var d = doc.data();
        var id = doc.id;
        polls[id] = { id: id, question: d.question, options: d.options || [], closed: d.closed };
        votes[id] = d.votes || {};
        closedPolls[id] = !!d.closed;
      });
      inMemoryData.polls = polls;
      inMemoryData.votes = votes;
      inMemoryData.closedPolls = closedPolls;
    }

    function seedLegacyIfEmpty(snapshot) {
      if (!snapshot.empty) return;
      pollsRef.doc(LEGACY_POLL.id).set({
        question: LEGACY_POLL.question,
        options: LEGACY_POLL.options,
        closed: false,
        votes: { 'add-ci-mi': [], 'leave-as-is': [] }
      }).catch(function () {});
    }

    function renderAll() {
      renderActivePolls();
      renderPollHistory();
    }

    pollsRef.onSnapshot(function (snapshot) {
      buildPollsFromSnapshot(snapshot);
      seedLegacyIfEmpty(snapshot);
      renderAll();
    });

    historyRef.orderBy('order', 'asc').onSnapshot(function (snapshot) {
      inMemoryData.history = snapshot.docs.map(function (doc) {
        var d = doc.data();
        return { id: doc.id, question: d.question, results: d.results || [] };
      });
      renderAll();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    fillTeamSelect();
    fillSidebarTeams();

    if (db) {
      initFirestore();
    } else {
      loadData();
      renderActivePolls();
      renderPollHistory();
    }

    var teamSelEl = document.getElementById('poll-team');
    function onTeamChange() {
      var val = teamSelEl && teamSelEl.value;
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

    var passwordForm = document.getElementById('password-form');
    var passwordInput = document.getElementById('password-input');
    var passwordError = document.getElementById('password-error');
    var passwordCancel = document.getElementById('password-cancel');
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

    var createPollForm = document.getElementById('create-poll-form');
    if (createPollForm) {
      createPollForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var questionInput = document.getElementById('create-poll-question');
        var question = questionInput && questionInput.value.trim();
        var optionInputs = createPollForm.querySelectorAll('.create-poll-options input[type="text"]');
        var options = [];
        optionInputs.forEach(function (input) {
          var v = input.value.trim();
          if (v) options.push(v);
        });
        if (!question || options.length < 2) return;
        var id = createPoll(question, options);
        if (id) {
          createPollForm.reset();
          if (!db) renderActivePolls();
        }
      });
    }
  });
})();
