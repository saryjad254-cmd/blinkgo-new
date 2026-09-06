#!/usr/bin/env python3
"""Capture drawer open screenshot"""
import asyncio
import os
from pathlib import Path
from playwright.async_api import async_playwright

URL = "https://fee-corporations-travels-strap.trycloudflare.com"
OUT = Path("/workspace/extracted/blinkgo-final/screenshots/stage1-v3/mobile-drawer-open.png")
CHROME = "/root/.cache/ms-playwright/chromium-1223/chrome-linux/chrome"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROME, headless=True, args=["--no-sandbox"])
        context = await browser.new_context(viewport={"width": 390, "height": 844})
        page = await context.new_page()
        await page.request.post(
            f"{URL}/api/auth/login",
            data={"email": "demo@blinkgo.de", "password": "DemoCustomer!2024"},
            headers={"Content-Type": "application/json"},
        )
        domain = URL.split("//")[-1].split(":")[0]
        await context.add_cookies([{"name": "blinkgo-locale", "value": "de", "domain": domain, "path": "/"}])
        await page.goto(f"{URL}/home", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(4000)
        # Find hamburger by aria-label
        result = await page.evaluate("""() => {
            const buttons = document.querySelectorAll('button[aria-label]');
            for (const b of buttons) {
                const label = b.getAttribute('aria-label') || '';
                if (label.includes('öffnen') || label.includes('Open') || label.includes('Menü')) {
                    b.click();
                    return {ok: true, label};
                }
            }
            return {ok: false, labels: Array.from(buttons).map(b => b.getAttribute('aria-label'))};
        }""")
        print(f"Click: {result}")
        await page.wait_for_timeout(2500)
        # Check drawer position
        drawer = await page.evaluate("""() => {
            const drawer = document.querySelector('[role="dialog"], aside');
            if (!drawer) return null;
            const rect = drawer.getBoundingClientRect();
            return {tag: drawer.tagName, x: rect.x, y: rect.y, w: rect.width, h: rect.height};
        }""")
        print(f"Drawer: {drawer}")
        await page.screenshot(path=str(OUT), full_page=False)
        print(f"Saved: {OUT}")
        await browser.close()


asyncio.run(main())
