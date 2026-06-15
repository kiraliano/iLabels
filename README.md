# iLabels - Landing Page

Apple-style premium landing page for the iLabels After Effects plugin.

## 📁 Project Structure

```
ilabels/
├── index.html          # Main HTML structure (semantic markup)
├── styles.css          # All styling and animations
├── script.js           # JavaScript for interactivity
└── README.md           # This file
```

## 🎯 Quick Start

### 1. Local Testing

Open `index.html` directly in your browser:
- Right-click → Open with → Browser
- Or drag `index.html` into your browser

### 2. Deploy to Cloudflare Pages

**Prerequisites:**
- GitHub account
- Cloudflare account (free)

**Steps:**

1. **Create GitHub Repository:**
   ```bash
   # Initialize git in this folder
   git init
   git add .
   git commit -m "Initial commit: iLabels landing page"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/ilabels.git
   git push -u origin main
   ```

2. **Connect to Cloudflare Pages:**
   - Go to https://pages.cloudflare.com/
   - Click "Create a project"
   - Select your GitHub repository
   - Build settings:
     - **Framework preset:** None
     - **Build command:** (leave empty)
     - **Build output directory:** (leave empty)
   - Click "Save and Deploy"

3. **Done!** Your site will be live at `ilabels.pages.dev`

## 🎨 Customization Guide

### Colors (Main Changes)

Edit variables in `styles.css` (lines 7-14):

```css
:root {
    --color-primary: #1d1d1f;        /* Main text */
    --color-secondary: #6e6e73;      /* Descriptions */
    --color-background: #ffffff;     /* Background */
    --color-border: #f5f5f7;         /* Borders/dividers */
    --color-accent: #007aff;         /* Optional accent */
}
```

Change any color value and it updates everywhere on the site.

### Typography Sizes

Edit in `styles.css` (lines 17-28) to adjust how big headlines are:

```css
--font-size-7xl: 64px;    /* Hero title */
--font-size-5xl: 48px;    /* Section titles */
--font-size-3xl: 28px;    /* Subheadings */
--font-size-xl: 20px;     /* Card titles */
```

### Spacing & Padding

Edit in `styles.css` (lines 30-38) to increase/decrease whitespace:

```css
--spacing-5xl: 64px;      /* Large section spacing */
--spacing-3xl: 48px;      /* Medium spacing */
--spacing-lg: 24px;       /* Normal spacing */
```

### Text Content

Edit in `index.html`:

- **Hero headline:** Line 31
- **Hero subtitle:** Line 36
- **Button labels:** Lines 41-44
- **Feature cards:** Lines 142-156
- **All other text:** Search for section comments (e.g., `<!-- SECTION 1: HERO -->`)

### Images & Mockups

The After Effects mockup is SVG (lines 57-107 in `index.html`).

To customize layer names, colors, or structure - edit the SVG coordinates and text:

```html
<!-- Example: Change layer name -->
<text x="16" y="63" class="layer-name">Background</text>
<!-- Change "Background" to your desired name -->

<!-- Example: Change label color -->
<circle cx="272" cy="61" r="6" class="label-chip red"/>
<!-- Change "red" to "teal" or "green" -->
```

### Adding New Sections

1. Copy the structure in `index.html`
2. Add `<section>` with unique ID
3. Create CSS styles in `styles.css` for that section
4. Update `script.js` if you need interactivity

### Buttons & Links

**Change link destinations:**
```html
<a href="#demo" class="button button-primary">
    Try the demo
</a>
<!-- Change "#demo" to any URL or section ID -->
```

**Add new buttons:**
```html
<a href="https://your-link.com" class="button button-primary">
    Button Text
</a>
```

Use `button-primary` for main CTA or `button-secondary` for alternatives.

## 📱 Responsive Design

The site is fully responsive:
- **Desktop:** 1200px max width, side-by-side layouts
- **Tablet:** (768px) Single column, adjusted spacing
- **Mobile:** (480px) Optimized typography and touch targets

Test with browser dev tools: **F12 → Click device icon** to see mobile view.

## 🚀 Advanced Customization

### Add Custom Font

Edit `index.html` head section:
```html
<link href="https://fonts.googleapis.com/css2?family=YOUR_FONT:wght@400;600;700&display=swap" rel="stylesheet">
```

Then update `styles.css`:
```css
body {
    font-family: 'YOUR_FONT', sans-serif;
}
```

### Add Animations

Edit `styles.css` to create new animations:
```css
@keyframes slideInLeft {
    from {
        opacity: 0;
        transform: translateX(-30px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

.slide-in-left {
    animation: slideInLeft 0.8s ease-out forwards;
}
```

Apply to elements:
```html
<div class="slide-in-left">Content here</div>
```

### Add Interactivity

Edit `script.js` to add new features. Example - scroll animation trigger:

```javascript
function onScroll() {
    const scrollTop = window.scrollY;
    
    // Change background based on scroll
    if (scrollTop > 300) {
        document.body.style.backgroundColor = '#f5f5f7';
    } else {
        document.body.style.backgroundColor = '#ffffff';
    }
}

window.addEventListener('scroll', onScroll);
```

## 🔍 File Explanations

### index.html
- **Purpose:** Structure and semantic HTML
- **Edit for:** Text content, page structure, element layout
- **Comment style:** HTML comments explain each section
- **Key elements:** `<section>`, `<h1>`, `<p>`, `<a>`

### styles.css
- **Purpose:** All visual styling, colors, animations, responsive design
- **Edit for:** Colors, fonts, spacing, borders, shadows, breakpoints
- **Comment style:** CSS comments explain each section
- **Key sections:** `:root` variables, typography, layout, sections

### script.js
- **Purpose:** Interactivity, smooth scrolling, animations on scroll
- **Edit for:** Click handlers, scroll effects, custom behavior
- **Comment style:** JavaScript comments explain each function
- **Key functions:** `initializeScrollBehavior()`, `initializeAnimations()`

## 🐛 Troubleshooting

**Links don't scroll smoothly:**
- Check `script.js` is loaded (console should say "initialized successfully")
- Ensure anchor links use matching IDs in `index.html`

**Colors don't match:**
- Clear browser cache: `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
- Or hard refresh: `Ctrl+F5` (Windows) or `Cmd+Shift+R` (Mac)

**Cloudflare page blank:**
- Check GitHub repo has all three files: `index.html`, `styles.css`, `script.js`
- Verify build settings are empty (no build command needed)
- Check "Pages" tab in Cloudflare for deployment logs

**Mobile layout broken:**
- Check viewport meta tag in `index.html`: `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
- Test with Chrome DevTools mobile view

## 📚 Documentation Links

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [CSS Variables Reference](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)
- [HTML Semantic Elements](https://www.w3schools.com/html/html5_semantic_elements.asp)
- [GitHub Pages vs Cloudflare Pages](https://blog.logrocket.com/github-pages-vs-cloudflare-pages/)

## 📝 License

Free to use and modify for personal and commercial projects.

## 💡 Tips

1. **Keep it simple** - Edit one thing at a time, test in browser
2. **Use browser DevTools** - F12 to inspect elements and debug CSS
3. **Mobile first** - Always test on mobile, tablets, and desktop
4. **Animations sparingly** - Less motion = more premium feeling
5. **Colors** - Stick to 3-4 colors max for professional look

## ✅ Checklist Before Launch

- [ ] All text content is correct and proofread
- [ ] Links point to correct destinations
- [ ] Mobile view looks good (test on real device if possible)
- [ ] No console errors (F12 → Console tab)
- [ ] Site loads in under 3 seconds
- [ ] All buttons are clickable
- [ ] No broken images or SVGs

---

Made with Apple-style minimalism for maximum impact. 🍎

## Тестовая лицензия для production Worker

`api-worker.js` проверяет лицензии в функции `activate`: ключ из запроса нормализуется в верхний регистр, после чего Worker читает запись из Cloudflare KV по имени `license:<LICENSE>` через binding `env.KV`. Этот binding должен быть именно Cloudflare KV namespace, привязанный в `api-wrangler.jsonc` как `KV`.

Для ручного создания тестовой лицензии добавьте запись в тот KV namespace, который указан в `api-wrangler.jsonc` в секции `kv_namespaces` для binding `KV`.

Ключ KV:

```text
license:ILBL-TEST-AAAA-CCCC
```

Значение KV для новой floating-системы:

```json
{
  "license": "ILBL-TEST-AAAA-CCCC",
  "licenseType": "floating",
  "maxSeats": 1,
  "leases": [],
  "createdAt": 1781300000000,
  "status": "active",
  "orderNumber": "manual-test"
}
```

Самый надёжный способ записи — сначала сохранить JSON в файл, а затем передать его Wrangler через `--path`. Так shell или PowerShell не смогут удалить кавычки из JSON и превратить его в невалидную строку вида `{license:ILBL-...}`.

Bash/macOS/Linux/Git Bash:

```bash
cat > license-test.json <<'JSON'
{
  "license": "ILBL-TEST-AAAA-CCCC",
  "licenseType": "floating",
  "maxSeats": 1,
  "leases": [],
  "createdAt": 1781300000000,
  "status": "active",
  "orderNumber": "manual-test"
}
JSON

npx wrangler kv key put "license:ILBL-TEST-AAAA-CCCC" --path ./license-test.json --binding KV --remote --config api-wrangler.jsonc
```

PowerShell:

```powershell
@'
{
  "license": "ILBL-TEST-AAAA-CCCC",
  "licenseType": "floating",
  "maxSeats": 1,
  "leases": [],
  "createdAt": 1781300000000,
  "status": "active",
  "orderNumber": "manual-test"
}
'@ | Set-Content -Path .\license-test.json -Encoding utf8

npx wrangler kv key put "license:ILBL-TEST-AAAA-CCCC" --path .\license-test.json --binding KV --remote --config api-wrangler.jsonc
```

Проверить, что в KV записался именно JSON с кавычками, можно командой:

```bash
npx wrangler kv key get "license:ILBL-TEST-AAAA-CCCC" --binding KV --remote --config api-wrangler.jsonc
```

После этого `/api/activate` или `/activate` сможет выдать floating lease для лицензии `ILBL-TEST-AAAA-CCCC`, если запись лежит в production KV namespace из binding `KV`.

Важно: локальный файл `kv-test.json` сам по себе не используется Worker-ом в production. Он может служить только локальной заметкой/примером и не создаёт запись в Cloudflare KV автоматически.

Если `https://ilabels-api.iosflowzy.workers.dev/api/activate?...` возвращает plain text `Not found`, значит на Cloudflare сейчас опубликована старая или другая версия API Worker без маршрута `/api/activate`. Сначала задеплойте API Worker:

```bash
npx wrangler deploy --config api-wrangler.jsonc
```

После успешного деплоя этот URL должен вернуть JSON, например `{"success":false,"error":"License not found"}` для отсутствующей лицензии или `{"success":true,...}` для активной записи в KV.

### Troubleshooting: `invalid_license_record` after fixing KV JSON

If Wrangler `kv key get` shows valid JSON but the API still returns `invalid_license_record`, deploy the latest API Worker and retry. The Worker now also repairs the earlier broken one-line test value format (`{license:...,licenseType:...}`) on the next successful lease write, but production must be running the latest `api-worker.js` for that fallback to exist.

```bash
npx wrangler deploy --config api-wrangler.jsonc
```

On Windows PowerShell, prefer `curl.exe` instead of `curl` because `curl` can be an alias for `Invoke-WebRequest`.

## 🔐 Floating License System

iLabels uses a floating-seat model inspired by Templater/DataclayLM: a license key does not permanently bind to a computer. Instead, each running After Effects panel leases one seat from the license pool and returns it when the panel closes.

### Server behavior

- Paid orders create `license:<key>` records with `licenseType: "floating"`, `maxSeats: 1`, and an empty `leases` list.
- `GET/POST /api/activate` and `/api/lease` acquire or renew a seat for `{ license, device }`.
- `GET/POST /api/validate` and `/api/heartbeat` validate and extend the current lease.
- `GET/POST /api/release` releases the current device's lease.
- Expired leases are pruned automatically on acquire/validate, so seats are returned even if After Effects or the workstation crashes.
- The lease duration defaults to 30 minutes and can be configured with the Cloudflare Worker environment variable `FLOATING_LEASE_MINUTES` (clamped to 5 minutes–24 hours).

### After Effects panel behavior

- On panel start, `iLabels.jsx` must successfully validate/renew an existing lease or acquire a new one before showing the main UI.
- If all floating seats are in use, the activation screen is shown and the API returns `no_floating_seats`.
- When a floating palette window closes, the panel calls `/release` to return the seat immediately. Docked ScriptUI panels may not always fire a close event, so the server-side expiration remains the safety mechanism.

### Operational notes

- Use `/admin/reset` with the admin bearer token to clear both legacy device activations and active floating leases for a license.
- Existing KV records with old `devices` fields are normalized at runtime; new license checks use `leases` and `maxSeats`.
- This project does **not** use the aescripts floating-license server. The Cloudflare Worker is the license manager for iLabels.
