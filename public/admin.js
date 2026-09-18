(function () {
  "use strict";

  var MAX_PHOTOS = 4;
  var MAX_BANKS = 5;

  var csrfToken = '';
  var isAdmin = false;
  var checkingSession = true;
  var loginError = '';
  var loggingIn = false;

  var STATE = { settings: {}, listings: [] };
  var loadedData = false;

  var adminTab = 'listings';
  var editingId = null;
  var existingImages = []; // [{url}] — photos already on the server for the listing being edited
  var newImages = [];      // [{blob, previewUrl}] — photos picked this session, not yet uploaded
  var formDraft = null;    // snapshot of the add/edit form's text fields, so re-rendering for a
                           // photo add/remove doesn't wipe out what's been typed so far
  // Bank-account rows being edited. Kept outside the DOM so adding or
  // removing a row can re-render without losing what's been typed.
  var formBanks = [];     // for the listing form
  var settingsBanks = null; // for the business-details form (null = not loaded yet)
  var saveNote = '';
  var saveErr = false;
  var busy = false; // true while a save/delete/login request is in flight

  var TYPE_LABELS = { motorcycle: 'Motorcycle', bajaj: 'Bajaj (three-wheeler)', other: 'Other vehicle' };
  var COND_LABELS = { 'new': 'Brand new', 'used-excellent': 'Used — excellent', 'used-good': 'Used — good', 'used-fair': 'Used — fair' };

  var ERROR_MESSAGES = {
    title_required: 'Title is required.',
    price_required: 'Price is required.',
    at_least_one_photo_required: 'Add at least 1 photo (up to ' + MAX_PHOTOS + ').',
    too_many_photos: 'You can have at most ' + MAX_PHOTOS + ' photos.',
    photo_too_large: 'One of those photos is too large — try a smaller one.',
    wrong_password: 'Wrong password.',
    wrong_current_password: 'Current password is incorrect.',
    password_too_short: 'New password must be at least 8 characters.',
    not_authenticated: 'Your session expired — please log in again.',
    not_found: 'That listing no longer exists.',
    too_many_attempts: 'Too many wrong passwords. Wait a few minutes and try again.',
    too_many_requests: 'Too many requests in a row — wait a moment and try again.',
    bad_csrf_token: 'Your session went stale — reload the page and log in again.',
    bad_origin: 'That request was blocked for security reasons.',
    not_an_image: 'One of those files is not an image.',
    price_out_of_range: 'That price looks wrong — check the number.',
    password_too_long: 'That password is too long.',
    server_error: 'Something went wrong on the server — try again.'
  };

  // Every state-changing request carries the per-session CSRF token the
  // server handed us from /api/admin/me (or from the login response).
  function apiFetch(url, options) {
    var opts = options || {};
    var headers = Object.assign({}, opts.headers || {});
    if (opts.method && opts.method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
    return fetch(url, Object.assign({}, opts, {
      credentials: 'same-origin',
      headers: headers
    }));
  }

  function friendlyError(body) {
    if (body && body.error && ERROR_MESSAGES[body.error]) return ERROR_MESSAGES[body.error];
    return 'Something went wrong — try again.';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function formatPrice(n) { n = Number(n) || 0; return n.toLocaleString('en-US') + ' ETB'; }

  function blankBank() { return { bank: '', accountName: '', accountNumber: '' }; }

  function normalizeBanks(arr) {
    return (Array.isArray(arr) ? arr : []).slice(0, MAX_BANKS).map(function (a) {
      return {
        bank: (a && a.bank) || '',
        accountName: (a && a.accountName) || '',
        accountNumber: (a && a.accountNumber) || ''
      };
    });
  }

  function cleanBanks(arr) {
    return normalizeBanks(arr).filter(function (a) { return String(a.accountNumber).trim(); });
  }

  // Reads the bank inputs currently on screen back into the given array, so
  // typed values survive a re-render.
  function captureBanks(prefix, target) {
    for (var i = 0; i < target.length; i++) {
      var b = document.getElementById(prefix + '-bank-' + i);
      var n = document.getElementById(prefix + '-name-' + i);
      var num = document.getElementById(prefix + '-num-' + i);
      if (!num) continue;
      target[i].bank = b ? b.value : '';
      target[i].accountName = n ? n.value : '';
      target[i].accountNumber = num.value;
    }
  }

  function renderBankRows(prefix, banks, hint) {
    var rows = banks.map(function (a, i) {
      return (
        '<div class="bank-row">' +
          '<input id="' + prefix + '-bank-' + i + '" type="text" placeholder="Bank (e.g. CBE, Awash, telebirr)" value="' + escapeHtml(a.bank) + '">' +
          '<input id="' + prefix + '-name-' + i + '" type="text" placeholder="Account name" value="' + escapeHtml(a.accountName) + '">' +
          '<input id="' + prefix + '-num-' + i + '" type="text" inputmode="numeric" placeholder="Account number" value="' + escapeHtml(a.accountNumber) + '">' +
          '<button type="button" class="bank-remove" data-rmbank="' + prefix + ':' + i + '" aria-label="Remove account">×</button>' +
        '</div>'
      );
    }).join('');
    return (
      '<div class="field full">' +
        '<label>Bank / payment accounts</label>' +
        '<p class="status-note" style="margin:-4px 0 8px;">' + escapeHtml(hint) + '</p>' +
        '<div class="bank-list">' + rows + '</div>' +
        (banks.length < MAX_BANKS
          ? '<button type="button" class="btn-ghost small" data-addbank="' + prefix + '">+ Add account</button>'
          : '<div class="status-note">' + MAX_BANKS + ' accounts is the maximum.</div>') +
      '</div>'
    );
  }

  function totalPhotoCount() { return existingImages.length + newImages.length; }

  function resetPhotoState() {
    newImages.forEach(function (n) { if (n.previewUrl) URL.revokeObjectURL(n.previewUrl); });
    existingImages = [];
    newImages = [];
  }

  // ---------- rendering ----------

  function renderLogin() {
    return (
      '<div class="login-wrap">' +
        '<h1>Yibro Bajaj admin</h1>' +
        '<p>Enter the admin password to manage listings.</p>' +
        '<input type="password" id="admin-pass" placeholder="Admin password">' +
        '<button class="btn-primary" id="admin-pass-submit" style="width:100%;" ' + (loggingIn ? 'disabled' : '') + '>' + (loggingIn ? 'Logging in…' : 'Log in') + '</button>' +
        (loginError ? '<p class="status-note err" style="margin-top:10px;">' + escapeHtml(loginError) + '</p>' : '') +
      '</div>'
    );
  }

  function captureFormDraft() {
    var get = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
    if (!document.getElementById('af-title')) return; // form isn't on screen — nothing to capture
    formDraft = {
      type: get('af-type') || 'motorcycle',
      title: get('af-title'),
      year: get('af-year'),
      price: get('af-price'),
      mileageKm: get('af-km'),
      condition: get('af-cond') || 'used-good',
      description: get('af-desc'),
      phone: get('af-phone'),
      whatsapp: get('af-wa'),
      telegram: get('af-tg')
    };
    captureBanks('afb', formBanks);
  }

  function renderAdminForm(list) {
    var editing = editingId ? list.find(function (l) { return l.id === editingId; }) : null;
    var v = formDraft || editing || { type: 'motorcycle', title: '', year: '', price: '', mileageKm: '', condition: 'used-good', description: '', phone: '', whatsapp: '', telegram: '' };
    var thumbs = existingImages.map(function (img, i) {
      return (
        '<div class="img-thumb' + (i === 0 && newImages.length === 0 ? ' cover' : '') + '">' +
          '<img src="' + img.url + '">' +
          (i === 0 && totalPhotoCount() > 0 ? '<span class="img-thumb-label">Cover</span>' : '') +
          '<button type="button" class="img-thumb-remove" data-rmimg="existing:' + i + '" aria-label="Remove photo">×</button>' +
        '</div>'
      );
    }).join('') + newImages.map(function (img, i) {
      var isCover = existingImages.length === 0 && i === 0;
      return (
        '<div class="img-thumb' + (isCover ? ' cover' : '') + '">' +
          '<img src="' + img.previewUrl + '">' +
          (isCover ? '<span class="img-thumb-label">Cover</span>' : '') +
          '<button type="button" class="img-thumb-remove" data-rmimg="new:' + i + '" aria-label="Remove photo">×</button>' +
        '</div>'
      );
    }).join('');

    return (
      '<h2 style="margin-top:0;">' + (editing ? 'Edit listing' : 'Add a listing') + '</h2>' +
      '<div class="form-grid">' +
        '<div class="field"><label>Type</label><select id="af-type">' +
          '<option value="motorcycle"' + (v.type === 'motorcycle' ? ' selected' : '') + '>Motorcycle</option>' +
          '<option value="bajaj"' + (v.type === 'bajaj' ? ' selected' : '') + '>Bajaj (three-wheeler)</option>' +
          '<option value="other"' + (v.type === 'other' ? ' selected' : '') + '>Other</option>' +
        '</select></div>' +
        '<div class="field"><label>Title</label><input id="af-title" type="text" placeholder="e.g. Bajaj Boxer 150" value="' + escapeHtml(v.title) + '"></div>' +
        '<div class="field"><label>Year</label><input id="af-year" type="number" placeholder="2023" value="' + escapeHtml(v.year) + '"></div>' +
        '<div class="field"><label>Price (ETB)</label><input id="af-price" type="number" placeholder="95000" value="' + escapeHtml(v.price) + '"></div>' +
        '<div class="field"><label>Mileage (km)</label><input id="af-km" type="number" placeholder="9000" value="' + escapeHtml(v.mileageKm) + '"></div>' +
        '<div class="field"><label>Condition</label><select id="af-cond">' +
          '<option value="new"' + (v.condition === 'new' ? ' selected' : '') + '>Brand new</option>' +
          '<option value="used-excellent"' + (v.condition === 'used-excellent' ? ' selected' : '') + '>Used — excellent</option>' +
          '<option value="used-good"' + (v.condition === 'used-good' ? ' selected' : '') + '>Used — good</option>' +
          '<option value="used-fair"' + (v.condition === 'used-fair' ? ' selected' : '') + '>Used — fair</option>' +
        '</select></div>' +
        '<div class="field full"><label>Description</label><textarea id="af-desc" placeholder="Condition notes, service history, anything a buyer should know">' + escapeHtml(v.description) + '</textarea></div>' +
        '<div class="field"><label>Phone for this listing (optional)</label><input id="af-phone" type="text" placeholder="Leave blank to use business phone" value="' + escapeHtml(v.phone) + '"></div>' +
        '<div class="field"><label>WhatsApp for this listing (optional)</label><input id="af-wa" type="text" placeholder="Leave blank to use business WhatsApp" value="' + escapeHtml(v.whatsapp) + '"></div>' +
        '<div class="field"><label>Telegram for this listing (optional)</label><input id="af-tg" type="text" placeholder="Leave blank to use business Telegram" value="' + escapeHtml(v.telegram) + '"></div>' +
        renderBankRows('afb', formBanks, 'Shown on this listing so a buyer can pay by transfer. Leave empty to use the business accounts from Business details.') +
        '<div class="field full"><label>Photos (1 to ' + MAX_PHOTOS + ' — first one is the cover photo)</label>' +
          (totalPhotoCount() < MAX_PHOTOS
            ? '<input id="af-img" type="file" accept="image/*" multiple>'
            : '<div class="status-note">' + MAX_PHOTOS + ' of ' + MAX_PHOTOS + ' photos added — remove one below to add another.</div>') +
          '<div class="img-grid" id="af-img-grid">' + thumbs + '</div>' +
          '<div class="status-note">' + totalPhotoCount() + ' of ' + MAX_PHOTOS + ' photos selected — at least 1 is required.</div>' +
        '</div>' +
      '</div>' +
      '<div class="form-actions">' +
        '<button class="btn-primary" id="af-save" ' + (busy ? 'disabled' : '') + '>' + (busy ? 'Saving…' : (editing ? 'Save changes' : 'Add listing')) + '</button>' +
        (editing ? '<button class="btn-ghost" id="af-cancel">Cancel edit</button>' : '') +
      '</div>'
    );
  }

  function renderAdminListingsManage(list) {
    if (!list.length) return '<p class="status-note">No listings yet — add your first one above.</p>';
    return '<div class="manage-list">' + list.map(function (l) {
      return (
        '<div class="manage-row">' +
          '<div class="thumb">' + ((l.images && l.images[0]) ? '<img src="' + l.images[0] + '">' : '🏍️') + '</div>' +
          '<div class="info"><div class="t">' + escapeHtml(l.title) + '</div><div class="m">' + formatPrice(l.price) + ' · ' + escapeHtml(TYPE_LABELS[l.type]) + '</div></div>' +
          '<div class="row-actions"><button data-edit="' + l.id + '">Edit</button><button class="danger" data-del="' + l.id + '">Delete</button></div>' +
        '</div>'
      );
    }).join('') + '</div>';
  }

  function renderAdminSettings() {
    var s = STATE.settings || {};
    if (settingsBanks === null) settingsBanks = normalizeBanks(s.bankAccounts);
    return (
      '<h2 style="margin-top:0;">Business details</h2>' +
      '<p class="sub">Used as the default contact info on every listing, and shown at the top of the public page.</p>' +
      '<div class="form-grid">' +
        '<div class="field"><label>Business name</label><input id="as-name" type="text" value="' + escapeHtml(s.businessName) + '"></div>' +
        '<div class="field"><label>Location</label><input id="as-loc" type="text" value="' + escapeHtml(s.location) + '"></div>' +
        '<div class="field full"><label>Tagline</label><input id="as-tag" type="text" value="' + escapeHtml(s.tagline) + '"></div>' +
        '<div class="field"><label>Phone</label><input id="as-phone" type="text" placeholder="+2519xxxxxxxx" value="' + escapeHtml(s.phone) + '"></div>' +
        '<div class="field"><label>WhatsApp number</label><input id="as-wa" type="text" placeholder="+2519xxxxxxxx" value="' + escapeHtml(s.whatsapp) + '"></div>' +
        '<div class="field"><label>Telegram username</label><input id="as-tg" type="text" placeholder="yourusername" value="' + escapeHtml(s.telegram) + '"></div>' +
        renderBankRows('asb', settingsBanks || [], 'Default accounts shown on every listing that has none of its own.') +
      '</div>' +
      '<div class="form-actions">' +
        '<button class="btn-primary" id="as-save" ' + (busy ? 'disabled' : '') + '>' + (busy ? 'Saving…' : 'Save business details') + '</button>' +
      '</div>'
    );
  }

  function renderAdminSecurity() {
    return (
      '<h2 style="margin-top:0;">Change admin password</h2>' +
      '<p class="sub">Whoever knows this password can log into this admin panel. Anyone currently logged in stays logged in after you change it.</p>' +
      '<div class="form-grid">' +
        '<div class="field full"><label>Current password</label><input id="pw-current" type="password" autocomplete="current-password"></div>' +
        '<div class="field"><label>New password</label><input id="pw-new" type="password" autocomplete="new-password"></div>' +
        '<div class="field"><label>Confirm new password</label><input id="pw-confirm" type="password" autocomplete="new-password"></div>' +
        '<div class="field full"><p class="status-note">At least 8 characters. Nothing else required, but longer and less guessable is safer.</p></div>' +
      '</div>' +
      '<div class="form-actions">' +
        '<button class="btn-primary" id="pw-save" ' + (busy ? 'disabled' : '') + '>' + (busy ? 'Saving…' : 'Change password') + '</button>' +
      '</div>'
    );
  }

  function render() {
    var app = document.getElementById('app');
    if (checkingSession) { app.innerHTML = ''; return; }
    if (!isAdmin) { app.innerHTML = renderLogin(); bindLogin(); return; }
    if (!loadedData) { app.innerHTML = '<div class="card-block">Loading…</div>'; return; }

    var list = STATE.listings.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    var html = (
      '<div class="adminbar">' +
        '<div><span class="brand">Yibro<span class="accent" style="color:var(--rust);"> Bajaj</span></span><span class="tag">Admin</span></div>' +
        '<button class="btn-ghost small" id="admin-logout">Log out</button>' +
      '</div>' +
      '<div class="card-block">' +
        '<div class="admin-tabs">' +
          '<button data-tab="listings" class="' + (adminTab === 'listings' ? 'active' : '') + '">Add / edit listings</button>' +
          '<button data-tab="manage" class="' + (adminTab === 'manage' ? 'active' : '') + '">All listings (' + list.length + ')</button>' +
          '<button data-tab="settings" class="' + (adminTab === 'settings' ? 'active' : '') + '">Business details</button>' +
          '<button data-tab="security" class="' + (adminTab === 'security' ? 'active' : '') + '">Password</button>' +
        '</div>' +
        (saveNote ? '<p class="status-note' + (saveErr ? ' err' : '') + '" style="margin:-8px 0 16px;">' + escapeHtml(saveNote) + '</p>' : '') +
        (adminTab === 'listings' ? renderAdminForm(list) : '') +
        (adminTab === 'manage' ? renderAdminListingsManage(list) : '') +
        (adminTab === 'settings' ? renderAdminSettings() : '') +
        (adminTab === 'security' ? renderAdminSecurity() : '') +
      '</div>' +
      '<p class="status-note">Changes here go live immediately — there\'s nothing else to upload.</p>'
    );
    app.innerHTML = html;
    bindAdmin();
  }

  // ---------- auth ----------

  function bindLogin() {
    var submit = document.getElementById('admin-pass-submit');
    var input = document.getElementById('admin-pass');
    if (submit) submit.addEventListener('click', doLogin);
    if (input) input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') doLogin(); });
    if (input) input.focus();
  }

  function doLogin() {
    if (loggingIn) return;
    var p = document.getElementById('admin-pass');
    var val = p ? p.value : '';
    loggingIn = true; loginError = ''; render();
    apiFetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: val })
    }).then(function (r) {
      if (r.ok) return r.json().then(function (body) {
        if (body && body.csrfToken) csrfToken = body.csrfToken; // session was regenerated — new token
        isAdmin = true; loggingIn = false; loginError = '';
        render();
        loadData();
      });
      return r.json().then(function (body) {
        loggingIn = false;
        loginError = friendlyError(body);
        render();
      });
    }).catch(function () {
      loggingIn = false;
      loginError = 'Could not reach the server — try again.';
      render();
    });
  }

  function checkSession() {
    fetch('/api/admin/me', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        if (body && body.csrfToken) csrfToken = body.csrfToken;
        isAdmin = !!body.isAdmin;
        checkingSession = false;
        render();
        if (isAdmin) loadData();
      })
      .catch(function () {
        checkingSession = false;
        isAdmin = false;
        render();
      });
  }

  function loadData() {
    loadedData = false;
    Promise.all([
      fetch('/api/settings', { credentials: 'same-origin' }).then(function (r) { return r.json(); }),
      fetch('/api/listings', { credentials: 'same-origin' }).then(function (r) { return r.json(); })
    ]).then(function (results) {
      STATE.settings = results[0];
      STATE.listings = results[1];
      loadedData = true;
      render();
    });
  }

  // ---------- bindings ----------

  function bindAdmin() {
    var logoutBtn = document.getElementById('admin-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', function () {
      apiFetch('/api/admin/logout', { method: 'POST' }).then(function () {
        isAdmin = false; csrfToken = ''; render();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
      b.addEventListener('click', function () {
        adminTab = b.getAttribute('data-tab'); editingId = null; resetPhotoState(); formDraft = null;
        formBanks = []; settingsBanks = null; saveNote = ''; render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-edit]'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-edit');
        var found = STATE.listings.find(function (l) { return l.id === id; });
        editingId = id;
        resetPhotoState();
        formDraft = null;
        existingImages = (found && found.images ? found.images : []).map(function (url) { return { url: url }; });
        formBanks = normalizeBanks(found && found.bankAccounts);
        adminTab = 'listings'; saveNote = ''; render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-del]'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-del');
        if (!confirm('Delete this listing? This cannot be undone.')) return;
        apiFetch('/api/admin/listings/' + id, { method: 'DELETE' })
          .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
          .then(function (res) {
            if (!res.ok) { saveNote = friendlyError(res.body); saveErr = true; render(); return; }
            STATE.listings = STATE.listings.filter(function (l) { return l.id !== id; });
            saveNote = 'Listing deleted.'; saveErr = false;
            render();
          });
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-rmimg]'), function (b) {
      b.addEventListener('click', function () {
        var parts = b.getAttribute('data-rmimg').split(':');
        var kind = parts[0], idx = Number(parts[1]);
        if (kind === 'existing') existingImages.splice(idx, 1);
        else {
          var removed = newImages.splice(idx, 1)[0];
          if (removed && removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
        }
        captureFormDraft();
        render();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-addbank]'), function (b) {
      b.addEventListener('click', function () {
        var prefix = b.getAttribute('data-addbank');
        if (prefix === 'afb') {
          captureFormDraft();
          if (formBanks.length < MAX_BANKS) formBanks.push(blankBank());
        } else {
          captureBanks('asb', settingsBanks);
          if (settingsBanks.length < MAX_BANKS) settingsBanks.push(blankBank());
        }
        render();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-rmbank]'), function (b) {
      b.addEventListener('click', function () {
        var parts = b.getAttribute('data-rmbank').split(':');
        var prefix = parts[0], idx = Number(parts[1]);
        if (prefix === 'afb') { captureFormDraft(); formBanks.splice(idx, 1); }
        else { captureBanks('asb', settingsBanks); settingsBanks.splice(idx, 1); }
        render();
      });
    });

    var imgInput = document.getElementById('af-img');
    if (imgInput) imgInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(imgInput.files || []);
      if (!files.length) return;
      var remaining = MAX_PHOTOS - totalPhotoCount();
      if (remaining <= 0) return;
      files = files.slice(0, remaining);
      captureFormDraft();
      Promise.all(files.map(compressImage)).then(function (blobs) {
        blobs.forEach(function (blob) {
          newImages.push({ blob: blob, previewUrl: URL.createObjectURL(blob) });
        });
        render();
      }).catch(function () {
        saveNote = 'Could not read one of those images.'; saveErr = true; render();
      });
    });

    var afSave = document.getElementById('af-save');
    if (afSave) afSave.addEventListener('click', saveListing);
    var afCancel = document.getElementById('af-cancel');
    if (afCancel) afCancel.addEventListener('click', function () { editingId = null; resetPhotoState(); formDraft = null; formBanks = []; render(); });

    var asSave = document.getElementById('as-save');
    if (asSave) asSave.addEventListener('click', saveSettings);

    var pwSave = document.getElementById('pw-save');
    if (pwSave) pwSave.addEventListener('click', changePassword);
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var maxW = 640;
          var scale = Math.min(1, maxW / img.width);
          var w = Math.max(1, Math.round(img.width * scale));
          var h = Math.max(1, Math.round(img.height * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          canvas.toBlob(function (blob) {
            if (blob) resolve(blob); else reject(new Error('toBlob failed'));
          }, 'image/jpeg', 0.72);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function saveListing() {
    if (busy) return;
    captureFormDraft();
    var title = (document.getElementById('af-title').value || '').trim();
    var price = Number(document.getElementById('af-price').value || 0);
    if (!title) { saveNote = 'Title is required.'; saveErr = true; render(); return; }
    if (!price) { saveNote = 'Price is required.'; saveErr = true; render(); return; }
    if (totalPhotoCount() < 1) { saveNote = 'Add at least 1 photo (up to ' + MAX_PHOTOS + ').'; saveErr = true; render(); return; }

    var fd = new FormData();
    fd.append('type', document.getElementById('af-type').value);
    fd.append('title', title);
    fd.append('year', document.getElementById('af-year').value);
    fd.append('price', String(price));
    fd.append('mileageKm', document.getElementById('af-km').value || '0');
    fd.append('condition', document.getElementById('af-cond').value);
    fd.append('description', document.getElementById('af-desc').value || '');
    fd.append('phone', document.getElementById('af-phone').value || '');
    fd.append('whatsapp', document.getElementById('af-wa').value || '');
    fd.append('telegram', document.getElementById('af-tg').value || '');
    fd.append('bankAccounts', JSON.stringify(cleanBanks(formBanks)));
    if (editingId) fd.append('keepImages', JSON.stringify(existingImages.map(function (i) { return i.url; })));
    newImages.forEach(function (n) { fd.append('images', n.blob, 'photo.jpg'); });

    var wasEditing = !!editingId;
    var url = wasEditing ? ('/api/admin/listings/' + editingId) : '/api/admin/listings';
    var method = wasEditing ? 'PUT' : 'POST';

    busy = true; render();
    apiFetch(url, { method: method, body: fd })
      .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
      .then(function (res) {
        busy = false;
        if (!res.ok) { saveNote = friendlyError(res.body); saveErr = true; render(); return; }
        if (wasEditing) {
          var idx = STATE.listings.findIndex(function (l) { return l.id === editingId; });
          if (idx !== -1) STATE.listings[idx] = res.body; else STATE.listings.push(res.body);
        } else {
          STATE.listings.push(res.body);
        }
        editingId = null;
        resetPhotoState();
        formDraft = null;
        formBanks = [];
        saveNote = (wasEditing ? 'Listing updated and live.' : 'Listing added and live.');
        saveErr = false;
        render();
      })
      .catch(function () {
        busy = false;
        saveNote = 'Could not reach the server — try again.'; saveErr = true; render();
      });
  }

  function saveSettings() {
    if (busy) return;
    var patch = {
      businessName: document.getElementById('as-name').value.trim(),
      location: document.getElementById('as-loc').value.trim(),
      tagline: document.getElementById('as-tag').value.trim(),
      phone: document.getElementById('as-phone').value.trim(),
      whatsapp: document.getElementById('as-wa').value.trim(),
      telegram: document.getElementById('as-tg').value.trim(),
      bankAccounts: (captureBanks('asb', settingsBanks || []), cleanBanks(settingsBanks || []))
    };
    busy = true; render();
    apiFetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    }).then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
      .then(function (res) {
        busy = false;
        if (!res.ok) { saveNote = friendlyError(res.body); saveErr = true; render(); return; }
        STATE.settings = res.body;
        settingsBanks = normalizeBanks(res.body.bankAccounts);
        saveNote = 'Business details updated and live.'; saveErr = false;
        render();
      })
      .catch(function () {
        busy = false;
        saveNote = 'Could not reach the server — try again.'; saveErr = true; render();
      });
  }

  function changePassword() {
    if (busy) return;
    var current = document.getElementById('pw-current').value || '';
    var next = document.getElementById('pw-new').value || '';
    var confirm = document.getElementById('pw-confirm').value || '';

    if (!current) { saveNote = 'Enter your current password.'; saveErr = true; render(); return; }
    if (next.length < 8) { saveNote = 'New password must be at least 8 characters.'; saveErr = true; render(); return; }
    if (next !== confirm) { saveNote = 'New passwords don\'t match.'; saveErr = true; render(); return; }

    busy = true; render();
    apiFetch('/api/admin/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: next })
    }).then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
      .then(function (res) {
        busy = false;
        if (!res.ok) { saveNote = friendlyError(res.body); saveErr = true; render(); return; }
        saveNote = 'Password changed.'; saveErr = false; render();
      })
      .catch(function () {
        busy = false;
        saveNote = 'Could not reach the server — try again.'; saveErr = true; render();
      });
  }

  render();
  checkSession();
})();
