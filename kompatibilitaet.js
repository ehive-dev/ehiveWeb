(() => {
  const energyFlow = document.querySelector("[data-energy-flow]");
  const energyFlowToggle = document.querySelector("[data-energy-flow-toggle]");

  if (energyFlow && energyFlowToggle) {
    energyFlowToggle.addEventListener("click", () => {
      const paused = energyFlow.classList.toggle("is-paused");
      energyFlowToggle.setAttribute("aria-pressed", String(paused));
      energyFlowToggle.textContent = paused ? "Animation fortsetzen" : "Animation pausieren";
    });
  }

  const input = document.querySelector("[data-compat-search]");
  const reset = document.querySelector("[data-compat-reset]");
  const status = document.querySelector("[data-compat-status]");
  const noResults = document.querySelector("[data-compat-empty]");
  const categories = [...document.querySelectorAll("[data-compat-category]")];

  if (!input || !reset || !status || !noResults || !categories.length) return;

  const normalize = (value) => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de")
    .trim();

  const filterManufacturers = () => {
    const query = normalize(input.value);
    let visibleManufacturers = 0;
    let visibleCategories = 0;

    categories.forEach((category) => {
      let categoryMatches = 0;
      category.querySelectorAll("[data-manufacturer]").forEach((manufacturer) => {
        const brand = normalize(manufacturer.dataset.brand || "");
        const models = normalize(manufacturer.dataset.models || manufacturer.textContent);
        const matches = !query || brand.includes(query) || models.includes(query);
        const details = manufacturer.querySelector("details");

        if (details && query && matches && !brand.includes(query)) {
          if (!details.open) {
            details.open = true;
            details.dataset.searchOpened = "true";
          }
        } else if (details?.dataset.searchOpened) {
          details.open = false;
          delete details.dataset.searchOpened;
        }

        manufacturer.hidden = !matches;
        if (matches) categoryMatches += 1;
      });

      category.hidden = categoryMatches === 0;
      if (categoryMatches) {
        visibleCategories += 1;
        visibleManufacturers += categoryMatches;
      }
    });

    reset.hidden = !query;
    noResults.hidden = visibleManufacturers !== 0;
    status.textContent = query
      ? `${visibleManufacturers} ${visibleManufacturers === 1 ? "Treffer" : "Treffer"} in ${visibleCategories} ${visibleCategories === 1 ? "Kategorie" : "Kategorien"} gefunden.`
      : "";
  };

  input.addEventListener("input", filterManufacturers);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && input.value) {
      input.value = "";
      filterManufacturers();
    }
  });

  reset.addEventListener("click", () => {
    input.value = "";
    filterManufacturers();
    input.focus();
  });
})();
