/* ============================================================
   ILABELS LANDING PAGE — JAVASCRIPT
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {
    initSmoothScroll();
    initScrollAnimations();
    initButtonRipple();
    initTypingTitle();
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

   

function initTypingTitle() {
    const text = document.getElementById('typing-text');
    if (!text) return;

    const first = 'and that’s it .';
    const second = 'and that’s it ?';

    const colors = [
        '#FFBA71',
        '#FF6778',
        '#F5B9EA',
        '#BC82F3',
        '#AA6EEE',
        '#8D9FFF'
    ];

    let current = first;

    function render(str) {
        text.innerHTML = '';

        for (const char of str) {
            const span = document.createElement('span');
            span.textContent = char;

            if (char.trim()) {
                span.classList.add('ntl-char');
            }

            text.appendChild(span);
        }
    }

    async function typeText(str) {
        text.innerHTML = '';

        for (const char of str) {
            const span = document.createElement('span');
            span.textContent = char;

            if (char.trim()) {
                span.classList.add('ntl-char');
            }

            text.appendChild(span);

            const delay =
                Math.random() < 0.08 ? 180 :
                Math.random() < 0.2 ? 90 :
                45;

            await new Promise(r => setTimeout(r, delay));
        }
    }

    async function eraseText() {
        const currentText = text.textContent;

        for (let i = currentText.length; i >= 0; i--) {
            text.textContent = currentText.slice(0, i);
            await new Promise(r => setTimeout(r, 18 + Math.random() * 20));
        }
    }

   let lastY = window.scrollY;
let cooldown = false;

window.addEventListener('scroll', () => {
    const dy = Math.abs(window.scrollY - lastY);
    if (dy < 15 || cooldown) return;

    lastY = window.scrollY;
    cooldown = true;

    const chars = [...text.querySelectorAll('.ntl-char')];
    if (!chars.length) {
        cooldown = false;
        return;
    }

    const span = chars[Math.floor(Math.random() * chars.length)];

    span.style.setProperty(
        '--spark-color',
        colors[Math.floor(Math.random() * colors.length)]
    );

    span.classList.add('ntl-char--active');

    setTimeout(() => {
        span.classList.remove('ntl-char--active');
    }, 350);

    setTimeout(() => {
        cooldown = false;
    }, 380);
}, { passive: true });





    async function loop() {
        while (true) {
            await typeText(current);
            await new Promise(r => setTimeout(r, 5000));

            await eraseText();

            current = current === first ? second : first;
        }
    }














    loop();
}