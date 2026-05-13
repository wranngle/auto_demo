import type { Page } from 'playwright';
import * as actions from '../browser/actions.js';
import { getInteractiveElements, getPageInfo, type InteractiveElement } from '../browser/accessibility.js';
import { EventLog } from '../recording/event-log.js';
import { screenshotsDir } from '../utils/paths.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ElementTarget } from '../browser/resolve-locator.js';
import type { Viewport, TargetMeta } from '../recording/types.js';

export interface ToolResult {
  content: Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;
  isDone?: boolean;
  summary?: string;
}

export class ToolHandlers {
  private actionCount = 0;
  // Cached element list from the most recent observation. Used to back-resolve
  // an index → role/name when the agent acts by index alone, so author-mode
  // flows still get stable selectors.
  private lastElements: InteractiveElement[] = [];

  constructor(
    private page: Page,
    private eventLog: EventLog,
    private recordingDir: string,
    private actionDelayMs: number
  ) {}

  /** Seed the element cache from outside (e.g. the initial observation in loop.ts). */
  seedElements(elements: InteractiveElement[]): void {
    this.lastElements = elements;
  }

  /** Return element list only (no vision — fast). Used by all action tools. */
  private async elementsOnly(): Promise<ToolResult['content']> {
    const { elements, formatted } = await getInteractiveElements(this.page);
    this.lastElements = elements;
    return [{ type: 'text', text: formatted }];
  }

  /** Back-resolve an index to {role, name, text} from the most recent snapshot. */
  private resolveIndex(index: number | undefined): {role?: string; name?: string; text?: string} {
    if (index === undefined) return {};
    const hit = this.lastElements.find((el) => el.index === index);
    if (!hit) return {};
    const role = hit.role && hit.role !== 'generic' ? hit.role : undefined;
    const name = hit.name && hit.name.trim().length > 0 ? hit.name.trim() : undefined;
    // Visible text content — last-resort selector when role/name aren't useful.
    // Truncate long blocks so `text=` doesn't try to match a 500-char paragraph.
    const rawText = hit.text?.trim();
    const text = rawText && rawText.length > 0 && rawText.length <= 80 ? rawText : undefined;
    return {role, name, text};
  }

  async handle(toolName: string, input: Record<string, any>): Promise<ToolResult> {
    switch (toolName) {
      case 'screenshot':
        return this.handleScreenshot();
      case 'get_interactive_elements':
        return this.handleGetInteractiveElements();
      case 'get_accessibility_tree':
        // Legacy: redirect to interactive elements
        return this.handleGetInteractiveElements();
      case 'get_page_info':
        return this.handlePageInfo();
      case 'click':
        return this.handleClick(input);
      case 'type':
        return this.handleType(input);
      case 'press_key':
        return this.handlePressKey(input);
      case 'go_back':
        return this.handleGoBack(input);
      case 'scroll':
        return this.handleScroll(input);
      case 'hover':
        return this.handleHover(input);
      case 'navigate':
        return this.handleNavigate(input);
      case 'wait':
        return this.handleWait(input);
      case 'select_option':
        return this.handleSelectOption(input);
      case 'done':
        return this.handleDone(input);
      case 'narrate':
        return this.handleNarrate(input);
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }] };
    }
  }

  private viewport(): Viewport {
    return this.page.viewportSize() ?? { width: 1920, height: 1080 };
  }

  private saveScreenshot(buffer: Buffer): string {
    this.actionCount++;
    const filename = `step-${String(this.actionCount).padStart(3, '0')}.jpg`;
    const dir = screenshotsDir(this.recordingDir);
    const path = join(dir, filename);
    writeFileSync(path, buffer);
    return path;
  }

  private screenshotContent(buffer: Buffer): ToolResult['content'] {
    this.saveScreenshot(buffer);
    return [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: buffer.toString('base64'),
        },
      },
    ];
  }

  private extractTarget(input: Record<string, any>): ElementTarget {
    return {
      index: input.index,
      role: input.role,
      name: input.name,
      text: input.target_text ?? (input.role || input.selector || input.index !== undefined ? input.text : undefined),
      selector: input.selector,
      x: input.x,
      y: input.y,
    };
  }

  private targetMetaFor(target: ElementTarget): TargetMeta | undefined {
    const meta: TargetMeta = {};
    if (target.role) meta.role = target.role;
    if (target.name) meta.name = target.name;
    if (target.text) meta.text = target.text;
    if (target.selector) meta.selector = target.selector;
    if (target.index !== undefined) meta.index = target.index;

    // Back-resolve: if the agent only sent an index, look up the cached element
    // to fill in role/name/text so author-mode flows get a stable selector.
    if (target.index !== undefined && !meta.role && !meta.name) {
      const resolved = this.resolveIndex(target.index);
      if (resolved.role) meta.role = resolved.role;
      if (resolved.name) meta.name = resolved.name;
      if (resolved.text && !meta.text) meta.text = resolved.text;
    }

    return Object.keys(meta).length > 0 ? meta : undefined;
  }

  private async handleScreenshot(): Promise<ToolResult> {
    // Screenshot is the opt-in vision tool — returns actual image + elements
    const [screenshot, { formatted }] = await Promise.all([
      this.page.screenshot({ type: 'jpeg', quality: 50 }),
      getInteractiveElements(this.page),
    ]);
    this.saveScreenshot(screenshot);
    return {
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: screenshot.toString('base64') } },
        { type: 'text', text: formatted },
      ],
    };
  }

  private async handleGetInteractiveElements(): Promise<ToolResult> {
    const { formatted } = await getInteractiveElements(this.page);
    return {
      content: [{ type: 'text', text: formatted }],
    };
  }

  private async handlePageInfo(): Promise<ToolResult> {
    const info = await getPageInfo(this.page);
    return {
      content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
    };
  }

  private async handleClick(input: Record<string, any>): Promise<ToolResult> {
    const target = this.extractTarget(input);
    const result = await actions.click(this.page, target, input.click_type ?? 'left', this.actionDelayMs);
    this.eventLog.append({
      type: 'click',
      description: input.description,
      bounding_box: result.bounding_box,
      viewport: this.viewport(),
      url: result.url,
      target_meta: this.targetMetaFor(target),
    });
    return { content: await this.elementsOnly() };
  }

  private async handleType(input: Record<string, any>): Promise<ToolResult> {
    const target = this.extractTarget(input);
    const hasTarget = target.index !== undefined || target.role || target.selector || target.text;

    if (!hasTarget) {
      // No explicit target — type into focused element
      await this.page.keyboard.type(input.text, { delay: input.character_by_character ? 50 : undefined });
      await this.page.waitForTimeout(this.actionDelayMs);
      this.eventLog.append({
        type: 'type',
        description: input.description,
        viewport: this.viewport(),
        value: input.text,
        url: this.page.url(),
      });
      return { content: await this.elementsOnly() };
    }

    const result = await actions.type(
      this.page,
      target,
      input.text,
      { clearFirst: input.clear_first, characterByCharacter: input.character_by_character },
      this.actionDelayMs
    );
    this.eventLog.append({
      type: 'type',
      description: input.description,
      bounding_box: result.bounding_box,
      viewport: this.viewport(),
      value: input.text,
      url: result.url,
      target_meta: this.targetMetaFor(target),
    });
    return { content: await this.elementsOnly() };
  }

  private async handlePressKey(input: Record<string, any>): Promise<ToolResult> {
    const result = await actions.pressKey(this.page, input.key, this.actionDelayMs);
    this.eventLog.append({
      type: 'press_key',
      description: input.description,
      viewport: this.viewport(),
      value: input.key,
      url: result.url,
    });
    return { content: await this.elementsOnly() };
  }

  private async handleGoBack(input: Record<string, any>): Promise<ToolResult> {
    const result = await actions.goBack(this.page, this.actionDelayMs);
    this.eventLog.append({
      type: 'navigate',
      description: input.description,
      viewport: this.viewport(),
      url: result.url,
    });
    return { content: await this.elementsOnly() };
  }

  private async handleScroll(input: Record<string, any>): Promise<ToolResult> {
    const toElement: ElementTarget | undefined =
      input.to_index !== undefined || input.to_text || input.to_selector
        ? { index: input.to_index, text: input.to_text, selector: input.to_selector }
        : undefined;
    const result = await actions.scroll(
      this.page,
      { direction: input.direction, amount: input.amount, toElement },
      this.actionDelayMs
    );
    this.eventLog.append({
      type: 'scroll',
      description: input.description,
      bounding_box: result.bounding_box,
      viewport: this.viewport(),
      url: result.url,
    });
    return { content: await this.elementsOnly() };
  }

  private async handleHover(input: Record<string, any>): Promise<ToolResult> {
    const target = this.extractTarget(input);
    const result = await actions.hover(this.page, target, this.actionDelayMs);
    this.eventLog.append({
      type: 'hover',
      description: input.description,
      bounding_box: result.bounding_box,
      viewport: this.viewport(),
      url: result.url,
      target_meta: this.targetMetaFor(target),
    });
    return { content: await this.elementsOnly() };
  }

  private async handleNavigate(input: Record<string, any>): Promise<ToolResult> {
    const result = await actions.navigate(this.page, input.url, this.actionDelayMs);
    this.eventLog.append({
      type: 'navigate',
      description: input.description,
      viewport: this.viewport(),
      value: input.url,
      url: result.url,
    });
    return { content: await this.elementsOnly() };
  }

  private async handleWait(input: Record<string, any>): Promise<ToolResult> {
    const result = await actions.waitFor(this.page, {
      time: input.time,
      elementVisible: input.element_visible,
      elementHidden: input.element_hidden,
      networkIdle: input.network_idle,
    });
    this.eventLog.append({
      type: 'wait',
      description: input.description,
      viewport: this.viewport(),
      url: result.url,
    });
    return { content: await this.elementsOnly() };
  }

  private async handleSelectOption(input: Record<string, any>): Promise<ToolResult> {
    const target = this.extractTarget(input);
    const result = await actions.selectOption(
      this.page,
      target,
      { label: input.option_label, value: input.option_value },
      this.actionDelayMs
    );
    this.eventLog.append({
      type: 'select_option',
      description: input.description,
      bounding_box: result.bounding_box,
      viewport: this.viewport(),
      value: input.option_label ?? input.option_value,
      url: result.url,
    });
    return { content: await this.elementsOnly() };
  }

  private async handleDone(input: Record<string, any>): Promise<ToolResult> {
    this.eventLog.append({
      type: 'done',
      description: input.summary,
      viewport: this.viewport(),
      url: this.page.url(),
    });
    this.eventLog.flush();
    return {
      content: [{ type: 'text', text: `Recording complete: ${input.summary}` }],
      isDone: true,
      summary: input.summary,
    };
  }

  private async handleNarrate(input: Record<string, any>): Promise<ToolResult> {
    this.eventLog.append({
      type: 'narrate',
      description: input.text,
      viewport: this.viewport(),
      value: input.text,
      url: this.page.url(),
    });
    return {
      content: [{ type: 'text', text: `Narration added: "${input.text}"` }],
    };
  }
}
