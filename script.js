/*
  eHive One Shop (GitHub Pages) – vanilla JS
  Main functions:
    - initMobileNav(): toggles the mobile navigation panel
    - setActiveNav(): sets aria-current based on current filename
    - money(): formats EUR/other currencies for display
    - paypalActionUrl(): returns the correct PayPal endpoint for live/sandbox
    - renderDynamicPaypalAdd(): creates an "Add to Cart" PayPal form for a selected variant + quantity
    - wireShopCard(), wireProductPage(), wireAddonButtons(): bind UI events and render PayPal forms

  Notes:
    - This site uses a PayPal-hosted shopping cart. The cart and totals are calculated by PayPal.
    - Each variant/add-on needs its own PayPal hosted button ID (hosted_button_id).
*/

(function () {
  "use strict";

  function resolveIncludePath(key) {
    if (!key) return "";
    if (key.includes("/") || key.endsWith(".html")) return key;
    return `partials/${key}.html`;
  }

  async function loadPartials() {
    const slots = document.querySelectorAll("[data-include]");
    if (!slots.length) return;

    const tasks = Array.from(slots).map(async slot => {
      const key = slot.getAttribute("data-include");
      const path = resolveIncludePath(key);
      if (!path) return;

      try {
        const res = await fetch(path, { cache: "no-store" });
        if (!res.ok) {
          console.warn(`[include] ${path} failed: ${res.status}`);
          return;
        }
        slot.innerHTML = await res.text();
      } catch (err) {
        console.warn(`[include] ${path} failed`, err);
      }
    });

    await Promise.all(tasks);
  }

  function cfg() {
    return window.EHIVE_SHOP_CONFIG || {};
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function money(value, currency) {
    try {
      return new Intl.NumberFormat("de-DE", { style: "currency", currency: currency || "EUR" }).format(value);
    } catch {
      return String(value);
    }
  }

  function paypalActionUrl() {
    const env = (cfg().paypal && cfg().paypal.env) || "live";
    return env === "sandbox"
      ? "https://www.sandbox.paypal.com/cgi-bin/webscr"
      : "https://www.paypal.com/cgi-bin/webscr";
  }

  function hostedButtonId(buttonKey) {
    const p = (cfg().paypal && cfg().paypal.hostedButtons) || {};
    return p[buttonKey] || "";
  }

  function isPlaceholderId(id) {
    return !id || /^PASTE_HOSTED_BUTTON_ID_HERE$/i.test(id) || id.length < 6;
  }

  function createHidden(name, value) {
    const i = document.createElement("input");
    i.type = "hidden";
    i.name = name;
    i.value = String(value);
    return i;
  }

  function createPaypalAddToCartForm(buttonKey, qty, extraVars) {
    const buttonId = hostedButtonId(buttonKey);
    const form = document.createElement("form");
    form.method = "post";
    form.action = paypalActionUrl();
    form.target = "_top";

    if (isPlaceholderId(buttonId)) {
      const warn = document.createElement("div");
      warn.className = "note";
      warn.textContent = "PayPal Button-ID fehlt. Bitte in config.js eintragen.";
      return warn;
    }

    // Hosted (saved) button. PayPal decides if it’s Add-to-Cart/Buy-Now based on the saved button.
    form.appendChild(createHidden("cmd", "_s-xclick"));
    form.appendChild(createHidden("hosted_button_id", buttonId));

    const p = cfg().paypal || {};
    const urls = p.urls || {};

    // Optional: control checkout language + currency
    if (p.locale) form.appendChild(createHidden("lc", p.locale));
    if (p.currency) form.appendChild(createHidden("currency_code", p.currency));

    // Optional: "Continue shopping" + return/cancel URLs
    if (urls.shopping_url) form.appendChild(createHidden("shopping_url", urls.shopping_url));
    if (urls.return_url) form.appendChild(createHidden("return", urls.return_url));
    if (urls.cancel_return_url) form.appendChild(createHidden("cancel_return", urls.cancel_return_url));

    // Quantity (positive integer)
    const q = Math.max(1, Math.min(99, Number(qty) || 1));
    form.appendChild(createHidden("quantity", q));

    // Extra variables (optional): on0/os0, custom, etc.
    if (extraVars && typeof extraVars === "object") {
      Object.entries(extraVars).forEach(([k, v]) => {
        if (v === undefined || v === null || v === "") return;
        form.appendChild(createHidden(k, v));
      });
    }

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "btn primary";
    submit.textContent = "In den PayPal-Warenkorb";
    form.appendChild(submit);

    return form;
  }

  function createPaypalViewCartForm(mountEl) {
    const p = cfg().paypal || {};
    const business = p.business || "";
    if (!mountEl) return;

    if (!business || /^YOUR_PAYPAL_MERCHANT_ID$/i.test(business)) {
      mountEl.innerHTML = '<p class="note">PayPal business/merchant ID fehlt. Bitte in config.js eintragen.</p>';
      return;
    }

    const form = document.createElement("form");
    form.method = "post";
    form.action = paypalActionUrl();
    form.target = "_top";

    form.appendChild(createHidden("cmd", "_cart"));
    form.appendChild(createHidden("business", business));
    form.appendChild(createHidden("display", "1"));

    if (p.locale) form.appendChild(createHidden("lc", p.locale));
    if (p.currency) form.appendChild(createHidden("currency_code", p.currency));

    const btn = document.createElement("button");
    btn.type = "submit";
    btn.className = "btn primary";
    btn.textContent = "PayPal-Warenkorb öffnen";
    form.appendChild(btn);

    mountEl.replaceChildren(form);
  }

  function initMobileNav() {
    const btn = byId("mobileToggle");
    const panel = byId("mobilePanel");
    if (!btn || !panel) return;

    btn.addEventListener("click", () => {
      panel.classList.toggle("show");
      btn.setAttribute("aria-expanded", panel.classList.contains("show") ? "true" : "false");
    });
  }

  function setActiveNav() {
    const path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    document.querySelectorAll(".nav-links a, .mobile-panel a").forEach(a => {
      const href = (a.getAttribute("href") || "").toLowerCase();
      if (href === path) a.setAttribute("aria-current", "page");
    });
  }

  function wireFooter() {
    const y = byId("year");
    if (y) y.textContent = String(new Date().getFullYear());

    const email = (cfg().brand && cfg().brand.contactEmail) || "sales@example.com";
    const fe = byId("footerEmail");
    if (fe) fe.textContent = email;
  }

  function initCommunityStats() {
    const wrap = document.querySelector("[data-community-stats]");
    if (!wrap) return;
    const endpoint = wrap.getAttribute("data-community-endpoint") || "";
    const statsFallback = (cfg().stats && typeof cfg().stats === "object") ? cfg().stats : null;

    const slots = {};
    wrap.querySelectorAll("[data-live]").forEach(el => {
      const key = el.getAttribute("data-live");
      if (!key) return;
      slots[key] = el;
      if (statsFallback && key in statsFallback) {
        el.textContent = statsFallback[key];
      }
    });

    if (!endpoint) return;

    const pick = (obj, paths) => {
      for (const path of paths) {
        let cur = obj;
        for (const key of path) {
          if (cur && Object.prototype.hasOwnProperty.call(cur, key)) {
            cur = cur[key];
          } else {
            cur = undefined;
            break;
          }
        }
        if (cur !== undefined && cur !== null && cur !== "") return cur;
      }
      return null;
    };

    const coerceNumber = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "string") {
        if (/[a-z%]/i.test(value)) return value;
        const cleaned = value.replace(",", ".");
        const num = Number(cleaned);
        return Number.isFinite(num) ? num : value;
      }
      return value;
    };

    const findByPatterns = (sources, patterns, exclude = []) => {
      const keys = patterns.map(p => new RegExp(p, "i"));
      const blacklist = exclude.map(p => new RegExp(p, "i"));
      for (const src of sources) {
        if (!src || typeof src !== "object") continue;
        for (const [key, raw] of Object.entries(src)) {
          if (blacklist.some(re => re.test(key))) continue;
          if (keys.some(re => re.test(key))) return raw;
        }
      }
      return null;
    };

    const findDeepByPatterns = (root, patterns, exclude = []) => {
      if (!root || typeof root !== "object") return null;
      const keys = patterns.map(p => new RegExp(p, "i"));
      const blacklist = exclude.map(p => new RegExp(p, "i"));
      const queue = [{ value: root, depth: 0 }];
      const seen = new Set();
      while (queue.length) {
        const { value, depth } = queue.shift();
        if (!value || typeof value !== "object" || seen.has(value) || depth > 3) continue;
        seen.add(value);
        for (const [key, raw] of Object.entries(value)) {
          if (blacklist.some(re => re.test(key))) continue;
          if (keys.some(re => re.test(key))) return raw;
          if (raw && typeof raw === "object") {
            queue.push({ value: raw, depth: depth + 1 });
          }
        }
      }
      return null;
    };

    const formatPower = (value) => {
      const val = coerceNumber(value);
      if (typeof val === "string") return val;
      const num = Number(val);
      if (!Number.isFinite(num)) return "—";
      const abs = Math.abs(num);
      const sign = num < 0 ? "−" : "";
      if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)} MW`;
      if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)} kW`;
      return `${sign}${Math.round(abs)} W`;
    };

    const formatEnergy = (value) => {
      const val = coerceNumber(value);
      if (typeof val === "string") return val;
      const num = Number(val);
      if (!Number.isFinite(num)) return "—";
      const abs = Math.abs(num);
      if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)} GWh`;
      if (abs >= 1_000) return `${(abs / 1_000).toFixed(1)} MWh`;
      return `${Math.round(abs)} kWh`;
    };

    const formatPercent = (value) => {
      const val = coerceNumber(value);
      if (typeof val === "string") return val;
      let num = Number(val);
      if (!Number.isFinite(num)) return "—";
      if (num > 0 && num <= 1) num = num * 100;
      const digits = num < 10 ? 1 : 0;
      const formatted = num.toLocaleString("de-DE", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
      });
      return `${formatted}%`;
    };

    const formatCount = (value) => {
      const val = coerceNumber(value);
      if (typeof val === "string") return val;
      const num = Number(val);
      if (!Number.isFinite(num)) return "—";
      return Math.round(num).toLocaleString("de-DE");
    };

    const update = async () => {
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const payload = data && typeof data === "object" && "result" in data ? data.result : data;

        const candidates = [payload, payload && payload.total, payload && payload.data, payload && payload.stats];
        const mappings = {
          power: {
            fmt: formatPower,
            keys: [["power"], ["chargingPower"], ["chargePower"], ["currentPower"], ["totalPower"]],
            patterns: ["power", "charging.*power", "charge.*power"]
          },
          users: {
            fmt: formatCount,
            keys: [["users"], ["activeUsers"], ["installations"], ["activeInstallations"], ["active"]],
            patterns: ["user", "install", "active"]
          },
          solarShare: {
            fmt: formatPercent,
            keys: [["solarShare"], ["solarSharePercent"], ["solarPercent"], ["solar_share"], ["solarRatio"]],
            patterns: ["solar.*share", "share.*solar", "solar.*percent", "percent.*solar", "solar.*ratio", "ratio.*solar"]
          },
          solarEnergy: {
            fmt: formatEnergy,
            keys: [["solarEnergy"], ["energySolar"], ["solar_total"], ["solarEnergyTotal"], ["solarEnergySum"]],
            patterns: ["solar.*energy", "energy.*solar"]
          },
          energy: {
            fmt: formatEnergy,
            keys: [["energy"], ["totalEnergy"], ["chargedEnergy"], ["energyTotal"], ["energySum"]],
            patterns: ["energy", "charged", "charge.*energy"],
            exclude: ["solar"]
          }
        };

        Object.entries(mappings).forEach(([key, cfgMap]) => {
          const slot = slots[key];
          if (!slot) return;
          let value = pick(payload, cfgMap.keys);
          if (value === null) {
            value = findByPatterns(candidates, cfgMap.patterns || [], cfgMap.exclude || []);
          }
          if (value === null) {
            value = findDeepByPatterns(payload, cfgMap.patterns || [], cfgMap.exclude || []);
          }
          if (value === null) return;
          slot.textContent = cfgMap.fmt(value);
        });

        const solarSlot = slots.solarShare;
        if (solarSlot && (solarSlot.textContent === "—" || solarSlot.textContent === "")) {
          const solarEnergy = pick(payload, mappings.solarEnergy.keys) ??
            findByPatterns(candidates, mappings.solarEnergy.patterns || []) ??
            findDeepByPatterns(payload, mappings.solarEnergy.patterns || []);
          const totalEnergy = pick(payload, mappings.energy.keys) ??
            findByPatterns(candidates, mappings.energy.patterns || [], mappings.energy.exclude || []) ??
            findDeepByPatterns(payload, mappings.energy.patterns || [], mappings.energy.exclude || []);
          const solarNum = Number(coerceNumber(solarEnergy));
          const totalNum = Number(coerceNumber(totalEnergy));
          if (Number.isFinite(solarNum) && Number.isFinite(totalNum) && totalNum > 0) {
            const ratio = (solarNum / totalNum) * 100;
            solarSlot.textContent = formatPercent(ratio);
          }
        }
      } catch (err) {
        // keep fallback values if fetch fails
      }
    };

    update();
    window.setInterval(update, 12000);
  }

  function getCatalog() {
    const c = cfg().catalog || {};
    const products = Array.isArray(c.products) ? c.products : [];
    const addons = Array.isArray(c.addons) ? c.addons : [];
    return { products, addons };
  }

  function findProduct(id) {
    return getCatalog().products.find(p => p.id === id);
  }

  function renderDynamicPaypalAdd(mountEl, buttonKey, qty, extraVars) {
    if (!mountEl) return;
    mountEl.replaceChildren(createPaypalAddToCartForm(buttonKey, qty, extraVars));
  }

  function wireShopCard() {
    // Shop page: product card with variant selector
    const select = document.querySelector("[data-variant-select='ehive-one']");
    const qtyInput = document.querySelector("[data-qty-input='ehive-one']");
    const slot = document.querySelector("[data-paypal-slot='ehive-one']");

    if (!select || !qtyInput || !slot) return;

    function refresh() {
      const variantId = select.value;
      const qty = qtyInput.value;
      const p = findProduct("ehive-one");
      const v = p && p.variants ? p.variants.find(x => x.id === variantId) : null;

      // Optional: pass a visible option value to PayPal (tracking)
      const extra = v ? { on0: "variant", os0: v.label } : undefined;

      renderDynamicPaypalAdd(slot, variantId, qty, extra);

      const priceEl = document.querySelector("[data-price='ehive-one']");
      if (priceEl && v) priceEl.textContent = money(v.price, (cfg().paypal && cfg().paypal.currency) || "EUR");
    }

    select.addEventListener("change", refresh);
    qtyInput.addEventListener("input", refresh);
    refresh();
  }

  function wireProductPage() {
    // Product detail page: variant + qty + add to cart
    const select = document.querySelector("[data-variant-select='ehive-one-detail']");
    const qtyInput = document.querySelector("[data-qty-input='ehive-one-detail']");
    const slot = document.querySelector("[data-paypal-slot='ehive-one-detail']");
    const priceEl = document.querySelector("[data-price='ehive-one-detail']");

    if (!select || !qtyInput || !slot) return;

    function refresh() {
      const variantId = select.value;
      const qty = qtyInput.value;

      const p = findProduct("ehive-one");
      const v = p && p.variants ? p.variants.find(x => x.id === variantId) : null;
      if (priceEl && v) priceEl.textContent = money(v.price, (cfg().paypal && cfg().paypal.currency) || "EUR");

      const extra = v ? { on0: "variant", os0: v.label } : undefined;
      renderDynamicPaypalAdd(slot, variantId, qty, extra);
    }

    select.addEventListener("change", refresh);
    qtyInput.addEventListener("input", refresh);
    refresh();
  }

  function wireAddonButtons() {
    // For each add-on card: optional qty input + paypal slot
    document.querySelectorAll("[data-addon-id]").forEach(card => {
      const addonId = card.getAttribute("data-addon-id");
      if (!addonId) return;

      const qtyInput = card.querySelector("[data-addon-qty]");
      const slot = card.querySelector("[data-addon-slot]");
      if (!slot) return;

      function refresh() {
        const qty = qtyInput ? qtyInput.value : 1;
        renderDynamicPaypalAdd(slot, addonId, qty);
      }

      if (qtyInput) qtyInput.addEventListener("input", refresh);
      refresh();
    });
  }

  function wireCartPage() {
    const mount = document.querySelector("[data-paypal-view-cart]");
    if (mount) createPaypalViewCartForm(mount);
  }

  function initScrollReveal() {
    const els = document.querySelectorAll("[data-reveal-on-scroll]");
    if (!els.length) return;

    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        } else {
          entry.target.classList.remove("is-visible");
        }
      });
    }, { root: null, rootMargin: "0px 0px -10% 0px", threshold: 0.15 });

    els.forEach(el => io.observe(el));
  }

  function syncHeroPretextOffset() {
    const hero = document.querySelector(".hero-ehive");
    if (!hero) return;
    const pretext = hero.querySelector(".hero-ehive-pretext");
    const copyInner = hero.querySelector(".hero-ehive-copy-inner");
    if (!pretext || !copyInner) return;

    const gapRaw = getComputedStyle(hero).getPropertyValue("--hero-pretext-gap").trim();
    const gap = parseFloat(gapRaw) || 24;
    const offset = Math.max(0, pretext.offsetTop + pretext.offsetHeight + gap);
    hero.style.setProperty("--hero-pretext-offset", `${offset.toFixed(1)}px`);
  }

  function initScrollShift() {
    const els = document.querySelectorAll("[data-scroll-shift]");
    if (!els.length) return;

    const parseLen = (raw, vh, fallback) => {
      const v = (raw || "").toString().trim();
      if (!v) return fallback;
      if (/vh$/i.test(v)) return (parseFloat(v) || 0) * vh / 100;
      if (/px$/i.test(v)) return parseFloat(v) || 0;
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };

    const getTranslateY = (node) => {
      const t = getComputedStyle(node).transform;
      if (!t || t === "none") return 0;
      if (t.startsWith("matrix3d(")) {
        const vals = t.slice(9, -1).split(",").map(v => parseFloat(v));
        return vals[13] || 0;
      }
      const vals = t.slice(7, -1).split(",").map(v => parseFloat(v));
      return vals[5] || 0;
    };

    let ticking = false;
    const update = () => {
      ticking = false;
      const vh = window.innerHeight || 1;
      const scrollY = window.scrollY || window.pageYOffset || 0;

      els.forEach(el => {
        const stage = el.closest("[data-scroll-stage]");
        if (!stage) return;

        const frameForTrigger = el.closest(".hero-ehive-frame");
        const frameRectForTrigger = frameForTrigger ? frameForTrigger.getBoundingClientRect() : null;
        const rawTrigger = (el.getAttribute("data-scroll-trigger") || el.getAttribute("data-scroll-range") || "").trim();
        let triggerOffset = parseLen(rawTrigger, vh, -120);
        const triggerTop = triggerOffset;
        const frameTopNow = frameRectForTrigger ? frameRectForTrigger.top : 0;
        const triggered = frameRectForTrigger ? frameTopNow <= triggerTop : false;
        stage.classList.toggle("hero-text-active", triggered);

        const rect = el.getBoundingClientRect();
        const currentTranslate = getTranslateY(el);

        const frame = el.closest(".hero-ehive-frame");
        const bg = frame ? frame.querySelector(".hero-ehive-bg") : null;
        let frameTop = NaN;
        let frameBottom = NaN;
        let padTop = NaN;
        let padBottom = NaN;
        let minTop = 80;
        let maxTop = rect.top;
        let frameHeight = NaN;
        let minRatio = 0.18;
        let bgW = NaN;
        let bgH = NaN;
        let bgCrop = 0;
        let bgShift = 0;
        let bgDelay = NaN;
        let bgShiftMax = NaN;
        let bgShiftSpeed = NaN;

        if (frame) {
          const frameRect = frame.getBoundingClientRect();
          frameTop = frameRect.top;
          frameBottom = frameRect.bottom;
          frameHeight = frameRect.height;
          if (bg) {
            const bgRect = bg.getBoundingClientRect();
            bgW = bgRect.width;
            bgH = bgRect.height;
            const minW = 698;
            const maxW = 1400;
            const maxCrop = 10;
            if (bgW > minW) {
              const t = Math.min(1, (bgW - minW) / (maxW - minW));
              bgCrop = t * maxCrop;
            }
            bg.style.setProperty("--hero-bg-crop", `${bgCrop.toFixed(2)}%`);

            const delayRaw = getComputedStyle(stage).getPropertyValue("--hero-bg-delay").trim();
            const maxRaw = getComputedStyle(stage).getPropertyValue("--hero-bg-shift-max").trim();
            const speedRaw = getComputedStyle(stage).getPropertyValue("--hero-bg-shift-speed").trim();
            bgDelay = parseLen(delayRaw, vh, 140);
            bgShiftMax = parseLen(maxRaw, vh, 80);
            const speedNum = parseFloat(speedRaw);
            bgShiftSpeed = Number.isFinite(speedNum) ? speedNum : 0.35;
            if (triggered) {
              const triggerDelta = Math.max(0, (triggerTop - frameTopNow) - bgDelay);
              bgShift = Math.min(bgShiftMax, triggerDelta * bgShiftSpeed);
            } else {
              bgShift = 0;
            }
            bg.style.setProperty("--hero-bg-shift", `${bgShift.toFixed(2)}px`);
          }
          const padTopRaw = getComputedStyle(frame).getPropertyValue("--hero-frame-pad-top").trim();
          const padBottomRaw = getComputedStyle(frame).getPropertyValue("--hero-frame-pad-bottom").trim();
          const ratioRaw = getComputedStyle(frame).getPropertyValue("--hero-copy-top-ratio").trim();
          const padTopFallback = parseFloat(getComputedStyle(frame).paddingTop) || 0;
          const padBottomFallback = parseFloat(getComputedStyle(frame).paddingBottom) || 0;
          padTop = parseLen(padTopRaw, vh, padTopFallback);
          padBottom = parseLen(padBottomRaw, vh, padBottomFallback);
          const ratioNum = parseFloat(ratioRaw);
          minRatio = Number.isFinite(ratioNum) ? ratioNum : minRatio;

          minTop = frameTop + (frameHeight * minRatio);
          maxTop = frameBottom - padBottom - rect.height;
        }

        if (maxTop < minTop) maxTop = minTop;
        const desiredTop = triggered ? minTop : maxTop;
        const delta = desiredTop - rect.top;
        const translate = currentTranslate + delta;

        el.style.transform = `translateY(${translate.toFixed(2)}px)`;
        el.style.opacity = triggered ? "1" : "0";

        const debug = document.querySelector("[data-debug-panel]");
        if (debug) {
          debug.textContent =
            `triggerTop: ${triggerTop.toFixed(1)}px\n` +
            `frameTopNow: ${frameTopNow.toFixed(1)}px\n` +`triggered: ${triggered}\n` +
            `frameTop: ${Number.isFinite(frameTop) ? frameTop.toFixed(1) : "n/a"}px\n` +
              `frameBottom: ${Number.isFinite(frameBottom) ? frameBottom.toFixed(1) : "n/a"}px\n` +
              `bgSize:  ${Number.isFinite(bgW) ? bgW.toFixed(1) : "n/a"}x${Number.isFinite(bgH) ? bgH.toFixed(1) : "n/a"}px\n` +
              `bgCrop:  ${bgCrop.toFixed(2)}%\n` +
              `bgDelay: ${Number.isFinite(bgDelay) ? bgDelay.toFixed(1) : "n/a"}px\n` +
              `bgShift: ${bgShift.toFixed(1)}px\n` +
              `padTop:   ${Number.isFinite(padTop) ? padTop.toFixed(1) : "n/a"}px\n` +
            `padBottom:${Number.isFinite(padBottom) ? padBottom.toFixed(1) : "n/a"}px\n` +
            `minTop:   ${minTop.toFixed(1)}px\n` +
            `maxTop:   ${maxTop.toFixed(1)}px\n` +
            `desired:  ${desiredTop.toFixed(1)}px\n` +
            `textTop:  ${rect.top.toFixed(1)}px\n` +
            `transY:   ${translate.toFixed(1)}px\n` +
            `scrollY:  ${scrollY.toFixed(1)}px`;
        }
      });

    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
  }

  function initHeroHideOnScroll() {
    const hero = document.querySelector(".hero-ehive");
    if (!hero) return;
    let ticking = false;

    const update = () => {
      ticking = false;
      const y = window.scrollY || window.pageYOffset || 0;
      hero.classList.toggle("hide-on-scroll", y > 5);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
  }

  function wireBrand() {
    const b = cfg().brand || {};
    const nameEls = document.querySelectorAll("[data-brand-name]");
    const subEls = document.querySelectorAll("[data-brand-subtitle]");
    nameEls.forEach(el => { el.textContent = b.name || "eHive One"; });
    subEls.forEach(el => { el.textContent = b.subtitle || "OpenArc Shop"; });
  }

  function syncHeaderHeight() {
    const header = document.querySelector(".header");
    if (!header) return;
    const h = header.offsetHeight || 0;
    if (h) document.documentElement.style.setProperty("--header-h", `${h}px`);
  }

  function initLogoLightbox() {
    const items = document.querySelectorAll("[data-zoom-src]");
    if (!items.length) return;

    let lightbox = document.getElementById("imageLightbox");
    let img = document.getElementById("imageLightboxImg");
    let label = document.getElementById("imageLightboxLabel");
    let closeBtn = document.getElementById("imageLightboxClose");

    if (!lightbox) {
      lightbox = document.createElement("div");
      lightbox.id = "imageLightbox";
      lightbox.className = "image-lightbox";
      lightbox.setAttribute("aria-hidden", "true");
      lightbox.setAttribute("role", "dialog");
      lightbox.innerHTML = [
        '<button id="imageLightboxClose" class="lightbox-close" type="button" aria-label="Schließen">X</button>',
        '<div class="lightbox-content">',
        '<img id="imageLightboxImg" src="" alt="">',
        '<p id="imageLightboxLabel" class="lightbox-label"></p>',
        "</div>"
      ].join("");
      document.body.appendChild(lightbox);
      img = document.getElementById("imageLightboxImg");
      label = document.getElementById("imageLightboxLabel");
      closeBtn = document.getElementById("imageLightboxClose");
    }

    const open = (src, text) => {
      if (img) img.src = src;
      if (img) img.alt = text || "Bildvorschau";
      if (label) label.textContent = text || "";
      lightbox.classList.add("show");
      lightbox.setAttribute("aria-hidden", "false");
      document.body.classList.add("lightbox-open");
    };

    const close = () => {
      lightbox.classList.remove("show");
      lightbox.setAttribute("aria-hidden", "true");
      document.body.classList.remove("lightbox-open");
    };

    items.forEach(item => {
      item.addEventListener("click", () => {
        const src = item.getAttribute("data-zoom-src");
        const text = item.getAttribute("data-zoom-label") || "";
        if (!src) return;
        open(src, text);
      });
    });

    if (closeBtn) closeBtn.addEventListener("click", close);
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) close();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  function initVideoLightbox() {
    const items = document.querySelectorAll("[data-video-src]");
    if (!items.length) return;

    let lightbox = document.getElementById("videoLightbox");
    let video = document.getElementById("videoLightboxVideo");
    let label = document.getElementById("videoLightboxLabel");
    let closeBtn = document.getElementById("videoLightboxClose");

    if (!lightbox) {
      lightbox = document.createElement("div");
      lightbox.id = "videoLightbox";
      lightbox.className = "video-lightbox";
      lightbox.setAttribute("aria-hidden", "true");
      lightbox.setAttribute("role", "dialog");
      lightbox.innerHTML = [
        '<button id="videoLightboxClose" class="lightbox-close" type="button" aria-label="Schließen">X</button>',
        '<div class="lightbox-content">',
        '<video id="videoLightboxVideo" controls playsinline preload="metadata"></video>',
        '<p id="videoLightboxLabel" class="video-label"></p>',
        "</div>"
      ].join("");
      document.body.appendChild(lightbox);
      video = document.getElementById("videoLightboxVideo");
      label = document.getElementById("videoLightboxLabel");
      closeBtn = document.getElementById("videoLightboxClose");
    }

    const open = (src, text) => {
      if (video) {
        video.src = src;
        video.load();
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
      }
      if (label) label.textContent = text || "";
      lightbox.classList.add("show");
      lightbox.setAttribute("aria-hidden", "false");
      document.body.classList.add("lightbox-open");
    };

    const close = () => {
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      lightbox.classList.remove("show");
      lightbox.setAttribute("aria-hidden", "true");
      document.body.classList.remove("lightbox-open");
    };

    items.forEach(item => {
      item.addEventListener("click", () => {
        const src = item.getAttribute("data-video-src");
        const text = item.getAttribute("data-video-label") || "";
        if (!src) return;
        open(src, text);
      });
    });

    if (closeBtn) closeBtn.addEventListener("click", close);
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) close();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }


  // Init
  document.addEventListener("DOMContentLoaded", () => {
      loadPartials().then(() => {
        syncHeaderHeight();
        syncHeroPretextOffset();
        initMobileNav();
        setActiveNav();
        wireFooter();
        wireBrand();
        initCommunityStats();
        initScrollReveal();
        initScrollShift();
        initHeroHideOnScroll();
        initLogoLightbox();
        initVideoLightbox();
        window.addEventListener("resize", syncHeaderHeight);
        window.addEventListener("resize", syncHeroPretextOffset);
        window.addEventListener("load", syncHeroPretextOffset, { once: true });

        // Page-specific bindings
        wireShopCard();
      wireProductPage();
      wireAddonButtons();
      wireCartPage();
    });
  });
})();









