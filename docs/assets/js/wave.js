/**
 * Wave Background -- AK-Vortex Water Theme
 * Canvas-based animated wave/ocean background
 */

export function initWaveBackground() {
  const canvas = document.getElementById('wave-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width, height;
  let animationId;
  let time = 0;

  // Wave layers configuration
  const layers = [
    { y: 0.65, amplitude: 18, wavelength: 300, speed: 0.008, color: 'rgba(0, 229, 255, 0.03)' },
    { y: 0.70, amplitude: 14, wavelength: 220, speed: 0.012, color: 'rgba(0, 229, 255, 0.04)' },
    { y: 0.75, amplitude: 10, wavelength: 160, speed: 0.018, color: 'rgba(0, 229, 255, 0.05)' },
    { y: 0.80, amplitude: 7,  wavelength: 120, speed: 0.025, color: 'rgba(0, 229, 255, 0.06)' },
    { y: 0.85, amplitude: 5,  wavelength: 90,  speed: 0.032, color: 'rgba(0, 229, 255, 0.07)' },
  ];

  // Particle configuration (bubbles / foam)
  const particles = [];
  const PARTICLE_COUNT = 40;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function initParticles() {
    particles.length = 0;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * width,
        y: height * 0.6 + Math.random() * height * 0.4,
        radius: 0.5 + Math.random() * 1.5,
        opacity: 0.1 + Math.random() * 0.3,
        speed: 0.2 + Math.random() * 0.5,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.01 + Math.random() * 0.02,
      });
    }
  }

  function drawWave(layer, t) {
    const baseY = height * layer.y;

    ctx.beginPath();
    ctx.moveTo(0, height);

    for (let x = 0; x <= width; x += 2) {
      const normalizedX = x / width;
      const y = baseY +
        Math.sin((x / layer.wavelength) * Math.PI * 2 + t * layer.speed * 100) * layer.amplitude +
        Math.sin((x / (layer.wavelength * 0.6)) * Math.PI * 2 + t * layer.speed * 60) * (layer.amplitude * 0.4);
      ctx.lineTo(x, y);
    }

    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = layer.color;
    ctx.fill();
  }

  function drawParticles(t) {
    for (const p of particles) {
      p.y -= p.speed;
      p.wobble += p.wobbleSpeed;
      p.x += Math.sin(p.wobble) * 0.3;

      if (p.y < height * 0.3) {
        p.y = height * 0.6 + Math.random() * height * 0.4;
        p.x = Math.random() * width;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 229, 255, ${p.opacity * (0.5 + 0.5 * Math.sin(t * 0.02 + p.wobble))})`;
      ctx.fill();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, time);

    // Draw wave layers back to front
    for (const layer of layers) {
      drawWave(layer, time);
    }

    // Draw floating particles
    drawParticles(time);

    time++;
    animationId = requestAnimationFrame(draw);
  }

  // Initialize
  resize();
  initParticles();
  draw();

  // Handle resize
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
    // Draw static state
    ctx.clearRect(0, 0, width, height);
    for (const layer of layers) {
      drawWave(layer, 0);
    }
  }

  return () => {
    cancelAnimationFrame(animationId);
  };
}
