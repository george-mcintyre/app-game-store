// Injected by ourapps into web apps it serves: a one-tap "add to home screen" banner.
// Shows only in a normal browser tab, never once the app runs from the home screen.
(function () {
  "use strict";
  if (window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true) return;
  var KEY = "ourapps-install-dismissed";
  var dismissedAt = Number(localStorage.getItem(KEY) || 0);
  if (Date.now() - dismissedAt < 3 * 24 * 60 * 60 * 1000) return;

  var ua = navigator.userAgent;
  var isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var isSafari = isIOS && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  var isAndroid = /Android/.test(ua);
  var inAppBrowser = isIOS && !isSafari && !/CriOS|FxiOS|EdgiOS/.test(ua);
  var deferred = null;
  var appName = (document.querySelector('meta[name="application-name"]') || {}).content || (document.querySelector('meta[name="apple-mobile-web-app-title"]') || {}).content || document.title || "this app";

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    render();
  });
  window.addEventListener("appinstalled", function () {
    remove();
    localStorage.setItem(KEY, String(Date.now()));
  });

  var host = null;
  function remove() {
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
  }

  function render() {
    if (!document.body) return;
    remove();
    host = document.createElement("div");
    host.setAttribute("data-ourapps-install", "");
    var root = host.attachShadow ? host.attachShadow({ mode: "closed" }) : host;
    var body;
    if (deferred) {
      body = '<b>Add ' + esc(appName) + ' to your home screen</b><span>One tap, then it opens like an app and keeps its permissions.</span><button data-act="install">Add</button>';
    } else if (isSafari) {
      body = '<b>Add ' + esc(appName) + ' to your home screen</b><span>Tap <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a1 1 0 001 1h12a1 1 0 001-1v-7"/></svg> Share below, then <em>Add to Home Screen</em>, then <em>Add</em>. After that it opens like an app and remembers camera and microphone permission.</span>';
    } else if (inAppBrowser) {
      body = '<b>Open in Safari first</b><span>This browser cannot add apps to the home screen. Tap the menu and choose <em>Open in Safari</em>, then add it from there.</span>';
    } else if (isAndroid) {
      body = '<b>Add ' + esc(appName) + ' to your home screen</b><span>Tap the browser menu (three dots), then <em>Add to Home screen</em> or <em>Install app</em>.</span>';
    } else {
      return;
    }
    root.innerHTML =
      '<style>' +
      ':host{all:initial}' +
      '.b{position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483647;display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:16px;background:#1d1d1f;color:#f5f5f7;font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.35);animation:up .35s cubic-bezier(.2,.8,.2,1)}' +
      '@keyframes up{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}' +
      '.t{flex:1;min-width:0}.t b{display:block;font-size:15px;margin-bottom:2px}.t span{color:#c7c7cc}.t em{font-style:normal;color:#fff;font-weight:600}' +
      'button{font:inherit;border:0;border-radius:999px;padding:9px 16px;cursor:pointer;background:#0a84ff;color:#fff;font-weight:600;flex:none}' +
      'button.x{background:transparent;color:#8e8e93;padding:6px 8px;font-size:20px;line-height:1}' +
      '</style>' +
      '<div class="b" role="dialog" aria-label="Add to home screen"><div class="t">' + body + '</div><button class="x" data-act="close" aria-label="Not now">&times;</button></div>';
    root.addEventListener("click", function (e) {
      var act = e.target && e.target.getAttribute && e.target.getAttribute("data-act");
      if (act === "close") {
        localStorage.setItem(KEY, String(Date.now()));
        remove();
      } else if (act === "install" && deferred) {
        deferred.prompt();
        deferred.userChoice.then(function () {
          deferred = null;
          remove();
        });
      }
    });
    document.body.appendChild(host);
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
