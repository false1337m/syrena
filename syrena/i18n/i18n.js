/**
 * SYRENA i18n — PL (default), EN, UK
 * Depends on window.SYRENA_TRANSLATIONS from translations.js
 */
(function () {
  "use strict";

  var STORAGE_KEY = "syrena-lang";
  var DEFAULT_LANG = "pl";
  var FADE_MS = 280;

  var VALID = { pl: true, en: true, uk: true };

  function getDict(lang) {
    var all = window.SYRENA_TRANSLATIONS || {};
    return all[lang] || all[DEFAULT_LANG] || {};
  }

  function interpolate(str, vars) {
    if (!str || !vars) return str || "";
    return String(str).replace(/\{\{(\w+)\}\}/g, function (_, k) {
      return vars[k] != null ? String(vars[k]) : "";
    });
  }

  function t(key, vars) {
    var lang = getStoredLang();
    var dict = getDict(lang);
    var raw = dict[key];
    if (raw == null && lang !== DEFAULT_LANG) {
      raw = (getDict(DEFAULT_LANG) || {})[key];
    }
    if (raw == null) return key;
    return interpolate(raw, vars);
  }

  function getStoredLang() {
    try {
      var s = localStorage.getItem(STORAGE_KEY);
      if (s && VALID[s]) return s;
    } catch (e) {
      /* ignore */
    }
    return DEFAULT_LANG;
  }

  function setStoredLang(lang) {
    if (!VALID[lang]) lang = DEFAULT_LANG;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      /* ignore */
    }
    return lang;
  }

  function applyLang(lang, opts) {
    lang = VALID[lang] ? lang : DEFAULT_LANG;
    var dict = getDict(lang);
    var fade = !(opts && opts.noFade);

    function runApply() {
      document.documentElement.lang = lang === "uk" ? "uk" : lang;

      var page = document.body && document.body.getAttribute("data-syrena-page");
      var titleKey = page === "rez" ? "rez_page.meta.title" : "meta.title";
      var descKey = page === "rez" ? "rez_page.meta.description" : "meta.description";

      var titleEl = document.querySelector("title");
      if (titleEl && dict[titleKey]) titleEl.textContent = dict[titleKey];

      var metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc && dict[descKey]) {
        metaDesc.setAttribute("content", dict[descKey]);
      }

      var yearNow = String(new Date().getFullYear());

      document.querySelectorAll("[data-i18n]").forEach(function (el) {
        var key = el.getAttribute("data-i18n");
        if (!key || dict[key] == null) return;
        el.textContent = interpolate(dict[key], { year: yearNow });
      });

      document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
        var key = el.getAttribute("data-i18n-html");
        if (!key || dict[key] == null) return;
        el.innerHTML = interpolate(dict[key], { year: yearNow });
      });

      document.querySelectorAll("[data-i18n-aria-label]").forEach(function (el) {
        var key = el.getAttribute("data-i18n-aria-label");
        if (!key || dict[key] == null) return;
        el.setAttribute("aria-label", interpolate(dict[key], { year: yearNow }));
      });

      document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
        var key = el.getAttribute("data-i18n-placeholder");
        if (!key || dict[key] == null) return;
        el.setAttribute("placeholder", dict[key]);
      });

      document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
        var key = el.getAttribute("data-i18n-title");
        if (!key || dict[key] == null) return;
        el.setAttribute("title", dict[key]);
      });

      document.querySelectorAll(".lang-switcher__btn").forEach(function (btn) {
        var l = btn.getAttribute("data-lang");
        var active = l === lang;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });

      window.dispatchEvent(new CustomEvent("syrena:languagechange", { detail: { lang: lang } }));
    }

    var roots = [
      document.getElementById("site"),
      document.getElementById("booking-overlay"),
      document.getElementById("menu-modal"),
      document.getElementById("voucher-modal"),
      document.getElementById("rez-site"),
      document.getElementById("rez-cart-bar"),
      document.getElementById("rez-pay-modal"),
    ].filter(Boolean);

    if (fade && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      roots.forEach(function (r) {
        r.classList.add("lang-fade");
      });
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          runApply();
          window.setTimeout(function () {
            roots.forEach(function (r) {
              r.classList.remove("lang-fade");
            });
          }, FADE_MS);
        });
      });
    } else {
      runApply();
    }
  }

  function initSwitcher() {
    var wrap = document.querySelector(".lang-switcher");
    if (!wrap) return;

    wrap.querySelectorAll("[data-lang]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var lang = btn.getAttribute("data-lang");
        if (!VALID[lang]) return;
        setStoredLang(lang);
        applyLang(lang, {});
      });
    });
  }

  window.SyrenaI18n = {
    t: t,
    getLang: getStoredLang,
    setLang: function (lang) {
      setStoredLang(lang);
      applyLang(lang, {});
    },
    apply: applyLang,
    getMonthsGen: function () {
      var lang = getStoredLang();
      var dict = getDict(lang);
      var keys = [];
      for (var i = 1; i <= 12; i++) {
        keys.push(dict["locale.month_" + i] || "");
      }
      return keys;
    },
    getWeekdays: function () {
      var lang = getStoredLang();
      var dict = getDict(lang);
      var keys = [];
      for (var i = 0; i < 7; i++) {
        keys.push(dict["locale.weekday_" + i] || "");
      }
      return keys;
    },
    formatDateLong: function (d) {
      var months = window.SyrenaI18n.getMonthsGen();
      var days = window.SyrenaI18n.getWeekdays();
      var lang = getStoredLang();
      if (lang === "en") {
        return days[d.getDay()] + ", " + months[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
      }
      return days[d.getDay()] + ", " + d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
    },
  };

  document.addEventListener("DOMContentLoaded", function () {
    initSwitcher();
    applyLang(getStoredLang(), { noFade: true });
  });
})();
