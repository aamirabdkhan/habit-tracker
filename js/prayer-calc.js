// Location-based prayer times via the vendored adhan.js (MIT). Everything here is DEVICE-LOCAL:
// coordinates, method, madhab and the auto toggle live under the htn_ prefix so isSyncableKey
// skips them (coordinates are personal + single-device, like the other htn_* MVP data). The
// computed HH:MM strings are written into the app's normal prayer-time store by waqt.js, so the
// rest of the app (Template, Pehar, reminders, widget feed) reads auto times exactly like manual
// ones. No coordinates ever leave the device.
(function () {
  var AUTO_KEY = "htn_prayer_auto";
  var GEO_KEY = "htn_geo";
  var METHOD_KEY = "htn_prayer_method";
  var MADHAB_KEY = "htn_prayer_madhab";
  var DUHA_OFFSET_KEY = "htn_duha_offset";

  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  window.prayerAutoOn = function () { return lsGet(AUTO_KEY, "false") === "true"; };
  window.setPrayerAutoOn = function (on) { lsSet(AUTO_KEY, on ? "true" : "false"); };
  window.getPrayerGeo = function () { try { return JSON.parse(localStorage.getItem(GEO_KEY)); } catch (e) { return null; } };
  window.setPrayerGeo = function (lat, lng) { lsSet(GEO_KEY, JSON.stringify({ lat: lat, lng: lng, ts: Date.now() })); };
  window.getPrayerMethod = function () { return lsGet(METHOD_KEY, "MuslimWorldLeague"); };
  window.setPrayerMethod = function (m) { lsSet(METHOD_KEY, m); };
  window.getPrayerMadhab = function () { return lsGet(MADHAB_KEY, "Shafi"); };
  window.setPrayerMadhab = function (m) { lsSet(MADHAB_KEY, m); };
  window.getDuhaOffset = function () { return parseInt(lsGet(DUHA_OFFSET_KEY, "20"), 10) || 20; };

  // Methods exposed in the picker (subset of adhan's CalculationMethod that users actually pick).
  window.PRAYER_METHODS = [
    ["MuslimWorldLeague", "Muslim World League"],
    ["NorthAmerica", "North America (ISNA)"],
    ["UmmAlQura", "Umm al-Qura (Makkah)"],
    ["Egyptian", "Egyptian"],
    ["Karachi", "Karachi"],
    ["Dubai", "Dubai"],
    ["Qatar", "Qatar"],
    ["Kuwait", "Kuwait"],
    ["MoonsightingCommittee", "Moonsighting Committee"],
    ["Singapore", "Singapore"],
    ["Turkey", "Turkey"],
    ["Tehran", "Tehran"]
  ];

  function hm(d) {
    if (!d || isNaN(d.getTime())) return "";
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }

  // -> { Fajr, Dhuhr, Asr, Maghrib, Isha, Duha, Tahajjud } as HH:MM for `dateObj`, or null if the
  // library isn't loaded or no location is stored.
  window.computeAutoPrayerTimes = function (dateObj) {
    if (typeof adhan === "undefined") return null;
    var geo = window.getPrayerGeo();
    if (!geo || typeof geo.lat !== "number" || typeof geo.lng !== "number") return null;
    var coords = new adhan.Coordinates(geo.lat, geo.lng);
    var methodName = window.getPrayerMethod();
    var methodFn = adhan.CalculationMethod[methodName] || adhan.CalculationMethod.MuslimWorldLeague;
    var params = methodFn();
    params.madhab = window.getPrayerMadhab() === "Hanafi" ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
    var pt = new adhan.PrayerTimes(coords, dateObj || new Date(), params);
    var out = { Fajr: hm(pt.fajr), Dhuhr: hm(pt.dhuhr), Asr: hm(pt.asr), Maghrib: hm(pt.maghrib), Isha: hm(pt.isha) };
    if (pt.sunrise && !isNaN(pt.sunrise.getTime())) {
      out.Duha = hm(new Date(pt.sunrise.getTime() + window.getDuhaOffset() * 60000));
    }
    try { out.Tahajjud = hm(new adhan.SunnahTimes(pt).lastThirdOfTheNight); } catch (e) {}
    return out;
  };

  // Standard makruh/forbidden durations (minutes). Mirrors the common convention most prayer apps
  // use: ~15 min after sunrise, the zawal sliver before Dhuhr, and the yellowing before sunset.
  var FORBIDDEN_AFTER_SUNRISE = 15, ZAWAL_BEFORE_DHUHR = 10, BEFORE_SUNSET = 10;

  // Full Deen-style window table for one day: an ordered list of events, each with a start and (for
  // windows) an end Date. kind: "prayer" | "voluntary" | "sunrise" | "sunset" | "forbidden".
  // A window runs until the next event begins; sunrise/sunset are single-moment markers (end null).
  // Needs location + adhan (same as computeAutoPrayerTimes); returns null without them.
  window.computePrayerWindows = function (dateObj) {
    if (typeof adhan === "undefined") return null;
    var geo = window.getPrayerGeo();
    if (!geo || typeof geo.lat !== "number" || typeof geo.lng !== "number") return null;
    var coords = new adhan.Coordinates(geo.lat, geo.lng);
    var methodFn = adhan.CalculationMethod[window.getPrayerMethod()] || adhan.CalculationMethod.MuslimWorldLeague;
    var params = methodFn();
    var madhab = window.getPrayerMadhab() === "Hanafi" ? "Hanafi" : "Shafi";
    params.madhab = madhab === "Hanafi" ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
    var ok = function (d) { return d instanceof Date && !isNaN(d.getTime()); };
    var base = dateObj || new Date();
    // Pre-dawn (before today's Fajr) we're still in last night's prayer-day, so compute for yesterday
    // — that keeps the Isha/Tahajjud windows current and the "now" highlight correct at 2am.
    if (base.getHours() * 60 + base.getMinutes() < 12 * 60) {
      var probe = new adhan.PrayerTimes(coords, base, params);
      if (ok(probe.fajr) && base < probe.fajr) base = new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1);
    }
    var pt = new adhan.PrayerTimes(coords, base, params);
    // next day's Fajr, so Isha/Tahajjud windows have a real end past midnight
    var next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
    var ptN = new adhan.PrayerTimes(coords, next, params);
    var mins = function (d, m) { return new Date(d.getTime() + m * 60000); };
    var sunrise = pt.sunrise, sunset = ok(pt.sunset) ? pt.sunset : pt.maghrib, fajrNext = ptN.fajr;
    // Every row depends on these; at polar latitudes adhan can return Invalid Date for some. Rather
    // than render blank/garbled rows, bail to null so the sheet shows the manual-times fallback.
    if (![pt.fajr, sunrise, pt.dhuhr, pt.asr, pt.maghrib, pt.isha, sunset, fajrNext].every(ok)) return null;
    var duhaStart = mins(sunrise, window.getDuhaOffset());
    var zawalStart = mins(pt.dhuhr, -ZAWAL_BEFORE_DHUHR);
    var preSunset = mins(sunset, -BEFORE_SUNSET);
    var tahajjud = null; try { tahajjud = new adhan.SunnahTimes(pt).lastThirdOfTheNight; } catch (e) {}
    var hasTahajjud = ok(tahajjud);
    // Isha runs until Tahajjud begins (if tracked-able) so the two windows don't both claim "now".
    var ishaEnd = hasTahajjud ? tahajjud : fajrNext;
    var ev = [
      { key: "Fajr", label: "Fajr", kind: "prayer", start: pt.fajr, end: sunrise },
      { key: "Sunrise", label: "Sunrise", kind: "sunrise", start: sunrise, end: null },
      { key: "Forbidden1", label: "Forbidden Time", kind: "forbidden", start: sunrise, end: mins(sunrise, FORBIDDEN_AFTER_SUNRISE) },
      { key: "Duha", label: "Salatul Duha", kind: "voluntary", start: duhaStart, end: zawalStart },
      { key: "Forbidden2", label: "Forbidden Time", kind: "forbidden", start: zawalStart, end: pt.dhuhr },
      { key: "Dhuhr", label: "Dhuhr", kind: "prayer", start: pt.dhuhr, end: pt.asr },
      { key: "Asr", label: "Asr (" + madhab + ")", kind: "prayer", start: pt.asr, end: preSunset },
      { key: "Forbidden3", label: "Forbidden Time", kind: "forbidden", start: preSunset, end: sunset },
      { key: "Sunset", label: "Sunset", kind: "sunset", start: sunset, end: null },
      { key: "Maghrib", label: "Maghrib", kind: "prayer", start: pt.maghrib, end: pt.isha },
      { key: "Isha", label: "Isha", kind: "prayer", start: pt.isha, end: ishaEnd }
    ];
    if (hasTahajjud) ev.push({ key: "Tahajjud", label: "Tahajjud", kind: "voluntary", start: tahajjud, end: fajrNext });
    return ev;
  };

  // Ask the browser for one position fix; resolves to {lat,lng} (also stored) or null.
  window.fetchPrayerLocation = function () {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        function (pos) { window.setPrayerGeo(pos.coords.latitude, pos.coords.longitude); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        function () { resolve(null); },
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 6 * 3600 * 1000 }
      );
    });
  };
})();
