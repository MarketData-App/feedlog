import { strict as assert } from 'node:assert'
import { test } from 'node:test'

const { isBoardAdminRole } = await import('../app/utils/board-admin')

// Final review M3: the header's admin control and the board bar show "Board
// admin" and the Admin link by the same rule: the org's owners and managers.
test('isBoardAdminRole: owners and managers only', () => {
  assert.equal(isBoardAdminRole('owner'), true)
  assert.equal(isBoardAdminRole('manager'), true)
  for (const role of ['contributor', 'member', 'admin', '', null, undefined]) {
    assert.equal(isBoardAdminRole(role), false, String(role))
  }
})
