import test from 'node:test';
import assert from 'node:assert/strict';
import { canParentNode, removeFactionNode, publicFactionNodes, initialFactionPrototype } from '../src/lib/faction-prototype.ts';

const node = (id, parentId = 'root', revealed = false) => ({ id, parentId, revealed, kind: 'group', targetId: '', name: id, role: '', relation: 'part-of' });

test('structure rejects cycles, missing parents, and corrupted ancestor chains', () => {
  const nodes = [node('leader'), node('member', 'leader'), node('branch', 'member')];
  assert.equal(canParentNode(nodes, 'leader', 'branch'), false);
  assert.equal(canParentNode(nodes, 'leader', 'leader'), false);
  assert.equal(canParentNode(nodes, 'member', 'missing'), false);
  assert.equal(canParentNode(nodes, 'member', 'root'), true);
  assert.equal(canParentNode([node('a', 'b'), node('b', 'a')], 'new', 'a'), false);
});

test('removing a structural node keeps its children reachable', () => {
  const nodes = [node('branch'), node('leader', 'branch'), node('member', 'leader')];
  assert.deepEqual(removeFactionNode(nodes, 'leader').map(({ id, parentId }) => ({ id, parentId })), [
    { id: 'branch', parentId: 'root' }, { id: 'member', parentId: 'branch' },
  ]);
  assert.equal(nodes[2].parentId, 'leader');
});

test('public structure excludes hidden nodes and hidden reporting connections', () => {
  const hidden = node('secret-leader');
  const revealed = { ...node('known-member', 'secret-leader', true), relation: 'reports-to' };
  const result = publicFactionNodes([hidden, revealed]);
  assert.equal(result.length, 1);
  assert.equal(result[0].parentId, 'root');
  assert.equal(result[0].relation, 'part-of');
  assert.equal(revealed.parentId, 'secret-leader');
});

test('existing NPC affiliations seed prototype members without revealing them', () => {
  const npcs = [{ id: 'npc-1', name: 'Scout', presentation: { factions: [{ targetId: 'guild', label: 'Leader' }] } },
    { id: 'npc-2', name: 'Outsider', presentation: { factions: [] } }];
  const prototype = initialFactionPrototype('guild', npcs);
  assert.equal(prototype.known, false);
  assert.equal(prototype.nodes.length, 1);
  assert.equal(prototype.nodes[0].role, 'Leader');
  assert.equal(prototype.nodes[0].revealed, false);
});
