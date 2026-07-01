// ─────────────────────────────────────────────────────────────
// Mentara site : shared scripts (waitlist + mentor application)
// ─────────────────────────────────────────────────────────────
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ── CONFIG ───────────────────────────────────────────────────
const SUPABASE_URL = 'https://fjzvyotmklgdhiygtgnn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqenZ5b3Rta2xnZGhpeWd0Z25uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDExMjIsImV4cCI6MjA5MDY3NzEyMn0.-OfkV1g_hhMm003Cx-Q-wzkW1EZJ_cUAQA8u_6VG6LA';
// ─────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Shared wizard data - populated as user steps through the mentor wizard
const wizardData = { name: '', expertise: '', experience: '', linkedin: '' };

function msgEl(form) {
  return (
    form.parentElement.querySelector('.form-msg') ||
    form.querySelector('.form-msg') ||
    (form.closest && form.closest('.form-card') && form.closest('.form-card').querySelector('.form-msg'))
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

// ── Mentor signup wizard ──────────────────────────────────────
// 4-step flow: name -> expertise -> background (optional) -> create account
// The final step shows Google/Apple OAuth and an email+password form.
(function setupMentorWizard() {
  const TOTAL_STEPS = 4;
  let currentStep = 0;

  function showStep(step) {
    for (let i = 0; i < TOTAL_STEPS; i++) {
      const pane = document.getElementById('wizard-pane-' + i);
      if (pane) pane.style.display = i === step ? '' : 'none';
    }
    const label = document.getElementById('wizard-step-label');
    if (label) label.textContent = 'Step ' + (step + 1) + ' of ' + TOTAL_STEPS;
    const fill = document.getElementById('wizard-progress-fill');
    if (fill) fill.style.width = ((step + 1) / TOTAL_STEPS * 100) + '%';

    // When reaching the final step, populate hidden form inputs so the
    // email form handler can read wizard data via FormData
    if (step === TOTAL_STEPS - 1) {
      const setHidden = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      setHidden('m-name', wizardData.name);
      setHidden('m-expertise', wizardData.expertise);
      setHidden('m-experience', wizardData.experience);
      setHidden('m-linkedin', wizardData.linkedin);
    }

    currentStep = step;
  }

  function setWizardErr(step, msg) {
    const el = document.getElementById('wizard-err-' + step);
    if (el) el.textContent = msg || '';
  }

  document.querySelectorAll('.wizard-btn-next').forEach((btn) => {
    btn.addEventListener('click', () => {
      const step = parseInt(btn.getAttribute('data-step') || '0', 10);
      setWizardErr(step, '');

      if (step === 0) {
        const name = (document.getElementById('w-name') || {value: ''}).value.trim();
        if (!name) { setWizardErr(0, 'Please enter your name.'); return; }
        wizardData.name = name;
      } else if (step === 1) {
        const expertise = (document.getElementById('w-expertise') || {value: ''}).value.trim();
        if (!expertise) { setWizardErr(1, 'Please enter at least one area of expertise.'); return; }
        wizardData.expertise = expertise;
      } else if (step === 2) {
        // Both fields are optional - just save whatever is there
        wizardData.experience = (document.getElementById('w-experience') || {value: ''}).value.trim();
        wizardData.linkedin = (document.getElementById('w-linkedin') || {value: ''}).value.trim();
      }

      if (step < TOTAL_STEPS - 1) showStep(step + 1);
    });
  });

  document.querySelectorAll('.wizard-btn-back').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (currentStep > 0) showStep(currentStep - 1);
    });
  });

  // Allow pressing Enter to advance from text inputs in steps 0 and 1
  ['w-name', 'w-expertise'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const stepBtn = document.querySelector(
          '#wizard-pane-' + currentStep + ' .wizard-btn-next'
        );
        if (stepBtn) stepBtn.click();
      }
    });
  });
})();

// ── Founding mentor email signup (.js-mentor) ─────────────────
// This form lives inside wizard step 3. Hidden inputs (name, expertise,
// experience, linkedin) are pre-populated by the wizard before step 3 is shown.
document.querySelectorAll('.js-mentor').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());
    const name = (data.name || '').trim();
    const email = (data.email || '').trim().toLowerCase();
    const password = data.password || '';
    const expertise = (data.expertise || '').trim();
    const experience = (data.experience || '').trim();
    const linkedin = (data.linkedin || '').trim();

    if (!name) { setMsg(form, 'Your name is missing. Please go back and try again.', 'err'); return; }
    if (!EMAIL_RE.test(email)) { setMsg(form, 'Please enter a valid email address.', 'err'); return; }
    if (password.length < 8) { setMsg(form, 'Please choose a password of at least 8 characters.', 'err'); return; }
    if (!expertise) { setMsg(form, 'Expertise is missing. Please go back and try again.', 'err'); return; }

    lockBtn(btn, 'Creating your account…');

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role: 'mentor', full_name: name, signup_source: 'web' },
        emailRedirectTo: 'https://mentara.me/',
      },
    });
    const alreadyRegistered =
      !!authError && /already (registered|exists)|user already/i.test(authError.message || '');
    if (authError && !alreadyRegistered) {
      unlockBtn(btn);
      setMsg(form, "We couldn't create your account: " + authError.message, 'err');
      console.error('[signup]', authError);
      return;
    }

    const { error: appError } = await supabase.from('mentor_applications').insert({
      name, email, expertise,
      experience: experience || null,
      linkedin: linkedin || null,
      source: 'landing',
    });
    if (appError && appError.code !== '23505') console.error('[mentor_applications]', appError);

    unlockBtn(btn);
    form.reset();
    if (alreadyRegistered) {
      setMsg(form, "You already have a Mentara account. You're all set. Use this email to log in when the app launches. 💛", 'ok');
    } else {
      setMsg(form, "🎉 Your founding mentor account is created! Check your inbox to confirm your email, then log in with this same email and password in the app at launch.", 'ok');
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

// ── App demo: scroll-zoom into the phone ──────────────────────
(function () {
  const demo = document.querySelector('.phone-demo');
  if (!demo) return;
  const phone = demo.querySelector('.phone');
  const bg = demo.querySelector('.demo-bg');
  const screens = Array.from(demo.querySelectorAll('.phone-screen'));
  const caps = Array.from(demo.querySelectorAll('.demo-cap'));
  const dots = Array.from(demo.querySelectorAll('.demo-dots i'));
  let ticking = false;

  function update() {
    ticking = false;
    const total = demo.offsetHeight - window.innerHeight;
    const scrolled = Math.min(Math.max(-demo.getBoundingClientRect().top, 0), Math.max(total, 1));
    const p = total > 0 ? scrolled / total : 0;

    const zoomP = Math.min(p / 0.42, 1);
    const eased = zoomP * zoomP * (3 - 2 * zoomP);
    const scale = 0.40 + eased * (1.18 - 0.40);
    phone.style.transform = 'scale(' + scale.toFixed(3) + ')';
    if (bg) {
      bg.style.opacity = (1 - zoomP * 0.94).toFixed(3);
      bg.style.transform = 'scale(' + (1 + zoomP * 0.45).toFixed(3) + ')';
    }

    const sp = Math.max((p - 0.46) / 0.54, 0);
    let idx = Math.floor(sp * screens.length);
    if (idx > screens.length - 1) idx = screens.length - 1;
    screens.forEach((s, i) => s.classList.toggle('active', i === idx));
    caps.forEach((s, i) => s.classList.toggle('active', i === idx));
    dots.forEach((d, i) => d.classList.toggle('active', i === idx));
  }

  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
})();

// ── Google / Apple OAuth ──────────────────────────────────────
// Creates a real account in the same Supabase project as the app.
// For mentor intent: wizardData (collected before reaching step 3) is stored
// in localStorage so it survives the OAuth redirect.
// On return: claim_mentor_role() RPC sets role='mentor', then application saved.
function oauthToast(text) {
  const t = document.createElement('div');
  t.textContent = text;
  t.style.cssText =
    'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:90%;' +
    'background:#0D4F5C;color:#fff;padding:14px 18px;border-radius:12px;' +
    'box-shadow:0 10px 34px rgba(0,0,0,.28);z-index:9999;font:500 15px/1.45 system-ui,sans-serif';
  document.body.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; }, 7000);
  setTimeout(() => t.remove(), 7600);
}

document.querySelectorAll('.oauth-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const provider = btn.getAttribute('data-provider');
    const block = btn.closest('[data-oauth-intent]');
    const intent = block ? block.getAttribute('data-oauth-intent') : 'student';

    let extra = {};
    if (intent === 'mentor') {
      // wizardData is populated as the user steps through the wizard.
      // By the time they reach the OAuth buttons (step 3), name and expertise are set.
      extra = {
        name: wizardData.name,
        expertise: wizardData.expertise,
        experience: wizardData.experience,
        linkedin: wizardData.linkedin,
      };
    }
    try { localStorage.setItem('mentara_oauth', JSON.stringify({ intent, extra, ts: Date.now() })); } catch (_) {}

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + '/' },
    });
    if (error) {
      try { localStorage.removeItem('mentara_oauth'); } catch (_) {}
      oauthToast('Could not start ' + provider + ' sign-in. Please try again.');
      console.error('[oauth]', error);
    }
  });
});

// Runs on every page load; completes the signup after the provider redirects back.
(async function finishOAuthReturn() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem('mentara_oauth') || 'null'); } catch (_) {}
  if (!stored) return;
  if (Date.now() - (stored.ts || 0) > 10 * 60 * 1000) { localStorage.removeItem('mentara_oauth'); return; }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  localStorage.removeItem('mentara_oauth');

  if (stored.intent === 'mentor') {
    const { error: roleErr } = await supabase.rpc('claim_mentor_role');
    if (roleErr) console.error('[claim_mentor_role]', roleErr);

    const email = (session.user.email || '').toLowerCase();
    const meta = session.user.user_metadata || {};
    // Use the name captured in the wizard, falling back to the OAuth provider's name
    const name = ((stored.extra && stored.extra.name) || '').trim()
      || meta.full_name || meta.name || '';
    const expertise = ((stored.extra && stored.extra.expertise) || '').trim();
    if (email && expertise) {
      const { error: appErr } = await supabase.from('mentor_applications').insert({
        name: name || email, email, expertise,
        experience: ((stored.extra && stored.extra.experience) || '').trim() || null,
        linkedin: ((stored.extra && stored.extra.linkedin) || '').trim() || null,
        source: 'landing-oauth',
      });
      if (appErr && appErr.code !== '23505') console.error('[mentor_applications]', appErr);
    }
    oauthToast("🎉 You're a founding mentor! Your account is ready. Use this same Google/Apple login in the Mentara app at launch.");
  } else {
    oauthToast("🎉 You're in! Your account is ready. Use this same login in the Mentara app at launch.");
  }
})();
