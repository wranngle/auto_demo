import type Anthropic from '@anthropic-ai/sdk';

type ToolDef = Anthropic.Tool;

export const tools: ToolDef[] = [
  // ── Observation ──
  {
    name: 'get_interactive_elements',
    description: 'Get a numbered list of all interactive elements visible on the page. Returns indices you can use with click, type, etc.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'screenshot',
    description: 'Capture a visual screenshot of the page. Only use when you need to see images, charts, or complex visual layout. Most tasks do NOT need this — the element list is sufficient.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  // ── Actions ──
  {
    name: 'click',
    description: 'Click an interactive element. Prefer role + name from the element list (produces flows that replay deterministically). Fall back to index, then x/y coordinates.',
    input_schema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'ARIA role from the element list, e.g. "button", "link", "menuitem". Preferred — produces stable selectors.' },
        name: { type: 'string', description: 'Accessible name of the target element, exactly as shown in the element list.' },
        index: { type: 'number', description: 'Element index from the interactive elements list. Use when role+name is ambiguous or absent.' },
        x: { type: 'number', description: 'X coordinate (last-resort fallback).' },
        y: { type: 'number', description: 'Y coordinate (use with x).' },
        description: { type: 'string', description: 'What this click does.' },
      },
      required: ['description'],
    },
  },
  {
    name: 'type',
    description: 'Type text into an input. Prefer role + name to target the input; fall back to index, or type into the currently focused element if no target is given.',
    input_schema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'ARIA role of the input ("textbox", "searchbox", "combobox", etc.). Preferred.' },
        name: { type: 'string', description: 'Accessible name (label) of the input, NOT the value being typed.' },
        index: { type: 'number', description: 'Element index. Use when role+name is ambiguous.' },
        text: { type: 'string', description: 'Text to type.' },
        clear_first: { type: 'boolean', description: 'Clear input before typing.' },
        description: { type: 'string', description: 'What this typing does.' },
      },
      required: ['text', 'description'],
    },
  },
  {
    name: 'press_key',
    description: 'Press a key or combination. Examples: "Enter", "Tab", "Escape", "Alt+ArrowLeft" (back).',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key or combination.' },
        description: { type: 'string', description: 'What this does.' },
      },
      required: ['key', 'description'],
    },
  },
  {
    name: 'go_back',
    description: 'Go back to the previous page (browser back button).',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Why going back.' },
      },
      required: ['description'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the page in a direction.',
    input_schema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction.' },
        amount: { type: 'number', description: 'Pixels (default 600).' },
        description: { type: 'string', description: 'What this does.' },
      },
      required: ['direction', 'description'],
    },
  },
  {
    name: 'navigate',
    description: 'Navigate to a URL.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to.' },
        description: { type: 'string', description: 'Why navigating.' },
      },
      required: ['url', 'description'],
    },
  },
  {
    name: 'wait',
    description: 'Wait for a duration.',
    input_schema: {
      type: 'object',
      properties: {
        time: { type: 'number', description: 'Milliseconds to wait.' },
        description: { type: 'string', description: 'What you are waiting for.' },
      },
      required: ['time', 'description'],
    },
  },
  {
    name: 'hover',
    description: 'Hover over an element. Prefer role+name; fall back to index.',
    input_schema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'ARIA role.' },
        name: { type: 'string', description: 'Accessible name.' },
        index: { type: 'number', description: 'Element index (fallback).' },
        description: { type: 'string', description: 'What this does.' },
      },
      required: ['description'],
    },
  },
  {
    name: 'select_option',
    description: 'Select a dropdown option by element index.',
    input_schema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Element index of the select.' },
        option_label: { type: 'string', description: 'Option label to select.' },
        description: { type: 'string', description: 'What this does.' },
      },
      required: ['index', 'option_label', 'description'],
    },
  },

  // ── Control ──
  {
    name: 'done',
    description: 'Task complete.',
    input_schema: {
      type: 'object',
      properties: { summary: { type: 'string', description: 'What was accomplished.' } },
      required: ['summary'],
    },
  },
  {
    name: 'narrate',
    description: 'Add a narration caption for viewers.',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Caption text.' } },
      required: ['text'],
    },
  },
];
