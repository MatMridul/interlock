"""S2 and S3 checks on an executed symbol trace (spec 4.5), as plain rules, not the table.

Kept free of test-only packages (Hypothesis) because the deployed app imports bench.race,
which judges both race arms with these. tests/props.py re-exports them for the property tests.
"""


def check_s2(t):
    """S2 on an executed symbol trace (also used by bench/race.py to judge both arms)."""
    for i, s in enumerate(t):
        if s != "TRANSFER":
            continue
        js = [j for j in range(i) if t[j] in ("DRAFT", "EDIT")]
        assert js, ("TRANSFER with no draft", t)
        j = js[-1]
        assert "MFA" in t[j + 1:i], ("TRANSFER without MFA after latest DRAFT/EDIT", t)
        assert not {"TRANSFER", "CANCEL"} & set(t[j + 1:i]), ("TRANSFER on a spent/cancelled draft", t)


def check_s3(t):
    """S3 on an executed symbol trace (also used by bench/race.py)."""
    since_draft = True  # becomes False after a TRANSFER, True again after a DRAFT
    for s in t:
        if s == "DRAFT":
            since_draft = True
        elif s == "TRANSFER":
            assert since_draft, ("second TRANSFER without DRAFT", t)
            since_draft = False
