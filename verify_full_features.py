import os
import time
from playwright.sync_api import sync_playwright

def run_cuj(page):
    print("Navigating to local web app...")
    page.goto("http://localhost:8000")
    page.wait_for_timeout(1000)

    # 1. Verify Header & Initial State
    print("Checking initial interface elements...")
    page.wait_for_selector("#my-board")
    page.wait_for_timeout(500)

    # 2. Click 'Kasparov vs Topalov' Sample Game and 'Start Review'
    print("Loading Kasparov vs Topalov sample game...")
    page.click("#btn-sample-1")
    page.wait_for_timeout(500)

    print("Clicking Start Review...")
    page.click("#btn-start-review")
    page.wait_for_timeout(2500)

    # 3. Test Navigation Controls & Keyboard Shortcuts
    print("Testing move navigation controls...")
    page.click("#btn-next")
    page.wait_for_timeout(600)
    page.click("#btn-next")
    page.wait_for_timeout(600)
    page.click("#btn-next")
    page.wait_for_timeout(600)

    # Test keyboard navigation
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(600)
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(600)

    # Test Flip Board
    page.keyboard.press("f")
    page.wait_for_timeout(800)
    page.keyboard.press("f")
    page.wait_for_timeout(800)

    # 4. Interact with Piece Movement on Board
    print("Testing retry practice mode...")
    if page.is_visible("#btn-retry-move"):
        page.click("#btn-retry-move")
        page.wait_for_timeout(800)
        if page.is_visible("#btn-cancel-practice"):
            page.click("#btn-cancel-practice")
            page.wait_for_timeout(500)

    # 5. Switch Tabs: Evaluation Graph & Move History
    print("Testing Evaluation Graph tab...")
    page.click("#tab-btn-graph")
    page.wait_for_timeout(1000)

    print("Testing Move History tab...")
    page.click("#tab-btn-moves")
    page.wait_for_timeout(1000)

    # Click a move row in history table
    move_rows = page.query_selector_all("#moves-table-body tr")
    if len(move_rows) > 3:
        move_rows[3].click()
        page.wait_for_timeout(800)

    page.click("#tab-btn-summary")
    page.wait_for_timeout(800)

    # 6. Open Settings Modal
    print("Opening Engine Settings Modal...")
    page.click("#btn-open-settings")
    page.wait_for_timeout(800)

    page.fill("#modal-colab-url", "https://demo-colab.trycloudflare.com")
    page.wait_for_timeout(500)

    page.click("#btn-save-settings")
    page.wait_for_timeout(1000)

    # 7. Take Final Verification Screenshot
    print("Taking final screenshot...")
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)
    os.makedirs("/home/jules/verification/videos", exist_ok=True)
    page.screenshot(path="/home/jules/verification/screenshots/verification.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos"
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
    print("Verification script executed successfully.")
