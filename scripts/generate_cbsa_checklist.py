#!/usr/bin/env python3
"""Generate CBSA Mailing Checklist PDF for Shana Devi GST refund claim."""

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUTPUT_PATH = "/Users/kumarsunilrai/Downloads/CBSA_Mailing_Checklist_ShanaDevi.pdf"

CHECKBOX = "\u25a1"  # □


def build_pdf(path: str) -> None:
    doc = SimpleDocTemplate(
        path,
        pagesize=letter,
        leftMargin=0.65 * inch,
        rightMargin=0.65 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.55 * inch,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title",
        parent=styles["Heading1"],
        fontSize=16,
        spaceAfter=4,
        textColor=colors.HexColor("#1a365d"),
        alignment=1,
    )
    subtitle_style = ParagraphStyle(
        "Subtitle",
        parent=styles["Normal"],
        fontSize=10,
        spaceAfter=10,
        alignment=1,
        textColor=colors.HexColor("#4a5568"),
    )
    section_style = ParagraphStyle(
        "Section",
        parent=styles["Heading2"],
        fontSize=11,
        spaceBefore=8,
        spaceAfter=4,
        textColor=colors.HexColor("#2d3748"),
        borderPadding=2,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontSize=9.5,
        leading=12,
        spaceAfter=2,
    )
    item_style = ParagraphStyle(
        "Item",
        parent=styles["Normal"],
        fontSize=9.5,
        leading=12,
        leftIndent=4,
        spaceAfter=3,
    )
    note_style = ParagraphStyle(
        "Note",
        parent=styles["Normal"],
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#4a5568"),
        spaceAfter=2,
    )
    warn_style = ParagraphStyle(
        "Warn",
        parent=styles["Normal"],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#c53030"),
        spaceBefore=4,
    )

    story = []

    story.append(Paragraph("CBSA Mailing Checklist", title_style))
    story.append(
        Paragraph("Shana Devi &mdash; GST Refund Claim (~$274.23)", subtitle_style)
    )
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#cbd5e0")))
    story.append(Spacer(1, 6))

    # Mail to
    story.append(Paragraph("Mail To", section_style))
    mail_lines = [
        "<b>CBSA Casual Refund Centre &mdash; Scarborough</b>",
        "7th Floor, Suite 718",
        "55 Town Centre Court",
        "Scarborough, ON M1P 4X4",
        "Canada",
        "Phone: 416-973-1811",
    ]
    for line in mail_lines:
        story.append(Paragraph(line, body_style))

    story.append(Spacer(1, 4))

    # Claim summary
    story.append(Paragraph("Claim Summary", section_style))
    summary_items = [
        "Claimant: <b>Shana Devi</b> &mdash; GST refund <b>$274.23</b>",
        "Import: Nov 8, 2023 &mdash; Peace Bridge &mdash; doc <b>PB000007530T</b>",
        "Export: Nov 24&ndash;25, 2025 &mdash; YYZ &rarr; Pakistan",
    ]
    for item in summary_items:
        story.append(Paragraph(f"&bull; {item}", body_style))

    story.append(Spacer(1, 4))

    # Documents checklist
    story.append(Paragraph("Documents to Include", section_style))
    checklist = [
        (
            "1.",
            "CBSA_Informal_Adjustment_Request_Filled_ShanaDevi_CORRECTED.pdf "
            "&mdash; printed, ink-signed by Shana",
        ),
        ("2.", "CBSA_Cover_Letter_ShanaDevi.pdf &mdash; printed, ink-signed"),
        ("3.", "Original or certified copy BSF715-1 (PB000007530T)"),
        ("4.", "Apple Store receipt (Oct 24, 2023, iPhone 15 Pro Max)"),
        ("5.", "Delta flight receipt (YYZ&rarr;JFK, Nov 24, 2025)"),
        (
            "6.",
            "Turkish Airlines receipt/itinerary (JFK&rarr;KHI, PNR RA8A2Q)",
        ),
        (
            "7.",
            "WhatsApp.pdf pages 6, 8, 9 &mdash; physical boarding passes "
            "(Delta DL5081, TK12, TK708)",
        ),
        ("8.", "Optional: IMEI/serial note (J6JQ9D99XV)"),
    ]

    table_data = [
        [CHECKBOX, Paragraph(text, item_style)] for _, text in checklist
    ]
    # Add row numbers
    table_data = [
        [num, CHECKBOX, Paragraph(text, item_style)]
        for (num, text) in checklist
    ]

    checklist_table = Table(table_data, colWidths=[0.3 * inch, 0.25 * inch, 6.5 * inch])
    checklist_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 1),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    story.append(checklist_table)

    story.append(Spacer(1, 4))

    # Before mailing
    story.append(Paragraph("Before Mailing", section_style))
    before_items = [
        "Shana ink-signs B2G form Part B",
        "Shana ink-signs cover letter",
        "Make copies of everything for records",
        "Use tracked international courier (DHL / FedEx / EMS)",
        "Keep tracking number",
    ]
    before_data = [
        [CHECKBOX, Paragraph(item, item_style)] for item in before_items
    ]
    before_table = Table(before_data, colWidths=[0.25 * inch, 6.8 * inch])
    before_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 1),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    story.append(before_table)

    story.append(Spacer(1, 4))

    # Notes
    story.append(Paragraph("Notes", section_style))
    notes = [
        "Refund ~$274.23 GST only (duty was $0)",
        "Email on file: SDSHANADEVI@GMAIL.COM",
        "2023&rarr;2025 export gap &mdash; cover letter explains",
    ]
    for note in notes:
        story.append(Paragraph(f"&bull; {note}", note_style))

    story.append(
        Paragraph(
            "<b>Do NOT mail until all signatures are complete.</b>",
            warn_style,
        )
    )

    doc.build(story)


if __name__ == "__main__":
    build_pdf(OUTPUT_PATH)
    print(f"Created: {OUTPUT_PATH}")
