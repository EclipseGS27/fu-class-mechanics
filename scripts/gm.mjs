import { MODULE_ID, SOCKET, setting } from './util.mjs';
import { broadcastFx } from './fx.mjs';

/**
 * Things players can't do on their own (create actors and tokens, put effects on other creatures)
 * run on the active GM.
 */
const pending = new Map();
let seq = 0;

export async function gm(op, payload = {}) {
	if (game.users.activeGM?.isSelf || (game.user.isGM && !game.users.activeGM)) return execute(op, payload, game.user.id);
	if (!game.users.activeGM) {
		ui.notifications.warn('A GM needs to be online for that.');
		return { ok: false };
	}
	const reqId = `${game.user.id}.${++seq}`;
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			pending.delete(reqId);
			resolve({ ok: false, message: 'The GM did not answer.' });
		}, 15000);
		pending.set(reqId, (r) => {
			clearTimeout(timer);
			resolve(r);
		});
		game.socket.emit(SOCKET, { type: 'gm', op, payload, reqId, userId: game.user.id });
	});
}

export function onGmSocket(msg) {
	if (msg?.type === 'gm' && game.users.activeGM?.isSelf) execute(msg.op, msg.payload, msg.userId).then((res) => game.socket.emit(SOCKET, { type: 'gmResult', reqId: msg.reqId, userId: msg.userId, res }));
	else if (msg?.type === 'gmResult' && msg.userId === game.user.id) {
		pending.get(msg.reqId)?.(msg.res);
		pending.delete(msg.reqId);
	}
}

async function execute(op, p, userId) {
	try {
		const user = game.users.get(userId);
		const actor = p.actor ? await fromUuid(p.actor) : null;
		if (actor && !user.isGM && !actor.testUserPermission(user, 'OWNER')) return { ok: false, message: 'Not your character.' };
		const fn = OPS[op];
		return fn ? await fn(actor, p, user) : { ok: false };
	} catch (err) {
		console.error(`${MODULE_ID} | ${op}`, err);
		return { ok: false, message: err.message };
	}
}

/* ---------- Pilot: the vehicle on the map ---------- */

const FRAME_SIZE = { exoskeleton: 1, mech: 2, steed: 1 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Project FU keeps the active vehicle (and modules) as embedded item references */
export function activeVehicle(pilot) {
	const v = pilot?.system?.vehicle?.vehicle;
	return (typeof v === 'function' ? v() : v) ?? null;
}

export function vehicleTokens(pilot, scene = canvas.scene) {
	return (scene?.tokens?.contents ?? []).filter((t) => t.actor?.getFlag(MODULE_ID, 'vehicleOf')?.pilot === pilot.uuid);
}

async function vehicleActor(pilot, item) {
	let a = game.actors.find((x) => x.getFlag(MODULE_ID, 'vehicleOf')?.pilot === pilot.uuid && x.getFlag(MODULE_ID, 'vehicleOf')?.item === item.id);
	const size = FRAME_SIZE[item.system?.data?.frame] ?? 1;
	const img = item.getFlag(MODULE_ID, 'tokenImg') || item.img;
	if (a) {
		if (a.img !== img || a.prototypeToken.width !== size) await a.update({ img, 'prototypeToken.texture.src': img, 'prototypeToken.width': size, 'prototypeToken.height': size });
		return a;
	}
	let folder = game.folders.find((f) => f.type === 'Actor' && f.getFlag(MODULE_ID, 'vehicles'));
	folder ??= await Folder.create({ name: 'Pilot vehicles', type: 'Actor', flags: { [MODULE_ID]: { vehicles: true } } });
	const ownership = foundry.utils.deepClone(pilot.ownership);
	return Actor.create({
		name: `${item.name} (${pilot.name})`,
		type: 'npc',
		img,
		folder: folder.id,
		ownership,
		prototypeToken: { name: item.name, texture: { src: img }, width: size, height: size, actorLink: true, disposition: pilot.prototypeToken.disposition, displayName: 30 },
		flags: { [MODULE_ID]: { vehicleOf: { pilot: pilot.uuid, item: item.id } } },
	});
}

/** Where the vehicle goes: under the pilot when embarked, beside them otherwise */
function placeFor(pilotToken, size, embarked) {
	const g = canvas.grid.size;
	if (embarked) return { x: pilotToken.x - ((size - pilotToken.width) * g) / 2, y: pilotToken.y - ((size - pilotToken.height) * g) / 2 };
	return { x: pilotToken.x + pilotToken.width * g, y: pilotToken.y };
}

const OPS = {
	async summonVehicle(pilot, p) {
		const item = pilot.items.get(p.item) ?? activeVehicle(pilot);
		if (!item) return { ok: false, message: 'No active vehicle.' };
		const pt = pilot.getActiveTokens(false, true)[0];
		if (!pt) return { ok: false, message: `${pilot.name} has no token on this scene.` };
		const scene = pt.parent;
		const va = await vehicleActor(pilot, item);
		const embarked = !!pilot.system?.vehicle?.embarked;
		const size = va.prototypeToken.width;
		const pos = placeFor(pt, size, embarked);
		const existing = vehicleTokens(pilot, scene);
		if (existing.length) {
			await existing[0].update(pos);
			return { ok: true };
		}
		const tokenData = (await va.getTokenDocument({ ...pos, sort: Math.max(0, num(pt.sort) - 1), elevation: pt.elevation })).toObject();
		const [doc] = await scene.createEmbeddedDocuments('Token', [tokenData]);
		await sleep(50);
		game.socket.emit(SOCKET, { type: 'popIn', tokenId: doc.id, sceneId: scene.id });
		if (scene.id === canvas.scene?.id) (await import('./fx.mjs')).popIn(doc.id);
		broadcastFx('vehicle', doc);
		return { ok: true };
	},

	async dismissVehicle(pilot) {
		const pt = pilot.getActiveTokens(false, true)[0];
		for (const t of vehicleTokens(pilot, pt?.parent ?? canvas.scene)) {
			broadcastFx('vehicleOut', t);
			await sleep(600);
			await t.delete();
		}
		return { ok: true };
	},

	/** Move the vehicle to its pilot. `at` is where the pilot's token is going (Foundry 13 moves tokens over time) */
	async followPilot(pilot, p = {}) {
		const doc = p.token ?? pilot.getActiveTokens(false, true)[0];
		if (!doc) return { ok: false };
		const pt = { x: p.at?.x ?? doc.x, y: p.at?.y ?? doc.y, width: doc.width, height: doc.height };
		const embarked = !!pilot.system?.vehicle?.embarked;
		for (const t of vehicleTokens(pilot, doc.parent)) await t.update(placeFor(pt, t.width, embarked), { fucmFollow: true });
		return { ok: true };
	},

	/* ---------- Symbolist ---------- */

	async applySymbol(symbolist, p) {
		const item = symbolist.items.get(p.item);
		if (!item) return { ok: false };
		for (const uuid of p.targets) {
			const target = await fromUuid(uuid);
			const actor = target?.actor ?? target;
			if (!actor) continue;
			// a creature bears one symbol at a time: any older one is destroyed
			const old = actor.effects.filter((e) => e.getFlag(MODULE_ID, 'symbol'));
			if (old.length) await actor.deleteEmbeddedDocuments('ActiveEffect', old.map((e) => e.id));
			await actor.createEmbeddedDocuments('ActiveEffect', [
				{
					name: `Symbol: ${item.name}`,
					img: item.img,
					description: item.system?.data?.description ?? '',
					origin: item.uuid,
					flags: { [MODULE_ID]: { symbol: { by: symbolist.uuid, item: item.id, name: item.name } } },
				},
			]);
			const tok = target?.documentName === 'Token' ? target : actor.getActiveTokens(false, true)[0];
			if (tok) broadcastFx('symbol', tok);
		}
		return { ok: true };
	},

	async destroySymbol(symbolist, p, user) {
		const effect = await fromUuid(p.effect);
		if (!effect) return { ok: false };
		// only symbols, and only the symbolist's own (the GM may clear any)
		const f = effect.getFlag?.(MODULE_ID, 'symbol');
		if (!f || (!user?.isGM && f.by !== symbolist?.uuid)) return { ok: false, message: 'That is not one of your symbols.' };
		const tok = effect.parent?.getActiveTokens?.(false, true)[0];
		if (tok) broadcastFx('dismiss', tok, 0xf2c45a);
		await effect.delete();
		return { ok: true };
	},
};

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/* ---------- automatic placement (active GM) ---------- */

export function installVehicleHooks() {
	Hooks.on('updateActor', async (actor, changed) => {
		if (!game.users.activeGM?.isSelf || actor.type !== 'character') return;
		const v = changed.system?.vehicle;
		if (!v) return;
		if ('vehicle' in v && !v.vehicle && setting('autoDismiss') !== false) return OPS.dismissVehicle(actor);
		// switched to another vehicle while one is on the map: swap the token
		if ('vehicle' in v && v.vehicle && vehicleTokens(actor).length) {
			await OPS.dismissVehicle(actor);
			await OPS.summonVehicle(actor, {});
			return;
		}
		if ('embarked' in v) {
			if (v.embarked && setting('autoPlace') !== false) {
				await OPS.summonVehicle(actor, {});
				const t = actor.getActiveTokens(false, true)[0];
				if (t) broadcastFx('vehicle', t);
			} else if (vehicleTokens(actor).length) await OPS.followPilot(actor);
		}
	});
	Hooks.on('updateToken', (token, changed, options) => {
		if (!game.users.activeGM?.isSelf || options.fucmFollow) return;
		if (!('x' in changed || 'y' in changed)) return;
		const actor = token.actor;
		if (actor?.type !== 'character' || !actor.system?.vehicle?.embarked) return;
		if (!vehicleTokens(actor, token.parent).length) return;
		OPS.followPilot(actor, { token, at: { x: changed.x ?? token.x, y: changed.y ?? token.y } });
	});
}
