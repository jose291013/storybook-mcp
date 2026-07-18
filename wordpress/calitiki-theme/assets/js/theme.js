(function () {
  const LANGUAGE_PREFERENCE_KEY = 'calitiki-language-preference';
  const ACCOUNT_SCROLL_KEY = 'calitiki-account-scroll-target';

  function languageCode(value) {
    return String(value || '').trim().toLowerCase().replace('_', '-').split('-')[0];
  }

  function languageUrlKey(value) {
    const url = new URL(value, window.location.href);
    return url.pathname.replace(/\/+$/, '') + url.search;
  }

  function safeStorage(storage, action, key, value) {
    try {
      if (action === 'get') return storage.getItem(key);
      if (action === 'set') storage.setItem(key, value);
      if (action === 'remove') storage.removeItem(key);
    } catch (error) {
      return null;
    }
    return null;
  }

  function setupLanguagePreference() {
    const switcher = document.querySelector('[data-calitiki-language-switcher]');
    if (!switcher) return;
    const links = [...switcher.querySelectorAll('a[href]')];
    const linkByLanguage = new Map();
    const languageByUrl = new Map();
    try {
      const options = JSON.parse(switcher.dataset.calitikiLanguageOptions || '[]');
      options.forEach(function (option) {
        const code = languageCode(option.code);
        if (!code || !option.url) return;
        const urlKey = languageUrlKey(option.url);
        languageByUrl.set(urlKey, code);
        const matchingLink = links.find(function (link) { return languageUrlKey(link.href) === urlKey; });
        if (matchingLink) linkByLanguage.set(code, matchingLink);
      });
    } catch (error) {
      // The visible switcher remains usable even if optional metadata is malformed.
    }
    links.forEach(function (link) {
      const code = languageCode(link.getAttribute('lang') || link.getAttribute('hreflang') || link.dataset.languageCode || languageByUrl.get(languageUrlKey(link.href)));
      if (code) linkByLanguage.set(code, link);
      link.addEventListener('click', function () {
        if (code) safeStorage(window.localStorage, 'set', LANGUAGE_PREFERENCE_KEY, code);
      });
    });
    const currentLanguage = languageCode(document.documentElement.lang);
    const availableLanguages = new Set([currentLanguage, ...linkByLanguage.keys()].filter(Boolean));
    const savedLanguage = languageCode(safeStorage(window.localStorage, 'get', LANGUAGE_PREFERENCE_KEY));
    if (savedLanguage && availableLanguages.has(savedLanguage)) return;
    const browserLanguages = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language];
    const detectedLanguage = browserLanguages.map(languageCode).find(function (code) {
      return availableLanguages.has(code);
    });
    if (!detectedLanguage) return;
    safeStorage(window.localStorage, 'set', LANGUAGE_PREFERENCE_KEY, detectedLanguage);
    const destination = linkByLanguage.get(detectedLanguage);
    if (detectedLanguage !== currentLanguage && destination) window.location.replace(destination.href);
  }

  function setupAccountContentScroll() {
    const accountNavigation = document.querySelector('.woocommerce-MyAccount-navigation');
    const accountContent = document.querySelector('.woocommerce-MyAccount-content');
    if (!accountNavigation || !accountContent) return;
    accountNavigation.addEventListener('click', function (event) {
      const link = event.target.closest('a[href]');
      if (!link || !window.matchMedia('(max-width: 820px)').matches) return;
      const destination = new URL(link.href, window.location.href);
      safeStorage(window.sessionStorage, 'set', ACCOUNT_SCROLL_KEY, destination.pathname + destination.search);
    });
    const expectedTarget = safeStorage(window.sessionStorage, 'get', ACCOUNT_SCROLL_KEY);
    const currentTarget = window.location.pathname + window.location.search;
    if (!expectedTarget || expectedTarget !== currentTarget || !window.matchMedia('(max-width: 820px)').matches) return;
    safeStorage(window.sessionStorage, 'remove', ACCOUNT_SCROLL_KEY);
    window.setTimeout(function () {
      accountContent.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
    }, 160);
  }

  setupLanguagePreference();
  setupAccountContentScroll();

  const universeToggle = document.querySelector('[data-universe-toggle]');
  if (universeToggle) {
    const gallery = document.getElementById(universeToggle.getAttribute('aria-controls'));
    universeToggle.addEventListener('click', function () {
      const expanded = universeToggle.getAttribute('aria-expanded') === 'true';
      universeToggle.setAttribute('aria-expanded', String(!expanded));
      gallery.hidden = expanded;
      universeToggle.querySelector('span').textContent = expanded ? universeToggle.dataset.openLabel : universeToggle.dataset.closeLabel;
      universeToggle.querySelector('b').textContent = expanded ? '↓' : '↑';
    });
  }
  const toggle = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('.site-navigation');
  if (!toggle || !navigation) return;
  function positionMobileNavigation() {
    const header = document.querySelector('.site-header');
    if (!header || !window.matchMedia('(max-width: 820px)').matches) return;
    document.documentElement.style.setProperty('--calitiki-mobile-menu-top', Math.max(0, header.getBoundingClientRect().bottom) + 'px');
  }
  toggle.addEventListener('click', function () {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    if (!open) positionMobileNavigation();
    toggle.setAttribute('aria-expanded', String(!open));
    navigation.classList.toggle('is-open', !open);
    document.body.classList.toggle('menu-open', !open);
  });
  navigation.addEventListener('click', function (event) {
    if (!event.target.closest('a')) return;
    toggle.setAttribute('aria-expanded', 'false');
    navigation.classList.remove('is-open');
    document.body.classList.remove('menu-open');
  });
  window.addEventListener('resize', positionMobileNavigation);
}());
