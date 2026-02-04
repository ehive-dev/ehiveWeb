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

  function wireBrand() {
    const b = cfg().brand || {};
    const nameEls = document.querySelectorAll("[data-brand-name]");
    const subEls = document.querySelectorAll("[data-brand-subtitle]");
    nameEls.forEach(el => { el.textContent = b.name || "eHive One"; });
    subEls.forEach(el => { el.textContent = b.subtitle || "OpenArc Shop"; });
  }

  // Init
  document.addEventListener("DOMContentLoaded", () => {
    initMobileNav();
    setActiveNav();
    wireFooter();
    wireBrand();

    // Page-specific bindings
    wireShopCard();
    wireProductPage();
    wireAddonButtons();
    wireCartPage();
  });
})();
