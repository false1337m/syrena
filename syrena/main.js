(function () {
  "use strict";

  var ROOM_IDS = { perla: true, fala: true, syrena: true };

  var ROOM_FALLBACK = {
    perla: "Pokój Perła",
    fala: "Pokój Fala",
    syrena: "Pokój Syrena",
  };

  var MONTHS_GEN_PL = [
    "stycznia",
    "lutego",
    "marca",
    "kwietnia",
    "maja",
    "czerwca",
    "lipca",
    "sierpnia",
    "września",
    "października",
    "listopada",
    "grudnia",
  ];

  var WEEKDAYS_PL = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];

  function i18n() {
    return window.SyrenaI18n;
  }

  function roomFullName(id) {
    var I = i18n();
    if (I) return I.t("rooms." + id + ".name");
    return ROOM_FALLBACK[id] || id;
  }

  function formatDateLong(d) {
    var I = i18n();
    if (I) return I.formatDateLong(d);
    return WEEKDAYS_PL[d.getDay()] + ", " + d.getDate() + " " + MONTHS_GEN_PL[d.getMonth()] + " " + d.getFullYear();
  }

  var header = document.querySelector("[data-header]");
  var navToggle = document.querySelector("[data-nav-toggle]");
  var navDrawer = document.querySelector("[data-nav-drawer]");
  var overlay = document.getElementById("booking-overlay");
  var dateLineEl = document.querySelector("[data-date-line]");
  var summaryDetailEl = document.querySelector("[data-booking-summary-detail]");
  var dateInput = document.querySelector("[data-date-input]");
  var dateLabelBtn = document.querySelector("[data-date-open]");

  var btnToday = document.querySelector("[data-date-today]");
  var btnPrev = document.querySelector("[data-date-prev]");
  var btnNext = document.querySelector("[data-date-next]");
  var btnConfirm = document.querySelector("[data-confirm-booking]");

  var voucherModal = document.querySelector("[data-voucher-modal]");
  var voucherFab = document.querySelector("[data-open-voucher]");
  var voucherBuy = document.querySelector("[data-voucher-buy]");
  var voucherLastFocus = null;

  var menuModal = document.querySelector("[data-menu-modal]");
  var menuLastFocus = null;

  var selectedDate = stripTime(new Date());
  var selectedRoomId = null;
  var selectedTime = null;
  var pickedSlotEl = null;
  var lastFocus = null;

  /** Rezerwacje na wybrany dzień: klucz "pokój:godzina" → true */
  var reservedSlots = {};

  var REVEAL_STAGGER_MS = 200;

  function slotKey(room, time) {
    return room + ":" + time;
  }

  function restoreSlotAria(cell) {
    var room = cell.getAttribute("data-room-row");
    var lab = cell.getAttribute("data-slot-label");
    var price = cell.getAttribute("data-price");
    var I = i18n();
    if (I) {
      cell.setAttribute(
        "aria-label",
        I.t("booking.slot_aria_template", {
          room: roomFullName(room),
          slot: lab,
          price: price,
          currency: I.t("booking.currency"),
          hint: I.t("booking.slot_aria_hint"),
        })
      );
    } else {
      var rname = ROOM_FALLBACK[room] || room;
      cell.setAttribute("aria-label", rname + ", " + lab + ", " + price + " zł. Wybierz termin lub zarezerwuj.");
    }
  }

  function clearReservedUI(cell) {
    cell.classList.remove("is-reserved", "is-reserved--anim");
    cell.setAttribute("tabindex", "0");
    cell.setAttribute("role", "button");
    restoreSlotAria(cell);
    var reserved = cell.querySelector(".booking-slot__reserved");
    var avail = cell.querySelector(".booking-slot__available");
    if (reserved) reserved.setAttribute("aria-hidden", "true");
    if (avail) avail.removeAttribute("aria-hidden");
  }

  function applyReservedUI(cell, withAnimation) {
    cell.classList.add("is-reserved");
    cell.removeAttribute("tabindex");
    cell.removeAttribute("role");
    cell.setAttribute("aria-label", i18n() ? i18n().t("booking.busy_aria") : "Zajęte — termin niedostępny");
    var reserved = cell.querySelector(".booking-slot__reserved");
    var avail = cell.querySelector(".booking-slot__available");
    if (reserved) reserved.removeAttribute("aria-hidden");
    if (avail) avail.setAttribute("aria-hidden", "true");
    if (pickedSlotEl === cell) {
      clearPickedSlot();
    }
    if (withAnimation && !prefersReducedMotion()) {
      cell.classList.add("is-reserved--anim");
      window.setTimeout(function () {
        cell.classList.remove("is-reserved--anim");
      }, 580);
    }
  }

  function clearAllReservationsForDay() {
    reservedSlots = {};
    if (overlay) {
      overlay.querySelectorAll("[data-booking-slot]").forEach(function (cell) {
        clearReservedUI(cell);
      });
    }
  }

  function refreshSlotsFromReservationState() {
    if (!overlay) return;
    overlay.querySelectorAll("[data-booking-slot]").forEach(function (cell) {
      var room = cell.getAttribute("data-room-row");
      var time = cell.getAttribute("data-time");
      if (reservedSlots[slotKey(room, time)]) {
        applyReservedUI(cell, false);
      } else {
        clearReservedUI(cell);
      }
    });
    updateSummary();
  }

  function markSlotReserved(cell) {
    if (!cell || cell.classList.contains("is-reserved")) return;
    var room = cell.getAttribute("data-room-row");
    var time = cell.getAttribute("data-time");
    reservedSlots[slotKey(room, time)] = true;
    applyReservedUI(cell, true);
    setRoom(room);
  }

  function pickSlot(cell) {
    if (!cell || cell.classList.contains("is-reserved")) return;
    var rowRoom = cell.getAttribute("data-room-row");
    var time = cell.getAttribute("data-time");
    if (pickedSlotEl && pickedSlotEl !== cell) {
      pickedSlotEl.classList.remove("is-picked");
    }
    pickedSlotEl = cell;
    cell.classList.add("is-picked");
    selectedTime = time;
    setRoom(rowRoom);
  }

  function onBookingOverlayKeydown(ev) {
    if (!overlay || !overlay.classList.contains("is-open")) return;
    if (ev.key !== "Enter" && ev.key !== " ") return;
    var cell = ev.target.closest("[data-booking-slot]");
    if (!cell || !overlay.contains(cell) || cell.classList.contains("is-reserved")) return;
    if (ev.target.closest(".booking-slot__btn")) return;
    ev.preventDefault();
    pickSlot(cell);
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function queryRevealsIn(root) {
    return Array.prototype.slice.call(root.querySelectorAll(".reveal"));
  }

  function staggerAddRevealVisible(elements) {
    if (!elements.length) return;
    if (prefersReducedMotion()) {
      elements.forEach(function (el) {
        el.classList.add("reveal-visible");
      });
      return;
    }
    elements.forEach(function (el, i) {
      window.setTimeout(function () {
        el.classList.add("reveal-visible");
      }, i * REVEAL_STAGGER_MS);
    });
  }

  function stripRevealVisible(root) {
    if (!root) return;
    root.querySelectorAll(".reveal").forEach(function (el) {
      el.classList.remove("reveal-visible");
    });
  }

  function initReveal() {
    var roots = document.querySelectorAll("[data-reveal-chain]");
    if (!roots.length) return;

    if (prefersReducedMotion()) {
      roots.forEach(function (root) {
        staggerAddRevealVisible(queryRevealsIn(root));
      });
      return;
    }

    if (!("IntersectionObserver" in window)) {
      roots.forEach(function (root) {
        staggerAddRevealVisible(queryRevealsIn(root));
      });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var root = entry.target;
          io.unobserve(root);
          staggerAddRevealVisible(queryRevealsIn(root));
        });
      },
      { root: null, rootMargin: "0px 0px -6% 0px", threshold: 0.06 }
    );

    roots.forEach(function (root) {
      io.observe(root);
    });
  }

  function playBookingReveal() {
    if (!overlay) return;
    stripRevealVisible(overlay);
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        staggerAddRevealVisible(queryRevealsIn(overlay));
      });
    });
  }

  function stripTime(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function toInputValue(d) {
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    return d.getFullYear() + "-" + (m.length < 2 ? "0" : "") + m + "-" + (day.length < 2 ? "0" : "") + day;
  }

  function parseInputValue(s) {
    var p = String(s).split("-");
    if (p.length !== 3) return null;
    var y = parseInt(p[0], 10);
    var mo = parseInt(p[1], 10) - 1;
    var da = parseInt(p[2], 10);
    if (isNaN(y) || isNaN(mo) || isNaN(da)) return null;
    return stripTime(new Date(y, mo, da));
  }

  function updateDateLine() {
    if (dateLineEl) {
      dateLineEl.textContent = formatDateLong(selectedDate);
    }
    if (dateInput) {
      dateInput.value = toInputValue(selectedDate);
    }
  }

  function updateSummary() {
    if (!summaryDetailEl) return;
    var I = i18n();
    var none = I ? I.t("booking.summary_none") : "brak";
    var pickSlot = I ? I.t("booking.summary_pick_slot") : " — wybierz godzinę z siatki";
    var pickRoom = I ? I.t("booking.summary_pick_room") : "wybierz pokój";
    var roomName = selectedRoomId ? roomFullName(selectedRoomId) : null;
    var slotLabel =
      pickedSlotEl && pickedSlotEl.getAttribute ? pickedSlotEl.getAttribute("data-slot-label") : null;
    var pickValid =
      pickedSlotEl && selectedTime && !pickedSlotEl.classList.contains("is-reserved");

    if (roomName && selectedTime && slotLabel && pickValid) {
      summaryDetailEl.textContent = roomName + ", " + slotLabel;
    } else if (roomName && !selectedTime) {
      summaryDetailEl.textContent = roomName + pickSlot;
    } else if (!roomName && selectedTime) {
      summaryDetailEl.textContent = pickRoom;
    } else {
      summaryDetailEl.textContent = none;
    }
  }

  function setRoom(id) {
    selectedRoomId = id && ROOM_IDS[id] ? id : null;
    document.querySelectorAll("[data-booking-room]").forEach(function (btn) {
      var rid = btn.getAttribute("data-booking-room");
      btn.classList.toggle("is-selected", !!selectedRoomId && rid === selectedRoomId);
    });
    updateSummary();
  }

  function clearPickedSlot() {
    if (pickedSlotEl) {
      pickedSlotEl.classList.remove("is-picked");
      pickedSlotEl = null;
    }
    selectedTime = null;
  }

  function setSelectedDate(d) {
    var next = stripTime(d);
    if (!isSameDay(next, selectedDate)) {
      clearPickedSlot();
      clearAllReservationsForDay();
    }
    selectedDate = next;
    updateDateLine();
    updateSummary();
  }

  function openBooking(prefRoom) {
    if (!overlay) return;
    lastFocus = document.activeElement;
    overlay.removeAttribute("hidden");
    overlay.removeAttribute("inert");
    overlay.setAttribute("aria-hidden", "false");
    overlay.classList.add("is-open");
    document.body.classList.add("is-booking-open");

    setSelectedDate(selectedDate);
    if (prefRoom && ROOM_IDS[prefRoom]) {
      setRoom(prefRoom);
    } else {
      setRoom(null);
    }

    playBookingReveal();
    refreshSlotsFromReservationState();

    window.requestAnimationFrame(function () {
      var back = overlay.querySelector("[data-close-booking]");
      if (back) back.focus();
    });
  }

  function closeBooking() {
    if (!overlay || !overlay.classList.contains("is-open")) return;
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("inert", "");
    document.body.classList.remove("is-booking-open");

    window.setTimeout(function () {
      overlay.setAttribute("hidden", "");
    }, 450);

    if (lastFocus && typeof lastFocus.focus === "function") {
      try {
        lastFocus.focus();
      } catch (e) {
        /* ignore */
      }
    }
  }

  function onDocumentClick(ev) {
    var openBtn = ev.target.closest("[data-open-booking]");
    if (openBtn) {
      ev.preventDefault();
      var room = openBtn.getAttribute("data-room");
      openBooking(room || null);
      if (navDrawer && navToggle) {
        navDrawer.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
        navDrawer.setAttribute("hidden", "");
      }
      return;
    }

    var openMenuBtn = ev.target.closest("[data-open-menu]");
    if (openMenuBtn) {
      ev.preventDefault();
      openMenu();
      if (navDrawer && navToggle) {
        navDrawer.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
        navDrawer.setAttribute("hidden", "");
      }
      return;
    }

    if (ev.target.closest("[data-close-booking]")) {
      ev.preventDefault();
      closeBooking();
      return;
    }

    if (ev.target.closest("[data-close-menu]")) {
      ev.preventDefault();
      closeMenu();
      return;
    }

    var reserveBtn = ev.target.closest(".booking-slot__btn");
    if (reserveBtn && overlay && overlay.contains(reserveBtn)) {
      var slotForReserve = reserveBtn.closest("[data-booking-slot]");
      if (slotForReserve && !slotForReserve.classList.contains("is-reserved")) {
        ev.preventDefault();
        markSlotReserved(slotForReserve);
      }
      return;
    }

    var slotCell = ev.target.closest("[data-booking-slot]");
    if (slotCell && overlay && overlay.contains(slotCell) && !slotCell.classList.contains("is-reserved")) {
      ev.preventDefault();
      pickSlot(slotCell);
      return;
    }

    var roomBtn = ev.target.closest("[data-booking-room]");
    if (roomBtn && overlay && overlay.contains(roomBtn)) {
      var rid = roomBtn.getAttribute("data-booking-room");
      clearPickedSlot();
      setRoom(rid);
      return;
    }
  }

  function onScroll() {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 40);
  }

  function initNavDrawer() {
    if (!navToggle || !navDrawer) return;
    navToggle.addEventListener("click", function () {
      var open = !navDrawer.classList.contains("is-open");
      navDrawer.classList.toggle("is-open", open);
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) navDrawer.removeAttribute("hidden");
      else navDrawer.setAttribute("hidden", "");
    });
    navDrawer.querySelectorAll("a, button").forEach(function (el) {
      el.addEventListener("click", function () {
        navDrawer.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
        navDrawer.setAttribute("hidden", "");
      });
    });
  }

  function initBookingControls() {
    if (btnToday) {
      btnToday.addEventListener("click", function () {
        setSelectedDate(stripTime(new Date()));
      });
    }
    if (btnPrev) {
      btnPrev.addEventListener("click", function () {
        var d = new Date(selectedDate);
        d.setDate(d.getDate() - 1);
        setSelectedDate(d);
      });
    }
    if (btnNext) {
      btnNext.addEventListener("click", function () {
        var d = new Date(selectedDate);
        d.setDate(d.getDate() + 1);
        setSelectedDate(d);
      });
    }
    if (dateInput) {
      dateInput.addEventListener("change", function () {
        var parsed = parseInputValue(dateInput.value);
        if (parsed) setSelectedDate(parsed);
      });
    }
    if (dateLabelBtn && dateInput) {
      dateLabelBtn.addEventListener("click", function () {
        try {
          dateInput.showPicker();
        } catch (e) {
          dateInput.focus();
          dateInput.click();
        }
      });
    }
    if (btnConfirm) {
      btnConfirm.addEventListener("click", function () {
        var slotLb =
          pickedSlotEl && pickedSlotEl.getAttribute
            ? pickedSlotEl.getAttribute("data-slot-label")
            : null;
        if (
          !selectedRoomId ||
          !selectedTime ||
          !pickedSlotEl ||
          pickedSlotEl.classList.contains("is-reserved") ||
          !slotLb
        ) {
          window.alert(i18n() ? i18n().t("booking.alert_pick") : "Wybierz wolny termin w siatce (kliknij pole), potem potwierdź rezerwację.");
          return;
        }
        var msg = i18n()
          ? i18n().t("booking.alert_demo_body", {
              room: roomFullName(selectedRoomId),
              slot: slotLb,
              date: formatDateLong(selectedDate),
            })
          : "Dziękujemy! Symulacja rezerwacji:\n" +
            ROOM_FALLBACK[selectedRoomId] +
            ", " +
            slotLb +
            ", " +
            formatDateLong(selectedDate) +
            "\n\nTo demo front-end — bez zapisu w systemie.";
        window.alert(msg);
      });
    }
    if (overlay) {
      overlay.addEventListener("keydown", onBookingOverlayKeydown);
    }
  }

  function openVoucher() {
    if (!voucherModal) return;
    voucherLastFocus = document.activeElement;
    voucherModal.classList.add("is-open");
    voucherModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-voucher-open");
    window.requestAnimationFrame(function () {
      var closeBtn = voucherModal.querySelector("[data-close-voucher]");
      if (closeBtn) closeBtn.focus();
    });
  }

  function closeVoucher() {
    if (!voucherModal || !voucherModal.classList.contains("is-open")) return;
    voucherModal.classList.remove("is-open");
    voucherModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-voucher-open");
    if (voucherLastFocus && typeof voucherLastFocus.focus === "function") {
      try {
        voucherLastFocus.focus();
      } catch (e) {
        /* ignore */
      }
    }
  }

  function initVoucher() {
    if (voucherFab) {
      voucherFab.addEventListener("click", function (ev) {
        ev.preventDefault();
        openVoucher();
      });
    }
    if (voucherModal) {
      voucherModal.addEventListener("click", function (ev) {
        if (ev.target.closest("[data-close-voucher]")) {
          ev.preventDefault();
          closeVoucher();
        }
      });
    }
    if (voucherBuy) {
      voucherBuy.addEventListener("click", function () {
        window.alert(
          i18n()
            ? i18n().t("voucher.alert_msg")
            : "Dziękujemy za zainteresowanie! Wkrótce uruchomimy sprzedaż voucherów SYRENA — na razie to tylko demonstracja strony."
        );
      });
    }
  }

  function openMenu() {
    if (!menuModal || menuModal.classList.contains("is-open")) return;
    menuLastFocus = document.activeElement;
    menuModal.removeAttribute("hidden");
    menuModal.classList.add("is-open");
    menuModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-menu-open");
    window.requestAnimationFrame(function () {
      var backBtn = menuModal.querySelector("[data-close-menu]");
      if (backBtn) backBtn.focus();
    });
  }

  function closeMenu() {
    if (!menuModal || !menuModal.classList.contains("is-open")) return;
    menuModal.classList.remove("is-open");
    menuModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-menu-open");
    window.setTimeout(function () {
      menuModal.setAttribute("hidden", "");
    }, 450);
    if (menuLastFocus && typeof menuLastFocus.focus === "function") {
      try {
        menuLastFocus.focus();
      } catch (e) {
        /* ignore */
      }
    }
  }

  function onKeyDown(ev) {
    if (ev.key !== "Escape") return;
    if (voucherModal && voucherModal.classList.contains("is-open")) {
      closeVoucher();
      return;
    }
    if (menuModal && menuModal.classList.contains("is-open")) {
      closeMenu();
      return;
    }
    if (overlay && overlay.classList.contains("is-open")) {
      closeBooking();
    }
  }

  function onLanguageChange() {
    updateDateLine();
    refreshSlotsFromReservationState();
  }

  function initEvoParallax() {
    var root = document.querySelector("[data-evo-section]");
    if (!root || prefersReducedMotion()) return;
    var layers = root.querySelectorAll("[data-evo-parallax]");
    if (!layers.length) return;
    var ticking = false;
    function update() {
      ticking = false;
      var rect = root.getBoundingClientRect();
      var vh = window.innerHeight || 1;
      var centerDelta = (rect.top + rect.height / 2 - vh / 2) / vh;
      var clamped = Math.max(-1, Math.min(1, centerDelta));
      layers.forEach(function (el) {
        var depth = parseFloat(el.getAttribute("data-evo-parallax"));
        if (isNaN(depth)) depth = 0;
        var y = clamped * depth * -22;
        var x = clamped * depth * 10;
        el.style.transform = "translate3d(" + x.toFixed(2) + "px," + y.toFixed(2) + "px,0)";
      });
    }
    function onMove() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }
    window.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("resize", onMove, { passive: true });
    update();
  }

  function init() {
    document.addEventListener("syrena:languagechange", onLanguageChange);

    updateDateLine();
    updateSummary();
    refreshSlotsFromReservationState();

    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    initNavDrawer();
    initBookingControls();
    initVoucher();
    initReveal();
    initEvoParallax();
  }

  init();
})();
