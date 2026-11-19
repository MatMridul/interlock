# GENERATED, DO NOT EDIT.
# Source: policy/finance.jff via `jflap_cli.py export-table`; regenerate with
#   python scripts/gen_executor_table.py
# A test fails if regenerating changes this file.

STATES = ('START', 'AUTHED', 'DRAFTED', 'APPROVED')
SYMBOLS = ('AUTH', 'DRAFT', 'EDIT', 'MFA', 'TRANSFER', 'CANCEL')
INITIAL = 'START'
ACCEPTING = ('START', 'AUTHED', 'DRAFTED', 'APPROVED')

# TABLE[state][symbol] = next state. Missing cell = undefined = REJECT.
TABLE = {
    'START': {'AUTH': 'AUTHED'},
    'AUTHED': {'DRAFT': 'DRAFTED'},
    'DRAFTED': {'EDIT': 'DRAFTED', 'MFA': 'APPROVED', 'CANCEL': 'AUTHED'},
    'APPROVED': {'EDIT': 'DRAFTED', 'TRANSFER': 'AUTHED', 'CANCEL': 'AUTHED'},
}
