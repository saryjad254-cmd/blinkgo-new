#!/usr/bin/env python3
"""Stage 1 v3 Screenshots — NEW VISUAL DIRECTION (Dark + Red + Gold)"""
import asyncio
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

URL = os.environ.get("BLINKGO_URL", "http://localhost:3000")
OUT_DIR = Path("/workspace/extracted/blinkgo-final/screenshots/stage1-v3")
OUT_DIR.mkdir(parents=True, exist_ok=True)

VIEWPORTS = {
    "mobile": (390, 844),
    "tablet": (820, 1180),
    "desktop": (1440, 900),
}
LOCALES = ["de", "en", "ar"]
DEMO_EMAIL = "demo@blinkgo.de"
DEMO_PASSWORD = "DemoCustomer!2024"


async def login(page, email, password):
    """Login via API and return cookies"""
    await page.goto(f"{URL}/login", wait_until="domcontentloaded", timeout=30000)
    # Click input fields
    try:
        await page.fill('input[name="email"], input[type="email"]', email, timeout=5000)
        await page.fill('input[name="password"], input[type="password"]', password, timeout=5000)
        await page.click('button[type="submit"]', timeout=5000)
        await page.wait_for_url(f"{URL}/home", timeout=15000)
        return True
    except Exception as e:
        print(f"  Login error: {e}", file=sys.stderr)
        return False


async def take_screenshots():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )

        for viewport_name, (w, h) in VIEWPORTS.items():
            print(f"=== Viewport: {viewport_name} ({w}x{h}) ===")
            context = await browser.new_context(viewport={"width": w, "height": h})
            page = await context.new_page()
            ok = await login(page, DEMO_EMAIL, DEMO_PASSWORD)
            if not ok:
                # Direct API login
                response = await page.request.post(
                    f"{URL}/api/auth/login",
                    data={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
                    headers={"Content-Type": "application/json"},
                )
                if response.status == 200:
                    ok = True
                    await page.goto(f"{URL}/home", wait_until="networkidle", timeout=30000)
            if not ok:
                print(f"  FAILED to login, skipping {viewport_name}")
                continue

            for locale in LOCALES:
                # Set locale via cookie
                await context.add_cookies([{
                    "name": "blinkgo-locale",
                    "value": locale,
                    "domain": URL.split("//")[-1].split(":")[0],
                    "path": "/",
                }])
                await page.goto(f"{URL}/home", wait_until="networkidle", timeout=30000)
                # Wait for content
                try:
                    await page.wait_for_selector("text=Blink", timeout=10000)
                except Exception:
                    pass
                await page.wait_for_timeout(2000)
                fname = f"{viewport_name}-{locale}.png"
                await page.screenshot(path=str(OUT_DIR / fname), full_page=True)
                print(f"  ✓ {fname}")

            # Mobile + drawer open
            if viewport_name == "mobile":
                await page.goto(f"{URL}/home", wait_until="networkidle", timeout=30000)
                try:
                    await page.click('button[aria-label*="menu" i]', timeout=5000)
                    await page.wait_for_timeout(1500)
                    fname = "mobile-drawer-open.png"
                    await page.screenshot(path=str(OUT_DIR / fname), full_page=False)
                    print(f"  ✓ {fname}")
                except Exception as e:
                    print(f"  Drawer click error: {e}", file=sys.stderr)

            await context.close()

        await browser.close()
        print(f"\n✓ All screenshots saved to {OUT_DIR}")


if __name__ == "__main__":
    asyncio.run(take_screenshots())
