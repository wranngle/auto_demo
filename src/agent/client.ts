// Shared Anthropic SDK client factory. Concentrating runtime SDK coupling
// here (instead of scattering `new Anthropic(...)` calls across commands)
// keeps the auth-cascade as the single source of truth and satisfies the
// architectural guard in tests/architecture.test.ts.
import Anthropic from '@anthropic-ai/sdk';
import type {AnthropicAuth} from '../oauth.js';

export function createAnthropicClient(auth: AnthropicAuth): Anthropic {
  if (auth.authToken) {
    return new Anthropic({
      authToken: auth.authToken,
      defaultHeaders: {'anthropic-beta': 'oauth-2025-04-20'},
    });
  }
  return new Anthropic({apiKey: auth.apiKey});
}
