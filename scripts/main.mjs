import { MODULE_ID, SOCKET, classLevel, skill } from './util.mjs';
import { ClassHub, classesOf } from './hub.mjs';
import { endConflict, startConflict } from './cards.mjs';
import { onFxSocket, playFx, popIn } from './fx.mjs';
import { installVehicleHooks, onGmSocket } from './gm.mjs';

let hub = null;
function open(actor) {
	if (!hub) hub = new ClassHub(actor);
	else if (actor) hub.actor = actor;
	hub.render({ force: true });
	return hub;
}
const rerender = (actor) => {
	if (hub?.rendered && (!actor || actor === hub.actor)) hub.render();
};
const isAce = (a) => a?.type === 'character' && (classLevel(a, 'ace-of-cards') || skill(a, 'magic-cards'));

Hooks.once('init', () => {
	const reg = (key, d) => game.settings.register(MODULE_ID, key, { config: true, ...d });
	reg('animations', { name: 'Class animations', hint: 'Summoning circles, transformations, vehicle arrivals, symbols, dances and card sets on the map.', scope: 'client', type: Boolean, default: true });
	reg('autoCards', { name: 'Ace of Cards: deal at combat start', hint: 'Shuffle and draw 5 when a combat starts; shuffle everything back when it ends.', scope: 'world', type: Boolean, default: true });
	reg('autoPlace', { name: 'Pilot: place the vehicle when embarking', hint: 'Embarking puts the vehicle token under the pilot (with its animation) and it follows the pilot around.', scope: 'world', type: Boolean, default: true });
	reg('autoDismiss', { name: 'Pilot: remove the vehicle when deactivated', scope: 'world', type: Boolean, default: true });
	game.modules.get(MODULE_ID).api = { open, playFx };
	installVehicleHooks();
});

Hooks.once('ready', () => {
	game.socket.on(SOCKET, (msg) => {
		if (msg?.type === 'fx') return onFxSocket(msg);
		if (msg?.type === 'popIn') return msg.sceneId === canvas.scene?.id && popIn(msg.tokenId);
		onGmSocket(msg);
	});
});

/* Ace of Cards: the deck exists only during conflicts */
Hooks.on('combatStart', (combat) => {
	if (!game.users.activeGM?.isSelf || game.settings.get(MODULE_ID, 'autoCards') === false) return;
	for (const c of combat.combatants) if (isAce(c.actor)) startConflict(c.actor);
});
Hooks.on('deleteCombat', (combat) => {
	if (!game.users.activeGM?.isSelf || game.settings.get(MODULE_ID, 'autoCards') === false) return;
	for (const c of combat.combatants) if (isAce(c.actor)) endConflict(c.actor);
});

Hooks.on('updateActor', (actor) => rerender(actor));
for (const h of ['createItem', 'updateItem', 'deleteItem']) Hooks.on(h, (item) => rerender(item.parent));
for (const h of ['createActiveEffect', 'deleteActiveEffect', 'createToken', 'deleteToken', 'targetToken']) Hooks.on(h, () => rerender());

/* Character sheet header and token controls */
Hooks.on('getHeaderControlsApplicationV2', (app, controls) => {
	const actor = app.document;
	if (!(actor instanceof Actor) || actor.type !== 'character' || !classesOf(actor).length) return;
	controls.push({ icon: 'fa-solid fa-diamond', label: 'Class mechanics', action: 'fucmOpen', onClick: () => open(actor) });
});
Hooks.on('getSceneControlButtons', (controls) => {
	try {
		const tokens = controls.tokens ?? controls.token;
		if (tokens?.tools && !Array.isArray(tokens.tools)) tokens.tools.fucmHub = { name: 'fucmHub', title: 'Class mechanics', icon: 'fa-solid fa-diamond', button: true, order: 63, visible: true, onChange: () => open(canvas.tokens?.controlled?.[0]?.actor) };
	} catch (err) {
		console.warn(`${MODULE_ID} | scene control`, err);
	}
});
