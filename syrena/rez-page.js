/**
 * SYRENA — rezerwacja pokoju: koszyk wielu slotów → płatność → zapis w localStorage.
 * - "bookings": potwierdzone rezerwacje { room, date, hour }
 * - "rez_cart": tymczasowy koszyk (te same pola)
 */
(function () {
  "use strict";

  var BOOKINGS_KEY = "bookings";
  var CART_KEY = "rez_cart";
  var SLOT_HOURS = [18, 19, 20, 21, 22, 23];
  var PRICES = { perla: 99, fala: 119, syrena: 139 };
  var ROOM_IDS = { perla: true, fala: true, syrena: true };
  var ROOM_ORDER = ["perla", "fala", "syrena"];
  var TOAST_MS = 5200;
  var PROCESS_MS = 1650;

  var selectedDate = startOfDay(new Date());
  var toastTimer = null;
  var toastHideTimer = null;
  var lastPayFocus = null;

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
  }

  function todayStart() {
    return startOfDay(new Date());
  }

  function toISODate(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function parseISODate(s) {
    var p = String(s).split("-");
    if (p.length !== 3) return todayStart();
    var y = parseInt(p[0], 10);
    var m = parseInt(p[1], 10) - 1;
    var day = parseInt(p[2], 10);
    if (!y || m < 0 || m > 11 || !day) return todayStart();
    return startOfDay(new Date(y, m, day));
  }

  function slotTimeLabel(h) {
    if (h === 23) return "23:00 – 00:00";
    return pad2(h) + ":00 – " + pad2(h + 1) + ":00";
  }

  function slotTimeLabelHyphen(h) {
    if (h === 23) return "23:00 - 00:00";
    return pad2(h) + ":00 - " + pad2(h + 1) + ":00";
  }

  function t(key) {
    if (window.SyrenaI18n && typeof window.SyrenaI18n.t === "function") {
      return window.SyrenaI18n.t(key);
    }
    return key;
  }

  function formatDateLong(d) {
    if (window.SyrenaI18n && typeof window.SyrenaI18n.formatDateLong === "function") {
      return window.SyrenaI18n.formatDateLong(d);
    }
    return toISODate(d);
  }

  function readRawBookings() {
    try {
      var raw = localStorage.getItem(BOOKINGS_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function normalizeRows(arr) {
    var out = [];
    var seen = {};
    arr.forEach(function (row) {
      if (!row || !ROOM_IDS[row.room] || typeof row.date !== "string") return;
      var h = row.hour;
      if (typeof h !== "number" || h < 18 || h > 23) return;
      var k = row.room + "|" + row.date + "|" + h;
      if (seen[k]) return;
      seen[k] = 1;
      out.push({ room: row.room, date: row.date, hour: h });
    });
    return out;
  }

  function readBookings() {
    return normalizeRows(readRawBookings());
  }

  function writeBookings(list) {
    try {
      localStorage.setItem(BOOKINGS_KEY, JSON.stringify(normalizeRows(list)));
    } catch (e) {
      /* ignore */
    }
  }

  function isBooked(room, dateISO, hour) {
    return readBookings().some(function (b) {
      return b.room === room && b.date === dateISO && b.hour === hour;
    });
  }

  function readRawCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  /** Koszyk: tylko wolne sloty (nie zapisane w bookings). */
  function readCart() {
    return normalizeRows(readRawCart()).filter(function (row) {
      return !isBooked(row.room, row.date, row.hour);
    });
  }

  function writeCart(list) {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(normalizeRows(list)));
    } catch (e) {
      /* ignore */
    }
  }

  function isInCart(room, dateISO, hour) {
    return readCart().some(function (x) {
      return x.room === room && x.date === dateISO && x.hour === hour;
    });
  }

  function cartAdd(item) {
    var list = readCart();
    list.push(item);
    writeCart(normalizeRows(list));
  }

  function cartRemove(room, dateISO, hour) {
    var list = readCart().filter(function (x) {
      return !(x.room === room && x.date === dateISO && x.hour === hour);
    });
    writeCart(list);
  }

  function cartToggle(room, dateISO, hour) {
    if (isBooked(room, dateISO, hour)) return;
    if (isInCart(room, dateISO, hour)) cartRemove(room, dateISO, hour);
    else cartAdd({ room: room, date: dateISO, hour: hour });
  }

  function cartLinePrice(item) {
    return PRICES[item.room] || 0;
  }

  function cartTotalAmount() {
    return readCart().reduce(function (sum, item) {
      return sum + cartLinePrice(item);
    }, 0);
  }

  function clampToToday(d) {
    var min = todayStart();
    return d < min ? min : d;
  }

  function buildScheduleMatrix() {
    var tbody = document.querySelector("[data-rez-matrix-body]");
    if (!tbody) return;
    tbody.innerHTML = "";
    SLOT_HOURS.forEach(function (h) {
      var tr = document.createElement("tr");
      var th = document.createElement("th");
      th.scope = "row";
      th.className = "rez-matrix__time";
      th.textContent = slotTimeLabel(h);
      tr.appendChild(th);
      ROOM_ORDER.forEach(function (room) {
        if (!ROOM_IDS[room]) return;
        var price = PRICES[room];
        var td = document.createElement("td");
        td.className = "rez-matrix__cell";
        td.setAttribute("data-room-col", room);
        var inner = document.createElement("div");
        inner.className = "rez-matrix__cell-inner";
        var priceWrap = document.createElement("div");
        priceWrap.className = "rez-matrix__price";
        var amount = document.createElement("span");
        amount.className = "rez-matrix__amount";
        amount.textContent = String(price);
        var cur = document.createElement("span");
        cur.setAttribute("data-i18n", "booking.currency");
        cur.textContent = "zł";
        priceWrap.appendChild(amount);
        priceWrap.appendChild(document.createTextNode(" "));
        priceWrap.appendChild(cur);
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "rez-slot__btn";
        btn.setAttribute("data-rez-book", "");
        btn.setAttribute("data-room", room);
        btn.setAttribute("data-hour", String(h));
        inner.appendChild(priceWrap);
        inner.appendChild(btn);
        td.appendChild(inner);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function applySlotButtonState(btn, room, dateISO, hour) {
    var td = btn.closest("td");
    var booked = isBooked(room, dateISO, hour);
    var inCart = isInCart(room, dateISO, hour);
    btn.classList.remove("is-in-cart");
    if (td) td.classList.toggle("is-cart-selected", inCart && !booked);

    if (booked) {
      btn.disabled = true;
      btn.classList.add("is-booked");
      btn.textContent = t("rez_page.booked");
    } else {
      btn.disabled = false;
      btn.classList.remove("is-booked");
      if (inCart) {
        btn.classList.add("is-in-cart");
        btn.textContent = t("rez_page.in_cart_btn");
      } else {
        btn.textContent = t("rez_page.book");
      }
    }

    var slotLabel = slotTimeLabel(hour);
    var roomName = t("rooms." + room + ".name");
    var hint = booked ? t("booking.busy_aria") : inCart ? t("rez_cart.hint") : t("booking.slot_aria_hint");
    btn.setAttribute(
      "aria-label",
      t("booking.slot_aria_template", {
        room: roomName,
        slot: slotLabel,
        price: String(PRICES[room]),
        currency: t("booking.currency"),
        hint: hint,
      })
    );
  }

  function refreshAllSlots() {
    var iso = toISODate(selectedDate);
    document.querySelectorAll("[data-rez-book]").forEach(function (btn) {
      var room = btn.getAttribute("data-room");
      var hour = parseInt(btn.getAttribute("data-hour"), 10);
      if (!ROOM_IDS[room] || SLOT_HOURS.indexOf(hour) === -1) return;
      applySlotButtonState(btn, room, iso, hour);
    });
  }

  function syncDateControls(dateInput, dateLabel, prevBtn) {
    var iso = toISODate(selectedDate);
    var minIso = toISODate(todayStart());
    dateInput.min = minIso;
    dateInput.value = iso;
    dateLabel.textContent = formatDateLong(selectedDate);
    if (prevBtn) {
      var isToday = toISODate(selectedDate) === minIso;
      prevBtn.disabled = isToday;
      prevBtn.setAttribute("aria-disabled", isToday ? "true" : "false");
    }
    refreshAllSlots();
  }

  function updateCartBar(cartBar, listEl, totalNumEl, checkoutBtn) {
    if (!cartBar || !listEl) return;
    var items = readCart();
    var n = items.length;
    document.body.classList.toggle("has-rez-cart", n > 0);
    if (n > 0) cartBar.removeAttribute("hidden");
    else cartBar.setAttribute("hidden", "");

    listEl.innerHTML = "";
    items.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "rez-cart__chip";
      var span = document.createElement("span");
      span.className = "rez-cart__chip-text";
      var d = parseISODate(item.date);
      span.textContent =
        t("rooms." + item.room + ".name") +
        " · " +
        formatDateLong(d) +
        " · " +
        slotTimeLabelHyphen(item.hour) +
        " · " +
        String(PRICES[item.room]) +
        " " +
        t("booking.currency");
      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "rez-cart__chip-remove";
      rm.setAttribute("data-rez-cart-remove", "");
      rm.setAttribute("data-room", item.room);
      rm.setAttribute("data-date", item.date);
      rm.setAttribute("data-hour", String(item.hour));
      rm.setAttribute("aria-label", t("rez_cart.remove_aria"));
      rm.textContent = "×";
      li.appendChild(span);
      li.appendChild(rm);
      listEl.appendChild(li);
    });

    if (totalNumEl) totalNumEl.textContent = String(cartTotalAmount());
    if (checkoutBtn) {
      checkoutBtn.disabled = n === 0;
      checkoutBtn.setAttribute("aria-disabled", n === 0 ? "true" : "false");
    }

    refreshAllSlots();
  }

  function isPayModalOpen(modal) {
    return modal && modal.classList.contains("is-open");
  }

  function fillPayModal(linesEl, totalNumEl) {
    if (!linesEl) return;
    var items = readCart();
    linesEl.innerHTML = "";
    items.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "rez-pay__line";
      var d = parseISODate(item.date);
      li.textContent =
        t("rooms." + item.room + ".name") +
        " · " +
        formatDateLong(d) +
        " · " +
        slotTimeLabelHyphen(item.hour) +
        " · " +
        String(PRICES[item.room]) +
        " " +
        t("booking.currency");
      linesEl.appendChild(li);
    });
    if (totalNumEl) totalNumEl.textContent = String(cartTotalAmount());
  }

  function openPayModal(modal, linesEl, totalNumEl, stepMain, stepProc) {
    if (!modal) return;
    var items = readCart();
    if (!items.length) return;
    lastPayFocus = document.activeElement;
    fillPayModal(linesEl, totalNumEl);
    if (stepMain) stepMain.removeAttribute("hidden");
    if (stepProc) stepProc.setAttribute("hidden", "");
    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-rez-pay-open");
    window.requestAnimationFrame(function () {
      modal.classList.add("is-open");
      var payBtn = modal.querySelector("[data-rez-pay-submit]");
      if (payBtn) {
        try {
          payBtn.focus();
        } catch (e) {
          /* ignore */
        }
      }
    });
  }

  function closePayModal(modal, stepMain, stepProc) {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-rez-pay-open");
    if (stepMain) stepMain.removeAttribute("hidden");
    if (stepProc) stepProc.setAttribute("hidden", "");
    window.setTimeout(function () {
      modal.setAttribute("hidden", "");
    }, 320);
    if (lastPayFocus && typeof lastPayFocus.focus === "function") {
      try {
        lastPayFocus.focus();
      } catch (e) {
        /* ignore */
      }
    }
    lastPayFocus = null;
  }

  function showToast(toastEl, i18nKey) {
    if (!toastEl) return;
    if (toastTimer) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (toastHideTimer) {
      window.clearTimeout(toastHideTimer);
      toastHideTimer = null;
    }
    toastEl.textContent = t(i18nKey || "rez_pay.success_toast");
    toastEl.classList.add("rez-toast--promo");
    toastEl.removeAttribute("hidden");
    window.requestAnimationFrame(function () {
      toastEl.classList.add("is-visible");
    });
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove("is-visible");
      toastHideTimer = window.setTimeout(function () {
        toastEl.setAttribute("hidden", "");
        toastEl.textContent = "";
        toastEl.classList.remove("rez-toast--promo");
      }, 400);
    }, TOAST_MS);
  }

  function onSlotClick(ev) {
    var btn = ev.target.closest("[data-rez-book]");
    if (!btn || btn.disabled) return;
    var room = btn.getAttribute("data-room");
    var hour = parseInt(btn.getAttribute("data-hour"), 10);
    if (!ROOM_IDS[room] || SLOT_HOURS.indexOf(hour) === -1) return;
    var iso = toISODate(selectedDate);
    if (isBooked(room, iso, hour)) return;
    ev.preventDefault();
    cartToggle(room, iso, hour);
    return true;
  }

  function onPaySubmit(modal, toastEl, stepMain, stepProc, payTotalEl) {
    var items = readCart();
    if (!items.length) return;
    if (stepMain) stepMain.setAttribute("hidden", "");
    if (stepProc) stepProc.removeAttribute("hidden");

    window.setTimeout(function () {
      var bookings = readBookings();
      items.forEach(function (item) {
        if (!isBooked(item.room, item.date, item.hour)) {
          bookings.push({ room: item.room, date: item.date, hour: item.hour });
        }
      });
      writeBookings(bookings);
      writeCart([]);
      closePayModal(modal, stepMain, stepProc);
      if (typeof payTotalEl !== "undefined" && payTotalEl) payTotalEl.textContent = "0";
      var cartBar = document.querySelector("[data-rez-cart]");
      var listEl = document.querySelector("[data-rez-cart-list]");
      var totalNum = document.querySelector("[data-rez-cart-total]");
      var checkout = document.querySelector("[data-rez-checkout]");
      updateCartBar(cartBar, listEl, totalNum, checkout);
      showToast(toastEl, "rez_pay.success_toast");
    }, PROCESS_MS);
  }

  function init() {
    var dateInput = document.querySelector("[data-rez-date-native]");
    var dateLabel = document.querySelector("[data-rez-date-label]");
    var prevBtn = document.querySelector("[data-rez-prev]");
    var bar = document.querySelector("[data-rez-datebar]");
    var rezSite = document.getElementById("rez-site");
    var cartBar = document.querySelector("[data-rez-cart]");
    var cartList = document.querySelector("[data-rez-cart-list]");
    var cartTotalNum = document.querySelector("[data-rez-cart-total]");
    var checkoutBtn = document.querySelector("[data-rez-checkout]");
    var payModal = document.getElementById("rez-pay-modal");
    var payLines = document.querySelector("[data-rez-pay-lines]");
    var payTotalNum = document.querySelector("[data-rez-pay-total-num]");
    var payStepMain = document.querySelector("[data-rez-pay-step-main]");
    var payStepProc = document.querySelector("[data-rez-pay-step-processing]");
    var toastEl = document.querySelector("[data-rez-toast]");

    if (!dateInput || !dateLabel || !bar || !rezSite) return;

    buildScheduleMatrix();
    if (window.SyrenaI18n && typeof window.SyrenaI18n.apply === "function") {
      window.SyrenaI18n.apply(window.SyrenaI18n.getLang(), { noFade: true });
    }

    selectedDate = clampToToday(selectedDate);
    syncDateControls(dateInput, dateLabel, prevBtn);
    updateCartBar(cartBar, cartList, cartTotalNum, checkoutBtn);

    bar.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-rez-today]")) {
        selectedDate = todayStart();
        syncDateControls(dateInput, dateLabel, prevBtn);
        updateCartBar(cartBar, cartList, cartTotalNum, checkoutBtn);
        return;
      }
      if (ev.target.closest("[data-rez-open-cal]")) {
        ev.preventDefault();
        try {
          if (typeof dateInput.showPicker === "function") dateInput.showPicker();
          else dateInput.click();
        } catch (e) {
          dateInput.click();
        }
        return;
      }
      if (ev.target.closest("[data-rez-prev]")) {
        var p = new Date(selectedDate);
        p.setDate(p.getDate() - 1);
        selectedDate = clampToToday(startOfDay(p));
        syncDateControls(dateInput, dateLabel, prevBtn);
        updateCartBar(cartBar, cartList, cartTotalNum, checkoutBtn);
        return;
      }
      if (ev.target.closest("[data-rez-next]")) {
        var n = new Date(selectedDate);
        n.setDate(n.getDate() + 1);
        selectedDate = startOfDay(n);
        syncDateControls(dateInput, dateLabel, prevBtn);
        updateCartBar(cartBar, cartList, cartTotalNum, checkoutBtn);
      }
    });

    dateInput.addEventListener("change", function () {
      selectedDate = clampToToday(parseISODate(dateInput.value));
      syncDateControls(dateInput, dateLabel, prevBtn);
      updateCartBar(cartBar, cartList, cartTotalNum, checkoutBtn);
    });

    rezSite.addEventListener("click", function (ev) {
      if (onSlotClick(ev)) {
        updateCartBar(cartBar, cartList, cartTotalNum, checkoutBtn);
      }
    });

    if (cartBar) {
      cartBar.addEventListener("click", function (ev) {
        var rm = ev.target.closest("[data-rez-cart-remove]");
        if (rm) {
          ev.preventDefault();
          var room = rm.getAttribute("data-room");
          var dateISO = rm.getAttribute("data-date");
          var hour = parseInt(rm.getAttribute("data-hour"), 10);
          if (ROOM_IDS[room] && dateISO && SLOT_HOURS.indexOf(hour) !== -1) {
            cartRemove(room, dateISO, hour);
            updateCartBar(cartBar, cartList, cartTotalNum, checkoutBtn);
          }
          return;
        }
        if (ev.target.closest("[data-rez-checkout]")) {
          ev.preventDefault();
          var btn = ev.target.closest("[data-rez-checkout]");
          if (btn && !btn.disabled) {
            openPayModal(payModal, payLines, payTotalNum, payStepMain, payStepProc);
            if (window.SyrenaI18n && typeof window.SyrenaI18n.apply === "function") {
              window.SyrenaI18n.apply(window.SyrenaI18n.getLang(), { noFade: true });
            }
          }
        }
      });
    }

    if (payModal) {
      payModal.addEventListener("click", function (ev) {
        if (ev.target.closest("[data-rez-pay-dismiss]")) {
          ev.preventDefault();
          closePayModal(payModal, payStepMain, payStepProc);
          return;
        }
        if (ev.target.closest("[data-rez-pay-submit]")) {
          ev.preventDefault();
          onPaySubmit(payModal, toastEl, payStepMain, payStepProc, payTotalNum);
        }
      });
    }

    document.addEventListener(
      "keydown",
      function (ev) {
        if (!isPayModalOpen(payModal) || ev.key !== "Escape") return;
        ev.preventDefault();
        ev.stopPropagation();
        closePayModal(payModal, payStepMain, payStepProc);
      },
      true
    );

    document.addEventListener("syrena:languagechange", function () {
      syncDateControls(dateInput, dateLabel, prevBtn);
      updateCartBar(cartBar, cartList, cartTotalNum, checkoutBtn);
      if (isPayModalOpen(payModal) && payStepMain && !payStepMain.hasAttribute("hidden")) {
        fillPayModal(payLines, payTotalNum);
      }
    });

    var params = new URLSearchParams(window.location.search);
    var focusRoom = params.get("room");
    if (focusRoom && ROOM_IDS[focusRoom]) {
      var cells = document.querySelectorAll('[data-room-col="' + focusRoom + '"]');
      cells.forEach(function (el) {
        el.classList.add("is-highlight-col");
      });
      var shell = document.querySelector(".rez-schedule-shell");
      if (shell) shell.scrollIntoView({ behavior: "smooth", block: "nearest" });
      var headCell = document.querySelector('thead [data-room-col="' + focusRoom + '"]');
      if (headCell && typeof headCell.scrollIntoView === "function") {
        headCell.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
      window.setTimeout(function () {
        cells.forEach(function (el) {
          el.classList.remove("is-highlight-col");
        });
      }, 5000);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
