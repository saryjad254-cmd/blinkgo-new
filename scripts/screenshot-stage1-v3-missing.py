#!/usr/bin/env python3
"""Capture remaining screenshots"""
import asyncio
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

URL = os.environ.get("BLINKGO_URL", "http://localhost:3000")
OUT_DIR = Path("/workspace/extracted/blinkgo-final/screenshots/stage1-v3")
CHROME_PATH = "/root/.cache/ms-playwright/chromium-1223/chrome-linux/chrome"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=CHROME_PATH,
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )

        # desktop AR
        print("Taking desktop-ar.png...")
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()
        response = await page.request.post(
            f"{URL}/api/auth/login",
            data={"email": "demo@blinkgo.de", "password": "DemoCustomer!2024"},
            headers={"Content-Type": "application/json"},
        )
        print(f"Login: {response.status}")
        if response.status == 200:
            domain = URL.split("//")[-1].split(":")[0]
            await context.add_cookies([{"name": "blinkgo-locale", "value": "ar", "domain": domain, "path": "/"}])
            await page.goto(f"{URL}/home", wait_until="domcontentloaded", timeout=60000)
            try:
                await page.wait_for_selector("text=Blink", timeout=10000)
            except Exception:
                pass
            await page.wait_for_timeout(4000)
            await page.screenshot(path=str(OUT_DIR / "desktop-ar.png"), full_page=True)
            print("  ✓ desktop-ar.png")
        await context.close()
        
        # Mobile drawer
        print("Taking mobile-drawer-open.png...")
        context = await browser.new_context(viewport={"width": 390, "height": 844})
        page = await context.new_page()
        response = await page.request.post(
            f"{URL}/api/auth/login",
            data={"email": "demo@blinkgo.de", "password": "DemoCustomer!2024"},
            headers={"Content-Type": "application/json"},
        )
        print(f"Login: {response.status}")
        if response.status == 200:
            domain = URL.split("//")[-1].split(":")[0]
            await context.add_cookies([{"name": "blinkgo-locale", "value": "de", "domain": domain, "path": "/"}])
            await page.goto(f"{URL}/home", wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_timeout(3500)
            # Open drawer with JS
            await page.evaluate("""() => {
                const btn = document.querySelector('button[aria-label*="menu" i]');
                if (btn) btn.click();
                return !!btn;
            }""")
            await page.wait_for_timeout(2000)
            await page.screenshot(path=str(OUT_DIR / "mobile-drawer-open.png"), full_page=False)
            print("  ✓ mobile-drawer-open.png")
        await context.close()
        
        await browser.close()
        print("Done")


asyncio.run(main())
