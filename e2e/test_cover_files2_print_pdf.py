import io

import pytest
from pypdf import PdfReader

from e2e.files2_support import click_button, dialog_open, downloads, scene, set_field, steady

PAPERS = [("a4", (595.44, 841.68), (2481, 3507)), ("letter", (612.0, 792.0), (2550, 3300))]


@pytest.mark.parametrize("paper,media,pixels", PAPERS, ids=[p[0] for p in PAPERS])
@steady
def test_print_dialog_save_as_pdf_makes_one_page_of_the_chosen_paper_size_at_300_dpi(page, tmp_path, paper, media, pixels):
    scene(page)
    dialog_open(page, "print")
    set_field(page, "Paper size", paper)
    set_field(page, "Corner Crop Marks", True)
    click_button(page, "Save as PDF")
    name, data = downloads(page, 1, 60000)[0]
    assert name.endswith(".pdf") and data[:5] == b"%PDF-"
    pdf = PdfReader(io.BytesIO(data))
    assert len(pdf.pages) == 1
    box = pdf.pages[0].mediabox
    assert abs(float(box.width) - media[0]) < 0.1 and abs(float(box.height) - media[1]) < 0.1
    images = list(pdf.pages[0].images)
    assert len(images) == 1 and images[0].image.size == pixels
