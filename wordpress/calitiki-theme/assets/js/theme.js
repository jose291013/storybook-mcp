(function () {
  const toggle = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('.site-navigation');
  if (!toggle || !navigation) return;
  toggle.addEventListener('click', function () {
    const open = toggle.getAttribute('aria-expanded') === 'true';
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
}());
