/**
 * Main Entry Point -- AK-Vortex
 * Orchestrates particles, scroll, and navigation
 */

import { initParticles } from './particles.js';
import { initScroll } from './scroll.js';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize floating particles
  initParticles();

  // Initialize scroll effects
  initScroll();

  // Mobile nav toggle
  const toggle = document.querySelector('.nav__toggle');
  const links = document.querySelector('.nav__links');

  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const isOpen = links.classList.toggle('is-open');
      toggle.classList.toggle('is-active');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    // Close mobile menu on link click
    links.querySelectorAll('.nav__link').forEach(link => {
      link.addEventListener('click', () => {
        links.classList.remove('is-open');
        toggle.classList.remove('is-active');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }
});
