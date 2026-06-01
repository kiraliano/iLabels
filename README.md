# iLabels — Landing Page

After Effects plugin for label-based layer selection.

## 📁 Structure

```
├── index.html        — Main page
├── styles.css        — All styles
├── script.js         — Animations and interactions
├── video/
│   ├── select-color.mp4
│   ├── double-click-reset.mp4
│   └── nothing-selected.mp4
├── _headers          — Cloudflare Pages HTTP headers
├── _redirects        — Cloudflare Pages redirects
└── .gitignore
```

## 🚀 Deploy to Cloudflare Pages (step by step)

### Step 1 — Push to GitHub

```bash
# 1. Create a new repo on github.com (name it: ilabels-landing)

# 2. In this folder, open terminal and run:
git init
git add .
git commit -m "initial: iLabels landing page"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ilabels-landing.git
git push -u origin main
```

### Step 2 — Connect Cloudflare Pages

1. Go to **https://dash.cloudflare.com/**
2. Left sidebar → **Workers & Pages** → **Create application**
3. Tab: **Pages** → **Connect to Git**
4. Choose GitHub → select repo **ilabels-landing**
5. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** *(leave empty / put `.`)*
6. Click **Save and Deploy**

✅ Site goes live at: `ilabels-landing.pages.dev`

### Step 3 — Custom domain (optional)

In Cloudflare Pages → your project → **Custom domains** → Add domain.

---

## 🔄 Update the site

Just push to GitHub — Cloudflare auto-deploys in ~30 seconds:

```bash
git add .
git commit -m "update: description of what changed"
git push
```

## ✅ Cloudflare Pages works in Russia

Cloudflare is a CDN network, not blocked in RF.
Free plan includes: unlimited requests, 500 deploys/month, HTTPS by default.
