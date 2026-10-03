"""
Merges the proposal tab exports into docs/HITTERS-Proposal.pdf.
    python scripts/merge-proposal-pdf.py <main.pdf> <player-pages.pdf> <admin-pages.pdf>
"""
import sys
import pymupdf

out = pymupdf.open()
for part in sys.argv[1:]:
    out.insert_pdf(pymupdf.open(part))
out.set_metadata({"title": "HITTERS Sports Academy — Platform Proposal", "author": "Amr Hefny", "subject": "Platform proposal"})
out.save("docs/HITTERS-Proposal.pdf", garbage=3, deflate=True)
doc = pymupdf.open("docs/HITTERS-Proposal.pdf")
print("pages", len(doc), "images", len({im[0] for p in doc for im in p.get_images()}))
