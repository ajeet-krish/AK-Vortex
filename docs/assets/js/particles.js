/**
 * Floating Particles -- AK-Vortex Water Theme
 * Canvas-based floating particle system (bubbles/foam)
 */

export function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width, height;
  let animationId;
  let time = 0;

  const particles = [];
  const PARTICLE_COUNT = 50;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function initParticles() {
    particles.length = 0;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * width,
        y: height * 0.3 + Math.random() * height * 0.7,
        radius: 0.5 + Math.random() * 1.5,
        opacity: 0.08 + Math.random() * 0.2,
        speed: 0.15 + Math.random() * 0.4,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.008 + Math.random() * 0.015,
        wobbleAmp: 0.2 + Math.random() * 0.3,
      });
    }
  }

  function drawParticles() {
    for (const p of particles) {
      p.y -= p.speed;
      p.wobble += p.wobbleSpeed;
      p.x += Math.sin(p.wobble) * p.wobbleAmp;

      if (p.y < -10) {
        p.y = height + 10;
        p.x = Math.random() * width;
      }

      const flicker = 0.6 + 0.4 * Math.sin(time * 0.015 + p.wobble);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 229, 255, ${p.opacity * flicker})`;
      ctx.fill();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    drawParticles();
    time++;
    animationId = requestAnimationFrame(draw);
  }

  resize();
  initParticles();
  draw();

  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      resize();
      initParticles();
    }, 200);
  });

  // Respect reduced motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (prefersReducedMotion.matches) {
    cancelAnimationFrame(animationId);
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 229, 255, ${p.opacity})`;
      ctx.fill();
    }
  }

  return () => {
    cancelAnimationFrame(animationId);
  };
}
