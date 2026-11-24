import { MODULE_ID, chat, esc, level, mp, num, skillLevel } from './util.mjs';

/**
 * Ace of Cards (Project FU ships the class; the rules handout is "Ace of Cards Rules").
 * Deck of 30: two jokers and values 1–7 in four suits, each suit tied to a damage type.
 * Hand of 5 at the start of a conflict; draws reshuffle the discard pile when the deck runs out;
 * everything goes back into the deck when the conflict ends.
 */

export const SUITS = {
	H: { name: 'Hearts', glyph: '♥', red: true },
	D: { name: 'Diamonds', glyph: '♦', red: true },
	C: { name: 'Clubs', glyph: '♣', red: false },
	S: { name: 'Spades', glyph: '♠', red: false },
};
export const DEFAULT_SUIT_TYPES = { D: 'air', C: 'earth', H: 'fire', S: 'ice' };
export const TRAP_TYPES = { attack: 'ice', objective: 'fire', skill: 'earth', spell: 'air' };

export const isJoker = (id) => id.startsWith('J');
export const cardValue = (id) => (isJoker(id) ? 0 : num(id.slice(1)));
export const cardSuit = (id) => (isJoker(id) ? null : id[0]);

export function freshDeck() {
	const out = ['J1', 'J2'];
	for (const s of Object.keys(SUITS)) for (let v = 1; v <= 7; v++) out.push(`${s}${v}`);
	return out;
}

function shuffle(a) {
	const arr = [...a];
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

export const state = (actor) => foundry.utils.mergeObject({ deck: [], hand: [], discard: [], active: false, suitTypes: DEFAULT_SUIT_TYPES }, actor.getFlag(MODULE_ID, 'cards') ?? {}, { inplace: false });
const save = (actor, s) => actor.setFlag(MODULE_ID, 'cards', s);

export async function startConflict(actor) {
	const s = state(actor);
	s.deck = shuffle(freshDeck());
	s.hand = [];
	s.discard = [];
	s.active = true;
	draw(s, 5);
	await save(actor, s);
}

export async function endConflict(actor) {
	const s = state(actor);
	s.deck = shuffle(freshDeck());
	s.hand = [];
	s.discard = [];
	s.active = false;
	await save(actor, s);
}

/** Draw into the hand (mutates s); reshuffles the discard pile when the deck is empty */
function draw(s, n) {
	for (let i = 0; i < n; i++) {
		if (!s.deck.length) {
			if (!s.discard.length) break;
			s.deck = shuffle(s.discard);
			s.discard = [];
		}
		s.hand.push(s.deck.shift());
	}
}

export async function drawCards(actor, n) {
	const s = state(actor);
	draw(s, n);
	await save(actor, s);
}

export async function discardCards(actor, ids, redraw = false) {
	const s = state(actor);
	const set = new Set(ids);
	const gone = s.hand.filter((c) => set.has(c));
	s.hand = s.hand.filter((c) => !set.has(c));
	s.discard.push(...gone);
	if (redraw) draw(s, gone.length);
	await save(actor, s);
	return gone;
}

/* ---------- sets ---------- */

const counts = (vals) => {
	const m = new Map();
	for (const v of vals) m.set(v, (m.get(v) ?? 0) + 1);
	return [...m.values()].sort((a, b) => b - a);
};
const consecutive = (vals) => {
	const s = [...vals].sort((a, b) => a - b);
	return s.every((v, i) => i === 0 || v === s[i - 1] + 1);
};
const sameSuit = (suits) => suits.every((x) => x === suits[0]);

/**
 * The seven set effects. Each test gets concrete cards ({v, s}) after jokers are assigned.
 * Requirements must match exactly, so the card count is part of each test.
 */
export const SET_EFFECTS = [
	{ id: 'jackpot', name: 'Jackpot', req: '4 cards of the same value, no jokers', test: (c, raw) => c.length === 4 && !raw.some(isJoker) && counts(c.map((x) => x.v))[0] === 4 },
	{ id: 'magicFlush', name: 'Magic Flush', req: '4 consecutive values of the same suit', test: (c) => c.length === 4 && consecutive(c.map((x) => x.v)) && new Set(c.map((x) => x.v)).size === 4 && sameSuit(c.map((x) => x.s)) },
	{ id: 'blindingFlush', name: 'Blinding Flush', req: '4 consecutive values', test: (c) => c.length === 4 && consecutive(c.map((x) => x.v)) && new Set(c.map((x) => x.v)).size === 4 },
	{ id: 'fullStatus', name: 'Full Status', req: '3 of a value + 2 of a value', test: (c) => c.length === 5 && ((k) => (k[0] === 3 && k[1] === 2))(counts(c.map((x) => x.v))) },
	{ id: 'tripleSupport', name: 'Triple Support', req: '3 cards of the same value', test: (c) => c.length === 3 && counts(c.map((x) => x.v))[0] === 3 },
	{ id: 'doubleTrouble', name: 'Double Trouble', req: '2 of a value + 2 of a value', test: (c) => c.length === 4 && ((k) => (k[0] === 2 && k[1] === 2))(counts(c.map((x) => x.v))) },
	{ id: 'magicPair', name: 'Magic Pair', req: '2 cards of the same value', test: (c) => c.length === 2 && c[0].v === c[1].v },
];

/** Every way to read the jokers (value 1–7, any suit) */
function* assignments(ids) {
	const jokers = ids.filter(isJoker).length;
	const fixed = ids.filter((i) => !isJoker(i)).map((i) => ({ v: cardValue(i), s: cardSuit(i) }));
	const opts = [];
	for (const s of Object.keys(SUITS)) for (let v = 1; v <= 7; v++) opts.push({ v, s, joker: true });
	if (!jokers) yield fixed;
	else if (jokers === 1) for (const a of opts) yield [...fixed, a];
	else for (const a of opts) for (const b of opts) yield [...fixed, a, b];
}

/** Level bonus for Magic Flush, Blinding Flush and Double Trouble */
const lvlBonus = (actor) => (level(actor) >= 40 ? 20 : level(actor) >= 20 ? 10 : 0);

function describe(effect, cards, actor, suitTypes) {
	const total = cards.reduce((s, c) => s + c.v, 0);
	const high = Math.max(...cards.map((c) => c.v));
	const types = [...new Set(cards.map((c) => suitTypes[c.s]))];
	switch (effect.id) {
		case 'jackpot':
			return { score: 1000, text: 'Every Player Character who surrendered but is still present regains consciousness (their Surrender still applies); you and every ally you can see recover 777 HP and 777 MP.', inline: '@GAIN[777 hp] @GAIN[777 mp]' };
		case 'magicFlush': {
			const dmg = 25 + total + lvlBonus(actor);
			return { score: dmg, text: `${dmg} ${suitTypes[cards[0].s]} damage to every enemy you can see.`, inline: `@DMG[${dmg} ${suitTypes[cards[0].s]}]` };
		}
		case 'blindingFlush': {
			const dmg = 15 + total + lvlBonus(actor);
			const type = high % 2 === 0 ? 'light' : 'dark';
			return { score: dmg, text: `${dmg} ${type} damage to every enemy you can see.`, inline: `@DMG[${dmg} ${type}]` };
		}
		case 'fullStatus':
			return high % 2 === 0
				? { score: 50 + high, text: 'Highest value is even: you and every ally you can see recover from two of dazed, shaken, slow and weak (your choice).' }
				: { score: 60 + high, text: 'Highest value is odd: every enemy you can see suffers two of dazed, shaken, slow and weak (your choice).' };
		case 'tripleSupport': {
			const hp = total * 3;
			return { score: hp, text: `You and every ally you can see recover ${hp} HP.`, inline: `@GAIN[${hp} hp]` };
		}
		case 'doubleTrouble': {
			const dmg = 10 + high + lvlBonus(actor);
			return { score: dmg, text: `${dmg} damage to each of up to two different enemies you can see; type of your choice among ${types.join(', ')}.`, inline: types.map((t) => `@DMG[${dmg} ${t}]`).join(' ') };
		}
		case 'magicPair':
			return { score: 5, text: `Perform a free attack with an equipped weapon; if it deals damage, all of it becomes ${types.join(' or ')} (your choice of the two suits).` };
	}
	return { score: 0, text: '' };
}

/** All effects a set can produce, each with the best reading of its jokers */
export function setOptions(actor, ids) {
	const suitTypes = state(actor).suitTypes;
	const best = new Map();
	for (const cards of assignments(ids)) {
		for (const eff of SET_EFFECTS) {
			if (!eff.test(cards, ids)) continue;
			const d = describe(eff, cards, actor, suitTypes);
			const prev = best.get(eff.id);
			if (!prev || d.score > prev.score) best.set(eff.id, { ...eff, ...d, cards });
		}
	}
	return SET_EFFECTS.filter((e) => best.has(e.id)).map((e) => best.get(e.id));
}

/** High or Low (skill): what the set adds on top */
export function highOrLow(actor, ids, cards) {
	const sl = skillLevel(actor, 'high-or-low');
	if (!sl) return '';
	const hasJ = ids.some(isJoker);
	const vals = (cards ?? ids.filter((i) => !isJoker(i)).map((i) => ({ v: cardValue(i) }))).map((c) => c.v);
	const out = [];
	if (hasJ || vals.includes(7)) out.push(`+${sl} damage dealt until the start of your next turn`);
	if (hasJ || vals.includes(1)) out.push(`damage suffered reduced by ${sl} until the start of your next turn`);
	if (!out.length) out.push(`recover ${sl * 2} HP @GAIN[${sl * 2} hp]`);
	return `High or Low: ${out.join('; ')}.`;
}

export const maxCards = (actor) => Math.min(5, 2 + skillLevel(actor, 'magic-cards'));

export function cardHtml(id, { sel = false, small = false, suitTypes = DEFAULT_SUIT_TYPES } = {}) {
	if (isJoker(id)) return `<span class="fucm-card joker ${sel ? 'sel' : ''} ${small ? 'sm' : ''}" data-card="${id}"><b>★</b><i>Joker</i></span>`;
	const s = SUITS[cardSuit(id)];
	return `<span class="fucm-card ${s.red ? 'red' : ''} ${sel ? 'sel' : ''} ${small ? 'sm' : ''}" data-card="${id}" data-tooltip="${esc(s.name)} · ${esc(suitTypes[cardSuit(id)])}"><b>${cardValue(id)}</b><i>${s.glyph}</i></span>`;
}

/** Magic Cards: spend 5 MP per card, discard the set, resolve one effect, draw back up */
export async function resolveSet(actor, ids, effectId) {
	const n = ids.length;
	if (n < 2 || n > maxCards(actor)) return ui.notifications.warn(`Resolve 2 to ${maxCards(actor)} cards.`);
	const cost = n * 5;
	if (mp(actor).value < cost) return ui.notifications.warn(`Not enough MP (${cost} needed).`);
	const options = setOptions(actor, ids);
	const eff = options.find((o) => o.id === effectId) ?? null;
	await actor.update({ 'system.resources.mp.value': mp(actor).value - cost });
	await discardCards(actor, ids, true);
	const s = state(actor);
	const extra = highOrLow(actor, ids, eff?.cards);
	const html = `<h3>Magic Cards${eff ? `: ${esc(eff.name)}` : ''}</h3>
		<div class="fucm-cards">${ids.map((c) => cardHtml(c, { small: true, suitTypes: s.suitTypes })).join('')}</div>
		<p>${eff ? esc(eff.text) : 'No set effect.'}</p>${eff?.inline ? `<p>${eff.inline}</p>` : ''}${extra ? `<p>${extra}</p>` : ''}
		<p class="muted">Spent ${cost} MP · drew ${n} card${n > 1 ? 's' : ''}.</p>`;
	await chat(actor, html);
	return eff;
}
