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
