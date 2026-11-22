# GENERATED, DO NOT EDIT.
# Source: policy/safe_ship.jff via `jflap_cli.py export-table`; regenerate with
#   python scripts/gen_executor_table.py
# A test fails if regenerating changes this file.

STATES = ('CLEAN', 'EDITED', 'TESTED')
SYMBOLS = ('EDIT', 'TEST', 'COMMIT', 'PUSH', 'DEPLOY')
INITIAL = 'CLEAN'
ACCEPTING = ('CLEAN', 'EDITED', 'TESTED')

# TABLE[state][symbol] = next state. Missing cell = undefined = REJECT.
TABLE = {
    'CLEAN': {'EDIT': 'EDITED', 'TEST': 'TESTED', 'COMMIT': 'CLEAN'},
    'EDITED': {'EDIT': 'EDITED', 'TEST': 'TESTED', 'COMMIT': 'EDITED'},
    'TESTED': {'EDIT': 'EDITED', 'TEST': 'TESTED', 'COMMIT': 'TESTED', 'PUSH': 'TESTED', 'DEPLOY': 'TESTED'},
}
