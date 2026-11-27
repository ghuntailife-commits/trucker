// Quo keys per workspace (George's, and an agent's own). Made-up keys only.
import { describe, expect, it } from 'vitest';
import { quoKeyFor, quoWorkspaces } from '../src/quo/keys';

const env = { QUO_API_KEY: 'main-api', QUO_SIGNING_KEY: 'main-sig', QUO_API_KEY_GRACIE: ' g-api ', QUO_SIGNING_KEY_GRACIE: 'g-sig', OTHER: 'x' };
describe('quo workspaces', () => {
  it('reads George and per-agent keys', () => {
    expect(quoWorkspaces(env)).toEqual([{ agent: null, apiKey: 'main-api', signing: 'main-sig' }, { agent: 'gracie', apiKey: 'g-api', signing: 'g-sig' }]);
  });
  it('sends with the agent’s own key, else George’s', () => {
    expect(quoKeyFor('gracie', env)).toBe('g-api');
    expect(quoKeyFor('austin', env)).toBe('main-api');
  });
});
