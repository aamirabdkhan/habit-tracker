try {
  var _t = localStorage.getItem("ht_theme") || "system";
  var _d = _t === "dark" || (_t === "system" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", _d ? "dark" : "light");
} catch (e) {}
