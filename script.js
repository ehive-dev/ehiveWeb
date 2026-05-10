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

  function syncViewportWidthVar() {
    const root = document.documentElement;
    const docWidth = root && root.clientWidth ? root.clientWidth : 0;
    const winWidth = window.innerWidth || docWidth;
    const width = Math.max(0, Math.min(docWidth || winWidth, winWidth || docWidth));
    if (!width) return;

    const value = `${width}px`;
    root.style.setProperty("--ehive-viewport-w", value);

    if (!document.body || !document.body.classList.contains("shop-page")) return;

    const isMobile = width <= 760 || window.matchMedia("(max-width: 760px)").matches;
    root.style.overflowX = isMobile ? "hidden" : "";

    const bounded = document.querySelectorAll(
      ".shop-page .header, .shop-page .header > .container, .shop-page main, .shop-page main > .section, .shop-page main > .section > .container"
    );
    const content = document.querySelectorAll(
      ".shop-page .section-title, .shop-page .products[data-layout='split'], .shop-page .products[data-layout='split'] .pro"
    );
    const inner = document.querySelectorAll(
      ".shop-page .pro .des, .shop-page .addon-overview, .shop-page .addon-details, .shop-page .addon-overview ul, .shop-page .addon-details ul, .shop-page .addon-specs, .shop-page .products[data-layout='split'] .row, .shop-page .field, .shop-page .paypal-slot"
    );
    const listItems = document.querySelectorAll(
      ".shop-page .addon-overview li, .shop-page .addon-details li"
    );

    if (!isMobile) {
      [...bounded, ...content, ...inner, ...listItems].forEach(el => {
        el.style.width = "";
        el.style.maxWidth = "";
        el.style.minWidth = "";
      });
      return;
    }

    const contentWidth = `${Math.max(0, width - 24)}px`;
    const innerWidth = `${Math.max(0, width - 48)}px`;
    const listItemWidth = `${Math.max(0, width - 64)}px`;

    bounded.forEach(el => {
      el.style.width = value;
      el.style.maxWidth = value;
    });
    content.forEach(el => {
      el.style.width = contentWidth;
      el.style.maxWidth = contentWidth;
    });
    inner.forEach(el => {
      el.style.width = innerWidth;
      el.style.maxWidth = innerWidth;
      el.style.minWidth = "0";
    });
    listItems.forEach(el => {
      el.style.width = listItemWidth;
      el.style.maxWidth = listItemWidth;
      el.style.minWidth = "0";
    });
  }

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

  function canonicalOrigin() {
    return (cfg().site && cfg().site.origin) || "https://www.ehiv3.de";
  }

  function pageKeyFromUrl(urlLike) {
    try {
      const url = new URL(urlLike, canonicalOrigin() + "/");
      const host = (url.hostname || "").toLowerCase();
      if (host && host !== "www.ehiv3.de" && host !== "ehiv3.de") return "";

      let path = (url.pathname || "/").toLowerCase();
      if (path !== "/" && path.endsWith("/")) path = path.slice(0, -1);
      if (!path || path === "/" || path === "/index" || path === "/index.html") return "index.html";

      const leaf = path.split("/").pop() || "";
      if (!leaf) return "index.html";
      return leaf.endsWith(".html") ? leaf : `${leaf}.html`;
    } catch {
      return "";
    }
  }

  function navKeyFromPageKey(pageKey) {
    if (!pageKey) return "";
    if (pageKey.startsWith("news-")) return "news.html";
    return pageKey;
  }

  function maybeRedirectToCanonicalUrl() {
    const host = (location.hostname || "").toLowerCase();
    if (host !== "www.ehiv3.de" && host !== "ehiv3.de") return;

    const origin = canonicalOrigin();
    const aliases = new Map([
      ["/", "/"],
      ["/index", "/"],
      ["/index.html", "/"],
      ["/about", "/about.html"],
      ["/cart", "/cart.html"],
      ["/cancel", "/cancel.html"],
      ["/contact", "/contact.html"],
      ["/datenschutz", "/datenschutz.html"],
      ["/evcc", "/evcc.html"],
      ["/impressum", "/impressum.html"],
      ["/news", "/news.html"],
      ["/shop", "/shop.html"],
      ["/sproduct", "/sproduct.html"],
      ["/success", "/success.html"]
    ]);

    let path = (location.pathname || "/").toLowerCase();
    if (path !== "/" && path.endsWith("/")) path = path.slice(0, -1);
    let canonicalPath = aliases.get(path);
    if (!canonicalPath) {
      const leaf = path.split("/").pop() || "";
      if (path !== "/" && leaf && !leaf.includes(".")) {
        canonicalPath = `${path}.html`;
      }
    }
    canonicalPath = canonicalPath || location.pathname || "/";
    const target = origin + canonicalPath + location.search + location.hash;

    if (target !== location.href) {
      location.replace(target);
    }
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

  function initPaypalCartButtons() {
    const nodes = document.querySelectorAll("paypal-cart-button[data-id]");
    if (!nodes.length) return;
    const run = () => {
      if (!window.cartPaypal || typeof window.cartPaypal.Cart !== "function") return false;
      nodes.forEach(node => {
        const id = node.getAttribute("data-id");
        if (!id) return;
        try {
          window.cartPaypal.Cart({ id });
        } catch (err) {
          // ignore
        }
      });
      return true;
    };
    if (!run()) window.addEventListener("load", run, { once: true });
  }

  function renderPaypalAddButton(mountEl, buttonId) {
    if (!mountEl) return;
    if (isPlaceholderId(buttonId)) {
      const warn = document.createElement("div");
      warn.className = "note";
      warn.textContent = "Der Kauf ist aktuell nicht verfügbar.";
      mountEl.replaceChildren(warn);
      return;
    }

    const btn = document.createElement("paypal-add-to-cart-button");
    btn.setAttribute("data-id", buttonId);
    mountEl.replaceChildren(btn);

    const init = () => {
      if (!window.cartPaypal || typeof window.cartPaypal.AddToCart !== "function") return false;
      try {
        window.cartPaypal.AddToCart({ id: buttonId });
      } catch (err) {
        // ignore
      }
      return true;
    };
    if (!init()) window.addEventListener("load", init, { once: true });
  }

  function fixPaypalCartQuantityLabel() {
    const translations = new Map([
      ["Quantity", "Menge"],
      ["Add to Cart", "In den Warenkorb"],
      ["View Cart", "Warenkorb"],
      ["Price", "Preis"],
      ["Subtotal", "Zwischensumme"],
      ["Total", "Summe"]
    ]);
    const hiddenLabels = new Set([
      "Quantity",
      "Menge"
    ]);
    const targets = new Set([
      "Quantity",
      "Menge",
      "Stück",
      "Add to Cart",
      "In den Warenkorb",
      "View Cart",
      "Warenkorb",
      "Price",
      "Preis",
      "Subtotal",
      "Zwischensumme",
      "Total",
      "Summe"
    ]);
    const normalizeText = value => String(value || "").replace(/\s+/g, " ").trim();
    const translatedText = value => translations.get(normalizeText(value)) || "";
    const paypalUiSelector = [
      ".paypal-slot",
      ".paypal-slot *",
      ".paypal-cart-wrap",
      ".paypal-cart-wrap *",
      "[data-paypal-view-cart]",
      "[data-paypal-view-cart] *",
      "paypal-add-to-cart-button",
      "paypal-cart-button"
    ].join(",");
    const isPaypalUiNode = el => Boolean(el && el.matches && el.matches(paypalUiSelector));

    const applyStyles = el => {
      if (!isPaypalUiNode(el)) return;
      el.style.whiteSpace = "nowrap";
      el.style.wordBreak = "normal";
      el.style.overflowWrap = "normal";
      el.style.minWidth = "max-content";
    };
    const applyInlineLayout = el => {
      el.style.display = "inline-flex";
      el.style.alignItems = "flex-end";
      el.style.flexWrap = "wrap";
      el.style.gap = "10px";
      el.style.width = "auto";
      el.style.maxWidth = "100%";
    };
    const translateElement = el => {
      if (!el || !el.childNodes || el.childNodes.length !== 1) return;
      const child = el.firstChild;
      if (!child || child.nodeType !== Node.TEXT_NODE) return;
      const replacement = translatedText(child.textContent);
      if (replacement && normalizeText(child.textContent) !== replacement) {
        child.textContent = replacement;
      }
    };
    const canTranslateValue = el => {
      const tag = String(el && el.tagName || "").toLowerCase();
      const type = String(el && el.getAttribute && el.getAttribute("type") || "").toLowerCase();
      const role = String(el && el.getAttribute && el.getAttribute("role") || "").toLowerCase();
      return tag === "button" || type === "submit" || type === "button" || role === "button";
    };
    const hideLabelIfNeeded = el => {
      if (!el || !el.querySelectorAll) return;
      const text = normalizeText(el.textContent);
      if (!hiddenLabels.has(text)) return;
      if (el.querySelector("input, select, textarea, button")) return;
      el.style.display = "none";
      el.style.margin = "0";
      el.style.padding = "0";
      el.setAttribute("aria-hidden", "true");
    };
    const translateAttributes = el => {
      if (!el || !el.getAttributeNames) return;
      ["aria-label", "title"].forEach(name => {
        const current = el.getAttribute(name);
        const replacement = translatedText(current);
        if (replacement && normalizeText(current) !== replacement) {
          el.setAttribute(name, replacement);
        }
      });
      if (canTranslateValue(el)) {
        const current = "value" in el ? el.value : el.getAttribute("value");
        const replacement = translatedText(current);
        if (replacement && normalizeText(current) !== replacement) {
          if ("value" in el) el.value = replacement;
          if (el.hasAttribute("value")) el.setAttribute("value", replacement);
        }
      }
      if (el.placeholder) {
        const replacement = translatedText(el.placeholder);
        if (replacement && normalizeText(el.placeholder) !== replacement) {
          el.placeholder = replacement;
        }
      }
    };
    const styleInteractiveNodes = root => {
      if (!root || !root.querySelectorAll) return;

      root.querySelectorAll(".paypal-slot [id^='form-container-'], .paypal-slot [id^='paypal-form-fields-container-']").forEach(applyInlineLayout);

      root.querySelectorAll(".paypal-slot input[name='quantity'], .paypal-slot input[id*='quantity'], .paypal-slot input[aria-label*='Quantity'], .paypal-slot input[aria-label*='Menge']").forEach(input => {
        const compactShop = document.body.classList.contains("shop-page") && window.matchMedia("(max-width: 760px)").matches;
        input.style.width = compactShop ? "100%" : "7.25rem";
        input.style.minWidth = compactShop ? "0" : "7.25rem";
        input.style.maxWidth = "100%";
        input.style.paddingInline = "12px";
        input.style.textAlign = "center";
        input.style.flex = compactShop ? "1 1 100%" : "0 0 auto";
        input.style.color = "var(--text)";
        input.style.background = "#fff";
        input.style.border = "1px solid var(--border)";
        input.style.lineHeight = "1.2";
        input.style.fontVariantNumeric = "tabular-nums";
      });

      root.querySelectorAll(".paypal-slot button, .paypal-slot input[type='submit'], .paypal-slot [role='button']").forEach(node => {
        const label = normalizeText(node.textContent || node.value || node.getAttribute("aria-label"));
        if (!targets.has(label)) return;
        const compactShop = document.body.classList.contains("shop-page") && window.matchMedia("(max-width: 760px)").matches;
        node.style.width = compactShop ? "100%" : "auto";
        node.style.minWidth = compactShop ? "0" : "13rem";
        node.style.maxWidth = "100%";
        node.style.whiteSpace = compactShop ? "normal" : "nowrap";
        node.style.overflowWrap = compactShop ? "anywhere" : "normal";
        node.style.flex = compactShop ? "1 1 100%" : "0 0 auto";
        node.style.paddingInline = "16px";
        node.style.transform = compactShop ? "none" : "translateY(-4px)";
      });
    };

    const scan = root => {
      if (!root || root.nodeType !== 1) return;
      // Remove product thumbnails that PayPal may inject in the add-to-cart area.
      if (root.matches && root.matches(".paypal-slot img")) {
        root.remove();
        return;
      }
      if (root.matches && root.matches(".paypal-slot [id^='carousel-container-']")) {
        root.remove();
        return;
      }
      if (root.querySelectorAll) {
        root.querySelectorAll(".paypal-slot img").forEach(img => img.remove());
        root.querySelectorAll(".paypal-slot [id^='carousel-container-']").forEach(el => el.remove());
      }
      translateAttributes(root);
      translateElement(root);
      hideLabelIfNeeded(root);
      if (root.querySelectorAll) {
        root.querySelectorAll("*").forEach(el => {
          translateAttributes(el);
          translateElement(el);
          hideLabelIfNeeded(el);
        });
      }

      const text = normalizeText(root.textContent);
      if (targets.has(text)) {
        applyStyles(root);
        if (root.parentElement) applyStyles(root.parentElement);
      }
      styleInteractiveNodes(root);
      if (!root.querySelectorAll) return;
      root.querySelectorAll("*").forEach(el => {
        const label = normalizeText(el.textContent);
        const isTarget = targets.has(label);
        const isMoney = /\d/.test(label) && /(?:€|eur|\$|usd|chf)/i.test(label);
        if (!isTarget && !isMoney) return;
        applyStyles(el);
        if (el.parentElement) applyStyles(el.parentElement);
        if (el.nextElementSibling) applyStyles(el.nextElementSibling);
        if (el.previousElementSibling) applyStyles(el.previousElementSibling);
      });
    };

    scan(document.body);

    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => scan(node));
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function createPaypalAddToCartForm(buttonKey) {
    const buttonId = hostedButtonId(buttonKey);
    const wrap = document.createElement("div");
    renderPaypalAddButton(wrap, buttonId);
    return wrap.firstChild ? wrap.firstChild : wrap;
  }
  function salesEmail() {
    return (cfg().brand && cfg().brand.contactEmail) || "";
  }

  function contactSubject() {
    return (cfg().brand && cfg().brand.contactSubject) || "[Sales] Anfrage";
  }

  function salesSubject() {
    return (cfg().brand && cfg().brand.salesSubject) || "[Sales] Pre-Order";
  }

  function buildMailto(email, subject, body) {
    const parts = [];
    if (subject) parts.push("subject=" + encodeURIComponent(subject));
    if (body) parts.push("body=" + encodeURIComponent(body));
    return "mailto:" + encodeURIComponent(email) + (parts.length ? "?" + parts.join("&") : "");
  }

  function newsItems() {
    return Array.isArray(window.EHIVE_NEWS) ? window.EHIVE_NEWS : [];
  }

  function renderNewsFeeds() {
    const feeds = document.querySelectorAll("[data-news-feed]");
    if (!feeds.length) return;

    const items = newsItems();
    feeds.forEach(feed => {
      const limitRaw = Number(feed.getAttribute("data-news-limit") || "0");
      const list = limitRaw > 0 ? items.slice(0, limitRaw) : items;
      feed.replaceChildren(...list.map(createNewsCard));
    });
  }

  function createNewsCard(item) {
    const article = document.createElement("article");
    article.className = "news-card";

    const top = document.createElement("div");
    top.className = "news-card-top";

    const time = document.createElement("time");
    time.dateTime = item.date || "";
    time.textContent = item.dateLabel || item.date || "";
    top.appendChild(time);

    const tags = document.createElement("div");
    tags.className = "news-tags";
    (item.tags || []).forEach(tagLabel => {
      const tag = document.createElement("span");
      tag.className = "news-tag";
      tag.textContent = tagLabel;
      tags.appendChild(tag);
    });
    top.appendChild(tags);

    const title = document.createElement("h3");
    const titleLink = document.createElement("a");
    titleLink.className = "news-card-title-link";
    titleLink.href = item.href || "#";
    titleLink.textContent = item.title || "";
    title.appendChild(titleLink);

    const excerpt = document.createElement("p");
    excerpt.textContent = item.excerpt || "";

    const footer = document.createElement("div");
    footer.className = "news-card-footer";

    const link = document.createElement("a");
    link.className = "news-card-link";
    link.href = item.href || "#";
    link.textContent = "Weiterlesen";
    footer.appendChild(link);

    article.appendChild(top);
    article.appendChild(title);
    article.appendChild(excerpt);
    article.appendChild(footer);
    return article;
  }

  function newsCommentsConfig() {
    const newsCfg = cfg().news || {};
    const commentsCfg = newsCfg.comments || {};
    return {
      enabled: commentsCfg.enabled !== false,
      repo: commentsCfg.repo || "",
      issueTerm: commentsCfg.issueTerm || "pathname",
      theme: commentsCfg.theme || "github-light",
      prompt: commentsCfg.prompt || "Fragen zu diesem Beitrag kannst du hier direkt hinterlassen. Wir antworten im selben Thread. Lesen kann jeder, zum Schreiben braucht man ein GitHub-Konto."
    };
  }

  function ensureUtterancesThread(host, commentsCfg) {
    if (!host || host.getAttribute("data-utterances-ready") === "true" || !commentsCfg.repo) return;

    const script = document.createElement("script");
    script.src = "https://utteranc.es/client.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.setAttribute("repo", commentsCfg.repo);
    script.setAttribute("issue-term", commentsCfg.issueTerm);
    script.setAttribute("theme", commentsCfg.theme);
    script.setAttribute("crossorigin", "anonymous");

    host.setAttribute("data-utterances-ready", "true");
    host.appendChild(script);
  }

  function initNewsComments() {
    const pageKey = pageKeyFromUrl(location.href);
    if (!pageKey || !pageKey.startsWith("news-")) return;

    const article = document.querySelector(".news-article");
    if (!article || article.querySelector("[data-news-comments]")) return;

    const commentsCfg = newsCommentsConfig();
    if (!commentsCfg.enabled || !commentsCfg.repo) return;

    const section = document.createElement("section");
    section.className = "news-comments";
    section.setAttribute("data-news-comments", "");

    const head = document.createElement("div");
    head.className = "news-comments-head";

    const kicker = document.createElement("p");
    kicker.className = "news-comments-kicker";
    kicker.textContent = "Fragen & Antworten";

    const title = document.createElement("h2");
    title.textContent = "Fragen zu diesem Beitrag?";

    const copy = document.createElement("p");
    copy.textContent = commentsCfg.prompt;

    const repoLink = document.createElement("a");
    repoLink.className = "news-comments-link";
    repoLink.href = `https://github.com/${commentsCfg.repo}/issues?q=${encodeURIComponent(location.pathname || `/${pageKey}`)}`;
    repoLink.target = "_blank";
    repoLink.rel = "noopener noreferrer";
    repoLink.textContent = "Diskussion auf GitHub öffnen";

    head.appendChild(kicker);
    head.appendChild(title);
    head.appendChild(copy);
    head.appendChild(repoLink);

    const thread = document.createElement("div");
    thread.className = "news-comments-thread";

    section.appendChild(head);
    section.appendChild(thread);
    article.appendChild(section);

    // Keep one shared Q&A thread per news article URL.
    ensureUtterancesThread(thread, commentsCfg);
  }

  function renderPreorderSlot(mountEl, itemName, variantLabel) {
    if (!mountEl) return;
    const email = salesEmail();
    if (!email) {
      const warn = document.createElement("div");
      warn.className = "note";
      warn.textContent = "Sales E-Mail fehlt. Bitte in config.js eintragen.";
      mountEl.replaceChildren(warn);
      return;
    }

    const label = [itemName, variantLabel].filter(Boolean).join(" – ");
    const body = label ? `Bitte um Vorbestellung: ${label}` : "Bitte um Vorbestellung.";
    const link = buildMailto(email, salesSubject(), body);

    const wrap = document.createElement("div");
    wrap.className = "preorder-card";

    const note = document.createElement("div");
    note.className = "note";
    note.textContent = "Ausverkauft – Pre‑Order anfragen.";

    const btn = document.createElement("a");
    btn.className = "btn primary";
    btn.href = link;
    btn.textContent = "Pre‑Order anfragen";
    btn.setAttribute("rel", "nofollow");

    wrap.appendChild(note);
    wrap.appendChild(btn);
    mountEl.replaceChildren(wrap);
  }

  function createPaypalViewCartForm(mountEl) {
    if (!mountEl) return;
    const btn = document.createElement("paypal-cart-button");
    btn.setAttribute("data-id", "pp-view-cart");
    mountEl.replaceChildren(btn);
    if (window.cartPaypal && typeof window.cartPaypal.Cart === "function") {
      try {
        window.cartPaypal.Cart({ id: "pp-view-cart" });
      } catch (err) {
        // ignore
      }
    } else {
      window.addEventListener("load", () => {
        if (window.cartPaypal && typeof window.cartPaypal.Cart === "function") {
          window.cartPaypal.Cart({ id: "pp-view-cart" });
        }
      }, { once: true });
    }
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
    const path = navKeyFromPageKey(pageKeyFromUrl(location.href));
    document.querySelectorAll(".nav-links a, .mobile-panel a").forEach(a => {
      const href = navKeyFromPageKey(pageKeyFromUrl(a.getAttribute("href") || ""));
      if (href && href === path) {
        a.setAttribute("aria-current", "page");
      } else {
        a.removeAttribute("aria-current");
      }
    });
  }


  function wireFooter() {
    const y = byId("year");
    if (y) y.textContent = String(new Date().getFullYear());

    const email = (cfg().brand && cfg().brand.contactEmail) || "sales@example.com";
    const fe = byId("footerEmail");
    if (fe) {
      fe.textContent = email;
      if (fe.tagName === "A") {
        const subject = contactSubject();
        fe.href = `mailto:${email}?subject=${encodeURIComponent(subject)}`;
      }
    }
  }

  function wireContactLinks() {
    const email = salesEmail();
    if (!email) return;

    const href = buildMailto(email, contactSubject());
    document.querySelectorAll("[data-contact-link]").forEach(link => {
      if (!link || link.tagName !== "A") return;
      link.href = href;
    });
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

    const isEmptyStat = (value) => {
      const text = String(value ?? "").trim();
      return text === "" || text === "-" || text === "—";
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
            keys: [["solarShare"], ["solarSharePercent"], ["solarPercent"], ["solar_share"], ["solarRatio"], ["greenShare"], ["greenPercent"], ["greenRatio"]],
            patterns: ["solar.*share", "share.*solar", "solar.*percent", "percent.*solar", "solar.*ratio", "ratio.*solar", "green.*share", "share.*green", "green.*percent", "percent.*green", "green.*ratio", "ratio.*green"]
          },
          solarEnergy: {
            fmt: formatEnergy,
            keys: [["solarEnergy"], ["energySolar"], ["solar_total"], ["solarEnergyTotal"], ["solarEnergySum"], ["greenEnergy"], ["energyGreen"], ["green_total"]],
            patterns: ["solar.*energy", "energy.*solar", "green.*energy", "energy.*green"]
          },
          energy: {
            fmt: formatEnergy,
            keys: [["energy"], ["totalEnergy"], ["chargedEnergy"], ["chargeEnergy"], ["energyTotal"], ["energySum"]],
            patterns: ["charge.*energy", "charged.*energy", "energy", "charged"],
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
        if (solarSlot && isEmptyStat(solarSlot.textContent)) {
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

  function findAddon(id) {
    return getCatalog().addons.find(a => a.id === id);
  }

  function isSoldOut(item, variant) {
    return Boolean((variant && variant.soldOut) || (item && item.soldOut));
  }

  function renderDynamicPaypalAdd(mountEl, buttonKey) {
    if (!mountEl) return;
    const buttonId = hostedButtonId(buttonKey);
    renderPaypalAddButton(mountEl, buttonId);
  }

  function wireShopCard() {
    // Shop page: support multiple product cards
    const selects = document.querySelectorAll("[data-variant-select]");
    if (!selects.length) return;

    selects.forEach(select => {
      const card = select.closest(".pro");
      if (!card) return;

      const productId = select.getAttribute("data-variant-select");
      const qtyInput = card.querySelector("[data-qty-input]");
      const slot = card.querySelector("[data-paypal-slot]");
      const priceEl = card.querySelector("[data-price]");

      if (!productId || !slot) return;

      function refresh() {
        const variantId = select.value;
        const qty = qtyInput ? qtyInput.value : 1;
        const p = findProduct(productId);
        const v = p && p.variants ? p.variants.find(x => x.id === variantId) : null;

        // Optional: pass a visible option value to PayPal (tracking)
        const extra = v ? { on0: "variant", os0: v.label } : undefined;

        if (isSoldOut(p, v)) {
          renderPreorderSlot(slot, p && p.name, v && v.label);
        } else {
          renderDynamicPaypalAdd(slot, variantId, qty, extra);
        }

        if (priceEl && v) {
          priceEl.textContent = money(v.price, (cfg().paypal && cfg().paypal.currency) || "EUR");
        }
      }

      select.addEventListener("change", refresh);
      if (qtyInput) qtyInput.addEventListener("input", refresh);
      refresh();
    });
  }

  function wireProductPage() {
    // Product detail page: variant + qty + add to cart
    const select = document.querySelector("[data-variant-select='ehive-one-detail']");
    const qtyInput = document.querySelector("[data-qty-input='ehive-one-detail']");
    const slot = document.querySelector("[data-paypal-slot='ehive-one-detail']");
    const priceEl = document.querySelector("[data-price='ehive-one-detail']");

    if (!select || !slot) return;

    function refresh() {
      const variantId = select.value;
      const qty = qtyInput ? qtyInput.value : 1;

      const p = findProduct("ehive-one");
      const v = p && p.variants ? p.variants.find(x => x.id === variantId) : null;
      if (priceEl && v) priceEl.textContent = money(v.price, (cfg().paypal && cfg().paypal.currency) || "EUR");

      const extra = v ? { on0: "variant", os0: v.label } : undefined;
      if (isSoldOut(p, v)) {
        renderPreorderSlot(slot, p && p.name, v && v.label);
      } else {
        renderDynamicPaypalAdd(slot, variantId, qty, extra);
      }
    }

    select.addEventListener("change", refresh);
    if (qtyInput) qtyInput.addEventListener("input", refresh);
    refresh();
  }

  function wireAddonButtons() {
    // For each add-on card: optional qty input + paypal slot
    document.querySelectorAll("[data-addon-id]").forEach(card => {
      const addonId = card.getAttribute("data-addon-id");
      if (!addonId) return;

      const addon = findAddon(addonId);
      const qtyInput = card.querySelector("[data-addon-qty]");
      const slot = card.querySelector("[data-addon-slot]");
      if (!slot) return;

      function refresh() {
        const qty = qtyInput ? qtyInput.value : 1;
        if (isSoldOut(addon)) {
          renderPreorderSlot(slot, addon && addon.name);
        } else {
          renderDynamicPaypalAdd(slot, addonId, qty);
        }
      }

      if (qtyInput) qtyInput.addEventListener("input", refresh);
      refresh();
    });
  }

  function wireCartPage() {
    const mount = document.querySelector("[data-paypal-view-cart]");
    if (mount) createPaypalViewCartForm(mount);
  }

  function initAddonDetails() {
    const cards = document.querySelectorAll("[data-addon-toggle]");
    if (!cards.length) return;

    cards.forEach(card => {
      const details = card.querySelector(".addon-details");
      if (!details) return;

      const toggle = () => {
        const open = !card.classList.contains("is-open");
        card.classList.toggle("is-open", open);
        card.setAttribute("aria-expanded", open ? "true" : "false");
      };

      card.addEventListener("click", (event) => {
        const interactive = event.target.closest(
          "input, select, button, a, label, .addon-overview, .addon-details, .addon-specs, .addon-specs-row"
        );
        if (interactive) return;
        toggle();
      });

      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle();
        }
      });
    });
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

  function initHeroProductVideo() {
    const video = document.querySelector("[data-hero-product-video]");
    if (!video) return;
    const stage = video.closest("[data-hero-video-stage]");
    const hotspotLayer = stage ? stage.querySelector("[data-hero-video-hotspots]") : null;
    const notesPanel = stage ? stage.querySelector("[data-hero-video-notes]") : null;
    const hotspots = stage ? Array.from(stage.querySelectorAll("[data-video-hotspot]")) : [];
    const noteJumpLinks = stage ? Array.from(stage.querySelectorAll("[data-open-note-jump]")) : [];
    let playbackCompleted = false;

    const ensureAutoplayAttrs = () => {
      video.muted = true;
      video.defaultMuted = true;
      video.volume = 0;
      video.playsInline = true;
      video.setAttribute("muted", "");
      video.setAttribute("autoplay", "");
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.setAttribute("x5-playsinline", "");
      video.setAttribute("x-webkit-airplay", "deny");
      video.setAttribute("noremoteplayback", "");
      video.setAttribute("disablepictureinpicture", "");
    };

    ensureAutoplayAttrs();

    const updateStackedNotesLayout = () => {
      if (!stage || !notesPanel) return;
      const stageWidth = stage.getBoundingClientRect().width || 0;
      const shouldStack = stageWidth > 0 && stageWidth < 980;
      stage.classList.toggle("is-stacked", shouldStack);
      if (!shouldStack) {
        stage.style.removeProperty("--hero-notes-h");
        return;
      }
      const measuredHeight = Math.ceil(
        notesPanel.scrollHeight || notesPanel.getBoundingClientRect().height || 0
      );
      const notesHeight = Math.max(120, measuredHeight + 18);
      stage.style.setProperty("--hero-notes-h", `${notesHeight}px`);
    };

    const closeHotspots = () => {
      hotspots.forEach(node => node.classList.remove("is-open"));
    };

    const showHotspots = () => {
      if (stage) stage.classList.add("is-ended");
      if (hotspotLayer) hotspotLayer.setAttribute("aria-hidden", "false");
      if (notesPanel) notesPanel.setAttribute("aria-hidden", "false");
      updateStackedNotesLayout();
    };

    const hideHotspots = () => {
      if (stage) stage.classList.remove("is-ended");
      if (hotspotLayer) hotspotLayer.setAttribute("aria-hidden", "true");
      if (notesPanel) notesPanel.setAttribute("aria-hidden", "true");
      closeHotspots();
      updateStackedNotesLayout();
    };

    const freezeOnLastFrame = () => {
      if (playbackCompleted) return;
      playbackCompleted = true;
      const duration = Number(video.duration);
      if (Number.isFinite(duration) && duration > 0) {
        const endFrameTime = Math.max(0, duration - 0.04);
        try {
          video.currentTime = endFrameTime;
        } catch (_) {
          // Ignore browsers that disallow seek at end.
        }
      }
      video.pause();
      showHotspots();
      removeGestureRetry();
    };

    video.addEventListener("ended", freezeOnLastFrame);

    hotspots.forEach(hotspot => {
      hotspot.addEventListener("click", (event) => {
        event.stopPropagation();
        const shouldOpen = !hotspot.classList.contains("is-open");
        closeHotspots();
        if (shouldOpen) hotspot.classList.add("is-open");
      });
    });

    noteJumpLinks.forEach(link => {
      link.addEventListener("click", (event) => {
        const href = link.getAttribute("href");
        if (!href || href.charAt(0) !== "#") return;
        const target = document.querySelector(href);
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    document.addEventListener("click", () => {
      closeHotspots();
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeHotspots();
    });

    let gestureRetryBound = false;
    const gestureEvents = ["touchstart", "pointerdown", "mousedown", "keydown"];

    const removeGestureRetry = () => {
      if (!gestureRetryBound) return;
      gestureRetryBound = false;
      gestureEvents.forEach((evt) => {
        window.removeEventListener(evt, startPlayback);
      });
    };

    const addGestureRetry = () => {
      if (gestureRetryBound) return;
      gestureRetryBound = true;
      gestureEvents.forEach((evt) => {
        window.addEventListener(evt, startPlayback, { passive: true });
      });
    };

    const startPlayback = () => {
      if (playbackCompleted) return;
      ensureAutoplayAttrs();
      hideHotspots();
      if (video.ended) return;
      const playPromise = video.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise
          .then(() => {
            removeGestureRetry();
          })
          .catch(() => {
            if (playbackCompleted) return;
            addGestureRetry();
          });
      } else if (!video.paused) {
        removeGestureRetry();
      }
    };

    const retryPlayback = () => {
      if (playbackCompleted || video.ended) return;
      if (!video.paused) return;
      startPlayback();
    };

    if (video.readyState >= 2) {
      startPlayback();
    } else {
      video.addEventListener("canplay", startPlayback, { once: true });
    }

    video.addEventListener("loadedmetadata", retryPlayback, { passive: true });
    video.addEventListener("loadeddata", retryPlayback, { passive: true });
    video.addEventListener("canplaythrough", retryPlayback, { passive: true });

    window.addEventListener("pageshow", retryPlayback);
    window.addEventListener("focus", retryPlayback);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) retryPlayback();
    });

    window.addEventListener("resize", updateStackedNotesLayout);
    window.addEventListener("orientationchange", updateStackedNotesLayout);
    window.addEventListener("pageshow", updateStackedNotesLayout);
    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === "function") {
      document.fonts.ready.then(updateStackedNotesLayout).catch(() => {});
    }

    // Extra retries for mobile browsers that delay media activation.
    window.setTimeout(retryPlayback, 120);
    window.setTimeout(retryPlayback, 500);
    window.setTimeout(retryPlayback, 1200);
    window.setTimeout(updateStackedNotesLayout, 60);
    window.setTimeout(updateStackedNotesLayout, 240);
  }

  function wireBrand() {
    const b = cfg().brand || {};
    const nameEls = document.querySelectorAll("[data-brand-name]");
    const subEls = document.querySelectorAll("[data-brand-subtitle]");
    nameEls.forEach(el => { el.textContent = b.name || "eHive One"; });
    subEls.forEach(el => { el.textContent = b.subtitle || "eHive Shop"; });
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
      const activate = () => {
        const src = item.getAttribute("data-video-src");
        const text = item.getAttribute("data-video-label") || "";
        if (!src) return;
        open(src, text);
      };

      if (!item.hasAttribute("role")) item.setAttribute("role", "button");
      if (!item.hasAttribute("tabindex")) item.setAttribute("tabindex", "0");

      item.addEventListener("click", activate);
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
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

  function initHeroDemoWindow() {
    const trigger = document.querySelector("[data-demo-open]");
    const modal = document.querySelector("[data-demo-window]");
    if (!trigger || !modal) return;

    const frame = modal.querySelector("[data-demo-frame]");
    const panel = modal.querySelector(".hero-demo-window-panel");
    const closeTargets = Array.from(modal.querySelectorAll("[data-demo-close]"));
    const demoUrl = "https://demo.evcc.io/#/";
    const baseWidth = 1366;
    const baseHeight = 900;

    const fitFrame = () => {
      if (!frame || !panel) return;
      const availableWidth = panel.clientWidth;
      const availableHeight = panel.clientHeight;
      if (!availableWidth || !availableHeight) return;

      const scale = Math.min(availableWidth / baseWidth, availableHeight / baseHeight);
      const scaledWidth = baseWidth * scale;
      const scaledHeight = baseHeight * scale;
      const offsetX = (availableWidth - scaledWidth) / 2;
      const offsetY = (availableHeight - scaledHeight) / 2;

      panel.style.setProperty("--demo-scale", scale.toFixed(5));
      panel.style.setProperty("--demo-offset-x", `${offsetX.toFixed(2)}px`);
      panel.style.setProperty("--demo-offset-y", `${offsetY.toFixed(2)}px`);
    };

    const open = () => {
      if (frame) frame.src = demoUrl;
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("lightbox-open");
      requestAnimationFrame(fitFrame);
    };

    const close = () => {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      if (frame) frame.src = "";
      document.body.classList.remove("lightbox-open");
    };

    trigger.addEventListener("click", open);
    closeTargets.forEach((node) => {
      node.addEventListener("click", close);
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    window.addEventListener("resize", fitFrame);
    if (frame) frame.addEventListener("load", fitFrame);
    fitFrame();
  }


  // Init
  syncViewportWidthVar();
  maybeRedirectToCanonicalUrl();
  window.addEventListener("resize", syncViewportWidthVar);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncViewportWidthVar);
  }

  document.addEventListener("DOMContentLoaded", () => {
      loadPartials().then(() => {
        syncViewportWidthVar();
        syncHeaderHeight();
        syncHeroPretextOffset();
        initHeroProductVideo();
        initHeroDemoWindow();
        initMobileNav();
        setActiveNav();
        initPaypalCartButtons();
        fixPaypalCartQuantityLabel();
        wireFooter();
        wireContactLinks();
        wireBrand();
        initCommunityStats();
        initScrollReveal();
        initScrollShift();
        initHeroHideOnScroll();
        initLogoLightbox();
        initVideoLightbox();
        initAddonDetails();
        renderNewsFeeds();
        initNewsComments();
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












