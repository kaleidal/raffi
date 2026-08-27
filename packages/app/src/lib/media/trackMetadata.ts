const ISO_639_2_LANGUAGE_CODE = /^[a-z]{3}$/;

export function outputLanguageCode(value: string | null | undefined) {
	const normalized = value?.trim().toLowerCase();
	return normalized && ISO_639_2_LANGUAGE_CODE.test(normalized)
		? normalized
		: undefined;
}
