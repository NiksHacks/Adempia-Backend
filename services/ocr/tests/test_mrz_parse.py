from mrz.generator.td3 import TD3CodeGenerator

from app.mrz_parse import parse_mrz

# Build a guaranteed-valid TD3 (passport) MRZ from known fields, then parse it
# back. This validates both length handling and field extraction deterministically.
SPECIMEN = str(
    TD3CodeGenerator(
        "P",
        "UTO",
        "ARENDT",
        "HANNAH",
        "L898902C3",
        "UTO",
        "740812",  # birth date YYMMDD
        "F",
        "120415",  # expiry YYMMDD
    )
)


def test_parse_td3_specimen():
    doc = parse_mrz(SPECIMEN)
    assert doc.valid is True
    assert doc.surname == "ARENDT"
    assert doc.given_names == "HANNAH"
    assert doc.document_type.startswith("P")
    assert doc.document_number == "L898902C3"
    assert doc.nationality == "UTO"
    assert doc.issuing_country == "UTO"
    assert doc.sex == "F"
    # 740812 -> birth date in the 1900s (not the future).
    assert doc.birth_date == "1974-08-12"
    # 120415 -> expiry in the 2000s.
    assert doc.expiry_date == "2012-04-15"


def test_parse_extracts_mrz_from_noisy_text():
    noisy = "REPUBBLICA ITALIANA\nsome header noise\n" + SPECIMEN + "\nfooter line"
    doc = parse_mrz(noisy)
    assert doc.surname == "ARENDT"
    assert doc.given_names == "HANNAH"


def test_parse_tolerates_truncated_line():
    # Drop the final composite check char: still parses core fields, valid=False.
    lines = SPECIMEN.splitlines()
    truncated = lines[0] + "\n" + lines[1][:-1]
    doc = parse_mrz(truncated)
    assert doc.surname == "ARENDT"
    assert doc.birth_date == "1974-08-12"


def test_parse_rejects_non_mrz():
    try:
        parse_mrz("just a normal line\nanother line")
    except ValueError:
        return
    raise AssertionError("expected ValueError for non-MRZ text")
