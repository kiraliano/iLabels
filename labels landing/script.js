/* ============================================================
   ILABELS LANDING PAGE — JAVASCRIPT
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {
    initSmoothScroll();
    initScrollAnimations();
    initButtonRipple();
    initNothingToLearnAnimation();
});

function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            e.preventDefault();

            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

function initScrollAnimations() {
    const elements = document.querySelectorAll('.fade-in-up');

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animationPlayState = 'running';
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.08,
        rootMargin: '0px 0px -40px 0px'
    });

    elements.forEach(el => {
        el.style.animationPlayState = 'paused';
        observer.observe(el);
    });
}

function initButtonRipple() {
    document.querySelectorAll('.button').forEach(btn => {
        btn.addEventListener('click', function (e) {
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);

            const ripple = document.createElement('span');
            ripple.classList.add('ripple');
            ripple.style.width = `${size}px`;
            ripple.style.height = `${size}px`;
            ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
            ripple.style.top = `${e.clientY - rect.top - size / 2}px`;

            this.appendChild(ripple);
            setTimeout(() => ripple.remove(), 620);
        });
    });
}

function initNothingToLearnAnimation() {
    const title = document.querySelector('.nothing-title');
    if (!title) return;

    const text = title.textContent;
    title.innerHTML = '';

    const charSpans = [];
    for (const char of text) {
        const span = document.createElement('span');
        span.textContent = char;

        if (char.trim()) {
            span.classList.add('ntl-char');
            charSpans.push(span);
        }

        title.appendChild(span);
    }

    if (!charSpans.length) return;

    let lastY = window.scrollY;
    let cooldown = false;
    const animating = new Set();

    window.addEventListener('scroll', function () {
        const dy = Math.abs(window.scrollY - lastY);
        if (dy < 15 || cooldown) return;

        lastY = window.scrollY;
        cooldown = true;

        const available = charSpans.filter(s => !animating.has(s));
        if (!available.length) {
            cooldown = false;
            return;
        }

        const count = Math.min(Math.floor(Math.random() * 3) + 1, available.length);
        const picked = available.sort(() => Math.random() - 0.5).slice(0, count);

        picked.forEach(span => {
            animating.add(span);
            span.classList.add('ntl-char--active');

            function onEnd() {
                span.classList.remove('ntl-char--active');
                animating.delete(span);
                span.removeEventListener('animationend', onEnd);
            }

            span.addEventListener('animationend', onEnd);
        });

        setTimeout(() => {
            cooldown = false;
        }, 380);
    }, { passive: true });
}
