export const MODULE_ID = 'fu-class-mechanics';
export const SOCKET = `module.${MODULE_ID}`;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const num = (v, d = 0) => {
	const n = Number(v);
	return Number.isFinite(n) ? n : d;
};
export const setting = (key) => {
	try {
		return game.settings.get(MODULE_ID, key);
	} catch {
		return undefined;
	}
};

/**
 * Project FU class feature subtype, e.g. "projectfu.vehicle" → "vehicle".
 * Project FU 4.x keeps it in system.featureType (data.type can be the feature's own field, e.g. a weapon
 * module's "melee"); 5.x moved it to system.data.type.
 */
export const featureType = (item) => String(item?.system?.featureType ?? item?._source?.system?.featureType ?? item?._source?.system?.data?.type ?? item?.system?.data?.type ?? '').replace(/^projectfu\./, '');
export const features = (actor, type) => (actor?.items?.contents ?? []).filter((i) => i.type === 'classFeature' && featureType(i) === type);
export const classLevel = (actor, fuid) => {
	const c = (actor?.items?.contents ?? []).find((i) => i.type === 'class' && (i.system?.fuid === fuid || i.name.toLowerCase() === fuid));
	return c ? num(c.system?.level?.value, 1) : 0;
};
export const skill = (actor, fuid) => (actor?.items?.contents ?? []).find((i) => i.type === 'skill' && i.system?.fuid === fuid) ?? null;
export const skillLevel = (actor, fuid) => {
	const s = skill(actor, fuid);
	return s ? num(s.system?.level?.value, 1) : 0;
};
export const level = (actor) => num(actor?.system?.level?.value, 1);
export const mp = (actor) => ({ value: num(actor?.system?.resources?.mp?.value), max: num(actor?.system?.resources?.mp?.max) });

export function tokenOf(actor) {
	if (!actor || !canvas?.ready) return null;
	return actor.getActiveTokens(true)[0] ?? null;
}

export async function enrich(html) {
	const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
	return TE.enrichHTML(html ?? '', { async: true });
}

export function chat(actor, html, flavor = '') {
	return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flavor, content: `<div class="fucm-chat">${html}</div>` });
}

/** Characters the user plays (the GM: every character on the canvas or in the party) */
export function myCharacters() {
	const all = game.actors.filter((a) => a.type === 'character');
	return game.user.isGM ? all.filter((a) => a.hasPlayerOwner || tokenOf(a)) : all.filter((a) => a.isOwner);
}
