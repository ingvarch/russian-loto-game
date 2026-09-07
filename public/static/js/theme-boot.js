// Applies the stored theme before the first paint.
//
// A classic, blocking script on purpose: an ES module is deferred, and a
// deferred theme runs after the page has already painted in the wrong one.
// The key and the accepted values are the ones prefs.js documents; keep the
// two in step.
(function () {
  try {
    var prefs = JSON.parse(localStorage.getItem("loto-prefs") || "{}");
    var theme = prefs && prefs.theme;
    if (theme === "light" || theme === "dark") {
      document.documentElement.dataset.theme = theme;
    } else if (localStorage.getItem("loto-display-theme") === "light") {
      // Pre-preferences displays kept their own flag.
      document.documentElement.dataset.theme = "light";
    }
  } catch (e) {
    // No storage, no stored theme. The system preference still applies.
  }
})();
