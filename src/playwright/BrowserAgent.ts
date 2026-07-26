import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';
import { join } from 'node:path';
import type { AppConfig } from '../../config/index.js';
import type { DomStyleSnapshot, LoginConfig, Viewport } from '../types/index.js';
import { logger, ensureDir, sanitizeFileName } from '../utils/index.js';

export type SupportedBrowser = 'chromium' | 'firefox' | 'webkit';

function resolveLauncher(name: SupportedBrowser) {
  switch (name) {
    case 'firefox':
      return firefox;
    case 'webkit':
      return webkit;
    default:
      return chromium;
  }
}

export class BrowserAgent {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(private readonly config: AppConfig) {}

  async launch(overrides?: {
    headless?: boolean;
    browser?: SupportedBrowser;
  }): Promise<Page> {
    const browserName = overrides?.browser ?? this.config.browser;
    const headless = overrides?.headless ?? this.config.headless;
    logger.info('Launching browser', { browserName, headless });

    const launcher = resolveLauncher(browserName);
    this.browser = await launcher.launch({ headless });
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.navigationTimeoutMs);
    this.page.setDefaultNavigationTimeout(this.config.navigationTimeoutMs);
    return this.page;
  }

  getPage(): Page {
    if (!this.page) throw new Error('Browser not launched. Call launch() first.');
    return this.page;
  }

  async navigate(url: string): Promise<void> {
    const page = this.getPage();
    logger.info('Navigating', { url });
    await page.goto(url, { waitUntil: 'networkidle' });
  }

  async login(login?: Partial<LoginConfig>): Promise<void> {
    const page = this.getPage();
    const cfg: LoginConfig = {
      username: login?.username ?? this.config.username,
      password: login?.password ?? this.config.password,
      userSelector: login?.userSelector ?? this.config.loginSelectorUser,
      passSelector: login?.passSelector ?? this.config.loginSelectorPass,
      submitSelector: login?.submitSelector ?? this.config.loginSelectorSubmit,
    };

    if (!cfg.username || !cfg.password) {
      logger.info('Skipping login — USERNAME/PASSWORD not configured');
      return;
    }

    logger.info('Attempting login');
    const user = page.locator(cfg.userSelector).first();
    const pass = page.locator(cfg.passSelector).first();

    if (!(await user.count()) || !(await pass.count())) {
      logger.warn('Login fields not found — skipping login');
      return;
    }

    await user.fill(cfg.username);
    await pass.fill(cfg.password);
    const submit = page.locator(cfg.submitSelector).first();
    if (await submit.count()) {
      await Promise.all([
        page.waitForLoadState('networkidle').catch(() => undefined),
        submit.click(),
      ]);
    } else {
      await pass.press('Enter');
      await page.waitForLoadState('networkidle').catch(() => undefined);
    }
    logger.info('Login submitted');
  }

  async navigateToScreen(screen: string): Promise<void> {
    // Absolute URL or path relative to APP_URL
    if (/^https?:\/\//i.test(screen)) {
      await this.navigate(screen);
      return;
    }
    const base = this.config.appUrl.replace(/\/$/, '');
    const path = screen.startsWith('/') ? screen : `/${screen}`;
    await this.navigate(`${base}${path}`);
  }

  async setViewport(viewport: Viewport): Promise<void> {
    const page = this.getPage();
    logger.debug('Setting viewport', viewport);
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.waitForTimeout(300);
  }

  async captureScreenshot(
    name: string,
    options?: { fullPage?: boolean },
  ): Promise<string> {
    const page = this.getPage();
    await ensureDir(this.config.screenshotDir);
    const fileName = `${sanitizeFileName(name)}.png`;
    const path = join(this.config.screenshotDir, fileName);
    await page.screenshot({
      path,
      fullPage: options?.fullPage ?? true,
      type: 'png',
    });
    logger.info('Screenshot captured', { path });
    return path;
  }

  /**
   * Collect computed styles for interactive / visible elements.
   */
  async collectDomStyles(limit = 200): Promise<DomStyleSnapshot[]> {
    const page = this.getPage();
    return page.evaluate((max) => {
      const interesting = Array.from(
        document.querySelectorAll(
          'body *:not(script):not(style):not(noscript):not(meta):not(link)',
        ),
      )
        .filter((el) => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .slice(0, max);

      return interesting.map((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const id = el.id ? `#${el.id}` : '';
        const cls =
          el.classList.length > 0
            ? '.' + Array.from(el.classList).slice(0, 3).join('.')
            : '';
        const testId = el.getAttribute('data-testid');
        const selector = testId
          ? `[data-testid="${testId}"]`
          : `${el.tagName.toLowerCase()}${id}${cls}`;

        return {
          selector,
          tagName: el.tagName.toLowerCase(),
          text: (el.textContent ?? '').trim().slice(0, 80) || undefined,
          bounds: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          computed: {
            color: style.color,
            backgroundColor: style.backgroundColor,
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
            borderRadius: style.borderRadius,
            margin: style.margin,
            padding: style.padding,
            width: style.width,
            height: style.height,
            display: style.display,
            opacity: style.opacity,
          },
        };
      });
    }, limit);
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.page = null;
    this.context = null;
    this.browser = null;
    logger.info('Browser closed');
  }
}
