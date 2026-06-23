// ─────────────────────────────────────────────────────────────
// Mentara site : shared scripts (waitlist + mentor application)
// ─────────────────────────────────────────────────────────────
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ── CONFIG ───────────────────────────────────────────────────
// Paste from Supabase → Project Settings → API.
// Both values are SAFE in the browser: the anon key is public by
// design, and the tables' row-level policies allow INSERT only
// (no one can read the lists back through this key).
const SUPABASE_URL = 'https://fjzvyotmklgdhiygtgnn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqenZ5b3Rta2xnZGhpeWd0Z25uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDExMjIsImV4cCI6MjA5MDY3NzEyMn0.-OfkV1g_hhMm003Cx-Q-wzkW1EZJ_cUAQA8u_6VG6LA';
// ─────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function msgEl(form) {
  // message element is the .form-msg that follows the form (or inside same parent)
  return (
    form.parentElement.querySelector('.form-msg') ||
    form.querySelector('.form-msg')
  );
}
function setMsg(form, text, kind) {
  const el = msgEl(form);
  if (!el) return;
  el.textContent = text;
  el.className = 'form-msg ' + (kind || '');
}
function lockBtn(btn, label) {
  btn._label = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
}
function unlockBtn(btn) {
  btn.disabled = false;
  if (btn._label) btn.textContent = btn._label;
}

// ── Student waitlist forms (.js-waitlist) ─────────────────────
document.querySelectorAll('.js-waitlist').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('input[type="email"]');
    const btn = form.querySelector('button');
    const email = (input.value || '').trim().toLowerCase();

    if (!EMAIL_RE.test(email)) {
      setMsg(form, 'Please enter a valid email address.', 'err');
      input.focus();
      return;
    }

    lockBtn(btn, 'Joining…');
    const { error } = await supabase.from('waitlist').insert({ email, source: 'landing' });
    unlockBtn(btn);

    if (!error) {
      form.reset();
      setMsg(form, "🎉 You're on the list! We'll email you the moment Mentara launches.", 'ok');
    } else if (error.code === '23505') {
      form.reset();
      setMsg(form, "You're already on the list. Thanks for the enthusiasm! 💛", 'ok');
    } else {
      setMsg(form, 'Something went wrong. Please try again in a moment.', 'err');
      console.error('[waitlist]', error);
    }
  });
});

// ── Mentor application form (.js-mentor) ──────────────────────
document.querySelectorAll('.js-mentor').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());
    const name = (data.name || '').trim();
    const email = (data.email || '').trim().toLowerCase();
    const expertise = (data.expertise || '').trim();
    const experience = (data.experience || '').trim();
    const linkedin = (data.linkedin || '').trim();

    if (!name) { setMsg(form, 'Please enter your name.', 'err'); return; }
    if (!EMAIL_RE.test(email)) { setMsg(form, 'Please enter a valid email address.', 'err'); return; }
    if (!expertise) { setMsg(form, 'Tell us your area of expertise.', 'err'); return; }

    lockBtn(btn, 'Submitting…');
    const { error } = await supabase.from('mentor_applications').insert({
      name, email, expertise,
      experience: experience || null,
      linkedin: linkedin || null,
      source: 'landing',
    });
    unlockBtn(btn);

    if (!error) {
      form.reset();
      setMsg(form, "🙌 Thank you! You're in our founding mentor pool. We'll reach out before launch.", 'ok');
    } else if (error.code === '23505') {
      form.reset();
      setMsg(form, "You've already applied and we have your details. Thank you! 💛", 'ok');
    } else {
      setMsg(form, 'Something went wrong. Please try again in a moment.', 'err');
      console.error('[mentor_applications]', error);
    }
  });
});

// ── Mobile nav toggle ─────────────────────────────────────────
const toggle = document.querySelector('.nav-toggle');
const links = document.querySelector('.nav-links');
if (toggle && links) {
  toggle.addEventListener('click', () => links.classList.toggle('open'));
  links.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => links.classList.remove('open'))
  );
}
