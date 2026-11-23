(function () {
  "use strict";
  function validAggregate(value) {
    return value && value["@type"] === "AggregateRating"
      && Number.isInteger(value.ratingCount) && value.ratingCount > 0
      && typeof value.ratingValue === "number" && Number.isFinite(value.ratingValue)
      && value.ratingValue >= 1 && value.ratingValue <= 5
      && value.bestRating === 5 && value.worstRating === 1;
  }
  function withAggregateRating(data, aggregate) {
    const copy = JSON.parse(JSON.stringify(data));
    const visit = (node) => {
      if (!node || typeof node !== "object") return;
      if (["Product", "ProductGroup"].includes(node["@type"]) && node.name === "eHive One") {
        if (validAggregate(aggregate)) node.aggregateRating = aggregate;
        else delete node.aggregateRating;
      }
      if (Array.isArray(node)) node.forEach(visit);
      else Object.values(node).forEach(visit);
    };
    visit(copy);
    return copy;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { validAggregate, withAggregateRating };
    return;
  }
  const section = document.querySelector("[data-product-ratings]");
  if (!section) return;
  fetch("https://ehive-ai-worker.ehive.workers.dev/product-ratings")
    .then(response => {
      if (!response.ok) throw new Error("Bewertungen nicht verfügbar");
      return response.json();
    })
    .then(data => {
      if (!validAggregate(data.aggregateRating)) return;
      const aggregate = data.aggregateRating;
      const summary = section.querySelector("[data-product-rating-summary]");
      const list = section.querySelector("[data-product-rating-reviews]");
      summary.textContent = `${aggregate.ratingValue.toLocaleString("de-DE", { maximumFractionDigits: 2 })} von 5 Sternen aus ${aggregate.ratingCount} ${aggregate.ratingCount === 1 ? "Bewertung" : "Bewertungen"} für eHive One.`;
      for (const review of data.reviews || []) {
        if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) continue;
        const article = document.createElement("article");
        article.className = "info-card";
        const heading = document.createElement("h3");
        heading.textContent = review.title;
        const author = document.createElement("p");
        author.textContent = `${review.author} · ${review.rating} von 5 Sternen`;
        const body = document.createElement("p");
        body.textContent = review.body;
        article.append(heading, author, body);
        list.appendChild(article);
      }
      section.hidden = false;
      document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
        try {
          script.textContent = JSON.stringify(withAggregateRating(JSON.parse(script.textContent), aggregate));
        } catch (_) { /* Leave unrelated structured data unchanged. */ }
      });
    })
    .catch(() => { /* Do not publish a stale or invented score on errors. */ });
})();
