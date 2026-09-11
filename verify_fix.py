import os
import time
from playwright.sync_api import sync_playwright

def run_fix_verification(page):
    print("Navigating to application...")
    page.goto("http://localhost:8000")
    page.wait_for_timeout(1000)

    # 1. Load sample game
    print("Loading Kasparov vs Topalov sample review...")
    page.click("#btn-sample-1")
    page.wait_for_timeout(300)
    page.click("#btn-start-review")
    page.wait_for_timeout(2000)

    # 2. Step through moves rapidly using right arrow key
    print("Stepping through moves rapidly...")
    for _ in range(10):
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(150)

    # 3. Step back
    for _ in range(5):
        page.keyboard.press("ArrowLeft")
        page.wait_for_timeout(150)

    # 4. Take final screenshot
    print("Taking verification screenshot...")
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)
    os.makedirs("/home/jules/verification/videos", exist_ok=True)
    page.screenshot(path="/home/jules/verification/screenshots/fix_verification.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos"
        )
        page = context.new_page()
        try:
            run_fix_verification(page)
        finally:
            context.close()
            browser.close()
    print("Verification completed successfully.")
