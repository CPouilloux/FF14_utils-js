document.addEventListener('DOMContentLoaded', () => {
  const STORAGE_KEY = 'ff14_theme';
  const toggleBtn = document.getElementById('themeToggleBtn');
  const body = document.body;

  function applyTheme(theme) {
    const isLight = theme === 'light';
    body.classList.toggle('light-theme', isLight);
    if (toggleBtn) {
      toggleBtn.textContent = isLight ? 'Mode sombre' : 'Mode clair';
    }
  }

  const savedTheme = localStorage.getItem(STORAGE_KEY) || 'dark';
  applyTheme(savedTheme);

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const nextTheme = body.classList.contains('light-theme') ? 'dark' : 'light';
      localStorage.setItem(STORAGE_KEY, nextTheme);
      applyTheme(nextTheme);
    });
  }
});
