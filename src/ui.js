// DOM overlay: HUD, back-seat commentary, comic bursts, screens.
import { HEALTH } from './lines.js';

export const $ = (id) => document.getElementById(id);
const faces = [...document.querySelectorAll('.face')];
const order = faces.map((f) => f.dataset.who);
const bubble = $('bubble');

export const ui = {
  cur: null,
  onSpeak: null,

  show(id, on = true) {
    $(id).classList.toggle('hidden', !on);
  },

  // priority: 0 idle chatter, 1 reactions, 2 story beats. Lower never interrupts higher.
  say(who, text, prio = 1, dur) {
    const now = performance.now();
    if (this.cur && now < this.cur.end && prio < this.cur.prio) return false;
    dur = dur ?? Math.min(4600, 1500 + text.length * 48);
    this.cur = { end: now + dur, prio };
    const i = order.indexOf(who);
    bubble.textContent = text;
    bubble.style.setProperty('--tail', `${i * 58 + 26}px`);
    bubble.classList.toggle('loud', who === 'baby' && text.includes('WAA'));
    bubble.classList.add('show');
    faces.forEach((f, k) => f.classList.toggle('talk', k === i));
    clearTimeout(this.sayTimer);
    this.sayTimer = setTimeout(() => this.hush(), dur);
    this.onSpeak?.(who, text);
    return true;
  },
  hush() {
    bubble.classList.remove('show');
    faces.forEach((f) => f.classList.remove('talk'));
    this.cur = null;
  },
  babyCry(ms) {
    const f = faces[order.indexOf('baby')];
    f.classList.add('cry');
    clearTimeout(this.cryTimer);
    if (ms) this.cryTimer = setTimeout(() => f.classList.remove('cry'), ms);
  },
  babyCalm() {
    clearTimeout(this.cryTimer);
    faces[order.indexOf('baby')].classList.remove('cry');
  },

  burst(text, cls = '') {
    const el = document.createElement('div');
    el.className = 'burst ' + cls;
    el.textContent = text;
    el.style.left = 30 + Math.random() * 40 + '%';
    el.style.top = 30 + Math.random() * 22 + '%';
    el.style.setProperty('--r', (Math.random() * 24 - 12).toFixed(1) + 'deg');
    $('bursts').appendChild(el);
    setTimeout(() => el.remove(), 1000);
  },

  hud({ togo, time, speed, shaves, damage, repairs }) {
    $('dist').textContent = (togo / 1000).toFixed(2);
    $('clock').textContent = `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
    $('mph').textContent = Math.round(speed * 2.237);
    $('shaves').textContent = shaves;
    const hp = Math.max(0, 100 - damage);
    $('hpfill').style.width = hp + '%';
    $('hpfill').style.background = hp > 60 ? '#6cc04a' : hp > 30 ? '#ffc93c' : '#ef5a45';
    $('hplabel').textContent = 'CAR: ' + HEALTH[Math.min(4, Math.floor(hp / 20))];
    $('repairs').textContent = repairs > 0 ? '🔧'.repeat(repairs) : '☠️';
  },
  hpHit() {
    const el = $('hp');
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
  },
};
