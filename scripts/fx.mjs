import { SOCKET, setting } from './util.mjs';

/**
 * Small canvas animations drawn with PIXI (no assets): a summoning circle, a transformation flash,
 * a glyph for symbols, sparkles for dances, a card burst. Played on every client.
 */
const STYLES = {
	summon: { color: 0xb48cff, rings: 3, rays: 12, glyph: '✦', dur: 1600 },
	dismiss: { color: 0x8a7bb0, rings: 2, rays: 0, glyph: '', dur: 900, inward: true },
	vehicle: { color: 0x5aa9ff, rings: 3, rays: 16, glyph: '⚙', dur: 1700 },
	vehicleOut: { color: 0x5aa9ff, rings: 2, rays: 0, glyph: '', dur: 900, inward: true },
	transform: { color: 0x6be3a0, rings: 2, rays: 20, glyph: '', dur: 1200, flash: true },
	symbol: { color: 0xf2c45a, rings: 1, rays: 0, glyph: '✧', dur: 1400 },
	dance: { color: 0xff8ad8, rings: 1, rays: 0, glyph: '♪', dur: 1500, sparkles: 18 },
	cards: { color: 0xf2c45a, rings: 1, rays: 8, glyph: '♠', dur: 1300, sparkles: 10 },
	song: { color: 0x7fd6ff, rings: 2, rays: 0, glyph: '♫', dur: 1500, sparkles: 12 },
};

export function playFx(kind, tokenId, color) {
	if (setting('animations') === false || !canvas?.ready) return;
	const token = canvas.tokens.get(tokenId);
	if (!token) return;
	const st = { ...(STYLES[kind] ?? STYLES.summon) };
	if (color) st.color = color;
	const c = new PIXI.Container();
	c.position.set(token.center.x, token.center.y);
	const size = Math.max(token.w, token.h);
	const g = new PIXI.Graphics();
	c.addChild(g);
	let label = null;
	if (st.glyph) {
		label = new PIXI.Text(st.glyph, { fontSize: size * 0.6, fill: st.color, fontWeight: 'bold', dropShadow: true, dropShadowColor: st.color, dropShadowBlur: 12, dropShadowDistance: 0 });
		label.anchor.set(0.5);
		c.addChild(label);
	}
	const sparks = Array.from({ length: st.sparkles ?? 0 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random() * 0.3 + 0.2, s: Math.random() * 0.6 + 0.6 }));
	(canvas.interface ?? canvas.stage).addChild(c);
	const t0 = performance.now();
	const tick = () => {
		const k = Math.min(1, (performance.now() - t0) / st.dur);
		const e = st.inward ? 1 - k : k;
		g.clear();
		const alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
		for (let i = 0; i < st.rings; i++) {
			const rk = Math.max(0, Math.min(1, e * 1.3 - i * 0.15));
			g.lineStyle(3 - i * 0.6, st.color, alpha * (1 - i * 0.2));
			g.drawCircle(0, 0, size * (0.4 + rk * (0.5 + i * 0.25)));
		}
		if (st.rays) {
			g.lineStyle(2, st.color, alpha * 0.8);
			for (let i = 0; i < st.rays; i++) {
				const a = (i / st.rays) * Math.PI * 2 + k * 1.2;
				const r0 = size * 0.5 * e;
				const r1 = size * (0.55 + 0.6 * e);
				g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
				g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
			}
		}
		if (st.flash) {
			g.beginFill(0xffffff, Math.max(0, 0.6 - k) * 0.9);
			g.drawCircle(0, 0, size * 0.6);
			g.endFill();
		}
		for (const p of sparks) {
			const r = size * (p.r + k * p.s);
			g.beginFill(st.color, alpha);
			g.drawCircle(Math.cos(p.a + k * 2) * r, Math.sin(p.a + k * 2) * r - k * size * 0.4, 3);
			g.endFill();
		}
		if (label) {
			label.alpha = alpha;
			label.scale.set(0.6 + e * 0.6);
			label.y = -size * 0.2 * k;
		}
		if (k >= 1) {
			canvas.app.ticker.remove(tick);
			c.destroy({ children: true });
		}
	};
	canvas.app.ticker.add(tick);
}

/** Play on every client viewing the token's scene (token: a Token, a TokenDocument or a token id on this scene) */
export function broadcastFx(kind, token, color) {
	const id = token?.id ?? token;
	if (!id) return;
	const sceneId = token?.parent?.id ?? token?.document?.parent?.id ?? canvas.scene?.id;
	if (sceneId === canvas.scene?.id) playFx(kind, id, color);
	game.socket.emit(SOCKET, { type: 'fx', kind, tokenId: id, sceneId, color });
}

export function onFxSocket(msg) {
	if (msg?.type === 'fx' && msg.sceneId === canvas.scene?.id) playFx(msg.kind, msg.tokenId, msg.color);
}

/** Fade a freshly placed token in (scale + alpha) */
export function popIn(tokenId) {
	const t = canvas.tokens?.get(tokenId);
	if (!t?.mesh) return;
	const t0 = performance.now();
	const base = { x: t.mesh.scale.x, y: t.mesh.scale.y };
	const tick = () => {
		const k = Math.min(1, (performance.now() - t0) / 700);
		const e = 1 - Math.pow(1 - k, 3);
		if (!t.mesh) return canvas.app.ticker.remove(tick);
		t.mesh.alpha = e;
		t.mesh.scale.set(base.x * (0.3 + 0.7 * e), base.y * (0.3 + 0.7 * e));
		if (k >= 1) {
			t.mesh.scale.set(base.x, base.y);
			canvas.app.ticker.remove(tick);
		}
	};
	canvas.app.ticker.add(tick);
}
