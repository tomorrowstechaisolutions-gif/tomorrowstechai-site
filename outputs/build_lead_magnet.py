"""
Generate the TomorrowsTech AI Operations Audit Checklist PDF.
3-page lead magnet, branded with cyan accent.
"""
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

OUT_PATH = "/sessions/optimistic-kind-mayer/mnt/C:/Users/hocki/Documents/03 - Projects/tomorrowstechai-site/public/downloads/operations-audit-checklist.pdf"

# Brand colors (matching the site)
CYAN = HexColor("#00D9FF")
CYAN_DEEP = HexColor("#0E7C95")
BG_BLACK = HexColor("#07090E")
INK = HexColor("#1A2533")
TEXT = HexColor("#2A3441")
MUTED = HexColor("#7A8A9A")
SUBTLE = HexColor("#A8B5C2")
LINE = HexColor("#D5DCE3")

PAGE_W, PAGE_H = LETTER
MARGIN_L = 0.85 * inch
MARGIN_R = 0.85 * inch
MARGIN_T = 0.85 * inch
MARGIN_B = 0.75 * inch
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R


def draw_header(c, page_num, total_pages):
    """Top brand bar + page indicator."""
    # Cyan accent bar on left edge
    c.setFillColor(CYAN)
    c.rect(0, 0, 0.18 * inch, PAGE_H, fill=1, stroke=0)

    # Brand chip top-left
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(CYAN_DEEP)
    c.drawString(MARGIN_L, PAGE_H - 0.5 * inch, "●  TOMORROWSTECH AI")

    # Page indicator top-right
    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED)
    c.drawRightString(
        PAGE_W - MARGIN_R,
        PAGE_H - 0.5 * inch,
        f"PAGE {page_num} / {total_pages}",
    )


def draw_footer(c):
    """Footer with URL + tagline."""
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED)
    c.drawString(MARGIN_L, 0.45 * inch, "tomorrowstechai.com")
    c.setFillColor(CYAN_DEEP)
    c.drawRightString(PAGE_W - MARGIN_R, 0.45 * inch, "PROPOSE · NEVER ACT")


def page1_cover(c, total):
    draw_header(c, 1, total)
    draw_footer(c)

    # Eyebrow
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(CYAN_DEEP)
    c.drawString(MARGIN_L, PAGE_H - 2.0 * inch, "●  THE OPERATIONS AUDIT")

    # Main title
    c.setFont("Helvetica-Bold", 32)
    c.setFillColor(INK)
    title_y = PAGE_H - 2.8 * inch
    c.drawString(MARGIN_L, title_y, "12 questions to ask")
    c.drawString(MARGIN_L, title_y - 0.45 * inch, "before adding AI to")
    c.drawString(MARGIN_L, title_y - 0.90 * inch, "your operation.")

    # Cyan underline
    c.setStrokeColor(CYAN)
    c.setLineWidth(2)
    c.line(MARGIN_L, title_y - 1.15 * inch, MARGIN_L + 1.5 * inch, title_y - 1.15 * inch)

    # Author / source line
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(TEXT)
    c.drawString(MARGIN_L, title_y - 1.55 * inch, "John Hockinson")
    c.setFont("Helvetica", 11)
    c.setFillColor(MUTED)
    c.drawString(MARGIN_L, title_y - 1.78 * inch, "Founder, TomorrowsTech AI  ·  18 years inside operations")

    # Lead paragraph
    intro_lines = [
        "Most AI integrations fail before they start.",
        "",
        "Not because the AI isn't smart enough — because the underlying operations",
        "aren't ready for it. Disorganized data produces disorganized AI. Tribal",
        "knowledge stays tribal. Manual handoffs stay manual.",
        "",
        "These are the 12 questions we walk through with every new client before",
        "suggesting AI anywhere. Answer them honestly. If most of your answers are",
        "\"I don't know\" — your foundation needs work before AI can help.",
        "",
        "Use this as a self-audit, or bring it to your next operations review.",
    ]
    c.setFont("Helvetica", 11.5)
    c.setFillColor(TEXT)
    y = title_y - 2.5 * inch
    for line in intro_lines:
        c.drawString(MARGIN_L, y, line)
        y -= 0.22 * inch


def draw_question(c, n, q, y):
    """Draw a single numbered question. Returns the y position after drawing."""
    # Number in cyan
    c.setFont("Helvetica-Bold", 13)
    c.setFillColor(CYAN_DEEP)
    c.drawString(MARGIN_L, y, f"{n:02d}.")
    # Question text
    c.setFont("Helvetica", 11)
    c.setFillColor(TEXT)
    # Wrap if needed (simple approach: max ~85 chars per line)
    max_chars = 88
    words = q.split()
    line = ""
    lines = []
    for w in words:
        if len(line) + len(w) + 1 > max_chars:
            lines.append(line)
            line = w
        else:
            line = (line + " " + w).strip()
    if line:
        lines.append(line)
    text_y = y
    for i, ln in enumerate(lines):
        c.drawString(MARGIN_L + 0.45 * inch, text_y, ln)
        text_y -= 0.18 * inch
    return text_y - 0.10 * inch


def page2_questions(c, total):
    draw_header(c, 2, total)
    draw_footer(c)

    # Section title
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(CYAN_DEEP)
    c.drawString(MARGIN_L, PAGE_H - 1.4 * inch, "●  THE 12 QUESTIONS")

    c.setFont("Helvetica-Bold", 20)
    c.setFillColor(INK)
    c.drawString(MARGIN_L, PAGE_H - 1.75 * inch, "Score yourself honestly.")

    c.setFont("Helvetica", 10.5)
    c.setFillColor(MUTED)
    c.drawString(MARGIN_L, PAGE_H - 2.0 * inch, "Check the ones you can confidently answer in less than five minutes.")

    questions = [
        "Where does each piece of operational data live today? (One source per domain or several?)",
        "Is there a single source of truth — or are three systems claiming to be it?",
        "Do your status fields have defined values, or does \"In progress\" mean four different things?",
        "Can a new hire find what they need without asking a coworker?",
        "What questions does leadership keep asking that take more than 5 minutes to answer?",
        "What gets done by tribal knowledge that should be in a system?",
        "Where are the manual handoffs where things consistently drop?",
        "Which workflows depend on someone remembering — instead of a system reminding?",
        "Where do approvals get stuck waiting on humans who don't know they're stuck?",
        "What's your propose-vs-act boundary going to be? (Where does AI suggest, where does it commit?)",
        "Who reviews AI output before it's used in a customer-facing or financial decision?",
        "What happens when the AI is wrong — and how loud is the failure when it does?",
    ]

    y = PAGE_H - 2.55 * inch
    for i, q in enumerate(questions, start=1):
        y = draw_question(c, i, q, y)


def page3_actions(c, total):
    draw_header(c, 3, total)
    draw_footer(c)

    # Section title
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(CYAN_DEEP)
    c.drawString(MARGIN_L, PAGE_H - 1.4 * inch, "●  WHAT TO DO WITH THIS")

    c.setFont("Helvetica-Bold", 20)
    c.setFillColor(INK)
    c.drawString(MARGIN_L, PAGE_H - 1.75 * inch, "Read your score.")

    # Three result blocks
    y = PAGE_H - 2.3 * inch

    # Block 1
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(INK)
    c.drawString(MARGIN_L, y, "If you confidently answered 3 or fewer:")
    c.setFont("Helvetica", 10.5)
    c.setFillColor(TEXT)
    lines1 = [
        "Your operational foundation isn't ready for AI yet. That's not a problem —",
        "it's information. Layer AI on top of disorganized data and AI will give you",
        "disorganized answers. Faster, more confidently, and at scale.",
        "",
        "Start here: clean one workflow end-to-end. Pick the one that loses the most",
        "hours to manual work. Get the data structure right. Then revisit this list.",
    ]
    for ln in lines1:
        y -= 0.22 * inch
        c.drawString(MARGIN_L, y, ln)

    y -= 0.45 * inch

    # Block 2
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(INK)
    c.drawString(MARGIN_L, y, "If you confidently answered 4 to 7:")
    c.setFont("Helvetica", 10.5)
    c.setFillColor(TEXT)
    lines2 = [
        "You have a partial foundation. AI can probably help with the well-documented",
        "parts, but you'll need to be selective about where it touches your operation.",
        "Read-only queries first. Write actions only after trust is built.",
    ]
    for ln in lines2:
        y -= 0.22 * inch
        c.drawString(MARGIN_L, y, ln)

    y -= 0.45 * inch

    # Block 3
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(INK)
    c.drawString(MARGIN_L, y, "If you confidently answered 8 or more:")
    c.setFont("Helvetica", 10.5)
    c.setFillColor(TEXT)
    lines3 = [
        "Your operation is ready. AI command centers, custom workflows, and",
        "Smartsheet-Claude MCP integrations will produce real leverage here — not",
        "novelty. Map the queries that already kill your week. Those are your first",
        "AI targets.",
    ]
    for ln in lines3:
        y -= 0.22 * inch
        c.drawString(MARGIN_L, y, ln)

    # CTA box
    y -= 0.6 * inch
    box_h = 1.5 * inch
    c.setFillColor(BG_BLACK)
    c.rect(MARGIN_L, y - box_h, CONTENT_W, box_h, fill=1, stroke=0)
    # Cyan left bar inside the box
    c.setFillColor(CYAN)
    c.rect(MARGIN_L, y - box_h, 0.06 * inch, box_h, fill=1, stroke=0)

    # CTA text
    c.setFillColor(CYAN)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(MARGIN_L + 0.35 * inch, y - 0.30 * inch, "●  WANT A WALK-THROUGH FOR YOUR OPERATION?")

    c.setFillColor(HexColor("#E8EEF5"))
    c.setFont("Helvetica-Bold", 14)
    c.drawString(MARGIN_L + 0.35 * inch, y - 0.60 * inch, "Book a 30-minute discovery call.")

    c.setFont("Helvetica", 10.5)
    c.setFillColor(HexColor("#A8B5C2"))
    cta_body = [
        "No pitch, just notes. We'll walk through your operations and tell you",
        "honestly whether what we do is a fit for your business.",
    ]
    inner_y = y - 0.85 * inch
    for ln in cta_body:
        c.drawString(MARGIN_L + 0.35 * inch, inner_y, ln)
        inner_y -= 0.20 * inch

    c.setFillColor(CYAN)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(
        MARGIN_L + 0.35 * inch,
        y - 1.35 * inch,
        "tomorrowstechai.com/contact  →",
    )


def build():
    c = canvas.Canvas(OUT_PATH, pagesize=LETTER)
    c.setTitle("The Operations Audit Checklist")
    c.setAuthor("John Hockinson · TomorrowsTech AI")
    c.setSubject("12 questions to ask before adding AI to your operation")
    c.setKeywords(["operations", "AI", "smartsheet", "audit", "checklist", "command center"])

    total = 3
    page1_cover(c, total)
    c.showPage()
    page2_questions(c, total)
    c.showPage()
    page3_actions(c, total)
    c.save()
    print(f"Wrote PDF: {OUT_PATH}")


if __name__ == "__main__":
    build()
