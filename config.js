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
  brand: {
    name: "eHive One",
    subtitle: "OpenArc Shop",
    contactEmail: "sales@example.com"
  },

  paypal: {
    // "live" or "sandbox"
    env: "live",

    // Used for the "View Cart" button (cmd=_cart&display=1).
    // Prefer your PayPal Merchant ID instead of an email address.
    business: "YOUR_PAYPAL_MERCHANT_ID",

    // Locale + currency shown at PayPal checkout.
    locale: "DE",
    currency: "EUR",

    // Where PayPal should send buyers back to your site.
    // For the PayPal-hosted cart, "Continue shopping" uses shopping_url.
    urls: {
      shopping_url: "shop.html",
      return_url: "success.html",
      cancel_return_url: "cancel.html"
    },

    // Add-to-cart buttons created & hosted in your PayPal account.
    // Replace the placeholder IDs.
    hostedButtons: {
      // eHive One variants
      "ehive-one-base": "PASTE_HOSTED_BUTTON_ID_HERE",
      "ehive-one-nvme-256": "PASTE_HOSTED_BUTTON_ID_HERE",
      "ehive-one-nvme-512": "PASTE_HOSTED_BUTTON_ID_HERE",

      // Add-ons (examples)
      "din-clip": "PASTE_HOSTED_BUTTON_ID_HERE",
      "power-cable": "PASTE_HOSTED_BUTTON_ID_HERE",
      "nvme-1tb": "PASTE_HOSTED_BUTTON_ID_HERE"
    }
  },

  catalog: {
    products: [
      {
        id: "ehive-one",
        name: "eHive One – DIN‑Rail Mini‑PC",
        maker: "OpenArc",
        image: "img/ehive-one.svg",
        descriptionShort: "Linux-basierte Hardwareplattform (OpenArc OS, DietPi-basiert). 12–30VDC, ~3W, IP20, optional NVMe.",
        descriptionLong: "Der eHive One ist ein Hutschienengerät‑PC für Open‑Source‑Software. Er eignet sich ideal als zentrale Smart‑Home Plattform mit Modulen wie EVCC, Home Assistant, Node‑RED, Grafana und mehr (je nach Setup).",
        bullets: [
          "12–30VDC, ca. 3W (typ.) • IP20",
          "OpenArc OS (DietPi‑Basis) mit Dashboard",
          "Optional NVMe-Erweiterung",
          "CE / EMV / RoHS (gemäß Planung/Zertifizierung)"
        ],
        variants: [
          { id: "ehive-one-base", label: "Basis (ohne NVMe)", price: 399.00 },
          { id: "ehive-one-nvme-256", label: "Basis + NVMe 256GB", price: 449.00 },
          { id: "ehive-one-nvme-512", label: "Basis + NVMe 512GB", price: 489.00 }
        ]
      }
    ],

    addons: [
      { id: "din-clip", name: "DIN‑Rail Clip (Ersatz/Set)", price: 9.90, image: "img/accessory.svg" },
      { id: "power-cable", name: "DC Anschlusskabel 12–30V (1m)", price: 7.90, image: "img/accessory.svg" },
      { id: "nvme-1tb", name: "NVMe SSD 1TB (Upgrade)", price: 129.00, image: "img/accessory.svg" }
    ]
  }
};
