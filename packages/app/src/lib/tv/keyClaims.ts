type KeyClaim = (event: KeyboardEvent) => boolean;

const claims: KeyClaim[] = [];

/**
 * Lets a screen handle remote keys before focus navigation sees them.
 * The newest claim goes first; returning true consumes the key.
 */
export function claimKeys(claim: KeyClaim) {
	claims.push(claim);
	return () => {
		const index = claims.indexOf(claim);
		if (index >= 0) claims.splice(index, 1);
	};
}

export function isClaimed(event: KeyboardEvent) {
	for (let index = claims.length - 1; index >= 0; index -= 1) {
		if (claims[index](event)) return true;
	}
	return false;
}
