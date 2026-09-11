import os
import time
from playwright.sync_api import sync_playwright

def run_piece_movement_test(page):
    print("Navigating to application...")
    page.goto("http://localhost:8000")
    page.wait_for_timeout(1000)

    # 1. Wait for board to initialize
    print("Waiting for board...")
    page.wait_for_selector("#my-board")
    page.wait_for_timeout(500)

    # 2. Drag piece e2 -> e4 in starting position
    print("Moving piece: e2 to e4...")
    square_e2 = page.locator("#my-board .square-e2")
    square_e4 = page.locator("#my-board .square-e4")

    # Perform drag and drop
    square_e2.drag_to(square_e4)
    page.wait_for_timeout(1000)

    # 3. Drag black piece e7 -> e5
    print("Moving piece: e7 to e5...")
    square_e7 = page.locator("#my-board .square-e7")
    square_e5 = page.locator("#my-board .square-e5")
    square_e7.drag_to(square_e5)
    page.wait_for_timeout(1000)

    # 4. Drag white knight g1 -> f3
    print("Moving piece: g1 to f3...")
    square_g1 = page.locator("#my-board .square-g1")
    square_f3 = page.locator("#my-board .square-f3")
    square_g1.drag_to(square_f3)
    page.wait_for_timeout(1000)

    # 5. Load a game review and test piece movements during review & practice mode
    print("Loading Kasparov vs Topalov review...")
    page.click("#btn-sample-1")
    page.wait_for_timeout(300)
    page.click("#btn-start-review")
    page.wait_for_timeout(2000)

    # Move to move 3
    page.click("#btn-next")
    page.wait_for_timeout(500)
    page.click("#btn-next")
    page.wait_for_timeout(500)

    print("Attempting piece move on review position...")
    # Attempt dragging a piece on current board position
    square_d2 = page.locator("#my-board .square-d2")
    square_d4 = page.locator("#my-board .square-d4")
    if square_d2.is_visible():
        square_d2.drag_to(square_d4)
        page.wait_for_timeout(1200)

    # 6. Take final piece movement screenshot
    print("Taking piece movement screenshot...")
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)
    os.makedirs("/home/jules/verification/videos", exist_ok=True)
    page.screenshot(path="/home/jules/verification/screenshots/piece_movement.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos"
        )
        page = context.new_page()
        try:
            run_piece_movement_test(page)
        finally:
            context.close()
            browser.close()
    print("Piece movement test completed successfully.")
