/* ================= theme toggle ================= */
var THEME_KEY = 'storymapper-theme';
var THEME_KEY_OLD = 'dialogue-loom-theme';
function getStoredTheme(){
  try {
    var v = localStorage.getItem(THEME_KEY);
    if(v) return v;
    var legacy = localStorage.getItem(THEME_KEY_OLD);
    if(legacy){
      localStorage.setItem(THEME_KEY, legacy);
      localStorage.removeItem(THEME_KEY_OLD);
      return legacy;
    }
    return null;
  } catch(e){ return null; }
}
function setStoredTheme(v){
  try { localStorage.setItem(THEME_KEY, v); } catch(e){}
}
function systemPrefersDark(){
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  var btn = document.getElementById('theme-toggle');
  if(btn) btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
}
(function initTheme(){
  var stored = getStoredTheme();
  var initial = (stored === 'light' || stored === 'dark') ? stored : (systemPrefersDark() ? 'dark' : 'light');
  applyTheme(initial);
})();
document.getElementById('theme-toggle').addEventListener('click', function(){
  var current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  var next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  setStoredTheme(next);
});
