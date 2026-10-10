// 관리자 페이지: 토큰은 sessionStorage(이 탭)에만 둔다. 모든 데이터는 /api/admin/* 에서 X-Admin-Token 으로 받는다.
(function () {
  const $ = (id) => document.getElementById(id);
  const KEY = 'fitdoing-admin-token';
  const PAGE = 50;
  let token = '';
  let offset = 0;
  let catalog = null;

  const store = {
    get() { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } },
    set(v) { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch {} },
  };

  function status(msg, err) {
    $('status').textContent = msg;
    $('status').className = err ? 'err' : '';
  }

  async function api(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: Object.assign({ 'X-Admin-Token': token }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(res.status === 401 ? '토큰이 맞지 않아요' : data.message || '요청이 실패했어요 (' + res.status + ')');
      e.status = res.status;
      throw e;
    }
    return data;
  }

  function cell(text, cls) {
    const td = document.createElement('td');
    td.textContent = text;
    if (cls) td.className = cls;
    return td;
  }

  function modelSelect(u, effective) {
    const sel = document.createElement('select');
    const def = document.createElement('option');
    def.value = '';
    def.textContent = '기본 (' + catalog.default + ')';
    sel.appendChild(def);
    for (const m of catalog.allowed) {
      if (m === catalog.default) continue;
      const o = document.createElement('option');
      o.value = m;
      o.textContent = m;
      sel.appendChild(o);
    }
    // 설정에서 빠진 모델이 지정돼 있으면 그대로 보여준다 (실제로는 기본 모델을 쓴다)
    if (u.aiModel && !catalog.allowed.includes(u.aiModel)) {
      const o = document.createElement('option');
      o.value = u.aiModel;
      o.textContent = u.aiModel + ' (허용 목록에 없음)';
      sel.appendChild(o);
    }
    sel.value = u.aiModel || '';
    sel.setAttribute('aria-label', (u.nickname || u.id) + ' AI 모델');
    sel.addEventListener('change', async () => {
      sel.disabled = true;
      try {
        const row = await api('PUT', '/api/admin/users/' + encodeURIComponent(u.id) + '/ai-model', {
          model: sel.value === '' ? null : sel.value,
        });
        effective.textContent = row.effectiveModel;
        status((u.nickname || u.id) + ' → ' + row.effectiveModel + ' 저장했어요');
      } catch (e) {
        sel.value = u.aiModel || '';
        status(e.message, true);
      } finally {
        sel.disabled = false;
      }
    });
    return sel;
  }

  function addRows(users) {
    const body = $('users');
    for (const u of users) {
      const tr = document.createElement('tr');
      const who = document.createElement('td');
      who.appendChild(document.createTextNode(u.nickname || '(닉네임 없음)'));
      const id = document.createElement('div');
      id.className = 'id';
      id.textContent = u.id;
      who.appendChild(id);
      tr.appendChild(who);
      tr.appendChild(cell(u.providers.length ? u.providers.join(', ') : '기기 토큰'));
      tr.appendChild(cell(new Date(u.createdAt).toLocaleDateString('ko-KR')));
      const effective = cell(u.effectiveModel, 'saved');
      const pick = document.createElement('td');
      pick.appendChild(modelSelect(u, effective));
      tr.appendChild(pick);
      tr.appendChild(effective);
      body.appendChild(tr);
    }
  }

  async function load(reset) {
    if (reset) {
      offset = 0;
      $('users').textContent = '';
    }
    status('불러오는 중…');
    try {
      if (!catalog) catalog = await api('GET', '/api/admin/ai-models');
      const data = await api('GET', '/api/admin/users?limit=' + PAGE + '&offset=' + offset);
      addRows(data.users);
      offset += data.users.length;
      $('more').hidden = data.users.length < PAGE;
      $('models').textContent = '기본 모델: ' + catalog.default + ' · 지정 가능: ' + catalog.allowed.join(', ');
      $('panel').hidden = false;
      status(offset ? '사용자 ' + offset + '명' : '아직 사용자가 없어요');
      store.set(token);
    } catch (e) {
      catalog = null;
      $('panel').hidden = true;
      if (e.status === 401) store.set('');
      status(e.message, true);
    }
  }

  $('login').addEventListener('submit', (ev) => {
    ev.preventDefault();
    token = $('token').value.trim();
    $('token').value = '';
    if (token) load(true);
  });
  $('more').addEventListener('click', () => load(false));
  $('logout').addEventListener('click', () => {
    token = '';
    catalog = null;
    store.set('');
    $('users').textContent = '';
    $('panel').hidden = true;
    status('토큰을 지웠어요');
  });

  token = store.get();
  if (token) load(true);
})();
