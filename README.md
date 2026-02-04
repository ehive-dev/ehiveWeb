# eHive One Shop (GitHub Pages) – PayPal-hosted Warenkorb

Dieses Projekt ist ein **statischer** Online‑Shop (HTML/CSS/JS) für **GitHub Pages**.
Der Warenkorb wird **PayPal‑hosted** geführt (Shopping Cart Buttons). Du brauchst kein Backend.

## 1) Konfiguration

Öffne `config.js` und setze:

- `paypal.env`: `live` oder `sandbox`
- `paypal.business`: PayPal Merchant ID (empfohlen) oder bestätigte Business‑E-Mail
- `paypal.hostedButtons`: Für **jede Variante / jedes Add‑on** die `hosted_button_id` eintragen

> PayPal empfiehlt, pro Produkt einen eigenen „Add to Cart“-Button zu erstellen und einen „View Cart“-Button für die gesamte Site zu verwenden.

### URL-Empfehlung (Return/Cancel)
Setze in `config.js` am besten **absolute** URLs (mit https://…), z. B.:
- `return_url`: `https://<user>.github.io/<repo>/success.html`
- `cancel_return_url`: `https://<user>.github.io/<repo>/cancel.html`
- `shopping_url`: `https://<user>.github.io/<repo>/shop.html`

## 2) Wie Stückzahl & Summe funktionieren

- Die **Stückzahl** wird als `quantity` an PayPal übergeben (oder kann im PayPal‑Warenkorb angepasst werden, je nach Button‑Einstellung).
- Die **Summe** berechnet PayPal im Warenkorb/Checkout anhand deiner PayPal‑Button‑Konfiguration.

## 3) GitHub Pages veröffentlichen (2 Varianten)

### Variante A (ohne Actions, am simpelsten)
1. Repo pushen
2. GitHub → **Settings → Pages**
3. **Build and deployment → Source: Deploy from a branch**
4. Branch: `main`, Folder: `/ (root)`
5. Optional: `.nojekyll` ist bereits enthalten (verhindert Jekyll-Sonderbehandlung)

### Variante B (mit GitHub Actions, robust)
1. Repo pushen
2. GitHub → **Settings → Pages**
3. **Build and deployment → Source: GitHub Actions**
4. Workflow ist enthalten: `.github/workflows/pages.yml`

> Wichtig: Verwende **nicht** `actions/jekyll-build-pages`, da dieses Projekt keine Jekyll-Site ist.

## Hinweise

- `Impressum`/`Datenschutz` sind Platzhalter und müssen mit echten Angaben ersetzt werden.
