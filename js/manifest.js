(function(){
  var manifest = {
    name: "Habit Tracker",
    short_name: "Habits",
    description: "Daily habit tracker — goals, prayers, health, reflections.",
    start_url: "./",
    display: "standalone",
    background_color: "#0C0C0C",
    theme_color: "#0C0C0C",
    orientation: "portrait-primary",
    icons: [
      { src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' rx='110' fill='%230C0C0C'/%3E%3Ccircle cx='256' cy='200' r='90' fill='none' stroke='%23C9943E' stroke-width='28'/%3E%3Ccircle cx='256' cy='200' r='16' fill='%23C9943E'/%3E%3Cline x1='256' y1='110' x2='256' y2='60' stroke='%23C9943E' stroke-width='22' stroke-linecap='round'/%3E%3Cline x1='346' y1='200' x2='396' y2='200' stroke='%23C9943E' stroke-width='22' stroke-linecap='round'/%3E%3Cline x1='166' y1='200' x2='116' y2='200' stroke='%23C9943E' stroke-width='22' stroke-linecap='round'/%3E%3Cline x1='320' y1='136' x2='356' y2='100' stroke='%23C9943E' stroke-width='22' stroke-linecap='round'/%3E%3Cline x1='192' y1='136' x2='156' y2='100' stroke='%23C9943E' stroke-width='22' stroke-linecap='round'/%3E%3Cpath d='M256 290 L220 380 L256 360 L292 380 Z' fill='%23C9943E'/%3E%3C/svg%3E", sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" }
    ]
  };
  var blob = new Blob([JSON.stringify(manifest)], {type: "application/manifest+json"});
  var url = URL.createObjectURL(blob);
  var link = document.createElement("link");
  link.rel = "manifest"; link.href = url;
  document.currentScript.parentNode.insertBefore(link, document.currentScript);
})();
