import { MODULE_ID, chat, classLevel, enrich, esc, featureType, features, level, mp, myCharacters, num, skill, skillLevel, tokenOf } from './util.mjs';
import { DEFAULT_SUIT_TYPES, SUITS, TRAP_TYPES, cardHtml, cardSuit, discardCards, drawCards, endConflict, highOrLow, isJoker, maxCards, resolveSet, setOptions, startConflict, state } from './cards.mjs';
import { broadcastFx } from './fx.mjs';
import { activeVehicle, gm, vehicleTokens } from './gm.mjs';

const { ApplicationV2 } = foundry.applications.api;

export const CLASSES = [
	{ id: 'ace', name: 'Ace of Cards', icon: 'fa-solid fa-diamond', has: (a) => classLevel(a, 'ace-of-cards') || skill(a, 'magic-cards') },
	{ id: 'arcanist', name: 'Arcanist', icon: 'fa-solid fa-hat-wizard', has: (a) => features(a, 'arcanum').length },
	{ id: 'chanter', name: 'Chanter', icon: 'fa-solid fa-music', has: (a) => features(a, 'verse').length || features(a, 'key').length },
	{ id: 'dancer', name: 'Dancer', icon: 'fa-solid fa-person-running', has: (a) => features(a, 'dance').length },
	{ id: 'gourmet', name: 'Gourmet', icon: 'fa-solid fa-utensils', has: (a) => features(a, 'cookbook').length || features(a, 'ingredient').length },
	{ id: 'merchant', name: 'Merchant', icon: 'fa-solid fa-coins', has: (a) => classLevel(a, 'merchant') || skill(a, 'winds-of-trade') },
	{ id: 'mutant', name: 'Mutant', icon: 'fa-solid fa-dna', has: (a) => features(a, 'therioform').length },
	{ id: 'pilot', name: 'Pilot', icon: 'fa-solid fa-robot', has: (a) => features(a, 'vehicle').length },
	{ id: 'symbolist', name: 'Symbolist', icon: 'fa-solid fa-signature', has: (a) => features(a, 'symbol').length },
	{ id: 'tinkerer', name: 'Tinkerer', icon: 'fa-solid fa-gears', has: (a) => classLevel(a, 'tinkerer') || ['alchemy', 'infusions', 'magitech'].some((t) => features(a, t).length) },
	{ id: 'other', name: 'Other features', icon: 'fa-solid fa-star', has: (a) => ['psychicGift', 'magiseed', 'garden', 'invocations'].some((t) => features(a, t).length) },
];
export const classesOf = (actor) => CLASSES.filter((c) => c.has(actor));

const DMG_TYPES = ['air', 'earth', 'fire', 'ice'];
const dataOf = (item) => item?.system?.data ?? {};

/** One window for every class that needs more than a sheet: cards, arcana, vehicles, symbols, dances, cooking… */
export class ClassHub extends ApplicationV2 {
	static DEFAULT_OPTIONS = {
		id: 'fucm-hub',
		classes: ['fucm'],
		window: { title: 'Class mechanics', icon: 'fa-solid fa-diamond', resizable: true },
		position: { width: 720, height: 680 },
		actions: {
			pickTab: ClassHub.#tab,
			roll: ClassHub.#roll,
			// cards
			cardsStart: ClassHub.#cardsStart,
			cardsEnd: ClassHub.#cardsEnd,
			card: ClassHub.#card,
			resolve: ClassHub.#resolve,
			mulligan: ClassHub.#mulligan,
			trap: ClassHub.#trap,
			draw: ClassHub.#draw,
			discard: ClassHub.#discard,
			// others
			arcanum: ClassHub.#arcanum,
			therio: ClassHub.#therio,
			dance: ClassHub.#dance,
			endDance: ClassHub.#endDance,
			qty: ClassHub.#qty,
			tp: ClassHub.#tp,
			shop: () => game.modules.get('fu-shopmenu')?.api?.pickShop?.(),
			projects: () => game.modules.get('fu-projects')?.api?.open?.(),
			vehicle: ClassHub.#vehicle,
			embark: ClassHub.#embark,
			module: ClassHub.#module,
			summon: ClassHub.#summon,
			sendAway: ClassHub.#sendAway,
			tokenArt: ClassHub.#tokenArt,
			symbol: ClassHub.#symbol,
			triggerSymbol: ClassHub.#triggerSymbol,
			destroySymbol: ClassHub.#destroySymbol,
		},
	};

	constructor(actor, options = {}) {
		super(options);
		this.actor = actor ?? null;
		this.tabId = null;
		this.selected = new Set();
		this.trapType = 'attack';
	}

	get title() {
		return this.actor ? `Class mechanics: ${this.actor.name}` : 'Class mechanics';
	}

	async _renderHTML() {
		const chars = myCharacters().filter((a) => classesOf(a).length);
		if (!this.actor || !chars.includes(this.actor)) this.actor = chars.find((a) => a.isOwner && !game.user.isGM) ?? chars[0] ?? this.actor;
		const a = this.actor;
		const div = document.createElement('div');
		div.className = 'fucm-body';
		if (!a) {
			div.innerHTML = '<p class="empty">None of your characters has a class this window handles (Ace of Cards, Arcanist, Chanter, Dancer, Gourmet, Merchant, Mutant, Pilot, Symbolist, Tinkerer).</p>';
			return div;
		}
		const tabs = classesOf(a);
		if (!tabs.some((t) => t.id === this.tabId)) this.tabId = tabs[0]?.id;
		const panel = await this.#panel(this.tabId, a);
		div.innerHTML = `<header class="hh">
				<select class="who">${chars.map((c) => `<option value="${c.uuid}" ${c === a ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
				<span class="res">MP <b>${mp(a).value}</b>/${mp(a).max}</span>
				<nav>${tabs.map((t) => `<button type="button" class="${t.id === this.tabId ? 'on' : ''}" data-action="pickTab" data-tab="${t.id}"><i class="${t.icon}"></i> ${esc(t.name)}</button>`).join('')}</nav>
			</header><section class="panel p-${this.tabId}">${panel}</section>`;
		return div;
	}

	_replaceHTML(result, content) {
		content.replaceChildren(result);
	}

	_onRender() {
		const el = this.element;
		el.querySelector('.who')?.addEventListener('change', (e) => {
			this.actor = fromUuidSync(e.target.value);
			this.selected.clear();
			this.render();
		});
		el.querySelectorAll('select[data-suit]').forEach((s) =>
			s.addEventListener('change', async () => {
				const st = state(this.actor);
				st.suitTypes = { ...st.suitTypes, [s.dataset.suit]: s.value };
				await this.actor.setFlag(MODULE_ID, 'cards', st);
			}),
		);
		el.querySelector('select[name=trapType]')?.addEventListener('change', (e) => {
			this.trapType = e.target.value;
			this.render();
		});
	}

	async #panel(id, a) {
		switch (id) {
			case 'ace':
				return this.#ace(a);
			case 'arcanist':
				return this.#arcanist(a);
			case 'chanter':
				return this.#list(a, [['key', 'Keys'], ['tone', 'Tones'], ['verse', 'Verses — Perform opens the verse composer']], 'Perform');
			case 'dancer':
				return this.#dancer(a);
			case 'gourmet':
				return this.#gourmet(a);
			case 'merchant':
				return this.#merchant(a);
			case 'mutant':
				return this.#mutant(a);
			case 'pilot':
				return this.#pilot(a);
			case 'symbolist':
				return this.#symbolist(a);
			case 'tinkerer':
				return `${this.#list(a, [['alchemy', 'Alchemy'], ['infusions', 'Infusions'], ['magitech', 'Magitech']], 'Use')}${game.modules.get('fu-projects')?.active ? '<button type="button" data-action="projects"><i class="fa-solid fa-screwdriver-wrench"></i> Projects & Downtime</button>' : ''}`;
			case 'other':
				return this.#list(a, [['psychicGift', 'Psychic gifts'], ['magiseed', 'Magiseeds'], ['garden', 'Garden'], ['invocations', 'Invocations']], 'Use');
		}
		return '';
	}

	#row(item, extra = '', cls = '') {
		return `<div class="row ${cls}"><img src="${esc(item.img)}" alt=""><span class="l">${esc(item.name)}${item.system?.summary?.value ? `<small>${esc(item.system.summary.value)}</small>` : ''}</span>${extra}</div>`;
	}

	#list(a, groups, verb) {
		return groups
			.map(([type, label]) => {
				const items = features(a, type);
				if (!items.length) return '';
				return `<h3>${esc(label)}</h3>${items.map((i) => this.#row(i, `<button type="button" data-action="roll" data-item="${i.id}">${verb}</button>`)).join('')}`;
			})
			.join('');
	}

	/* ---------- Ace of Cards ---------- */

	#ace(a) {
		const s = state(a);
		const st = s.suitTypes ?? DEFAULT_SUIT_TYPES;
		this.selected = new Set([...this.selected].filter((c) => s.hand.includes(c)));
		const sel = [...this.selected];
		const sl = { magic: skillLevel(a, 'magic-cards'), mull: skillLevel(a, 'mulligan'), trap: skillLevel(a, 'trap-card') };
		const max = maxCards(a);
		const opts = sel.length >= 2 ? setOptions(a, sel) : [];
		const cost = sel.length * 5;
		const suitsEditor = Object.keys(SUITS)
			.map((k) => `<label>${SUITS[k].glyph} <select data-suit="${k}">${DMG_TYPES.map((t) => `<option value="${t}" ${st[k] === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`)
			.join('');
		if (!s.active)
			return `<p>Your deck, hand and discard pile exist during conflicts. They are dealt automatically when a combat starts, or start one now.</p>
				<button type="button" class="cta" data-action="cardsStart"><i class="fa-solid fa-shuffle"></i> Shuffle and draw 5</button>
				<h3>Suits and damage types</h3><div class="suits">${suitsEditor}</div>`;
		const trapOk = sel.length > 0 && sel.length <= sl.trap + 1 && sel.every((c) => isJoker(c) || st[cardSuit(c)] === TRAP_TYPES[this.trapType]);
		return `<div class="piles"><span>Deck <b>${s.deck.length}</b></span><span>Discard <b>${s.discard.length}</b></span>
				<div class="disc">${s.discard.slice(-8).map((c) => cardHtml(c, { small: true, suitTypes: st })).join('')}</div></div>
			<h3>Hand <small>click cards to select · ${sel.length} selected</small></h3>
			<div class="hand">${s.hand.map((c) => `<button type="button" class="cardbtn" data-action="card" data-card="${c}">${cardHtml(c, { sel: this.selected.has(c), suitTypes: st })}</button>`).join('') || '<span class="muted">Empty hand.</span>'}</div>
			<h3>Magic Cards <small>2 to ${max} cards · 5 MP each${sl.magic ? ` · SL ${sl.magic}` : ''}</small></h3>
			${
				sel.length >= 2
					? opts.length
						? `<div class="opts">${opts.map((o, i) => `<label class="opt"><input type="radio" name="eff" value="${o.id}" ${i === 0 ? 'checked' : ''}><b>${esc(o.name)}</b> <small>${esc(o.req)}</small><span>${esc(o.text)}</span></label>`).join('')}</div>`
						: '<p class="muted">These cards make no set. You can still resolve them (no effect) to cycle your hand.</p>'
					: '<p class="muted">Select at least 2 cards.</p>'
			}
			${sel.length >= 2 ? `<p class="hol">${esc(highOrLow(a, sel, opts[0]?.cards).replace(/@GAIN\[[^\]]+\]/g, ''))}</p>` : ''}
			<div class="acts">
				<button type="button" class="cta" data-action="resolve" ${sel.length < 2 || sel.length > max || mp(a).value < cost ? 'disabled' : ''}>Resolve set (${cost} MP)</button>
				${sl.mull ? `<button type="button" data-action="mulligan" ${!sel.length || sel.length > sl.mull + 1 ? 'disabled' : ''} data-tooltip="After hitting with an attack on your turn: discard up to ${sl.mull + 1} and draw as many">Mulligan</button>` : ''}
				${sl.trap ? `<span class="trap"><select name="trapType">${Object.entries(TRAP_TYPES).map(([k, t]) => `<option value="${k}" ${k === this.trapType ? 'selected' : ''}>${k} (${t})</option>`).join('')}</select><button type="button" data-action="trap" ${trapOk ? '' : 'disabled'} data-tooltip="After an enemy's action: discard up to ${sl.trap + 1} jokers or cards of the matching suit, draw as many, then you may cast a spell of up to ${sl.trap * 5} MP for free">Trap Card</button></span>` : ''}
				<span class="sp"></span>
				<button type="button" data-action="draw">Draw 1</button>
				<button type="button" data-action="discard" ${sel.length ? '' : 'disabled'}>Discard</button>
				<button type="button" data-action="cardsEnd" data-tooltip="Shuffle everything back (also happens when combat ends)">End conflict</button>
			</div>
			${skill(a, 'double-or-nothing') ? '<p class="muted">Double or Nothing: declare it before a Check; even dice count double, odd dice count as 1.</p>' : ''}
			<details><summary>Suits and damage types</summary><div class="suits">${suitsEditor}</div></details>`;
	}

	static #card(e, t) {
		const c = t.dataset.card;
		if (this.selected.has(c)) this.selected.delete(c);
		else this.selected.add(c);
		this.render();
	}
	static async #cardsStart() {
		await startConflict(this.actor);
		broadcastFx('cards', tokenOf(this.actor));
	}
	static async #cardsEnd() {
		this.selected.clear();
		await endConflict(this.actor);
	}
	static async #resolve() {
		const eff = this.element.querySelector('input[name=eff]:checked')?.value;
		const ids = [...this.selected];
		this.selected.clear();
		const res = await resolveSet(this.actor, ids, eff);
		if (res !== undefined) broadcastFx('cards', tokenOf(this.actor));
	}
	static async #mulligan() {
		const ids = [...this.selected];
		this.selected.clear();
		await discardCards(this.actor, ids, true);
		chat(this.actor, `<h3>Mulligan</h3><p>Discarded and drew ${ids.length} card${ids.length > 1 ? 's' : ''}.</p>`);
	}
	static async #trap() {
		const ids = [...this.selected];
		this.selected.clear();
		const sl = skillLevel(this.actor, 'trap-card');
		const s = state(this.actor);
		await discardCards(this.actor, ids, true);
		chat(this.actor, `<h3>Trap Card</h3><div class="fucm-cards">${ids.map((c) => cardHtml(c, { small: true, suitTypes: s.suitTypes })).join('')}</div><p>In answer to an enemy's ${esc(this.trapType)}: drew ${ids.length}. You may now perform the Spell action for free with a spell of up to ${sl * 5} total MP (you still pay its MP). Not again until the start of your next turn.</p>`);
	}
	static async #draw() {
		await drawCards(this.actor, 1);
	}
	static async #discard() {
		const ids = [...this.selected];
		this.selected.clear();
		await discardCards(this.actor, ids, false);
	}

	/* ---------- Arcanist ---------- */

	async #arcanist(a) {
		const active = a.system?.equipped?.arcanum;
		const rows = [];
		for (const i of features(a, 'arcanum')) {
			const d = dataOf(i);
			const on = i.id === active;
			rows.push(`<div class="card ${on ? 'on' : ''}">${this.#row(i, `<button type="button" class="${on ? '' : 'cta'}" data-action="arcanum" data-item="${i.id}">${on ? 'Dismiss' : 'Summon'}</button>`)}
				${d.domains ? `<div class="muted">Domains: ${esc(d.domains)}</div>` : ''}
				<details ${on ? 'open' : ''}><summary>Merge${d.enablePulse ? ', pulse' : ''} and dismiss</summary>${await enrich(d.merge)}${d.enablePulse ? `<h4>Pulse</h4>${await enrich(d.pulse)}` : ''}<h4>Dismiss</h4>${await enrich(d.dismiss)}</details></div>`);
		}
		return `<p class="muted">One arcanum at a time. Summoning posts its merge effect and plays the summoning circle; dismissing posts its dismiss effect.</p>${rows.join('')}`;
	}

	static async #arcanum(e, t) {
		const a = this.actor;
		const item = a.items.get(t.dataset.item);
		const d = dataOf(item);
		const wasActive = a.system?.equipped?.arcanum === item.id;
		const prev = !wasActive && a.system?.equipped?.arcanum ? a.items.get(a.system.equipped.arcanum) : null;
		await a.update({ 'system.equipped.arcanum': wasActive ? null : item.id });
		const tok = tokenOf(a);
		if (wasActive) {
			broadcastFx('dismiss', tok);
			chat(a, `<h3>${esc(item.name)} dismissed</h3>${d.dismiss ?? ''}`);
		} else {
			broadcastFx('summon', tok);
			chat(a, `<h3>${esc(item.name)} summoned</h3>${prev ? `<p class="muted">${esc(prev.name)} leaves.</p>` : ''}${d.merge ?? ''}`);
		}
	}

	/* ---------- Dancer ---------- */

	#dancer(a) {
		const cur = a.getFlag(MODULE_ID, 'dance');
		return `${cur ? `<div class="banner"><i class="fa-solid fa-person-running"></i> Dancing: <b>${esc(cur.name)}</b> <small>(${esc(cur.duration)})</small><button type="button" data-action="endDance">End</button></div>` : ''}
			<h3>Dances</h3>${features(a, 'dance').map((i) => this.#row(i, `<small class="muted">${esc(dataOf(i).duration ?? '')}</small><button type="button" class="cta" data-action="dance" data-item="${i.id}">Dance</button>`)).join('')}`;
	}
	static async #dance(e, t) {
		const item = this.actor.items.get(t.dataset.item);
		await item.roll?.();
		broadcastFx('dance', tokenOf(this.actor));
		const dur = dataOf(item).duration ?? 'instant';
		if (dur !== 'instant') await this.actor.setFlag(MODULE_ID, 'dance', { name: item.name, duration: dur, item: item.id });
	}
	static async #endDance() {
		await this.actor.unsetFlag(MODULE_ID, 'dance');
	}

	/* ---------- Gourmet ---------- */

	#gourmet(a) {
		const ing = features(a, 'ingredient');
		const tastes = {};
		for (const i of ing) tastes[dataOf(i).taste] = (tastes[dataOf(i).taste] ?? 0) + num(dataOf(i).quantity);
		return `<div class="chips">${Object.entries(tastes).map(([k, v]) => `<span class="chip">${esc(k)} <b>${v}</b></span>`).join('') || '<span class="muted">No ingredients.</span>'}</div>
			${features(a, 'cookbook').map((i) => this.#row(i, `<button type="button" class="cta" data-action="roll" data-item="${i.id}">Cook</button>`)).join('')}
			<h3>Ingredients</h3>${ing.map((i) => this.#row(i, `<small class="muted">${esc(dataOf(i).taste)}</small><button type="button" data-action="qty" data-item="${i.id}" data-n="-1">−</button><b class="q">${num(dataOf(i).quantity)}</b><button type="button" data-action="qty" data-item="${i.id}" data-n="1">+</button>`)).join('')}`;
	}
	static async #qty(e, t) {
		const item = this.actor.items.get(t.dataset.item);
		await item.update({ 'system.data.quantity': Math.max(0, num(dataOf(item).quantity) + num(t.dataset.n)) });
	}

	/* ---------- Merchant ---------- */

	#merchant(a) {
		const w = skill(a, 'winds-of-trade');
		const cur = num(w?.system?.rp?.current);
		const sl = num(w?.system?.level?.value, 1);
		const max = num(w?.system?.rp?.max) || sl + 3;
		return `${w ? `<div class="big"><span>Trade Points</span><b>${cur}</b><small>/ ${max}</small><button type="button" data-action="tp" data-n="-1">−</button><button type="button" data-action="tp" data-n="1">+</button>
				<button type="button" data-action="tp" data-n="${sl + 1}" data-tooltip="After resting where commerce is possible">Rested (+${sl + 1})</button>
				<button type="button" class="cta" data-action="tp" data-n="-2" ${cur < 2 ? 'disabled' : ''} data-tooltip="Non-conflict scenes only">Spend 2</button></div>
			<p class="muted">Winds of Trade (SL ${sl}): gain ${sl + 1} after resting where commerce is possible (never more than ${sl + 3}). In a non-conflict scene, spend 2 to create a material or rare item the GM approves, worth up to ${level(a) * 30} zenit, or a nearby NPC contact (the GM says what they want in exchange).</p>` : '<p class="muted">No Winds of Trade skill.</p>'}
			${game.modules.get('fu-shopmenu')?.active ? '<button type="button" class="cta" data-action="shop"><i class="fa-solid fa-store"></i> Shops</button>' : ''}
			${this.#list(a, [], '')}`;
	}
	static async #tp(e, t) {
		const w = skill(this.actor, 'winds-of-trade');
		if (!w) return;
		const max = num(w.system?.rp?.max) || num(w.system?.level?.value, 1) + 3;
		const n = num(t.dataset.n);
		const now = Math.max(0, Math.min(max, num(w.system?.rp?.current) + n));
		await w.update({ 'system.rp.current': now });
		if (n === -2) chat(this.actor, `<h3>Winds of Trade</h3><p>${esc(this.actor.name)} spends 2 Trade Points (${now} left): a material or rare item worth up to ${level(this.actor) * 30} zenit, or a useful contact nearby.</p>`);
	}

	/* ---------- Mutant ---------- */

	#mutant(a) {
		const active = a.system?.equipped?.therioforms ?? [];
		return `<p class="muted">Theriomorphosis: switch forms on and off; the token flashes on every change.</p>${features(a, 'therioform')
			.map((i) => `<div class="card ${active.includes(i.id) ? 'on' : ''}">${this.#row(i, `<button type="button" class="${active.includes(i.id) ? '' : 'cta'}" data-action="therio" data-item="${i.id}">${active.includes(i.id) ? 'Revert' : 'Transform'}</button>`)}</div>`)
			.join('')}`;
	}
	static async #therio(e, t) {
		const a = this.actor;
		const item = a.items.get(t.dataset.item);
		const list = [...(a.system?.equipped?.therioforms ?? [])];
		const on = !list.includes(item.id);
		await a.update({ 'system.equipped.therioforms': on ? [...list, item.id] : list.filter((x) => x !== item.id) });
		broadcastFx('transform', tokenOf(a));
		if (on) chat(a, `<h3>${esc(a.name)} takes the ${esc(item.name)} form</h3>${dataOf(item).description ?? ''}`);
	}

	/* ---------- Pilot ---------- */

	#pilot(a) {
		const v = a.system?.vehicle ?? {};
		const active = activeVehicle(a);
		const embarked = !!v.embarked;
		const onMap = vehicleTokens(a).length > 0;
		const listRefs = (arr) => (arr ?? []).map((x) => (typeof x === 'function' ? x() : x)).filter(Boolean);
		const weapons = listRefs(v.weapons);
		const supports = listRefs(v.supports);
		const armor = typeof v.armor === 'function' ? v.armor() : v.armor;
		const vehicles = features(a, 'vehicle')
			.map((i) => {
				const on = i === active || i.id === active?.id;
				return `<div class="card ${on ? 'on' : ''}">${this.#row(i, `<small class="muted">${esc(dataOf(i).frame)}</small><button type="button" class="${on ? '' : 'cta'}" data-action="vehicle" data-item="${i.id}">${on ? 'Deactivate' : 'Activate'}</button>`)}</div>`;
			})
			.join('');
		const mod = (type, label) =>
			features(a, type)
				.map((i) => {
					const on = weapons.some((x) => x.id === i.id) || supports.some((x) => x.id === i.id) || armor?.id === i.id;
					return this.#row(i, `<small class="muted">${label}</small><button type="button" class="${on ? 'on' : ''}" data-action="module" data-type="${type}" data-item="${i.id}" ${active ? '' : 'disabled'}>${on ? 'Equipped' : 'Equip'}</button>`);
				})
				.join('');
		return `${
			active
				? `<div class="banner"><img src="${esc(active.getFlag(MODULE_ID, 'tokenImg') || active.img)}" alt=""><div><b>${esc(active.name)}</b><small>${esc(dataOf(active).frame)} · ${embarked ? 'embarked' : 'not embarked'}${onMap ? ' · on the map' : ''}</small></div><span class="sp"></span>
				<button type="button" class="cta" data-action="embark">${embarked ? 'Disembark' : 'Embark'}</button>
				${onMap ? '<button type="button" data-action="sendAway">Send away</button>' : '<button type="button" data-action="summon" data-tooltip="Put the vehicle token on the map, with its summoning animation">Put on the map</button>'}
				<button type="button" data-action="tokenArt" data-tooltip="Token image for this vehicle"><i class="fa-solid fa-image"></i></button></div>
				<p class="muted">While embarked the vehicle rides under ${esc(a.name)}'s token and follows it. Mechs take 2×2 squares.</p>`
				: '<p class="muted">Activate a vehicle first.</p>'
		}
			<h3>Vehicles</h3>${vehicles}
			<h3>Modules</h3>${mod('weaponModule', 'weapon')}${mod('armorModule', 'armor')}${mod('supportModule', 'support')}`;
	}
	static async #vehicle(e, t) {
		const a = this.actor;
		const item = a.items.get(t.dataset.item);
		await a.update({ 'system.vehicle': a.system.vehicle.updateActiveVehicle(item) });
	}
	static async #embark() {
		const a = this.actor;
		await a.update({ 'system.vehicle': a.system.vehicle.updateEmbarked() });
	}
	static async #module(e, t) {
		const a = this.actor;
		const item = a.items.get(t.dataset.item);
		const fn = { weaponModule: 'updateActiveWeaponModules', armorModule: 'updateActiveArmorModule', supportModule: 'updateActiveSupportModules' }[t.dataset.type];
		if (typeof a.system.vehicle[fn] !== 'function') return ui.notifications.warn('Use the character sheet for this module.');
		await a.update({ 'system.vehicle': a.system.vehicle[fn](item) });
	}
	static async #summon() {
		const res = await gm('summonVehicle', { actor: this.actor.uuid, item: activeVehicle(this.actor)?.id });
		if (res?.message) ui.notifications.warn(res.message);
		this.render();
	}
	static async #sendAway() {
		await gm('dismissVehicle', { actor: this.actor.uuid });
		this.render();
	}
	static async #tokenArt() {
		const item = activeVehicle(this.actor);
		if (!item) return;
		const FP = foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
		new FP({ type: 'image', current: item.getFlag(MODULE_ID, 'tokenImg') || item.img, callback: (path) => item.setFlag(MODULE_ID, 'tokenImg', path) }).render(true);
	}

	/* ---------- Symbolist ---------- */

	#symbolist(a) {
		const inscribed = [];
		for (const t of canvas.scene?.tokens ?? []) {
			for (const ef of t.actor?.effects ?? []) {
				const f = ef.getFlag(MODULE_ID, 'symbol');
				if (f?.by === a.uuid) inscribed.push({ t, ef, f });
			}
		}
		const targets = [...game.user.targets].map((t) => t.name).join(', ');
		return `<p class="muted">Apply a symbol to your targets (${targets ? esc(targets) : 'none: it goes on you'}). A creature bears one symbol at a time; a new one destroys the old.</p>
			<h3>Symbols</h3>${features(a, 'symbol').map((i) => this.#row(i, `<button type="button" class="cta" data-action="symbol" data-item="${i.id}">Apply</button>`)).join('')}
			<h3>On the map</h3>${
				inscribed.map(({ t, ef, f }) => `<div class="row"><img src="${esc(ef.img)}" alt=""><span class="l">${esc(f.name)}<small>on ${esc(t.name)}</small></span><button type="button" data-action="triggerSymbol" data-effect="${ef.uuid}">Trigger</button><button type="button" data-action="destroySymbol" data-effect="${ef.uuid}">Destroy</button></div>`).join('') ||
				'<p class="muted">None of your symbols are on this scene.</p>'
			}`;
	}
	static async #symbol(e, t) {
		const a = this.actor;
		const targets = [...game.user.targets].map((tk) => tk.document.uuid);
		if (!targets.length) {
			const own = tokenOf(a);
			if (own) targets.push(own.document.uuid);
		}
		if (!targets.length) return ui.notifications.warn('Target someone, or put your token on the map.');
		const item = a.items.get(t.dataset.item);
		await gm('applySymbol', { actor: a.uuid, item: item.id, targets });
		chat(a, `<h3>Symbol of ${esc(item.name.replace(/^Symbol of /i, ''))}</h3><p>Applied to ${esc([...game.user.targets].map((x) => x.name).join(', ') || a.name)}.</p>${dataOf(item).description ?? ''}`);
		this.render();
	}
	static async #triggerSymbol(e, t) {
		const ef = await fromUuid(t.dataset.effect);
		if (!ef) return;
		chat(this.actor, `<h3>${esc(ef.name)} triggers</h3><p>On ${esc(ef.parent?.name)}.</p>${ef.description ?? ''}`);
		await gm('destroySymbol', { actor: this.actor.uuid, effect: ef.uuid });
		this.render();
	}
	static async #destroySymbol(e, t) {
		await gm('destroySymbol', { actor: this.actor.uuid, effect: t.dataset.effect });
		this.render();
	}

	/* ---------- shared ---------- */

	static #tab(e, t) {
		this.tabId = t.dataset.tab;
		this.selected.clear();
		this.render();
	}
	static async #roll(e, t) {
		const item = this.actor.items.get(t.dataset.item);
		if (!item) return;
		await item.roll?.();
		const kind = { verse: 'song', alchemy: 'transform', infusions: 'summon', magitech: 'vehicle' }[featureType(item)];
		if (kind) broadcastFx(kind, tokenOf(this.actor));
	}
}
