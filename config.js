/*
  eHive One Shop – configuration (edit this file)
  Main parts:
    - paypal: environment + IDs for PayPal-hosted cart buttons
    - catalog: products + add-ons shown on the site

  How it works:
    - Each purchasable item/variant needs a PayPal "Add to Cart" hosted button ID.
    - The website only renders HTML forms that POST to PayPal.
    - The cart, totals, taxes, shipping options and checkout are handled by PayPal.

  Notes:
    - For a sandbox test, set env="sandbox" and create sandbox buttons in your PayPal sandbox account.
*/

window.EHIVE_SHOP_CONFIG = {
  site: {
    origin: "https://www.ehiv3.de"
  },

  brand: {
    name: "eHive",
    subtitle: "HEMS but smart",
    contactEmail: "ehive@gmx.de",
    contactSubject: "[Sales] Anfrage",
    salesSubject: "[Sales] Bestellung"
  },

  paypal: {
    // "live" or "sandbox"
    env: "live",

    // Used for the "View Cart" button (cmd=_cart&display=1).
    // Prefer your PayPal Merchant ID instead of an email address.
    business: "WL4UJPJ62Y972",

    // Locale + currency shown at PayPal checkout.
    locale: "DE",
    currency: "EUR",

    // Where PayPal should send buyers back to your site.
    // For the PayPal-hosted cart, "Continue shopping" uses shopping_url.
    urls: {
      shopping_url: "https://www.ehiv3.de/shop.html",
      return_url: "https://www.ehiv3.de/success.html",
      cancel_return_url: "https://www.ehiv3.de/cancel.html"
    },

    // Add-to-cart buttons created & hosted in your PayPal account.
    // Replace the placeholder IDs.
    hostedButtons: {
      // eHive One variants
      "ehive-one-no-license": "4EM9UUJZRTK8U",
      "ehive-one-with-license": "SNKJV66HSBEMC",

      // Add-ons (examples)
      "psu-24v": "C8P6NNSWGT3KA"
    }
  },

  catalog: {
    products: [
      {
        id: "ehive-one",
        name: "eHive One – DIN‑Rail Mini‑PC",
        maker: "eHive",
        soldOut: false,
        image: "products/ehive-one.png",
      descriptionShort: "Hutschienen‑Mini‑PC fürs Energiemanagement. 12–30VDC, ~3W, IP20, SLC-Speicher für -40°C bis +85°C.",
        descriptionLong: "Der eHive One ist ein Hutschienengerät‑PC für Open‑Source‑Software. Er eignet sich ideal als zentrale Smart‑Home Plattform mit Modulen wie EVCC, Home Assistant, Node‑RED, Grafana und mehr (je nach Setup). Im eHive One werden ausschließlich hochwertige SLC-Speicher verwendet, ausgelegt für bis zu 100.000 Schreib-/Lesezyklen sowie -40°C bis +85°C, was den zuverlässigen Einsatz in extremen Umgebungen ermöglicht.",
        bullets: [
          "12–30VDC, ca. 3W (typ.) • IP20",
          "Linux OS mit Dashboard",
          "Hochwertiger SLC-Speicher • bis zu 100.000 Schreib-/Lesezyklen • -40°C bis +85°C",
          "Optional NVMe-Erweiterung",
          "CE / EMV / RoHS (gemäß Planung/Zertifizierung)"
        ],
        variants: [
          { id: "ehive-one-no-license", label: "Ohne Lizenz", price: 199.00, soldOut: true },
          { id: "ehive-one-with-license", label: "Mit evcc", price: 349.00, soldOut: false }
        ]
      }
    ],

    addons: [
      { id: "psu-24v", name: "MEAN WELL HDR-15-24", price: 24.99, image: "products/MEAN-WELL-HDR-15-24.png", soldOut: false }
    ]
  }
};

