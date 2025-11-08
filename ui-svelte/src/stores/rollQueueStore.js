import { derived, get, writable } from 'svelte/store';

export const rollQueueStore = writable([]);
export const stagedResultsStore = writable([]);
export const stagedMapStore = writable({});

const normalize = (value) => (value || '').toString().trim().toLowerCase();

const RESOLVED_STATUSES = new Set(['rolled', 'auto', 'override', 'complete']);

export function normalizeParticipantKey(value) {
	return normalize(value);
}

function makeParticipantKey(queueId, participant) {
	return `${queueId}:${normalize(participant?.participantId || participant?.id || participant?.name)}`;
}

function getCombatAction(entry) {
	return entry?.metadata?.combatAction || null;
}

function getCurrentStep(entry) {
	const action = getCombatAction(entry);
	if (!action || !Array.isArray(action.steps)) {
		return null;
	}
	const index = Number.isInteger(action.currentStepIndex) ? action.currentStepIndex : 0;
	return action.steps[index] || null;
}

function buildCombatActionSummary(entry) {
	const action = getCombatAction(entry);
	if (!action || action.kind !== 'attack') {
		return null;
	}

	const steps = Array.isArray(action.steps) ? action.steps : [];
	const attackStep = steps.find((step) => step.type === 'attack');
	const damageStep = steps.find((step) => step.type === 'damage');

	const attackerName = action.attacker?.name || entry.participants?.find?.((p) => p.entityType === 'player')?.name || entry.participants?.[0]?.name || 'Attacker';
	const attackName = action.attackName || 'attack';
	const lines = [];

	const outcome = action.outcome || null;
	if (attackStep?.result || outcome) {
		const attackResult = attackStep?.result || {};
		const total = Number.isFinite(outcome?.total) ? outcome.total : attackResult.total;
		const natural = Number.isFinite(outcome?.natural) ? outcome.natural : attackResult.natural;
		const modifier = Number.isFinite(outcome?.modifier) ? outcome.modifier : attackResult.modifier;
		const targetAC = Number.isFinite(outcome?.targetAC) ? outcome.targetAC : action.targetAC;

		let attackLine = `${attackerName} ${attackName} attack`;
		if (Number.isFinite(total)) {
			attackLine += ` ${total}`;
		}
		if (Number.isFinite(natural)) {
			const modifierText = Number.isFinite(modifier) ? (modifier >= 0 ? `+${modifier}` : `${modifier}`) : null;
			attackLine += modifierText ? ` (${natural} ${modifierText})` : ` (${natural})`;
		}
		if (Number.isFinite(targetAC)) {
			attackLine += ` vs AC ${targetAC}`;
		}
		if (outcome?.crit) {
			attackLine += ' — critical hit';
		} else if (outcome?.hit === true) {
			attackLine += ' — hit';
		} else if (outcome?.hit === false) {
			attackLine += ' — miss';
		}
		lines.push(attackLine);
	}

	if (damageStep?.result) {
		const damageFormula = damageStep.formula || damageStep.result.formula || action.damage?.formula || null;
		const damageType = damageStep.damageType || action.damage?.type || null;
		const damageTotal = damageStep.result.total;
		let damageLine = 'Damage';
		if (damageFormula) {
			damageLine += ` ${damageFormula}`;
		}
		if (Number.isFinite(damageTotal)) {
			damageLine += ` = ${damageTotal}`;
		}
		if (damageType) {
			damageLine += ` ${damageType}`;
		}
		lines.push(damageLine);
	}

	if (!lines.length) {
		return null;
	}

	return {
		summary: `${attackerName}: ${attackName}`,
		text: lines.join('\n')
	};
}

function formatRollSummary(entry, participant) {
	const combatAction = getCombatAction(entry);
	let descriptor = entry.reason || participant.notes || 'Roll';

	if (combatAction?.kind === 'attack') {
		const currentStep = getCurrentStep(entry);
		if (combatAction.awaitingDamage || (currentStep && currentStep.type === 'damage')) {
			descriptor = `Damage: ${combatAction.attackName || 'Attack'}`;
		} else {
			const targetText = Number.isFinite(combatAction.targetAC) ? ` vs AC ${combatAction.targetAC}` : '';
			descriptor = `${combatAction.attackName || 'Attack'} attack${targetText}`;
		}
		const summaryDetails = buildCombatActionSummary(entry);
		if (summaryDetails && !(combatAction.awaitingDamage || (currentStep && currentStep.type === 'damage'))) {
			descriptor = summaryDetails.summary;
		}
	} else if (combatAction?.kind === 'saving-throw') {
		const ability = combatAction.ability ? combatAction.ability.toUpperCase() : 'Save';
		const dcText = Number.isFinite(combatAction.dc) ? ` (DC ${combatAction.dc})` : '';
		descriptor = `${ability} saving throw${dcText}`;
	}

	const ability = participant.ability || entry.ability || null;
	const dcText = participant.dc || entry.dc ? ` (DC ${participant.dc ?? entry.dc})` : '';
	const abilityText = ability ? ` [${ability.toUpperCase()}]` : '';
	const entityType = (participant.entityType || '').toLowerCase();
	const tag = entityType === 'enemy'
		? '[DM-controlled]'
		: participant.entityType === 'player'
			? '[Player]'
			: '';
	return `${tag ? `${tag} ` : ''}${descriptor}${abilityText}${dcText}`.trim();
}

function formatRollResultText(entry, participant) {
	const combatSummary = buildCombatActionSummary(entry);
	if (combatSummary) {
		return combatSummary.text;
	}

	const summary = formatRollSummary(entry, participant);
	const total = participant.result?.total ?? '—';
	const natural = participant.result?.natural;
	const modifier = participant.result?.modifier;
	const modifierText =
		typeof modifier === 'number' && modifier !== 0
			? ` (${natural ?? '?'} ${modifier >= 0 ? '+' : ''}${modifier})`
			: natural !== undefined
				? ` (${natural})`
				: '';
	const outcome = participant.status === 'override' ? 'OVERRIDDEN' : `Result ${total}`;
	const combatAction = getCombatAction(entry);
	const prefix = combatAction?.attacker?.name ? combatAction.attacker.name : participant.name;
	return `${prefix} ${summary}: ${outcome}${modifierText}`;
}

export function setRollQueue(queue = []) {
	const safeQueue = Array.isArray(queue) ? queue : [];
	rollQueueStore.set(safeQueue);

	const validKeys = new Set();
	safeQueue.forEach((entry) => {
		(entry.participants || []).forEach((participant) => {
			validKeys.add(makeParticipantKey(entry.queueId, participant));
		});
	});

	stagedMapStore.update((map) => {
		const next = {};
		for (const key of Object.keys(map || {})) {
			if (validKeys.has(key)) {
				next[key] = map[key];
			}
		}
		return next;
	});

	stagedResultsStore.update((list) =>
		list.filter((item) => validKeys.has(makeParticipantKey(item.queueId, { participantId: item.participantId, name: item.participantName })))
	);
}

export function stageResultForInjection(entry, participant) {
	if (!entry || !participant) {
		return { staged: false, reason: 'Invalid roll entry' };
	}

	const key = makeParticipantKey(entry.queueId, participant);
	const stagedMap = get(stagedMapStore);

	if (stagedMap[key]) {
		return { staged: false, reason: 'Already staged' };
	}

	if (!participant.result) {
		return { staged: false, reason: 'Result not available yet' };
	}

	const combatSummary = buildCombatActionSummary(entry);
	const summary = combatSummary ? combatSummary.summary : formatRollSummary(entry, participant);
	const text = combatSummary ? combatSummary.text : formatRollResultText(entry, participant);

	stagedMapStore.update((map) => ({
		...map,
		[key]: true
	}));

	stagedResultsStore.update((items) => [
		...items,
		{
			queueId: entry.queueId,
			participantId: participant.participantId || participant.id || normalize(participant.name),
			participantName: participant.name,
			summary,
			text
		}
	]);

	return { staged: true };
}

export function removeStagedResult(queueId, participant) {
	const key = makeParticipantKey(queueId, participant);
	stagedResultsStore.update((items) =>
		items.filter(
			(item) =>
				!(item.queueId === queueId && normalize(item.participantId || item.participantName) === normalize(participant?.participantId || participant?.name))
		)
	);
	stagedMapStore.update((map) => {
		const next = { ...(map || {}) };
		delete next[key];
		return next;
	});
}

export function clearStagedResults() {
	stagedResultsStore.set([]);
	stagedMapStore.set({});
}

export function getStagedResults() {
	return get(stagedResultsStore);
}

export function buildStagedInsert(results) {
	if (!results || results.length === 0) {
		return '';
	}
	const lines = results.map((item) => `- ${item.text}`);
	return `**Queued Roll Results**\n${lines.join('\n')}`;
}

export const participantRollStatus = derived(
	[rollQueueStore, stagedMapStore],
	([$queue, $stagedMap]) => {
		const map = {};

		const ensure = (participant, entry) => {
			const key = normalize(participant.participantId || participant.id || participant.name);
			if (!key) return null;
			if (!map[key]) {
				map[key] = {
					name: participant.name || participant.id,
					participantId: participant.participantId || participant.id || null,
					pending: [],
					ready: [],
					stagedCount: 0
				};
			}
			return map[key];
		};

		($queue || []).forEach((entry) => {
			(entry.participants || []).forEach((participant) => {
				const entityType = (participant.entityType || '').toLowerCase();
				if (participant.isPlayer === false || (entityType && entityType !== 'player')) {
					return;
				}
				const bucket = ensure(participant, entry);
				if (!bucket) return;

				const status = (participant.status || '').toLowerCase();
				const detail = {
					queueId: entry.queueId,
					reason: entry.reason,
					entry,
					participant,
					status
				};

				if (status === 'pending') {
					bucket.pending.push(detail);
				} else if (RESOLVED_STATUSES.has(status)) {
					const key = makeParticipantKey(entry.queueId, participant);
					const staged = !!$stagedMap[key];
					if (staged) {
						bucket.stagedCount += 1;
					}
					bucket.ready.push({
						...detail,
						staged,
						summary: formatRollSummary(entry, participant),
						text: formatRollResultText(entry, participant)
					});
				}
			});
		});

		return map;
	}
);

export const rollSummaryList = derived(participantRollStatus, ($status) => {
	const items = [];
	Object.values($status || {}).forEach((record) => {
		record.pending.slice(0, 3).forEach((detail) => {
			items.push({
				type: 'pending',
				label: `${record.name}: ${formatRollSummary(detail.entry, detail.participant)}`,
				queueId: detail.queueId
			});
		});
		record.ready
			.filter((detail) => !detail.staged)
			.slice(0, 3)
			.forEach((detail) => {
				items.push({
					type: 'ready',
					label: `${record.name}: ${formatRollSummary(detail.entry, detail.participant)}`,
					queueId: detail.queueId,
					participant: detail.participant,
					entry: detail.entry
				});
			});
	});
	return items;
});

export function focusQueueEntry(queueId) {
	window.dispatchEvent(new CustomEvent('rollQueueFocus', { detail: { queueId } }));
}

export function stageReadyDetail(detail) {
	if (!detail) return { staged: false, reason: 'No roll detail provided' };
	return stageResultForInjection(detail.entry, detail.participant);
}
