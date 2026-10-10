// 관리자 페이지: 비밀번호로 로그인하면 서버가 30일짜리 쿠키(HttpOnly)를 준다. 페이지는 비밀번호를 저장하지 않는다.
(function () {
  const $ = (id) => document.getElementById(id);
  const PAGE = 50;
  let offset = 0;
  let catalog = null;

  function status(msg, err) {
    $('status').textContent = msg;
    $('status').className = err ? 'err' : '';
  }

  async function api(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(data.message || '요청이 실패했어요 (' + res.status + ')');
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

  function showLogin(msg, err) {
    catalog = null;
    $('users').textContent = '';
    $('panel').hidden = true;
    $('login').hidden = false;
    status(msg || '', err);
    $('password').focus();
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
      $('login').hidden = true;
      $('panel').hidden = false;
      status(offset ? '사용자 ' + offset + '명' : '아직 사용자가 없어요');
    } catch (e) {
      if (e.status === 401) showLogin('다시 로그인해 주세요', true);
      else status(e.message, true);
    }
  }

  $('login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const password = $('password').value;
    if (!password) return;
    const btn = ev.submitter;
    if (btn) btn.disabled = true;
    try {
      await api('POST', '/api/admin/login', { password });
      $('password').value = '';
      await load(true);
    } catch (e) {
      status(e.message, true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
  $('more').addEventListener('click', () => load(false));
  $('logout').addEventListener('click', async () => {
    try {
      await api('POST', '/api/admin/logout');
    } catch {}
    showLogin('로그아웃했어요');
  });

  // 이미 로그인돼 있으면(쿠키) 바로 목록을 연다
  api('GET', '/api/admin/session').then(() => load(true), () => showLogin());
})();
