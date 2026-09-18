(function () {
  "use strict";

  var STATE = { settings: {}, listings: [] };
  var filters = { q: '', type: 'all', min: '', max: '', sort: 'new' };
  var openListingId = null;
  var activeImageIndex = 0;
  var loaded = false;
  var loadError = false;

  var LANG_KEY = 'yibro_lang';
  var lang = 'en';
  try { lang = localStorage.getItem(LANG_KEY) || 'en'; } catch (e) { lang = 'en'; }

  var STR = {
    en: {
      search_ph: 'Search model or brand',
      type_all: 'All types', type_motorcycle: 'Motorcycle', type_bajaj: 'Bajaj (three-wheeler)', type_other: 'Other vehicle',
      min_ph: 'Min ETB', max_ph: 'Max ETB',
      sort_new: 'Newest first', sort_price_asc: 'Price: low to high', sort_price_desc: 'Price: high to low',
      listed_suffix: ' listed',
      hero_sub: 'Browse current stock from {business} in {location}. No account needed — reach us directly by phone, WhatsApp or Telegram on any listing.',
      stat_vehicles: 'Vehicles listed', stat_location: 'Location', stat_reach: 'Reach us', reach_channels: 'Phone · WhatsApp · Telegram',
      call: 'Call', whatsapp: 'WhatsApp', telegram: 'Telegram',
      empty_filtered: 'No vehicles match your filters right now. Try widening your search.',
      footer_note: 'Built for direct contact only, no account required to browse.',
      back_to_listings: 'Back to listings',
      detail_cta: 'Interested? Reach out directly — no account or form needed.',
      loading: 'Loading vehicles…',
      load_error: 'Could not load listings right now. Please refresh the page.',
      cond_new: 'Brand new', cond_excellent: 'Used — excellent', cond_good: 'Used — good', cond_fair: 'Used — fair',
      km: 'km', currency: 'ETB',
      wa_msg_listing: 'Hello, I am interested in the {title} listed on Yibro Bajaj.',
      wa_msg_general: 'Hello, I would like to know more about your vehicles.',
      pay_title: 'Ready to pay? Bank details',
      pay_note: 'Send payment only after you have agreed on the vehicle and price with us by phone. Always confirm the transfer with us afterwards.',
      pay_acct_name: 'Account name',
      pay_acct_number: 'Account number',
      copy: 'Copy',
      copied: 'Copied'
    },
    am: {
      search_ph: 'ሞዴል ወይም ብራንድ ይፈልጉ',
      type_all: 'ሁሉም ዓይነቶች', type_motorcycle: 'ሞተር ሳይክል', type_bajaj: 'ባጃጅ (ባለ ሶስት ጎማ)', type_other: 'ሌላ ተሽከርካሪ',
      min_ph: 'ዝቅተኛ ብር', max_ph: 'ከፍተኛ ብር',
      sort_new: 'አዲስ መጀመሪያ', sort_price_asc: 'ዋጋ፦ ከዝቅተኛ ወደ ከፍተኛ', sort_price_desc: 'ዋጋ፦ ከከፍተኛ ወደ ዝቅተኛ',
      listed_suffix: ' ተዘርዝረዋል',
      hero_sub: 'ከ{business} በ{location} ያለውን ዝርዝር ያስሱ። መለያ አያስፈልግም — በማንኛውም ዝርዝር ላይ በስልክ፣ በዋትስአፕ ወይም በቴሌግራም በቀጥታ ያግኙን።',
      stat_vehicles: 'የተዘረዘሩ ተሽከርካሪዎች', stat_location: 'አካባቢ', stat_reach: 'ያግኙን', reach_channels: 'ስልክ · ዋትስአፕ · ቴሌግራም',
      call: 'ይደውሉ', whatsapp: 'ዋትስአፕ', telegram: 'ቴሌግራም',
      empty_filtered: 'በአሁኑ ጊዜ ከማጣሪያዎ ጋር የሚዛመድ ተሽከርካሪ የለም። ፍለጋዎን ያስፉ።',
      footer_note: 'ለቀጥታ ግንኙነት ብቻ የተሰራ፣ ለማሰስ መለያ አያስፈልግም።',
      back_to_listings: 'ወደ ዝርዝሮች ተመለስ',
      detail_cta: 'ፍላጎት አለዎት? ቀጥታ ያግኙን — መለያ ወይም ቅጽ አያስፈልግም።',
      loading: 'ተሽከርካሪዎችን በመጫን ላይ…',
      load_error: 'ዝርዝሮችን አሁን መጫን አልተቻለም። እባክዎ ገጹን ያድሱ።',
      cond_new: 'አዲስ', cond_excellent: 'ያገለገለ — በጣም ጥሩ', cond_good: 'ያገለገለ — ጥሩ', cond_fair: 'ያገለገለ — መካከለኛ',
      km: 'ኪ.ሜ', currency: 'ብር',
      wa_msg_listing: 'ሰላም፣ በይብሮ ባጃጅ ላይ በተዘረዘረው {title} ላይ ፍላጎት አለኝ።',
      wa_msg_general: 'ሰላም፣ ስለ ተሽከርካሪዎችዎ የበለጠ ማወቅ እፈልጋለሁ።',
      pay_title: 'ለመክፈል ተዘጋጅተዋል? የባንክ መረጃ',
      pay_note: 'ክፍያ የሚፈጸመው ስለ ተሽከርካሪውና ስለ ዋጋው በስልክ ከተስማማን በኋላ ብቻ ነው። ካስተላለፉ በኋላ ሁልጊዜ ያረጋግጡልን።',
      pay_acct_name: 'የመያዣ ስም',
      pay_acct_number: 'የመያዣ ቁጥር',
      copy: 'ቅዳ',
      copied: 'ተቀድቷል'
    }
  };

  function t(key) { return (STR[lang] && STR[lang][key] != null) ? STR[lang][key] : STR.en[key]; }
  function fmt(str, vars) {
    return str.replace(/\{(\w+)\}/g, function (m, k) { return (vars && vars[k] != null) ? vars[k] : ''; });
  }
  function setLang(l) {
    lang = (l === 'am') ? 'am' : 'en';
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    render();
  }

  var TYPE_KEYS = { motorcycle: 'type_motorcycle', bajaj: 'type_bajaj', other: 'type_other' };
  var COND_KEYS = { 'new': 'cond_new', 'used-excellent': 'cond_excellent', 'used-good': 'cond_good', 'used-fair': 'cond_fair' };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function digitsOnly(s) { return String(s || '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, ''); }
  function formatPrice(n) { n = Number(n) || 0; return n.toLocaleString('en-US') + ' ' + t('currency'); }
  function waLink(number, text) {
    var d = digitsOnly(number).replace('+', '');
    if (!d) return '';
    return 'https://wa.me/' + d + (text ? ('?text=' + encodeURIComponent(text)) : '');
  }
  function telLink(number) { var d = digitsOnly(number); return d ? ('tel:' + d) : ''; }
  function tgLink(handle) {
    if (!handle) return '';
    return 'https://t.me/' + String(handle).replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
  }

  var ICONS = {
    call: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M17.47 14.38c-.29-.15-1.7-.84-1.97-.93-.26-.1-.46-.15-.65.15-.2.29-.75.93-.92 1.12-.17.2-.34.22-.63.08-.29-.15-1.22-.45-2.33-1.44-.86-.77-1.44-1.72-1.61-2.01-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.15-.17.2-.29.29-.48.1-.2.05-.37-.02-.51-.08-.15-.65-1.57-.89-2.15-.24-.57-.48-.5-.65-.5-.17 0-.37-.02-.56-.02s-.51.07-.78.37c-.26.29-1.02 1-1.02 2.43s1.04 2.82 1.19 3.01c.15.2 2.05 3.13 4.96 4.39.69.3 1.23.48 1.65.61.69.22 1.32.19 1.82.11.55-.08 1.7-.7 1.94-1.37.24-.68.24-1.26.17-1.38-.07-.13-.26-.2-.55-.35z"/><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.87.51 3.62 1.4 5.12L2 22l5.11-1.5a9.87 9.87 0 0 0 4.93 1.32h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.14h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.11.91.92-3.03-.2-.31a8.18 8.18 0 0 1-1.26-4.36c0-4.52 3.68-8.2 8.15-8.2 2.18 0 4.22.85 5.76 2.39a8.09 8.09 0 0 1 2.39 5.76c0 4.52-3.68 8.17-8.15 8.17z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M21.94 3.36 18.6 20.13c-.25 1.11-.9 1.38-1.82.86l-5.03-3.71-2.43 2.34c-.27.27-.49.49-1 .49l.36-5.1L18.3 6.5c.4-.35-.09-.55-.62-.2L6.7 13.4l-4.98-1.56c-1.08-.34-1.1-1.08.23-1.6L20.6 2.24c.9-.33 1.68.2 1.34 1.12z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
  };

  // A listing can carry its own bank accounts; if it doesn't, fall back to
  // the business-wide ones from settings.
  function bankAccountsFor(listing) {
    var own = listing && Array.isArray(listing.bankAccounts) ? listing.bankAccounts : [];
    if (own.length) return own;
    var s = STATE.settings || {};
    return Array.isArray(s.bankAccounts) ? s.bankAccounts : [];
  }

  function renderBankPanel(listing) {
    var accounts = bankAccountsFor(listing).filter(function (a) { return a && a.accountNumber; });
    if (!accounts.length) return '';
    return (
      '<div class="pay-box">' +
        '<div class="pay-head">' +
          '<h3>' + escapeHtml(t('pay_title')) + '</h3>' +
          '<p>' + escapeHtml(t('pay_note')) + '</p>' +
        '</div>' +
        '<div class="pay-list">' + accounts.map(function (a, i) {
          return (
            '<div class="pay-row">' +
              '<div class="pay-bank">' + escapeHtml(a.bank || '') + '</div>' +
              (a.accountName
                ? '<div class="pay-line"><span class="pay-label">' + escapeHtml(t('pay_acct_name')) + '</span>' +
                  '<span class="pay-value">' + escapeHtml(a.accountName) + '</span></div>'
                : '') +
              '<div class="pay-line"><span class="pay-label">' + escapeHtml(t('pay_acct_number')) + '</span>' +
                '<span class="pay-value mono" id="pay-num-' + i + '">' + escapeHtml(a.accountNumber) + '</span>' +
                '<button type="button" class="copy-btn" data-copy="' + escapeHtml(a.accountNumber) + '">' +
                  ICONS.copy + '<span>' + escapeHtml(t('copy')) + '</span>' +
                '</button>' +
              '</div>' +
            '</div>'
          );
        }).join('') + '</div>' +
      '</div>'
    );
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // http:// origins and older browsers don't get the clipboard API — fall
    // back to a hidden textarea + execCommand.
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        // contentEditable + not-readonly is what makes select() work on
        // iOS Safari; the off-screen position keeps it invisible.
        ta.contentEditable = 'true';
        ta.readOnly = false;
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        // execCommand('copy') copies the *focused* selection — without
        // focus() it runs and copies nothing.
        ta.focus();
        ta.select();
        if (ta.setSelectionRange) ta.setSelectionRange(0, text.length);
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('copy failed'));
      } catch (e) { reject(e); }
    });
  }

  function contactButtons(listing) {
    var s = STATE.settings || {};
    var phone = listing && listing.phone ? listing.phone : s.phone;
    var wa = listing && listing.whatsapp ? listing.whatsapp : s.whatsapp;
    var tg = listing && listing.telegram ? listing.telegram : s.telegram;
    var msg = listing ? fmt(t('wa_msg_listing'), { title: listing.title }) : t('wa_msg_general');
    var html = '';
    var tel = telLink(phone);
    if (tel) html += '<a class="contact-btn call" href="' + tel + '">' + ICONS.call + '<span>' + t('call') + '</span></a>';
    var w = waLink(wa, msg);
    if (w) html += '<a class="contact-btn whatsapp" href="' + w + '" target="_blank" rel="noopener">' + ICONS.whatsapp + '<span>' + t('whatsapp') + '</span></a>';
    var tl = tgLink(tg);
    if (tl) html += '<a class="contact-btn telegram" href="' + tl + '" target="_blank" rel="noopener">' + ICONS.telegram + '<span>' + t('telegram') + '</span></a>';
    return html;
  }

  function filteredListings() {
    var q = filters.q.trim().toLowerCase();
    var list = STATE.listings.filter(function (l) {
      if (filters.type !== 'all' && l.type !== filters.type) return false;
      if (q && (l.title + ' ' + (l.description || '')).toLowerCase().indexOf(q) === -1) return false;
      if (filters.min && Number(l.price) < Number(filters.min)) return false;
      if (filters.max && Number(l.price) > Number(filters.max)) return false;
      return true;
    });
    list.sort(function (a, b) {
      if (filters.sort === 'price-asc') return a.price - b.price;
      if (filters.sort === 'price-desc') return b.price - a.price;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    return list;
  }

  function renderCard(l) {
    var cover = (l.images && l.images[0]) ? l.images[0] : '';
    var img = cover ? '<img src="' + cover + '" alt="' + escapeHtml(l.title) + '">' : '<span class="ph">🏍️</span>';
    return (
      '<div class="card" data-open="' + l.id + '" role="button" tabindex="0" aria-label="View details for ' + escapeHtml(l.title) + '">' +
        '<div class="plate">' + escapeHtml(t(TYPE_KEYS[l.type]) || 'Vehicle') + '</div>' +
        '<div class="media">' + img + '</div>' +
        '<div class="body">' +
          '<h3>' + escapeHtml(l.title) + '</h3>' +
          '<div class="meta">' + (l.year ? escapeHtml(l.year) + ' • ' : '') + (l.mileageKm ? l.mileageKm.toLocaleString('en-US') + ' ' + t('km') + ' • ' : '') + escapeHtml(t(COND_KEYS[l.condition]) || '') + '</div>' +
          '<div class="price">' + formatPrice(l.price) + '</div>' +
          (l.description ? '<div class="desc">' + escapeHtml(l.description) + '</div>' : '') +
          '<div class="actions">' + contactButtons(l) + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderFilters() {
    var count = filteredListings().length;
    return (
      '<div class="filters">' +
        '<div class="search-wrap"><span class="search-icon">' + ICONS.search + '</span>' +
          '<input type="text" id="f-q" placeholder="' + escapeHtml(t('search_ph')) + '" value="' + escapeHtml(filters.q) + '"></div>' +
        '<select id="f-type">' +
          '<option value="all"' + (filters.type === 'all' ? ' selected' : '') + '>' + escapeHtml(t('type_all')) + '</option>' +
          '<option value="motorcycle"' + (filters.type === 'motorcycle' ? ' selected' : '') + '>' + escapeHtml(t('type_motorcycle')) + '</option>' +
          '<option value="bajaj"' + (filters.type === 'bajaj' ? ' selected' : '') + '>' + escapeHtml(t('type_bajaj')) + '</option>' +
          '<option value="other"' + (filters.type === 'other' ? ' selected' : '') + '>' + escapeHtml(t('type_other')) + '</option>' +
        '</select>' +
        '<div class="price-range">' +
          '<input type="number" id="f-min" placeholder="' + escapeHtml(t('min_ph')) + '" value="' + escapeHtml(filters.min) + '">' +
          '<span>–</span>' +
          '<input type="number" id="f-max" placeholder="' + escapeHtml(t('max_ph')) + '" value="' + escapeHtml(filters.max) + '">' +
        '</div>' +
        '<select id="f-sort">' +
          '<option value="new"' + (filters.sort === 'new' ? ' selected' : '') + '>' + escapeHtml(t('sort_new')) + '</option>' +
          '<option value="price-asc"' + (filters.sort === 'price-asc' ? ' selected' : '') + '>' + escapeHtml(t('sort_price_asc')) + '</option>' +
          '<option value="price-desc"' + (filters.sort === 'price-desc' ? ' selected' : '') + '>' + escapeHtml(t('sort_price_desc')) + '</option>' +
        '</select>' +
        '<div class="count">' + count + escapeHtml(t('listed_suffix')) + '</div>' +
      '</div>'
    );
  }

  function renderHero() {
    var s = STATE.settings || {};
    return (
      '<div class="hero">' +
        '<div class="hero-copy">' +
          '<span class="hero-mark" aria-hidden="true"></span>' +
          '<h1>' + escapeHtml(s.tagline || '') + '</h1>' +
          '<p>' + escapeHtml(fmt(t('hero_sub'), { business: s.businessName || '', location: s.location || '' })) + '</p>' +
        '</div>' +
        '<div class="spec-plate"><dl>' +
          '<dt>' + escapeHtml(t('stat_vehicles')) + '</dt><dd>' + STATE.listings.length + '</dd>' +
          '<dt>' + escapeHtml(t('stat_location')) + '</dt><dd>' + escapeHtml(s.location || '') + '</dd>' +
          '<dt>' + escapeHtml(t('stat_reach')) + '</dt><dd>' + escapeHtml(t('reach_channels')) + '</dd>' +
        '</dl></div>' +
      '</div>'
    );
  }

  function renderTopbar() {
    var s = STATE.settings || {};
    return (
      '<div class="topbar">' +
        '<div class="brand">' +
          '<div class="brand-badge" aria-hidden="true">YB</div>' +
          '<div class="brand-text"><div class="brand-mark">Yibro<span class="accent"> Bajaj</span></div><div class="brand-loc">' + escapeHtml(s.location || '') + '</div></div>' +
        '</div>' +
        '<div class="topbar-right">' +
          '<div class="lang-switch" role="group" aria-label="Language">' +
            '<button type="button" class="lang-btn' + (lang === 'en' ? ' active' : '') + '" data-lang="en">EN</button>' +
            '<button type="button" class="lang-btn' + (lang === 'am' ? ' active' : '') + '" data-lang="am">አማ</button>' +
          '</div>' +
          '<div class="contact-row">' + contactButtons(null) + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function openListing(id) {
    openListingId = id; activeImageIndex = 0;
    var url = new URL(window.location.href);
    url.searchParams.set('v', id);
    window.history.pushState({ listing: id }, '', url);
    render();
    window.scrollTo(0, 0);
  }

  function closeListing() {
    openListingId = null;
    var url = new URL(window.location.href);
    url.searchParams.delete('v');
    window.history.pushState({}, '', url);
    render();
    window.scrollTo(0, 0);
  }

  function renderDetailPage(l) {
    var images = (l.images && l.images.length) ? l.images : [];
    var idx = images.length ? Math.min(activeImageIndex, images.length - 1) : 0;
    var mainSrc = images.length ? images[idx] : '';
    var mainHtml = mainSrc ? '<img src="' + mainSrc + '" alt="' + escapeHtml(l.title) + '">' : '<span class="ph">🏍️</span>';
    var thumbs = images.length > 1 ? (
      '<div class="detail-thumbs">' + images.map(function (src, i) {
        return '<button type="button" class="detail-thumb' + (i === idx ? ' active' : '') + '" data-imgidx="' + i + '" aria-label="Photo ' + (i + 1) + '"><img src="' + src + '" alt=""></button>';
      }).join('') + '</div>'
    ) : '';
    return (
      '<div class="detail-page">' +
        '<button type="button" class="back-link" id="detail-back">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>' +
          '<span>' + escapeHtml(t('back_to_listings')) + '</span>' +
        '</button>' +
        '<div class="detail-grid">' +
          '<div class="detail-gallery">' +
            '<div class="detail-plate">' + escapeHtml(t(TYPE_KEYS[l.type]) || 'Vehicle') + '</div>' +
            '<div class="detail-media">' + mainHtml + '</div>' +
            thumbs +
          '</div>' +
          '<div class="detail-info">' +
            '<h1>' + escapeHtml(l.title) + '</h1>' +
            '<div class="meta">' + (l.year ? escapeHtml(l.year) + ' • ' : '') + (l.mileageKm ? l.mileageKm.toLocaleString('en-US') + ' ' + t('km') + ' • ' : '') + escapeHtml(t(COND_KEYS[l.condition]) || '') + '</div>' +
            '<div class="price">' + formatPrice(l.price) + '</div>' +
            (l.description ? '<p class="desc">' + escapeHtml(l.description) + '</p>' : '') +
            '<div class="detail-cta">' +
              '<p class="detail-cta-label">' + escapeHtml(t('detail_cta')) + '</p>' +
              '<div class="actions">' + contactButtons(l) + '</div>' +
            '</div>' +
            renderBankPanel(l) +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function render() {
    var app = document.getElementById('app');
    if (!loaded) {
      app.innerHTML = '<div class="empty" style="margin-top:60px;">' + escapeHtml(t('loading')) + '</div>';
      return;
    }
    if (loadError) {
      app.innerHTML = '<div class="empty" style="margin-top:60px;">' + escapeHtml(t('load_error')) + '</div>';
      return;
    }
    if (openListingId) {
      var open = STATE.listings.find(function (x) { return x.id === openListingId; });
      if (open) {
        app.innerHTML = renderTopbar() + renderDetailPage(open);
        bind();
        return;
      }
      openListingId = null; // stale id (e.g. deleted) — fall through to the listings view
    }
    var list = filteredListings();
    var html = (
      renderTopbar() +
      renderHero() +
      '<div class="road-divider" aria-hidden="true"></div>' +
      renderFilters() +
      (list.length
        ? '<div class="grid">' + list.map(renderCard).join('') + '</div>'
        : '<div class="empty">' + escapeHtml(t('empty_filtered')) + '</div>'
      ) +
      '<div class="road-divider" aria-hidden="true"></div>' +
      '<footer><div>' + escapeHtml((STATE.settings || {}).businessName || '') + ' — ' + escapeHtml((STATE.settings || {}).location || '') + '</div><div>' + escapeHtml(t('footer_note')) + '</div></footer>'
    );
    app.innerHTML = html;
    bind();
  }

  function bind() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-lang]'), function (b) {
      b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); });
    });

    var q = document.getElementById('f-q');
    if (q) q.addEventListener('input', function () { filters.q = q.value; render(); });
    var ty = document.getElementById('f-type');
    if (ty) ty.addEventListener('change', function () { filters.type = ty.value; render(); });
    var mn = document.getElementById('f-min');
    if (mn) mn.addEventListener('change', function () { filters.min = mn.value; render(); });
    var mx = document.getElementById('f-max');
    if (mx) mx.addEventListener('change', function () { filters.max = mx.value; render(); });
    var so = document.getElementById('f-sort');
    if (so) so.addEventListener('change', function () { filters.sort = so.value; render(); });

    Array.prototype.forEach.call(document.querySelectorAll('[data-open]'), function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        openListing(card.getAttribute('data-open'));
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openListing(card.getAttribute('data-open'));
        }
      });
    });

    var backBtn = document.getElementById('detail-back');
    if (backBtn) backBtn.addEventListener('click', closeListing);

    Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (b) {
      b.addEventListener('click', function () {
        var label = b.querySelector('span');
        var original = label ? label.textContent : '';
        copyText(b.getAttribute('data-copy')).then(function () {
          b.classList.add('copied');
          if (label) label.textContent = t('copied');
          setTimeout(function () {
            b.classList.remove('copied');
            if (label) label.textContent = original;
          }, 1600);
        }).catch(function () {
          // Copying was blocked — select the number so it can be copied by hand.
          var el = b.parentNode.querySelector('.pay-value.mono');
          if (el && window.getSelection) {
            var range = document.createRange();
            range.selectNodeContents(el);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
        });
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-imgidx]'), function (b) {
      b.addEventListener('click', function () { activeImageIndex = Number(b.getAttribute('data-imgidx')); render(); });
    });
  }

  window.addEventListener('popstate', function () {
    var v = new URL(window.location.href).searchParams.get('v');
    openListingId = v || null;
    activeImageIndex = 0;
    render();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openListingId) { closeListing(); }
  });

  function load() {
    var initialV = new URL(window.location.href).searchParams.get('v');
    if (initialV) openListingId = initialV;
    Promise.all([
      fetch('/api/settings').then(function (r) { return r.json(); }),
      fetch('/api/listings').then(function (r) { return r.json(); })
    ]).then(function (results) {
      STATE.settings = results[0];
      STATE.listings = results[1];
      loaded = true;
      render();
    }).catch(function () {
      loaded = true;
      loadError = true;
      render();
    });
  }

  render();
  load();
})();
