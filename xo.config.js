// XO flat config — the single lint config (do not add a package.json#xo
// block: cosmiconfig checks package.json first and would shadow this file).
const config = [
	{
		prettier: false,
		space: 2,
		semicolon: true,
		rules: {
			'@typescript-eslint/consistent-type-definitions': 'off',
			// Tuned, not disabled: the xo-typescript default demands
			// strictCamelCase everywhere, which fights two deliberate idioms —
			// UPPER_CASE module constants (SAMPLE_RATE, QUALITY_PRESETS, …) and
			// external-API payload keys that MUST be snake_case / dotted
			// (ElevenLabs `model_id`, ECS `@timestamp` / `log.level`). Everything
			// else keeps the strict default shape.
			'@typescript-eslint/naming-convention': [
				'error',
				{
					selector: 'variable',
					modifiers: ['const'],
					format: ['strictCamelCase', 'UPPER_CASE'],
					leadingUnderscore: 'allowDouble',
					trailingUnderscore: 'allowDouble',
				},
				{
					selector: 'variable',
					format: ['strictCamelCase'],
					leadingUnderscore: 'allow',
				},
				{
					selector: 'function',
					format: ['strictCamelCase'],
				},
				{
					selector: 'parameter',
					format: ['strictCamelCase'],
					leadingUnderscore: 'allow',
				},
				{
					selector: 'typeLike',
					format: ['PascalCase'],
				},
				{
					selector: ['objectLiteralProperty', 'typeProperty', 'objectLiteralMethod'],
					format: null,
				},
				{
					selector: 'import',
					format: null,
				},
			],
			// `heroCopy`/`featureCards` switch on an open string union where the
			// default IS the undefined/unknown-vertical branch by design.
			'@typescript-eslint/switch-exhaustiveness-check': [
				'error',
				{considerDefaultExhaustiveForUnions: true},
			],
			// Sequential awaits are the recorder's core semantics: flow steps,
			// narration lines, and per-scenario cloud calls run in order on
			// purpose (determinism + API pacing). Parallelizing them would be
			// the bug.
			'no-await-in-loop': 'off',
		},
	},
	{
		files: ['tests/**/*.ts'],
		rules: {
			// Test files assert mock-call shapes (`fetchMock.mock.calls[0] as
			// unknown as [...]`) and probe JSON.parse output directly —
			// introspection the runtime types can't carry. Vitest's assertions
			// are the safety net here.
			'@typescript-eslint/no-unsafe-type-assertion': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
		},
	},
];

export default config;
